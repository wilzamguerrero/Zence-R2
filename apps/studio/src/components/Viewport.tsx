import {
  Box,
  Camera,
  Code2,
  Crosshair,
  Expand,
  Grid2X2,
  MoveUpRight,
  Orbit,
  RotateCcw,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CubicBezierCurve3,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  EdgesGeometry,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ReactNode, RefObject } from "react";
import type { Node, Project } from "../../../../packages/engine/project.ts";
import type { Playback } from "../playback.ts";
import { defaultPosition3D, nodeTypes } from "../studio.ts";
import type { NodeMeta, Position3D, ViewSettings } from "../studio.ts";

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

const categoryHex: Record<string, string> = {
  Control: "#ae68ad",
  Anim: "#58c4dc",
  Math: "#6ed491",
  Hydra: "#f0b35a",
  Scene: "#cfb7cf",
};

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
  project: Project;
  nodeMeta?: Record<string, NodeMeta>;
  selectedNodeId?: string;
  onSelectNode?: (id: string) => void;
  onChangeNode?: (node: Node) => void;
  onMoveNode3D?: (id: string, pos: Position3D) => void;
  view: ViewSettings;
  playing: boolean;
  hidden?: boolean;
  blackout?: boolean;
  codeOverlay?: boolean;
  onToggleCodeOverlay?: () => void;
  codeSlot?: ReactNode;
  microphone?: boolean;
  audioLevels?: RefObject<{ audio: number; bass: number; mid: number; high: number }>;
  onCapturePng?: () => void;
  onFrame: (tick: number) => void;
  onGrid: () => void;
  overlay?: ReactNode;
  bitmap?: RefObject<ImageBitmap | null>;
  texture?: boolean;
  onTexture?: (enabled: boolean) => void;
  mode?: "3d" | "hydra";
  onMode?: (mode: "3d" | "hydra") => void;
};

