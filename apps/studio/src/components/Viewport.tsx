import {
  Box,
  Crosshair,
  Expand,
  Grid2X2,
  MoveUpRight,
  Orbit,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  CanvasTexture,
  PlaneGeometry,
  MeshBasicMaterial,
  DoubleSide,
  AmbientLight,
  DirectionalLight,
  Box3,
  Mesh,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ReactNode, RefObject } from "react";
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
    gl_FragColor = vec4(mix(tone * (0.68 + tint * 0.32), vec3(1.0, 0.95, 1.0), core * 0.64), glow * (0.47 + tint * 0.53));
    #include <colorspace_fragment>
  }
`;

function addOrbit(
  guides: Group,
  radius: number,
  pitch: number,
  yaw: number,
  color: Color,
  opacity: number,
) {
  const points = Array.from({ length: 129 }, (_, index) => {
    const angle = (index / 128) * Math.PI * 2;
    return new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  });
  const line = new Line(
    new BufferGeometry().setFromPoints(points),
    new LineBasicMaterial({ color, transparent: true, opacity }),
  );
  line.rotation.set(pitch, yaw, radius * 0.08);
  guides.add(line);
}

type ViewportProps = {
  playback: Playback;
  view: ViewSettings;
  playing: boolean;
  onFrame: (tick: number) => void;
  onGrid: () => void;
  overlay?: ReactNode;
  bitmap?: RefObject<ImageBitmap | null>;
  texture?: boolean;
  mode?: "3d" | "hydra";
  onMode?: (mode: "3d" | "hydra") => void;
};

export function Viewport({
  playback,
  view,
  playing,
  onFrame,
  onGrid,
  overlay,
  mode,
  onMode,
  bitmap,
  texture,
}: ViewportProps) {
  const container = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState("");
  const [ready, setReady] = useState(false);
  const modelInput = useRef<HTMLInputElement>(null);
  const loadModel = useRef<(file: File) => void>(() => {});
  const resetCamera = useRef<() => void>(() => {});
  const visualSettings = useRef(view);
  const textureEnabled = useRef(texture);
  textureEnabled.current = texture;
  useEffect(() => {
    visualSettings.current = view;
  }, [view]);

  useEffect(() => {
    const host = mount.current!;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      setFailure(
        "El visor necesita WebGL 2. Revisa la aceleración gráfica de tu navegador.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.setAttribute(
      "aria-label",
      "Vista animada de partículas en 3D",
    );
    host.append(renderer.domElement);

    const theme = getComputedStyle(host);
    const palette = (name: string, fallback: string) =>
      new Color(theme.getPropertyValue(name).trim() || fallback);
    const videoCanvas = document.createElement("canvas");
    videoCanvas.width = 960;
    videoCanvas.height = 540;
    const videoTexture = new CanvasTexture(videoCanvas);
    const screen = new Mesh(
      new PlaneGeometry(6.4, 3.6),
      new MeshBasicMaterial({ map: videoTexture, side: DoubleSide }),
    );
    const scene = new Scene();
    scene.add(screen);
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

    const grid = new GridHelper(
      56,
      56,
      palette("--viewport-grid-major", "#515b42"),
      palette("--viewport-grid-minor", "#30372b"),
    );
    grid.position.y = -3.0;
    scene.add(grid);
    const guides = new Group();
    const orbitColor = palette("--viewport-orbit", "#859362");
    addOrbit(guides, 3.2, 0.14, 0.2, orbitColor, 0.65);
    addOrbit(guides, 3.62, 0.14, 0.2, orbitColor, 0.22);
    addOrbit(guides, 2.93, 1.06, -0.5, orbitColor, 0.39);
    scene.add(guides);
    scene.add(new AmbientLight(0xffffff, 2));
    const light = new DirectionalLight(0xffffff, 3);
    light.position.set(5, 6, 4);
    scene.add(light);
    const models = new Group();
    scene.add(models);
    let alive = true;
    let request = 0;
    function disposeModels(group: Group) {
      group.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) {
            for (const value of Object.values(material))
              if (
                value &&
                typeof value === "object" &&
                "isTexture" in value &&
                "dispose" in value
              )
                (value as { dispose: () => void }).dispose();
            material.dispose();
          }
        }
      });
      group.clear();
    }
    loadModel.current = async (file) => {
      const current = ++request;
      try {
        const model = file.name.toLowerCase().endsWith(".obj")
          ? new OBJLoader().parse(await file.text())
          : (await new GLTFLoader().parseAsync(await file.arrayBuffer(), ""))
              .scene;
        if (!alive || current !== request) {
          disposeModels(model);
          return;
        }
        const bounds = new Box3().setFromObject(model);
        const center = bounds.getCenter(new Vector3());
        const size = bounds.getSize(new Vector3());
        model.position.sub(center);
        const container = new Group();
        container.add(model);
        container.scale.setScalar(4 / Math.max(size.x, size.y, size.z, 0.01));
        disposeModels(models);
        models.add(container);
        setFailure("");
      } catch (error) {
        setFailure(
          "No se pudo importar el modelo. Usa un GLB autocontenido u OBJ. " +
            String(error),
        );
      }
    };

    let geometry = new BufferGeometry();
    let attribute: BufferAttribute | undefined;
    const material = new ShaderMaterial({
      uniforms: { tone: { value: new Color() }, pointSize: { value: 5 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
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
        attribute = new BufferAttribute(
          new Float32Array(runtime.pointCount * 3),
          3,
        );
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
        material.uniforms.pointSize.value =
          settings.size * renderer.getPixelRatio() * 2.4;
        lastView = settings;
      }
      screen.visible = !!textureEnabled.current;
      if (textureEnabled.current && bitmap?.current) {
        videoCanvas.getContext("2d")!.drawImage(bitmap.current, 0, 0, 960, 540);
        videoTexture.needsUpdate = true;
      }
      controls.update();
      renderer.render(scene, camera);
      if (
        tick !== lastUpdate &&
        (!playback.playing || tick % 3 === 0 || tick < lastUpdate)
      ) {
        lastUpdate = tick;
        onFrame(tick);
      }
      animation = requestAnimationFrame(draw);
    }
    animation = requestAnimationFrame(draw);
    setReady(true);
    return () => {
      alive = false;
      disposeModels(models);
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.dispose();
      grid.dispose();
      guides.children.forEach((object) => {
        const orbit = object as Line<BufferGeometry, LineBasicMaterial>;
        orbit.geometry.dispose();
        orbit.material.dispose();
      });
      screen.geometry.dispose();
      screen.material.dispose();
      videoTexture.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onFrame, playback, bitmap]);

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await container.current?.requestFullscreen();
    } catch {
      setFailure("El navegador no pudo activar la pantalla completa.");
    }
  }

  return (
    <section
      className="panel viewport-panel"
      aria-label="Visor 3D"
      ref={container}
    >
      <div className="panel-heading">
        <h2>
          <Box size={16} /> Visor{" "}
          <select
            className="mode-select"
            aria-label="Motor del visor"
            value={mode ?? "3d"}
            onChange={(e) => onMode?.(e.target.value as "3d" | "hydra")}
          >
            <option value="3d">Escena 3D</option>
            <option value="hydra">Hydra</option>
          </select>
        </h2>
        <div className="view-tools">
          <input
            type="file"
            accept=".glb,.obj"
            hidden
            ref={modelInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                loadModel.current(file);
                onMode?.("3d");
              }
              e.target.value = "";
            }}
          />
          <button
            className="icon-button"
            title="Importar GLB / OBJ"
            aria-label="Importar modelo 3D"
            onClick={() => modelInput.current?.click()}
          >
            <Box size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Restablecer cámara"
            title="Restablecer cámara"
            onClick={() => resetCamera.current()}
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Alternar cuadrícula"
            aria-pressed={view.grid}
            title="Alternar cuadrícula"
            onClick={onGrid}
          >
            <Grid2X2 size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Pantalla completa"
            title="Pantalla completa"
            disabled={!ready}
            onClick={() => void fullscreen()}
          >
            <Expand size={15} />
          </button>
        </div>
      </div>
      <div className="viewport-body">
        <div
          className="render-surface"
          style={{ visibility: mode === "hydra" ? "hidden" : "visible" }}
          ref={mount}
        />
        {overlay}
        <div
          style={{ visibility: mode === "hydra" ? "hidden" : "visible" }}
          className="view-frame"
          aria-hidden="true"
        >
          <i />
          <i />
          <i />
          <i />
        </div>
        <div
          style={{ visibility: mode === "hydra" ? "hidden" : "visible" }}
          className="view-meta"
        >
          <Crosshair size={15} />
          <span>Perspectiva</span>
        </div>
        <div
          style={{ visibility: mode === "hydra" ? "hidden" : "visible" }}
          className="axis-triad"
          aria-hidden="true"
        >
          <span>X</span>
          <span>Y</span>
          <span>Z</span>
          <MoveUpRight size={29} />
        </div>
        <div
          style={{ visibility: mode === "hydra" ? "hidden" : "visible" }}
          className="view-hint"
        >
          <Orbit size={14} /> Arrastrar para orbitar · rueda para acercar
        </div>
        <div className="view-live">
          <span className={`status-dot ${playing && ready ? "" : "muted"}`} />{" "}
          {playing && ready ? "En vivo" : "En pausa"}
        </div>
        {failure && (
          <div role="status" className="viewport-message">
            {failure}{" "}
            {ready && (
              <button
                className="button"
                type="button"
                onClick={() => setFailure("")}
              >
                Cerrar
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
