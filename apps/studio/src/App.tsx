import {
  Activity,
  AlertCircle,
  BookmarkPlus,
  Camera,
  Code2,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  ImagePlus,
  Layers,
  Mic,
  MicOff,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Video,
  Workflow,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Edge, Node, Project } from "../../../packages/engine/project.ts";
import { fixedStepSeconds } from "../../../packages/engine/clock.ts";
import { Assistant } from "./components/Assistant.tsx";
import { LiveCode } from "./components/LiveCode.tsx";
import { useLiveStudio } from "./useLiveStudio.ts";
import { Graph } from "./components/Graph.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { Viewport } from "./components/Viewport.tsx";
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
import type { CueSlot, Position, StudioDocument, ViewSettings } from "./studio.ts";

type PanelId = "graph" | "viewport" | "code" | "inspector";
type PanelVisibility = Record<PanelId, boolean>;

const defaultPanels: PanelVisibility = {
  graph: true,
  viewport: true,
  code: true,
  inspector: true,
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
  const [pending, setPending] = useState<Edge["from"] | null>(null);
  const [graphError, setGraphError] = useState("");
  const [notice, setNotice] = useState("");
  const [tick, setTick] = useState(initialTick);
  const [playing, setPlaying] = useState(true);
  const [panels, setPanels] = useState<PanelVisibility>(loadPanels);
  const [activeCue, setActiveCue] = useState<string>(defaultCues[0].id);
  const input = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const tapMarks = useRef<number[]>([]);

  const project = design.project;
  const bpm = design.bpm ?? 120;
  const cues = design.cues ?? defaultCues;
  const node = project.nodes.find(({ id }) => id === selected);
  // Read live evaluated values from runtime (re-read whenever tick or project updates).
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
    setPanels((current) => ({ ...current, [id]: !current[id] }));
  }

  function applyPresetLayout(preset: "studio" | "live" | "patch" | "stage") {
    if (preset === "studio") {
      setPanels({ graph: true, viewport: true, code: true, inspector: true });
    } else if (preset === "live") {
      setPanels({ graph: false, viewport: true, code: false, inspector: true });
    } else if (preset === "patch") {
      setPanels({ graph: true, viewport: true, code: false, inspector: true });
    } else {
      setPanels({ graph: false, viewport: true, code: false, inspector: false });
    }
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
    setDesign((current) => ({
      ...current,
      project: next,
      positions: position
        ? { ...current.positions, [position.id]: position.point }
        : current.positions,
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

  function connect(id: string, port: string, direction: "in" | "out") {
    setNotice("");
    if (direction === "out") {
      setPending(
        pending?.node === id && pending.port === port
          ? null
          : { node: id, port },
      );
      return;
    }
    if (!pending) {
      setNotice("Selecciona primero un puerto de salida.");
      return;
    }
    if (pending.node === id) {
      setNotice("No puedes conectar un operador consigo mismo.");
      return;
    }
    const source = project.nodes.find((item) => item.id === pending.node);
    const target = project.nodes.find((item) => item.id === id);
    if (!source || !target) return;
    const sourceType = nodeTypes[source.kind].outputType;
    const targetType = nodeTypes[target.kind].inputType;
    if (!sourceType || sourceType !== targetType) {
      setNotice(
        "Los puertos tienen tipos diferentes. Conecta señal con señal o puntos con puntos.",
      );
      return;
    }
    const edges = project.edges.filter(
      (edge) => edge.to.node !== id || edge.to.port !== port,
    );
    applyTopology({
      ...project,
      edges: [...edges, { from: pending, to: { node: id, port } }],
    });
    setPending(null);
  }

  function unlink(target: Edge) {
    applyTopology({
      ...project,
      edges: project.edges.filter((edge) => edge !== target),
    });
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
    }));
    setSelected(nodes[0]?.id ?? "");
    if (pending?.node === id) setPending(null);
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
      setPending(null);
      setGraphError("");
      setNotice("");
      setTick(playback.tick);
    } catch (error) {
      setNotice(messageFor(error));
    }
  }

  const showCenter = panels.viewport || panels.code;
  const visibleColumns: string[] = [];
  if (panels.graph) {
    visibleColumns.push(showCenter || panels.inspector ? "var(--graph-width)" : "1fr");
  }
  if (showCenter) {
    visibleColumns.push("minmax(320px, 1.75fr)");
  }
  if (panels.inspector) {
    visibleColumns.push(panels.graph || showCenter ? "var(--inspector-width)" : "1fr");
  }
  const anyVisible = panels.graph || showCenter || panels.inspector;

  const centerRows =
    panels.viewport && panels.code
      ? "minmax(200px, 1.15fr) minmax(170px, 0.75fr)"
      : "minmax(0, 1fr)";

  return (
    <div className="studio">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <span className="brand-symbol" aria-hidden="true">
              <Activity size={17} strokeWidth={2.35} />
            </span>
            <span className="brand-word">
              zence<span> / </span>R2
            </span>
          </div>
          <div className="project-title">
            <span className="title-rule" aria-hidden="true" />
            <h1>{design.title}</h1>
          </div>
          <div className="project-status" data-error={!!graphError}>
            {graphError ? (
              <>
                <AlertCircle size={13} /> Grafo pendiente
              </>
            ) : (
              <>
                <span className="status-dot" /> Grafo válido
              </>
            )}
          </div>
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
              title="Mostrar u ocultar Código Hydra (Alt+3)"
              onClick={() => togglePanel("code")}
            >
              <Code2 size={13} />
              <span>Código</span>
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
              title="Visor + Control en vivo"
              onClick={() => applyPresetLayout("live")}
            >
              Live
            </button>
            <button
              type="button"
              className="preset-chip"
              title="Solo Visor a pantalla completa de trabajo"
              onClick={() => applyPresetLayout("stage")}
            >
              Escenario
            </button>
          </div>
        </nav>

        <div className="topbar-actions">
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
        className="workspace"
        style={
          anyVisible
            ? { gridTemplateColumns: visibleColumns.join(" ") }
            : { gridTemplateColumns: "1fr" }
        }
      >
        <Graph
          project={project}
          positions={design.positions}
          values={liveValues}
          selected={selected}
          pending={pending}
          hidden={!panels.graph}
          onSelect={setSelected}
          onMove={(id, point) =>
            setDesign((current) => ({
              ...current,
              positions: { ...current.positions, [id]: point },
            }))
          }
          onPort={connect}
          onAdd={add}
          onDelete={remove}
          onLayout={() =>
            setDesign((current) => ({
              ...current,
              positions: autoLayout(current.project.nodes, current.project.edges),
            }))
          }
          onCancel={() => setPending(null)}
        />

        <div
          className={`center-stack ${showCenter ? "" : "is-panel-hidden"}`}
          style={{ gridTemplateRows: centerRows }}
        >
          <Viewport
            playback={playback}
            view={design.view}
            playing={playing}
            hidden={!panels.viewport}
            blackout={live.blackout}
            onFrame={setTick}
            onGrid={() => changeView({ grid: !design.view.grid })}
            mode={live.mode}
            onMode={live.setMode}
            bitmap={live.bitmap}
            texture={live.texture}
            onTexture={live.setTexture}
            overlay={
              <iframe
                ref={live.frame}
                className="hydra-surface"
                title="Motor Hydra"
                sandbox="allow-scripts"
                srcDoc={live.html}
                style={{
                  visibility: live.mode === "hydra" ? "visible" : "hidden",
                }}
              />
            }
          />
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
            liveValue={node ? liveValues[node.id] : undefined}
            view={design.view}
            onNode={changeNode}
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
                onClick={() => applyPresetLayout("stage")}
              >
                Mostrar Visor
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