export function Viewport({
  playback,
  project,
  nodeMeta,
  selectedNodeId,
  onSelectNode,
  onChangeNode,
  onMoveNode3D,
  view,
  playing,
  hidden,
  blackout,
  codeOverlay,
  onToggleCodeOverlay,
  codeSlot,
  microphone,
  audioLevels,
  onCapturePng,
  onFrame,
  onGrid,
  overlay,
  mode,
  onMode,
  bitmap,
  texture,
  onTexture,
}: ViewportProps) {
  const container = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const fpsNode = useRef<HTMLSpanElement>(null);
  const meterBars = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState("");
  const [ready, setReady] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [nodes3d, setNodes3d] = useState(false);
  const [edit3d, setEdit3d] = useState(false);

  const modelInput = useRef<HTMLInputElement>(null);
  const loadModel = useRef<(file: File) => void>(() => {});
  const resetCamera = useRef<() => void>(() => {});
  const sync3dScene = useRef<() => void>(() => {});

  const latestProps = useRef({
    project,
    nodeMeta,
    selectedNodeId,
    onSelectNode,
    onChangeNode,
    onMoveNode3D,
    mode,
  });
  latestProps.current = {
    project,
    nodeMeta,
    selectedNodeId,
    onSelectNode,
    onChangeNode,
    onMoveNode3D,
    mode,
  };

  const visualSettings = useRef(view);
  const textureEnabled = useRef(texture);
  const autoRotateEnabled = useRef(autoRotate);
  const nodes3dEnabled = useRef(nodes3d);
  const edit3dEnabled = useRef(edit3d);
  textureEnabled.current = texture;
  autoRotateEnabled.current = autoRotate;
  nodes3dEnabled.current = nodes3d;
  edit3dEnabled.current = edit3d;

  useEffect(() => {
    visualSettings.current = view;
  }, [view]);

  // Ctrl+Q toggles 3D node edit mode vs Orbit camera mode (like Rete.js 3D embedding)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "q") {
        e.preventDefault();
        setNodes3d(true);
        setEdit3d((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

    const cssRenderer = new CSS3DRenderer();
    cssRenderer.domElement.className = "css3d-surface";
    host.append(cssRenderer.domElement);

    const theme = getComputedStyle(host);
    const palette = (name: string, fallback: string) =>
      new Color(theme.getPropertyValue(name).trim() || fallback);

    const videoCanvas = document.createElement("canvas");
    videoCanvas.width = 960;
    videoCanvas.height = 540;
    const videoTexture = new CanvasTexture(videoCanvas);
    videoTexture.colorSpace = SRGBColorSpace;
    const screenGeometry = new PlaneGeometry(6.4, 3.6);
    const screen = new Mesh(
      screenGeometry,
      new MeshBasicMaterial({ map: videoTexture, side: DoubleSide }),
    );
    screen.position.set(0, 0, -1.2);
    const screenFrame = new LineSegments(
      new EdgesGeometry(screenGeometry),
      new LineBasicMaterial({ color: palette("--accent", "#ae68ad"), transparent: true, opacity: 0.7 }),
    );
    screen.add(screenFrame);

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

    const cssGroup = new Group();
    const cables3dGroup = new Group();
    scene.add(cssGroup);
    scene.add(cables3dGroup);

    const liveValueEls = new Map<string, HTMLElement>();
    const nodeObjects = new Map<string, CSS3DObject>();

    function rebuild3DCables() {
      cables3dGroup.children.forEach((child) => {
        const line = child as Line<BufferGeometry, LineBasicMaterial>;
        line.geometry.dispose();
        line.material.dispose();
      });
      cables3dGroup.clear();

      const { project: curProj } = latestProps.current;
      for (const edge of curProj.edges) {
        const srcObj = nodeObjects.get(edge.from.node);
        const dstObj = nodeObjects.get(edge.to.node);
        if (!srcObj || !dstObj) continue;
        const p0 = srcObj.position.clone().add(new Vector3(0.95, 0, 0));
        const p3 = dstObj.position.clone().add(new Vector3(-0.95, 0, 0));
        const span = Math.max(1.2, p0.distanceTo(p3) * 0.4);
        const p1 = p0.clone().add(new Vector3(span, 0, 0.25));
        const p2 = p3.clone().add(new Vector3(-span, 0, 0.25));
        const curve = new CubicBezierCurve3(p0, p1, p2, p3);
        const pts = curve.getPoints(24);
        const lineColor =
          edge.from.port === "points"
            ? "#c9a6ca"
            : edge.from.port === "tex"
              ? "#f0b35a"
              : "#cf8acc";
        const line = new Line(
          new BufferGeometry().setFromPoints(pts),
          new LineBasicMaterial({ color: lineColor, transparent: true, opacity: 0.9 }),
        );
        cables3dGroup.add(line);
      }
    }

    sync3dScene.current = () => {
      liveValueEls.clear();
      nodeObjects.clear();
      cssGroup.clear();

      if (!nodes3dEnabled.current) {
        rebuild3DCables();
        return;
      }

      const {
        project: curProj,
        nodeMeta: curMeta,
        selectedNodeId: curSelected,
      } = latestProps.current;

      curProj.nodes.forEach((node, index) => {
        const spec = nodeTypes[node.kind];
        const accent = curMeta?.[node.id]?.color || categoryHex[spec.category] || "#ae68ad";
        const pos = curMeta?.[node.id]?.pos3d ?? defaultPosition3D(index, curProj.nodes.length);

        const el = document.createElement("div");
        el.className = `rete-3d-card ${curSelected === node.id ? "is-selected" : ""}`;
        el.style.setProperty("--node-accent", accent);

        const head = document.createElement("div");
        head.className = "rete-3d-head";
        head.innerHTML = `<span class="rete-3d-ns">${spec.namespace}</span><strong>${spec.name} · ${node.id}</strong>`;
        el.appendChild(head);

        const valRow = document.createElement("div");
        valRow.className = "rete-3d-val";
        const outEl = document.createElement("output");
        const initialVal = playback.runtime.getNumber(node.id);
        outEl.textContent = Number.isFinite(initialVal) ? initialVal!.toFixed(2) : spec.category;
        valRow.appendChild(outEl);
        liveValueEls.set(node.id, outEl);
        el.appendChild(valRow);

        // Interactive live controls embedded directly in 3D space
        if (node.kind === "control.number") {
          const slider = document.createElement("input");
          slider.type = "range";
          slider.min = String(node.min);
          slider.max = String(node.max);
          slider.step = "any";
          slider.value = String(node.initial);
          slider.addEventListener("pointerdown", (ev) => ev.stopPropagation());
          slider.addEventListener("input", () => {
            const v = Number(slider.value);
            outEl.textContent = v.toFixed(2);
            latestProps.current.onChangeNode?.({ ...node, initial: v });
          });
          el.appendChild(slider);
        } else if (node.kind === "signal.lfo") {
          const rateWrap = document.createElement("label");
          rateWrap.className = "rete-3d-param";
          rateWrap.innerHTML = `<span>Hz</span>`;
          const rateInput = document.createElement("input");
          rateInput.type = "number";
          rateInput.step = "0.1";
          rateInput.min = "0";
          rateInput.max = "20";
          rateInput.value = String(node.rate);
          rateInput.addEventListener("pointerdown", (ev) => ev.stopPropagation());
          rateInput.addEventListener("change", () => {
            const rate = Number(rateInput.value);
            if (Number.isFinite(rate) && rate >= 0 && rate <= 100) {
              latestProps.current.onChangeNode?.({ ...node, rate });
            }
          });
          rateWrap.appendChild(rateInput);
          el.appendChild(rateWrap);
        } else if (node.kind === "hydra.osc" || node.kind === "hydra.kaleid") {
          const key = node.kind === "hydra.osc" ? "freq" : "sides";
          const wrap = document.createElement("label");
          wrap.className = "rete-3d-param";
          wrap.innerHTML = `<span>${key}</span>`;
          const num = document.createElement("input");
          num.type = "number";
          num.step = "1";
          num.value = String(node.kind === "hydra.osc" ? node.freq : node.sides);
          num.addEventListener("pointerdown", (ev) => ev.stopPropagation());
          num.addEventListener("change", () => {
            const val = Number(num.value);
            if (!Number.isFinite(val)) return;
            if (node.kind === "hydra.osc") latestProps.current.onChangeNode?.({ ...node, freq: val });
            else latestProps.current.onChangeNode?.({ ...node, sides: val });
          });
          wrap.appendChild(num);
          el.appendChild(wrap);
        }

        const obj = new CSS3DObject(el);
        obj.position.set(pos.x, pos.y, pos.z);
        obj.rotation.y = Math.atan2(-pos.x, 9);
        obj.scale.setScalar(0.011);

        // Dragging 3D node header in Edit mode
        head.addEventListener("pointerdown", (ev) => {
          ev.stopPropagation();
          latestProps.current.onSelectNode?.(node.id);
          if (!edit3dEnabled.current) return;
          const startX = ev.clientX;
          const startY = ev.clientY;
          const startPos = obj.position.clone();
          const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
          const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
          const scalePerPx = 0.014;

          function onMove(moveEv: PointerEvent) {
            const dx = (moveEv.clientX - startX) * scalePerPx;
            const dy = -(moveEv.clientY - startY) * scalePerPx;
            const nextPos = startPos
              .clone()
              .addScaledVector(right, dx)
              .addScaledVector(up, dy);
            obj.position.copy(nextPos);
            obj.rotation.y = Math.atan2(-nextPos.x, 9);
            rebuild3DCables();
          }
          function onUp() {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            latestProps.current.onMoveNode3D?.(node.id, {
              x: Number(obj.position.x.toFixed(2)),
              y: Number(obj.position.y.toFixed(2)),
              z: Number(obj.position.z.toFixed(2)),
            });
          }
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        });

        cssGroup.add(obj);
        nodeObjects.set(node.id, obj);
      });

      rebuild3DCables();
    };

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
        const containerGroup = new Group();
        containerGroup.add(model);
        containerGroup.scale.setScalar(4 / Math.max(size.x, size.y, size.z, 0.01));
        disposeModels(models);
        models.add(containerGroup);
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
      cssRenderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let animation = 0;
    let lastFrame: number | undefined;
    let lastUpdate = -1;
    let lastTick = -1;
    let fpsCounter = 0;
    let fpsMark = performance.now();
    let lastRuntime: typeof playback.runtime | undefined;
    let lastView: ViewSettings | undefined;
    function draw(now: number) {
      const elapsed = lastFrame === undefined ? 0 : (now - lastFrame) / 1000;
      lastFrame = now;
      fpsCounter += 1;
      if (now - fpsMark >= 500) {
        const fps = Math.round((fpsCounter * 1000) / (now - fpsMark));
        if (fpsNode.current) fpsNode.current.textContent = `${fps} FPS`;
        fpsCounter = 0;
        fpsMark = now;
      }
      if (meterBars.current && audioLevels?.current) {
        const { bass, mid, high, audio } = audioLevels.current;
        const vals = [bass, mid, high, audio];
        Array.from(meterBars.current.children).forEach((el, idx) => {
          const pct = Math.min(100, Math.max(8, Math.round((vals[idx] ?? 0) * 140)));
          (el as HTMLElement).style.height = `${pct}%`;
        });
      }
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

      const show3dNodes =
        nodes3dEnabled.current && latestProps.current.mode !== "hydra";
      cssGroup.visible = show3dNodes;
      cables3dGroup.visible = show3dNodes;
      cssRenderer.domElement.style.display = show3dNodes ? "block" : "none";
      cssRenderer.domElement.style.pointerEvents =
        show3dNodes && edit3dEnabled.current ? "auto" : "none";

      if (show3dNodes) {
        for (const [id, el] of liveValueEls) {
          const val = runtime.getNumber(id);
          if (Number.isFinite(val)) el.textContent = val!.toFixed(2);
        }
      }

      controls.enabled = !(show3dNodes && edit3dEnabled.current);
      controls.autoRotate = !!autoRotateEnabled.current && controls.enabled;
      controls.autoRotateSpeed = 1.6;
      controls.update();
      renderer.render(scene, camera);
      if (show3dNodes) cssRenderer.render(scene, camera);

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
      cables3dGroup.children.forEach((child) => {
        const line = child as Line<BufferGeometry, LineBasicMaterial>;
        line.geometry.dispose();
        line.material.dispose();
      });
      screen.geometry.dispose();
      screen.material.dispose();
      screenFrame.geometry.dispose();
      screenFrame.material.dispose();
      videoTexture.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      cssRenderer.domElement.remove();
    };
  }, [onFrame, playback, bitmap]);

  useEffect(() => {
    sync3dScene.current();
  }, [project, nodeMeta, selectedNodeId, nodes3d]);

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await container.current?.requestFullscreen();
    } catch {
      setFailure("El navegador no pudo activar la pantalla completa.");
    }
  }

  const activeEngine = mode === "hydra" ? "hydra" : texture ? "hydra3d" : "3d";

  return (
    <section
      className={`panel viewport-panel ${hidden ? "is-panel-hidden" : ""}`}
      aria-label="Visor 3D"
      ref={container}
    >
      <div className="panel-heading">
        <div className="viewport-heading-left">
          <h2>
            <Box size={14} /> Visor
          </h2>
          <div className="segmented" role="group" aria-label="Motor del visor">
            <button
              type="button"
              aria-pressed={activeEngine === "3d"}
              onClick={() => {
                onMode?.("3d");
                onTexture?.(false);
              }}
            >
              3D
            </button>
            <button
              type="button"
              aria-pressed={activeEngine === "hydra"}
              onClick={() => {
                onMode?.("hydra");
                onTexture?.(false);
              }}
            >
              Hydra
            </button>
            <button
              type="button"
              aria-pressed={activeEngine === "hydra3d"}
              onClick={() => {
                onMode?.("3d");
                onTexture?.(true);
              }}
            >
              Hydra 3D
            </button>
          </div>
        </div>
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
            type="button"
            className="icon-button"
            aria-label="Nodos Rete en escena 3D"
            aria-pressed={nodes3d}
            title="Mostrar nodos Rete flotando en el entorno 3D"
            onClick={() => {
              const next = !nodes3d;
              setNodes3d(next);
              if (next && mode === "hydra") {
                onMode?.("3d");
                onTexture?.(true);
              }
            }}
          >
            <Workflow size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Código sobre el visor (Alt+C)"
            aria-pressed={codeOverlay}
            title="Código sobre el visor estilo Hydra (Alt+C)"
            onClick={onToggleCodeOverlay}
          >
            <Code2 size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Capturar imagen PNG"
            title="Capturar imagen PNG"
            onClick={onCapturePng}
          >
            <Camera size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Importar GLB / OBJ"
            aria-label="Importar modelo 3D"
            onClick={() => modelInput.current?.click()}
          >
            <Box size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Auto-órbita de cámara"
            aria-pressed={autoRotate}
            title="Auto-órbita de cámara"
            onClick={() => setAutoRotate((v) => !v)}
          >
            <Orbit size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Restablecer cámara"
            title="Restablecer cámara"
            onClick={() => resetCamera.current()}
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Alternar cuadrícula"
            aria-pressed={view.grid}
            title="Alternar cuadrícula"
            onClick={onGrid}
          >
            <Grid2X2 size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Pantalla completa"
            title="Pantalla completa"
            disabled={!ready}
            onClick={() => void fullscreen()}
          >
            <Expand size={14} />
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
        {codeSlot}
        {nodes3d && mode !== "hydra" && (
          <button
            type="button"
            className={`edit-3d-pill ${edit3d ? "is-active" : ""}`}
            onClick={() => setEdit3d((v) => !v)}
            title="Alternar entre orbitar cámara y editar nodos en 3D"
          >
            {edit3d
              ? "Modo Editar Nodos 3D · Ctrl + Q para orbitar"
              : "Modo Cámara 3D · Ctrl + Q para editar nodos"}
          </button>
        )}
        {blackout && (
          <div className="viewport-blackout" role="status">
            <span>BLACKOUT ACTIVO</span>
          </div>
        )}
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
        <div className="view-meta">
          <Crosshair size={13} />
          <span>{activeEngine === "hydra" ? "Hydra 960×540" : "Perspectiva"}</span>
          <span className="view-fps" ref={fpsNode}>60 FPS</span>
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
          <Orbit size={13} /> Arrastrar para orbitar · rueda para acercar
        </div>
        <div className="view-live">
          {microphone && (
            <div className="view-audio-meter" ref={meterBars} title="Espectro de audio (Bass / Mid / High / Total)">
              <i />
              <i />
              <i />
              <i />
            </div>
          )}
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
