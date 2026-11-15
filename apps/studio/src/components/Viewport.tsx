import { Box, Crosshair, Expand, Grid2X2, MoveUpRight, Orbit, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, GridHelper, Group,
  Line, LineBasicMaterial, PerspectiveCamera, Points, Scene,
  ShaderMaterial, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Playback } from "../playback.ts";
import type { ViewSettings } from "../studio.ts";

const vertexShader = `
  uniform float pointSize;
  varying float tint;
  void main() {
    vec4 positionInView = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * positionInView;
    gl_PointSize = clamp(pointSize * 8.0 / max(1.0, -positionInView.z), 1.2, 40.0);
    tint = 0.5 + 0.5 * sin(float(gl_VertexID) * 1.218);
  }
`;

const fragmentShader = `
  uniform vec3 tone;
  varying float tint;
  void main() {
    float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
    float glow = 1.0 - smoothstep(0.12, 0.50, distanceFromCenter);
    float core = 1.0 - smoothstep(0.07, 0.25, distanceFromCenter);
    if (glow <= 0.0) discard;
    gl_FragColor = vec4(mix(tone * (0.68 + tint * 0.32), vec3(0.99, 1.0, 0.91), core * 0.64), glow * (0.47 + tint * 0.53));
    #include <colorspace_fragment>
  }
`;

function addOrbit(guides: Group, radius: number, pitch: number, yaw: number, color: Color, opacity: number) {
  const points = Array.from({ length: 129 }, (_, index) => {
    const angle = index / 128 * Math.PI * 2;
    return new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  });
  const line = new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color, transparent: true, opacity }));
  line.rotation.set(pitch, yaw, radius * 0.08);
  guides.add(line);
}

type ViewportProps = {
  playback: Playback;
  view: ViewSettings;
  playing: boolean;
  onFrame: (tick: number) => void;
  onGrid: () => void;
};

export function Viewport({ playback, view, playing, onFrame, onGrid }: ViewportProps) {
  const container = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState("");
  const [ready, setReady] = useState(false);
  const resetCamera = useRef<() => void>(() => {});
  const visualSettings = useRef(view);
  useEffect(() => { visualSettings.current = view; }, [view]);

  useEffect(() => {
    const host = mount.current!;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true });
    } catch {
      setFailure("El visor necesita WebGL 2. Revisa la aceleración gráfica de tu navegador.");
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.setAttribute("aria-label", "Vista animada de partículas en 3D");
    host.append(renderer.domElement);

    const theme = getComputedStyle(host);
    const palette = (name: string, fallback: string) => new Color(theme.getPropertyValue(name).trim() || fallback);
    const scene = new Scene();
    scene.background = palette("--viewport-bg", "#171a17");
    const camera = new PerspectiveCamera(37, 1, 0.05, 200);
    camera.position.set(7.6, 5.4, 10.8);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 2;
    controls.maxDistance = 50;
    controls.target.set(0, -0.15, 0);
    controls.update();
    controls.saveState();
    resetCamera.current = () => controls.reset();

    const grid = new GridHelper(56, 56, palette("--viewport-grid-major", "#515b42"), palette("--viewport-grid-minor", "#30372b"));
    grid.position.y = -3.0;
    scene.add(grid);
    const guides = new Group();
    const orbitColor = palette("--viewport-orbit", "#859362");
    addOrbit(guides, 3.20, 0.14, 0.2, orbitColor, 0.65);
    addOrbit(guides, 3.62, 0.14, 0.2, orbitColor, 0.22);
    addOrbit(guides, 2.93, 1.06, -0.5, orbitColor, 0.39);
    scene.add(guides);

    let geometry = new BufferGeometry();
    let attribute: BufferAttribute | undefined;
    const material = new ShaderMaterial({
      uniforms: { tone: { value: new Color() }, pointSize: { value: 5 } },
      vertexShader, fragmentShader, transparent: true, depthWrite: false,
    });
    const cloud = new Points(geometry, material);
    cloud.frustumCulled = false;
    scene.add(cloud);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let animation = 0;
    let lastFrame: number | undefined;
    let lastUpdate = -1;
    let lastTick = -1;
    let lastRuntime: typeof playback.runtime | undefined;
    let lastView: ViewSettings | undefined;
    function draw(now: number) {
      const elapsed = lastFrame === undefined ? 0 : (now - lastFrame) / 1000;
      lastFrame = now;
      playback.advance(elapsed);
      const { runtime, tick } = playback;
      if (attribute?.count !== runtime.pointCount) {
        geometry.dispose();
        geometry = new BufferGeometry();
        attribute = new BufferAttribute(new Float32Array(runtime.pointCount * 3), 3);
        attribute.setUsage(DynamicDrawUsage);
        geometry.setAttribute("position", attribute);
        cloud.geometry = geometry;
      }
      if (tick !== lastTick || runtime !== lastRuntime) {
        runtime.writePositions(attribute.array as Float32Array);
        attribute.needsUpdate = true;
        lastTick = tick;
        lastRuntime = runtime;
      }
      const settings = visualSettings.current;
      if (settings !== lastView) {
        grid.visible = settings.grid;
        guides.visible = settings.guides;
        material.uniforms.tone.value.set(settings.color);
        material.uniforms.pointSize.value = settings.size * renderer.getPixelRatio() * 2.4;
        lastView = settings;
      }
      controls.update();
      renderer.render(scene, camera);
      if (tick !== lastUpdate && (!playback.playing || tick % 3 === 0 || tick < lastUpdate)) {
        lastUpdate = tick;
        onFrame(tick);
      }
      animation = requestAnimationFrame(draw);
    }
    animation = requestAnimationFrame(draw);
    setReady(true);
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.dispose();
      grid.dispose();
      guides.children.forEach((object) => {
        const orbit = object as Line<BufferGeometry, LineBasicMaterial>;
        orbit.geometry.dispose();
        orbit.material.dispose();
      });
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onFrame, playback]);

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await container.current?.requestFullscreen();
    } catch {
      setFailure("El navegador no pudo activar la pantalla completa.");
    }
  }

  return <section className="panel viewport-panel" aria-label="Visor 3D" ref={container}>
    <div className="panel-heading">
      <h2><Box size={16} /> Visor 3D</h2>
      <div className="view-tools">
        <button type="button" className="icon-button" aria-label="Restablecer cámara" title="Restablecer cámara" onClick={() => resetCamera.current()}><RotateCcw size={15} /></button>
        <button type="button" className="icon-button" aria-label="Alternar cuadrícula" aria-pressed={view.grid} title="Alternar cuadrícula" onClick={onGrid}><Grid2X2 size={15} /></button>
        <button type="button" className="icon-button" aria-label="Pantalla completa" title="Pantalla completa" disabled={!ready} onClick={() => void fullscreen()}><Expand size={15} /></button>
      </div>
    </div>
    <div className="viewport-body">
      <div className="render-surface" ref={mount} />
      <div className="view-frame" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="view-meta"><Crosshair size={15} /><span>Perspectiva</span></div>
      <div className="axis-triad" aria-hidden="true"><span>X</span><span>Y</span><span>Z</span><MoveUpRight size={29} /></div>
      <div className="view-hint"><Orbit size={14} /> Arrastrar para orbitar · rueda para acercar</div>
      <div className="view-live"><span className={`status-dot ${playing && ready ? "" : "muted"}`} /> {playing && ready ? "En vivo" : "En pausa"}</div>
      {failure && <div role="status" className="viewport-message">{failure} {ready && <button className="button" type="button" onClick={() => setFailure("")}>Cerrar</button>}</div>}
    </div>
  </section>;
}
