import { Activity, AlertCircle, Download, FolderOpen, Pause, Play, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Edge, Node, Project } from "../../../packages/engine/project.ts";
import { fixedStepSeconds } from "../../../packages/engine/clock.ts";
import { Graph } from "./components/Graph.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { Viewport } from "./components/Viewport.tsx";
import { durationTicks, Playback } from "./playback.ts";
import { initialDocument, initialTick, loadDocument, makeNode, positionFor, saveDocument } from "./studio.ts";
import type { Position, StudioDocument, ViewSettings } from "./studio.ts";

function messageFor(error: unknown): string {
  if (!(error instanceof Error)) return "No se pudo procesar el proyecto.";
  const detail = error.message;
  if (detail.startsWith("Missing input ")) return `Conecta la entrada ${detail.slice(14)}.`;
  if (detail.startsWith("Incompatible connection ")) return `Los puertos tienen tipos diferentes · ${detail.slice(24)}.`;
  if (detail.startsWith("Scene must reference")) return "Selecciona una escena como salida.";
  if (detail.startsWith("Unsupported project version")) return "La versión de este proyecto no es compatible.";
  if (error instanceof SyntaxError) return "El archivo no contiene JSON válido.";
  return detail;
}

function timestamp(tick: number): string {
  const seconds = tick * fixedStepSeconds;
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
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
  const input = useRef<HTMLInputElement>(null);
  const project = design.project;
  const node = project.nodes.find(({ id }) => id === selected);

  function applyTopology(next: Project, position?: { id: string; point: Position }) {
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
      positions: position ? { ...current.positions, [position.id]: position.point } : current.positions,
    }));
  }

  function changeNode(next: Node) {
    const original = project.nodes.find(({ id }) => id === next.id);
    const nextProject = { ...project, nodes: project.nodes.map((item) => item.id === next.id ? next : item) };
    if (next.kind === "control.number" && original?.kind === "control.number" && !graphError) {
      playback.setNumber(next.id, next.initial);
      setDesign((current) => ({ ...current, project: nextProject }));
      return;
    }
    applyTopology(nextProject);
  }

  function connect(id: string, port: string, direction: "in" | "out") {
    setNotice("");
    if (direction === "out") {
      setPending(pending?.node === id && pending.port === port ? null : { node: id, port });
      return;
    }
    if (!pending) {
      setNotice("Selecciona primero un puerto de salida.");
      return;
    }
    const source = project.nodes.find(({ id }) => id === pending.node);
    const target = project.nodes.find((item) => item.id === id);
    if (!source || !target) return;
    const compatible = (source.kind === "control.number" && target.kind === "simulation.particles") ||
      (source.kind === "simulation.particles" && target.kind === "scene.points");
    if (!compatible) {
      setNotice("Los puertos tienen tipos diferentes. Conecta señal con intensidad o puntos con puntos.");
      return;
    }
    const edges = project.edges.filter((edge) => edge.to.node !== id || edge.to.port !== port);
    applyTopology({ ...project, edges: [...edges, { from: pending, to: { node: id, port } }] });
    setPending(null);
  }

  function unlink(target: Edge) {
    applyTopology({ ...project, edges: project.edges.filter((edge) => edge !== target) });
  }

  function add(kind: Node["kind"]) {
    const created = makeNode(kind, project.nodes);
    const bottom = Math.max(-110, ...project.nodes.map((item, index) => positionFor(item, index, design.positions).y));
    const y = Math.max(bottom + 145, 35);
    applyTopology({ ...project, nodes: [...project.nodes, created] }, { id: created.id, point: { x: 70, y } });
    setSelected(created.id);
  }

  function remove(id: string) {
    const nodes = project.nodes.filter((item) => item.id !== id);
    const scene = project.scene === id ? nodes.find((item) => item.kind === "scene.points")?.id ?? "" : project.scene;
    const edges = project.edges.filter((edge) => edge.from.node !== id && edge.to.node !== id);
    applyTopology({ ...project, nodes, scene, edges });
    setDesign((current) => ({ ...current, positions: Object.fromEntries(Object.entries(current.positions).filter(([key]) => key !== id)) }));
    setSelected(nodes[0]?.id ?? "");
    if (pending?.node === id) setPending(null);
  }

  function changeView(patch: Partial<ViewSettings>) {
    setDesign((current) => ({ ...current, view: { ...current.view, ...patch } }));
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
      if (file.size > 2 * 1024 * 1024) throw new Error("El archivo supera el tamaño máximo de 2 MB.");
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

  return <div className="studio">
    <header className="topbar">
      <div className="brand">
        <span className="brand-symbol" aria-hidden="true"><Activity size={23} strokeWidth={2.35} /></span>
        <span className="brand-word">zence<span> / </span>R2</span>
      </div>
      <div className="topbar-center">Estudio audiovisual</div>
      <div className="topbar-actions">
        <input type="file" accept=".json,application/json" ref={input} hidden onChange={(event) => void openProject(event)} />
        <button type="button" className="button button-open" onClick={() => input.current?.click()}><FolderOpen size={16} /> Abrir</button>
        <button type="button" className="button button-save" title={graphError ? "Completa las conexiones antes de guardar" : "Descargar archivo del proyecto"} disabled={!!graphError} onClick={() => { saveDocument(design); setNotice("Proyecto descargado."); }}><Download size={16} /> Guardar</button>
      </div>
    </header>

    <div className="project-bar">
      <div className="project-title">
        <span className="title-rule" aria-hidden="true" />
        <h1>{design.title}</h1>
      </div>
      <div className="project-status" data-error={!!graphError}>
        {graphError ? <><AlertCircle size={15} /> Grafo pendiente</> : <><span className="status-dot" /> Grafo válido</>}
      </div>
    </div>

    <main className="workspace">
      <Graph project={project} positions={design.positions} selected={selected} pending={pending}
        onSelect={setSelected}
        onMove={(id, point) => setDesign((current) => ({ ...current, positions: { ...current.positions, [id]: point } }))}
        onPort={connect} onAdd={add} onCancel={() => setPending(null)} />
      <Viewport playback={playback} view={design.view} playing={playing}
        onFrame={setTick} onGrid={() => changeView({ grid: !design.view.grid })} />
      <Inspector project={project} node={node} view={design.view} onNode={changeNode} onView={changeView}
        onUnlink={unlink} onRemove={remove} onScene={(id) => applyTopology({ ...project, scene: id })} />
    </main>

    {(graphError || notice) && <div className="notice" role="status">
      {graphError && <span><AlertCircle size={14} /> {graphError} El visor conserva la última escena válida.</span>}
      {notice && <span>{notice}</span>}
      {notice && <button type="button" aria-label="Cerrar aviso" onClick={() => setNotice("")}>×</button>}
    </div>}

    <footer className="transport" aria-label="Reproducción">
      <div className="transport-controls">
        <button type="button" className="play-button" aria-label={playing ? "Pausar" : "Reproducir"} title={playing ? "Pausar" : "Reproducir"} onClick={togglePlayback}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
        <button type="button" className="icon-button reset-time" aria-label="Reiniciar simulación" title="Reiniciar simulación" onClick={() => seek(0)}><RotateCcw size={16} /></button>
      </div>
      <div className="timecode"><output>{timestamp(tick)}</output><small>{timestamp(durationTicks)}</small></div>
      <div className="timeline">
        <div className="timeline-labels" aria-hidden="true"><span>0 s</span><span>2 s</span><span>4 s</span><span>6 s</span><span>8 s</span><span>10 s</span></div>
        <input aria-label="Posición de reproducción" className="timeline-input" type="range" min={0} max={durationTicks} value={tick} onChange={(event) => {
          playback.playing = false;
          setPlaying(false);
          seek(Number(event.target.value));
        }} />
      </div>
      <div className="transport-info"><Activity size={15} /> <span>{playback.runtime.pointCount.toLocaleString("es-CO")} partículas</span></div>
    </footer>
  </div>;
}
