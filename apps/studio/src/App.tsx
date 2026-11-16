import {
  Activity,
  AlertCircle,
  BookmarkPlus,
  Camera,
  Code2,
  Command,
  Dices,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  ImagePlus,
  Layers,
  Mic,
  MicOff,
  Monitor,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Video,
  Wand2,
  Webcam,
  Workflow,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import { compileHydraCode } from "../../../packages/engine/project.ts";
import type { Edge, Node, Project } from "../../../packages/engine/project.ts";
import { fixedStepSeconds } from "../../../packages/engine/clock.ts";
import { Assistant } from "./components/Assistant.tsx";
import { BrandMark } from "./components/BrandMark.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import type { PaletteAction } from "./components/CommandPalette.tsx";
import { LiveCode, OverlayCode } from "./components/LiveCode.tsx";
import { useLiveStudio } from "./useLiveStudio.ts";
import { Graph } from "./components/Graph.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { VersionSelector } from "./components/VersionSelector.tsx";
import { Viewport } from "./components/Viewport.tsx";
import { APP_VERSION, currentVersionUrl, isArchiveMode } from "./version.ts";
import { formatHydraCode, mutateHydraCode } from "./hydraTools.ts";
import { durationTicks, Playback } from "./playback.ts";
import {
  autoLayout,
  defaultCues,
  initialDocument,
  initialTick,
  loadDocument,
  makeNode,
  nodeTypes,
  positionFor,
  saveDocument,
} from "./studio.ts";
import type { CueSlot, NodeMeta, Position, StudioDocument, ViewSettings } from "./studio.ts";

type PanelId = "graph" | "viewport" | "code" | "inspector";
type PanelVisibility = Record<PanelId, boolean>;

const defaultPanels: PanelVisibility = {
  graph: true,
  viewport: true,
  code: true,
  inspector: true,
};

const defaultSplits = {
  graphWidth: 292,
  inspectorWidth: 266,
  viewportRatio: 0.58,
};

function loadPanels(): PanelVisibility {
  try {
    const raw = localStorage.getItem("zence.panels.v1");
    if (!raw) return defaultPanels;
    const parsed = JSON.parse(raw) as Partial<PanelVisibility>;
    return {
      graph: typeof parsed.graph === "boolean" ? parsed.graph : true,
      viewport: typeof parsed.viewport === "boolean" ? parsed.viewport : true,
      code: typeof parsed.code === "boolean" ? parsed.code : true,
      inspector: typeof parsed.inspector === "boolean" ? parsed.inspector : true,
    };
  } catch {
    return defaultPanels;
  }
}

function messageFor(error: unknown): string {
  if (!(error instanceof Error)) return "No se pudo procesar el proyecto.";
  const detail = error.message;
  if (detail.startsWith("Missing input "))
    return `Conecta la entrada ${detail.slice(14)}.`;
  if (detail.startsWith("Incompatible connection "))
    return `Los puertos tienen tipos diferentes · ${detail.slice(24)}.`;
  if (detail.startsWith("Scene must reference"))
    return "Selecciona una escena como salida.";
  if (detail.startsWith("Unsupported project version"))
    return "La versión de este proyecto no es compatible.";
  if (error instanceof SyntaxError)
    return "El archivo no contiene JSON válido.";
  return detail;
}

function timestamp(tick: number): string {
  const seconds = tick * fixedStepSeconds;
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

export function App() {
  const [design, setDesign] = useState<StudioDocument>(initialDocument);
  const [playback] = useState(() => new Playback(initialDocument.project));
  const [selected, setSelected] = useState(initialDocument.project.nodes[0].id);
  const [graphError, setGraphError] = useState("");
  const [notice, setNotice] = useState("");
  const [tick, setTick] = useState(initialTick);
  const [playing, setPlaying] = useState(true);
  const [panels, setPanels] = useState<PanelVisibility>(loadPanels);
  const [codeOverlay, setCodeOverlay] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSignal, setPaletteSignal] = useState(0);
  const [splits, setSplits] = useState(defaultSplits);
  const [activeCue, setActiveCue] = useState<string>(defaultCues[0].id);
  const input = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const tapMarks = useRef<number[]>([]);

  const project = design.project;
  const bpm = design.bpm ?? 120;
  const cues = design.cues ?? defaultCues;
  const node = project.nodes.find(({ id }) => id === selected);
  void tick;
  const liveValues = playback.runtime.getNumbers();

  const live = useLiveStudio(
    design.code,
    project.nodes,
    playing,
    bpm,
    playback,
    (id, value) => {
      const target = project.nodes.find((item) => item.id === id);
      if (target?.kind === "control.number") {
        changeNode({ ...target, initial: value });
      }
    },
  );

  useEffect(() => {
    try {
      localStorage.setItem("zence.panels.v1", JSON.stringify(panels));
    } catch {
      // Ignore storage errors in private contexts.
    }
  }, [panels]);

  const setBlackout = live.setBlackout;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const targetEl = event.target instanceof Element ? event.target : null;
        if (
          !targetEl ||
          !targetEl.closest("input, textarea, select, [contenteditable='true'], .cm-editor, .graph-panel")
        ) {
          event.preventDefault();
          setPanels((current) => ({ ...current, viewport: true, graph: true }));
          setPaletteSignal((s) => s + 1);
          return;
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        setCodeOverlay((v) => !v);
        return;
      }
      if (event.altKey) {
        if (event.key === "1") {
          event.preventDefault();
          togglePanel("graph");
        } else if (event.key === "2") {
          event.preventDefault();
          togglePanel("viewport");
        } else if (event.key === "3") {
          event.preventDefault();
          togglePanel("code");
        } else if (event.key === "4") {
          event.preventDefault();
          togglePanel("inspector");
        } else if (event.key === "0") {
          event.preventDefault();
          setPanels(defaultPanels);
        } else if (event.key.toLowerCase() === "c") {
          event.preventDefault();
          setCodeOverlay((v) => !v);
        } else if (event.key.toLowerCase() === "b") {
          event.preventDefault();
          setBlackout((v) => !v);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setBlackout]);

  function togglePanel(id: PanelId) {
    setPanels((current) => {
      const next = !current[id];
      if (id === "graph" && next) {
        return { ...current, graph: true, viewport: true };
      }
      return { ...current, [id]: next };
    });
  }

  function applyPresetLayout(preset: "studio" | "live" | "hydra" | "stage") {
    if (preset === "studio") {
      setPanels({ graph: true, viewport: true, code: true, inspector: true });
      setCodeOverlay(false);
    } else if (preset === "live") {
      setPanels({ graph: false, viewport: true, code: false, inspector: true });
      setCodeOverlay(false);
    } else if (preset === "hydra") {
      setPanels({ graph: false, viewport: true, code: false, inspector: false });
      live.setMode("hydra");
      setCodeOverlay(true);
    } else {
      setPanels({ graph: false, viewport: true, code: false, inspector: false });
      setCodeOverlay(false);
    }
  }

  function startHorizontalResize(_side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const initialInspector = splits.inspectorWidth;
    function onMove(moveEvent: PointerEvent) {
      const dx = moveEvent.clientX - startX;
      const maxSide = Math.max(240, (workspaceRef.current?.clientWidth ?? 1200) * 0.45);
      setSplits((s) => ({
        ...s,
        inspectorWidth: Math.round(Math.max(220, Math.min(maxSide, initialInspector - dx))),
      }));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startVerticalResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const container = centerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    function onMove(moveEvent: PointerEvent) {
      const ratio = (moveEvent.clientY - rect.top) / Math.max(1, rect.height);
      setSplits((s) => ({
        ...s,
        viewportRatio: Math.max(0.25, Math.min(0.8, Number(ratio.toFixed(3)))),
      }));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function applyTopology(
    next: Project,
    position?: { id: string; point: Position },
  ) {
    setNotice("");
    try {
      playback.replace(next);
      setGraphError("");
    } catch (error) {
      setGraphError(messageFor(error));
    }
    const compiledHydra = compileHydraCode(next);
    setDesign((current) => ({
      ...current,
      project: next,
      code: compiledHydra ?? current.code,
      positions: position
        ? { ...current.positions, [position.id]: position.point }
        : current.positions,
    }));
    if (compiledHydra) live.run(compiledHydra);
  }

  function changeNodeMeta(id: string, patch: Partial<NodeMeta>) {
    setDesign((current) => ({
      ...current,
      nodeMeta: {
        ...current.nodeMeta,
        [id]: { ...current.nodeMeta?.[id], ...patch },
      },
    }));
  }

  function changeNode(next: Node) {
    const original = project.nodes.find(({ id }) => id === next.id);
    const nextProject = {
      ...project,
      nodes: project.nodes.map((item) => (item.id === next.id ? next : item)),
    };
    if (
      next.kind === "control.number" &&
      original?.kind === "control.number" &&
      next.min === original.min &&
      next.max === original.max &&
      !graphError
    ) {
      playback.setNumber(next.id, next.initial);
      setDesign((current) => ({ ...current, project: nextProject }));
      return;
    }
    applyTopology(nextProject);
  }

  function connectEdge(newEdge: Edge) {
    setNotice("");
    if (newEdge.from.node === newEdge.to.node) {
      setNotice("No puedes conectar un operador consigo mismo.");
      return;
    }
    const source = project.nodes.find((item) => item.id === newEdge.from.node);
    const target = project.nodes.find((item) => item.id === newEdge.to.node);
    if (!source || !target) return;
    const outSpec = nodeTypes[source.kind].outputs.find((o) => o.key === newEdge.from.port);
    const inSpec = nodeTypes[target.kind].inputs.find((i) => i.key === newEdge.to.port);
    if (!outSpec || !inSpec || outSpec.type !== inSpec.type) {
      setNotice("Los puertos tienen tipos diferentes.");
      return;
    }
    const edges = project.edges.filter(
      (edge) => edge.to.node !== newEdge.to.node || edge.to.port !== newEdge.to.port,
    );
    applyTopology({
      ...project,
      edges: [...edges, newEdge],
    });
  }

  function removeEdge(target: Edge) {
    applyTopology({
      ...project,
      edges: project.edges.filter(
        (edge) =>
          edge.from.node !== target.from.node ||
          edge.from.port !== target.from.port ||
          edge.to.node !== target.to.node ||
          edge.to.port !== target.to.port,
      ),
    });
  }

  function unlink(target: Edge) {
    removeEdge(target);
  }

  function add(kind: Node["kind"]) {
    const created = makeNode(kind, project.nodes);
    const bottom = Math.max(
      -100,
      ...project.nodes.map(
        (item, index) => positionFor(item, index, design.positions).y,
      ),
    );
    const y = Math.max(bottom + 140, 24);
    applyTopology(
      { ...project, nodes: [...project.nodes, created] },
      { id: created.id, point: { x: 48, y } },
    );
    setSelected(created.id);
  }

  function addHydraStarterChain() {
    const created: Node[] = [];
    const pool = [...project.nodes];
    const osc = makeNode("hydra.osc", pool); pool.push(osc); created.push(osc);
    const kaleid = makeNode("hydra.kaleid", pool); pool.push(kaleid); created.push(kaleid);
    const color = makeNode("hydra.color", pool); pool.push(color); created.push(color);
    const out = makeNode("hydra.out", pool); pool.push(out); created.push(out);

    const baseY = 340;
    const newPositions: Record<string, Position> = {
      [osc.id]: { x: 40, y: baseY },
      [kaleid.id]: { x: 295, y: baseY },
      [color.id]: { x: 550, y: baseY },
      [out.id]: { x: 805, y: baseY },
    };
    const newEdges: Edge[] = [
      { from: { node: osc.id, port: "tex" }, to: { node: kaleid.id, port: "tex" } },
      { from: { node: kaleid.id, port: "tex" }, to: { node: color.id, port: "tex" } },
      { from: { node: color.id, port: "tex" }, to: { node: out.id, port: "tex" } },
    ];
    const sig = project.nodes.find((n) => n.kind === "control.number" || n.kind === "signal.lfo");
    if (sig) {
      newEdges.push({ from: { node: sig.id, port: "value" }, to: { node: osc.id, port: "mod" } });
    }
    const nextProject: Project = {
      ...project,
      nodes: [...project.nodes, ...created],
      edges: [...project.edges, ...newEdges],
    };
    setNotice("Cadena Hydra nodal creada y compilada.");
    try {
      playback.replace(nextProject);
      setGraphError("");
    } catch (error) {
      setGraphError(messageFor(error));
    }
    const compiledHydra = compileHydraCode(nextProject);
    setDesign((current) => ({
      ...current,
      project: nextProject,
      code: compiledHydra ?? current.code,
      positions: { ...current.positions, ...newPositions },
    }));
    if (compiledHydra) live.run(compiledHydra);
    setSelected(osc.id);
  }

  function remove(id: string) {
    const nodes = project.nodes.filter((item) => item.id !== id);
    const scene =
      project.scene === id
        ? (nodes.find((item) => item.kind === "scene.points")?.id ?? "")
        : project.scene;
    const edges = project.edges.filter(
      (edge) => edge.from.node !== id && edge.to.node !== id,
    );
    applyTopology({ ...project, nodes, scene, edges });
    setDesign((current) => ({
      ...current,
      positions: Object.fromEntries(
        Object.entries(current.positions).filter(([key]) => key !== id),
      ),
      nodeMeta: Object.fromEntries(
        Object.entries(current.nodeMeta ?? {}).filter(([key]) => key !== id),
      ),
    }));
    setSelected(nodes[0]?.id ?? "");
  }

  function changeView(patch: Partial<ViewSettings>) {
    setDesign((current) => ({
      ...current,
      view: { ...current.view, ...patch },
    }));
  }

  function setBpm(next: number) {
    const clamped = Math.max(40, Math.min(240, Math.round(next)));
    setDesign((current) => ({ ...current, bpm: clamped }));
  }

  function tapTempo() {
    const now = performance.now();
    const recent = tapMarks.current.filter((t) => now - t < 2000);
    recent.push(now);
    tapMarks.current = recent.slice(-5);
    live.syncBeatOrigin();
    if (recent.length >= 2) {
      const diffs = recent.slice(1).map((t, i) => t - recent[i]);
      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      if (avg > 0) setBpm(60000 / avg);
    }
  }

  function triggerCue(cue: CueSlot) {
    setActiveCue(cue.id);
    const nextNodes = project.nodes.map((item) => {
      if (item.kind === "control.number" && Object.hasOwn(cue.controls, item.id)) {
        const clamped = Math.max(item.min, Math.min(item.max, cue.controls[item.id]));
        if (!graphError) playback.setNumber(item.id, clamped);
        return { ...item, initial: clamped };
      }
      return item;
    });
    setDesign((current) => ({
      ...current,
      code: cue.code,
      view: { ...current.view, color: cue.color, size: cue.size },
      project: { ...current.project, nodes: nextNodes },
    }));
    live.run(cue.code);
  }

  function captureCue(cueId: string) {
    const controls = Object.fromEntries(
      project.nodes
        .filter((n): n is Extract<Node, { kind: "control.number" }> => n.kind === "control.number")
        .map((n) => [n.id, n.initial]),
    );
    setDesign((current) => ({
      ...current,
      cues: (current.cues ?? defaultCues).map((cue) =>
        cue.id === cueId
          ? {
              ...cue,
              code: current.code,
              color: current.view.color,
              size: current.view.size,
              controls,
            }
          : cue,
      ),
    }));
    setActiveCue(cueId);
    setNotice("Cue actualizado con la escena actual.");
  }

  function seek(next: number) {
    playback.seek(next);
    setTick(playback.tick);
  }

  function togglePlayback() {
    playback.playing = !playback.playing;
    setPlaying(playback.playing);
  }

  async function openProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("El archivo supera el tamaño máximo de 2 MB.");
      const next = loadDocument(JSON.parse(await file.text()), file.name);
      playback.replace(next.project, initialTick);
      setDesign(next);
      setSelected(next.project.nodes[0]?.id ?? "");
      setGraphError("");
      setNotice("");
      setTick(playback.tick);
    } catch (error) {
      setNotice(messageFor(error));
    }
  }

  const paletteActions = useMemo<PaletteAction[]>(
    () => [
      { id: "preset-studio", group: "Vista", label: "Modo Estudio (todos los paneles)", shortcut: "Alt+0", run: () => applyPresetLayout("studio") },
      { id: "preset-hydra", group: "Vista", label: "Modo Hydra Live (visor + código flotante)", run: () => applyPresetLayout("hydra") },
      { id: "preset-live", group: "Vista", label: "Modo Live VJ (visor + cues + salida)", run: () => applyPresetLayout("live") },
      { id: "preset-stage", group: "Vista", label: "Modo Escenario (solo visor limpio)", run: () => applyPresetLayout("stage") },
      { id: "toggle-overlay", group: "Panel", label: "Alternar código sobre el visor (estilo Hydra)", shortcut: "Alt+C", run: () => setCodeOverlay((v) => !v) },
      { id: "toggle-graph", group: "Panel", label: "Mostrar u ocultar Grafo", shortcut: "Alt+1", run: () => togglePanel("graph") },
      { id: "toggle-viewport", group: "Panel", label: "Mostrar u ocultar Visor", shortcut: "Alt+2", run: () => togglePanel("viewport") },
      { id: "toggle-code", group: "Panel", label: "Mostrar u ocultar Código acoplado", shortcut: "Alt+3", run: () => togglePanel("code") },
      { id: "toggle-inspector", group: "Panel", label: "Mostrar u ocultar Inspector y Salida", shortcut: "Alt+4", run: () => togglePanel("inspector") },
      { id: "engine-3d", group: "Motor", label: "Visor: Escena 3D", run: () => { live.setMode("3d"); live.setTexture(false); } },
      { id: "engine-hydra", group: "Motor", label: "Visor: Hydra 2D", run: () => { live.setMode("hydra"); live.setTexture(false); } },
      { id: "engine-hydra3d", group: "Motor", label: "Visor: Hydra en pantalla 3D", run: () => { live.setMode("3d"); live.setTexture(true); } },
      { id: "code-run", group: "Hydra", label: "Ejecutar código Hydra", shortcut: "Ctrl+Enter", run: () => live.run() },
      { id: "code-mutate", group: "Hydra", label: "Mutar parámetros del código Hydra", run: () => { const m = mutateHydraCode(design.code); setDesign((c) => ({ ...c, code: m })); live.run(m); } },
      { id: "code-format", group: "Hydra", label: "Formatear código Hydra", shortcut: "Ctrl+Shift+F", run: () => setDesign((c) => ({ ...c, code: formatHydraCode(c.code) })) },
      { id: "add-lfo", group: "Operador", label: "Añadir Oscilador LFO (Ops.Anim.LFO)", run: () => add("signal.lfo") },
      { id: "add-timer", group: "Operador", label: "Añadir Temporizador (Ops.Anim.Timer)", run: () => add("signal.timer") },
      { id: "add-smooth", group: "Operador", label: "Añadir Suavizador (Ops.Anim.Smooth)", run: () => add("signal.smooth") },
      { id: "add-maprange", group: "Operador", label: "Añadir MapRange (Ops.Math.MapRange)", run: () => add("signal.mapRange") },
      { id: "add-math", group: "Operador", label: "Añadir Operador Math (Ops.Math.Op)", run: () => add("signal.math") },
      { id: "add-hydra-chain", group: "Hydra", label: "Crear cadena nodal Hydra (Osc → Kaleid → Color → Out)", run: addHydraStarterChain },
      { id: "add-control", group: "Operador", label: "Añadir Control numérico", run: () => add("control.number") },
      { id: "add-particles", group: "Operador", label: "Añadir Emisor de partículas", run: () => add("simulation.particles") },
      { id: "layout-graph", group: "Grafo", label: "Auto-ordenar grafo de operadores", run: () => setDesign((c) => ({ ...c, positions: autoLayout(c.project.nodes, c.project.edges) })) },
      { id: "out-blackout", group: "Directo", label: "Alternar Blackout de salida", shortcut: "Alt+B", run: () => setBlackout((v) => !v) },
      { id: "out-tap", group: "Directo", label: "Tap Tempo (marcar pulso BPM)", run: tapTempo },
      { id: "out-png", group: "Salida", label: "Capturar imagen PNG del visor", run: live.capturePng },
      { id: "out-cam", group: "Fuente", label: "Alternar Cámara web en s0", run: live.toggleCamera },
      { id: "out-screen", group: "Fuente", label: "Alternar Captura de pantalla en s0", run: live.toggleScreen },
      { id: "out-mic", group: "Fuente", label: "Alternar Micrófono FFT", run: () => void live.toggleMicrophone() },
      { id: "out-proj", group: "Salida", label: "Abrir ventana de Proyección", run: live.openProjection },
      ...cues.map((cue) => ({
        id: `cue-${cue.id}`,
        group: "Cue",
        label: `Disparar Cue: ${cue.name}`,
        run: () => triggerCue(cue),
      })),
    ],
    [cues, design.code, live],
  );

  const showCenter = panels.viewport || panels.code;
  const hasRightSplitter = panels.inspector && showCenter;
  const hasCenterSplitter = panels.viewport && panels.code;

  const visibleColumns: string[] = [];
  if (showCenter) visibleColumns.push("minmax(280px, 1fr)");
  if (hasRightSplitter) visibleColumns.push("5px");
  if (panels.inspector) {
    visibleColumns.push(showCenter ? `${splits.inspectorWidth}px` : "1fr");
  }
  const anyVisible = showCenter || panels.inspector;

  const centerRows = hasCenterSplitter
    ? `${splits.viewportRatio}fr 5px ${1 - splits.viewportRatio}fr`
    : "minmax(0, 1fr)";

  return (
    <div className="studio">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <BrandMark />
            <span className="brand-word">
              Zence <span>R2</span>
            </span>
          </div>
          <div className="project-title">
            <span className="title-rule" aria-hidden="true" />
            <h1>dev by wilzamguerrero</h1>
          </div>
          <VersionSelector />
          {isArchiveMode() && (
            <a className="archive-pill" href={currentVersionUrl()}>
              Archivo v{APP_VERSION} · Ir a actual
            </a>
          )}
          {graphError && (
            <div className="project-status" data-error="true">
              <AlertCircle size={13} /> Grafo pendiente
            </div>
          )}
        </div>

        <nav className="topbar-panels" aria-label="Visibilidad de paneles">
          <div className="panel-toggles" role="group" aria-label="Mostrar u ocultar paneles">
            <button
              type="button"
              className="panel-toggle"
              aria-pressed={panels.graph}
              title="Mostrar u ocultar Grafo (Alt+1)"
              onClick={() => togglePanel("graph")}
            >
              <Workflow size={13} />
              <span>Grafo</span>
            </button>
            <button
              type="button"
              className="panel-toggle"
              aria-pressed={panels.viewport}
              title="Mostrar u ocultar Visor (Alt+2)"
              onClick={() => togglePanel("viewport")}
            >
              <Eye size={13} />
              <span>Visor</span>
            </button>
            <button
              type="button"
              className="panel-toggle"
              aria-pressed={panels.code}
              title="Mostrar u ocultar Código acoplado (Alt+3)"
              onClick={() => togglePanel("code")}
            >
              <Code2 size={13} />
              <span>Código</span>
            </button>
            <button
              type="button"
              className="panel-toggle"
              aria-pressed={codeOverlay}
              title="Código flotante sobre el visor estilo Hydra (Alt+C)"
              onClick={() => {
                setCodeOverlay((v) => !v);
                if (!panels.viewport) setPanels((p) => ({ ...p, viewport: true }));
              }}
            >
              <Code2 size={13} />
              <span>Overlay</span>
            </button>
            <button
              type="button"
              className="panel-toggle"
              aria-pressed={panels.inspector}
              title="Mostrar u ocultar Inspector y Salida (Alt+4)"
              onClick={() => togglePanel("inspector")}
            >
              <SlidersHorizontal size={13} />
              <span>Inspector</span>
            </button>
          </div>
          <div className="layout-presets" role="group" aria-label="Vistas rápidas">
            <button
              type="button"
              className="preset-chip"
              title="Todos los paneles (Alt+0)"
              onClick={() => applyPresetLayout("studio")}
            >
              <Layers size={12} /> Estudio
            </button>
            <button
              type="button"
              className="preset-chip"
              title="Hydra a pantalla completa con código transparente encima"
              onClick={() => applyPresetLayout("hydra")}
            >
              Hydra Live
            </button>
            <button
              type="button"
              className="preset-chip"
              title="Visor + Cues y Salida"
              onClick={() => applyPresetLayout("live")}
            >
              VJ
            </button>
            <button
              type="button"
              className="preset-chip"
              title="Solo Visor limpio"
              onClick={() => applyPresetLayout("stage")}
            >
              Escenario
            </button>
          </div>
        </nav>

        <div className="topbar-actions">
          <button
            type="button"
            className="button button-open"
            title="Paleta de comandos (Ctrl+K)"
            onClick={() => setPaletteOpen(true)}
          >
            <Command size={13} /> <span className="cmd-kbd">Ctrl+K</span>
          </button>
          <input
            type="file"
            accept=".json,application/json"
            ref={input}
            hidden
            onChange={(event) => void openProject(event)}
          />
          <button
            type="button"
            className="button button-open"
            onClick={() => input.current?.click()}
          >
            <FolderOpen size={14} /> Abrir
          </button>
          <button
            type="button"
            className="button button-save"
            title={
              graphError
                ? "Completa las conexiones antes de guardar"
                : "Descargar archivo del proyecto"
            }
            disabled={!!graphError}
            onClick={() => {
              saveDocument(design);
              setNotice("Proyecto descargado.");
            }}
          >
            <Download size={14} /> Guardar
          </button>
        </div>
      </header>

      <main
        ref={workspaceRef}
        className="workspace"
        style={
          anyVisible
            ? { gridTemplateColumns: visibleColumns.join(" ") }
            : { gridTemplateColumns: "1fr" }
        }
      >
        <div
          ref={centerRef}
          className={`center-stack ${showCenter ? "" : "is-panel-hidden"}`}
          style={{ gridTemplateRows: centerRows }}
        >
          <Viewport
            playback={playback}
            project={project}
            nodeMeta={design.nodeMeta}
            selectedNodeId={selected}
            onSelectNode={setSelected}
            onChangeNode={changeNode}
            onMoveNode3D={(id, pos3d) => changeNodeMeta(id, { pos3d })}
            view={design.view}
            playing={playing}
            hidden={!panels.viewport}
            blackout={live.blackout}
            codeOverlay={codeOverlay}
            onToggleCodeOverlay={() => setCodeOverlay((v) => !v)}
            graphVisible={panels.graph}
            onToggleGraph={() => togglePanel("graph")}
            graphSlot={
              <Graph
                backdrop
                project={project}
                positions={design.positions}
                nodeMeta={design.nodeMeta}
                values={liveValues}
                selected={selected}
                hidden={!panels.graph}
                openPaletteSignal={paletteSignal}
                onCloseBackdrop={() => togglePanel("graph")}
                onSelect={setSelected}
                onChangeNode={changeNode}
                onMove={(id, point) =>
                  setDesign((current) => ({
                    ...current,
                    positions: { ...current.positions, [id]: point },
                  }))
                }
                onConnectEdge={connectEdge}
                onRemoveEdge={removeEdge}
                onAdd={add}
                onAddHydraChain={addHydraStarterChain}
                onDelete={remove}
                onLayout={() =>
                  setDesign((current) => ({
                    ...current,
                    positions: autoLayout(current.project.nodes, current.project.edges),
                  }))
                }
              />
            }
            microphone={live.microphone}
            audioLevels={live.audioLevels}
            onCapturePng={live.capturePng}
            onFrame={setTick}
            onGrid={() => changeView({ grid: !design.view.grid })}
            mode={live.mode}
            onMode={live.setMode}
            bitmap={live.bitmap}
            texture={live.texture}
            onTexture={live.setTexture}
            codeSlot={
              codeOverlay ? (
                <OverlayCode
                  code={design.code}
                  status={live.status}
                  error={live.error}
                  onRun={live.run}
                  onCode={(code) => setDesign((current) => ({ ...current, code }))}
                  onClose={() => setCodeOverlay(false)}
                />
              ) : null
            }
            overlay={
              <iframe
                ref={live.frame}
                className="hydra-surface"
                title="Motor Hydra"
                sandbox="allow-scripts"
                srcDoc={live.html}
                style={
                  live.mode === "hydra"
                    ? { opacity: 1, pointerEvents: "auto", zIndex: 1 }
                    : { opacity: 1, pointerEvents: "none", zIndex: -1 }
                }
              />
            }
          />

          {hasCenterSplitter && (
            <div
              className="splitter splitter-h"
              role="separator"
              aria-orientation="horizontal"
              title="Arrastra para redimensionar · doble clic restablece"
              onPointerDown={startVerticalResize}
              onDoubleClick={() => setSplits((s) => ({ ...s, viewportRatio: defaultSplits.viewportRatio }))}
            />
          )}

          <LiveCode
            code={design.code}
            automatic={live.automatic}
            onAuto={live.setAutomatic}
            status={live.status}
            error={live.error}
            hidden={!panels.code}
            onRun={live.run}
            onCode={(code) => setDesign((current) => ({ ...current, code }))}
          />
        </div>

        {hasRightSplitter && (
          <div
            className="splitter splitter-v"
            role="separator"
            aria-orientation="vertical"
            title="Arrastra para redimensionar · doble clic restablece"
            onPointerDown={(e) => startHorizontalResize("right", e)}
            onDoubleClick={() => setSplits((s) => ({ ...s, inspectorWidth: defaultSplits.inspectorWidth }))}
          />
        )}

        <aside
          className={`panel dock-panel ${panels.inspector ? "" : "is-panel-hidden"}`}
          aria-label="Salida, cues e inspector"
        >
          <div className="panel-heading">
            <h2>
              <SlidersHorizontal size={14} /> Control &amp; Salida
            </h2>
            <button
              type="button"
              className="icon-button"
              title="Ocultar Inspector (Alt+4)"
              aria-label="Ocultar Inspector"
              onClick={() => togglePanel("inspector")}
            >
              <EyeOff size={13} />
            </button>
          </div>

          <div className="extra-actions">
            <button
              type="button"
              className="button"
              aria-pressed={live.projecting}
              onClick={live.openProjection}
            >
              <MonitorPlay size={13} /> Proyectar
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void live.showRemote()}
            >
              <Smartphone size={13} /> Celular
            </button>
            <button
              type="button"
              className="button"
              aria-pressed={live.microphone}
              onClick={() => void live.toggleMicrophone()}
            >
              {live.microphone ? <MicOff size={13} /> : <Mic size={13} />}
              {live.microphone ? "Silenciar" : "Micrófono"}
            </button>
            <button
              type="button"
              className="button"
              data-recording={live.recording}
              aria-pressed={live.recording}
              onClick={live.toggleRecording}
            >
              {live.recording ? <Camera size={13} /> : <Video size={13} />}
              {live.recording ? "Detener" : "Grabar"}
            </button>
            <button
              type="button"
              className="button"
              aria-pressed={live.liveSource === "camera"}
              title="Cámara web en s0"
              onClick={live.toggleCamera}
            >
              <Webcam size={13} /> Cámara
            </button>
            <button
              type="button"
              className="button"
              aria-pressed={live.liveSource === "screen"}
              title="Compartir pantalla en s0"
              onClick={live.toggleScreen}
            >
              <Monitor size={13} /> Pantalla
            </button>
            <button
              type="button"
              className="button"
              onClick={() => mediaInput.current?.click()}
            >
              <ImagePlus size={13} /> Medio
            </button>
            <button
              type="button"
              className="button blackout-button"
              aria-pressed={live.blackout}
              title="Blackout de salida (Alt+B)"
              onClick={() => live.setBlackout(!live.blackout)}
            >
              <Zap size={13} /> Blackout
            </button>
            <input
              hidden
              type="file"
              accept="image/*,video/*"
              ref={mediaInput}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) live.send({ type: "media", file });
                event.target.value = "";
              }}
            />
          </div>

          <div className="cue-deck" aria-label="Banco de cues">
            <div className="cue-deck-head">
              <span>Banco de Cues</span>
              <small>Clic dispara · icono guarda</small>
            </div>
            <div className="cue-grid">
              {cues.map((cue) => (
                <div
                  key={cue.id}
                  className={`cue-slot ${activeCue === cue.id ? "is-active" : ""}`}
                >
                  <button
                    type="button"
                    className="cue-trigger"
                    onClick={() => triggerCue(cue)}
                  >
                    <span
                      className="cue-swatch"
                      style={{ background: cue.color }}
                      aria-hidden="true"
                    />
                    <span>{cue.name}</span>
                  </button>
                  <button
                    type="button"
                    className="cue-capture"
                    title={`Guardar estado actual en ${cue.name}`}
                    aria-label={`Guardar en ${cue.name}`}
                    onClick={() => captureCue(cue.id)}
                  >
                    <BookmarkPlus size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Inspector
            project={project}
            node={node}
            meta={node ? design.nodeMeta?.[node.id] : undefined}
            liveValue={node ? liveValues[node.id] : undefined}
            view={design.view}
            onNode={changeNode}
            onNodeMeta={changeNodeMeta}
            onView={changeView}
            onUnlink={unlink}
            onRemove={remove}
            onScene={(id) => applyTopology({ ...project, scene: id })}
          />

          <Assistant
            document={design}
            onApply={(code) => {
              live.setAutomatic(false);
              setDesign((current) => ({ ...current, code }));
            }}
          />
        </aside>

        {!anyVisible && (
          <div className="workspace-empty">
            <p>Todos los paneles están ocultos.</p>
            <div className="workspace-empty-actions">
              <button
                type="button"
                className="button button-save"
                onClick={() => applyPresetLayout("studio")}
              >
                Restaurar Estudio
              </button>
              <button
                type="button"
                className="button"
                onClick={() => applyPresetLayout("hydra")}
              >
                Hydra Live
              </button>
              <button
                type="button"
                className="button"
                onClick={() => applyPresetLayout("stage")}
              >
                Solo Visor
              </button>
            </div>
          </div>
        )}
      </main>

      {(graphError || notice) && (
        <div className="notice" role="status">
          {graphError && (
            <span>
              <AlertCircle size={14} /> {graphError} El visor conserva la última
              escena válida.
            </span>
          )}
          {notice && <span>{notice}</span>}
          {notice && (
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          )}
        </div>
      )}

      {live.qr && (
        <dialog
          open
          className="remote-dialog"
          style={{ position: "fixed", top: "20%", zIndex: 20 }}
        >
          <h2>Control desde tu celular</h2>
          <img src={live.qr} alt="QR de la sesión" />
          <p>
            Conecta ambos equipos a la misma red. Escanea el QR para controlar
            los nodos numéricos.
          </p>
          <p>{live.address}</p>
          <button className="button" onClick={live.closeRemote}>
            Cerrar
          </button>
        </dialog>
      )}

      <CommandPalette
        open={paletteOpen}
        actions={paletteActions}
        onClose={() => setPaletteOpen(false)}
      />

      <footer className="transport" aria-label="Reproducción y tempo">
        <div className="transport-controls">
          <button
            type="button"
            className="play-button"
            aria-label={playing ? "Pausar" : "Reproducir"}
            title={playing ? "Pausar" : "Reproducir"}
            onClick={togglePlayback}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            type="button"
            className="icon-button reset-time"
            aria-label="Reiniciar simulación"
            title="Reiniciar simulación"
            onClick={() => seek(0)}
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Mutar Hydra"
            aria-label="Mutar Hydra"
            onClick={() => {
              const mutated = mutateHydraCode(design.code);
              setDesign((c) => ({ ...c, code: mutated }));
              live.run(mutated);
            }}
          >
            <Dices size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Formatear Hydra"
            aria-label="Formatear Hydra"
            onClick={() => setDesign((c) => ({ ...c, code: formatHydraCode(c.code) }))}
          >
            <Wand2 size={14} />
          </button>
        </div>

        <div className="timecode">
          <output>{timestamp(tick)}</output>
          <small>{timestamp(durationTicks)}</small>
        </div>

        <div className="timeline">
          <div className="timeline-labels" aria-hidden="true">
            <span>0 s</span>
            <span>2 s</span>
            <span>4 s</span>
            <span>6 s</span>
            <span>8 s</span>
            <span>10 s</span>
          </div>
          <input
            aria-label="Posición de reproducción"
            className="timeline-input"
            type="range"
            min={0}
            max={durationTicks}
            value={tick}
            onChange={(event) => {
              playback.playing = false;
              setPlaying(false);
              seek(Number(event.target.value));
            }}
          />
        </div>

        <div className="bpm-control" aria-label="Tempo BPM">
          <button
            type="button"
            className="icon-button"
            aria-label="Reducir BPM"
            onClick={() => setBpm(bpm - 1)}
          >
            -
          </button>
          <label className="bpm-readout">
            <input
              type="number"
              aria-label="BPM"
              min={40}
              max={240}
              value={bpm}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (Number.isFinite(val)) setBpm(val);
              }}
            />
            <span>BPM</span>
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label="Aumentar BPM"
            onClick={() => setBpm(bpm + 1)}
          >
            +
          </button>
          <button
            type="button"
            className="button tap-button"
            title="Tap Tempo (marca el pulso)"
            onClick={tapTempo}
          >
            TAP
          </button>
        </div>

        <div className="transport-info">
          <Activity size={14} />{" "}
          <span>
            {playback.runtime.pointCount.toLocaleString("es-CO")} pts · {project.nodes.length} ops
          </span>
        </div>
      </footer>
    </div>
  );
}
