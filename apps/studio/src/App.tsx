import {
  Activity,
  AlertCircle,
  Download,
  FolderOpen,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { useRef, useState } from "react";
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
  initialDocument,
  initialTick,
  loadDocument,
  makeNode,
  positionFor,
  saveDocument,
} from "./studio.ts";
import type { Position, StudioDocument, ViewSettings } from "./studio.ts";

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
  const input = useRef<HTMLInputElement>(null);
  const project = design.project;
  const node = project.nodes.find(({ id }) => id === selected);

  const live = useLiveStudio(
    design.code,
    project.nodes,
    playing,
    playback,
    (id, value) => {
      const target = project.nodes.find((item) => item.id === id);
      if (target?.kind === "control.number")
        changeNode({ ...target, initial: value });
    },
  );
  const mediaInput = useRef<HTMLInputElement>(null);

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
    const source = project.nodes.find(({ id }) => id === pending.node);
    const target = project.nodes.find((item) => item.id === id);
    if (!source || !target) return;
    const compatible =
      (source.kind === "control.number" &&
        target.kind === "simulation.particles") ||
      (source.kind === "simulation.particles" &&
        target.kind === "scene.points");
    if (!compatible) {
      setNotice(
        "Los puertos tienen tipos diferentes. Conecta señal con intensidad o puntos con puntos.",
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
      -110,
      ...project.nodes.map(
        (item, index) => positionFor(item, index, design.positions).y,
      ),
    );
    const y = Math.max(bottom + 145, 35);
    applyTopology(
      { ...project, nodes: [...project.nodes, created] },
      { id: created.id, point: { x: 70, y } },
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

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">
          <span className="brand-symbol" aria-hidden="true">
            <Activity size={23} strokeWidth={2.35} />
          </span>
          <span className="brand-word">
            zence<span> / </span>R2
          </span>
        </div>
        <div className="topbar-center">Estudio audiovisual</div>
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
            <FolderOpen size={16} /> Abrir
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
            <Download size={16} /> Guardar
          </button>
        </div>
      </header>

      <div className="project-bar">
        <div className="project-title">
          <span className="title-rule" aria-hidden="true" />
          <h1>{design.title}</h1>
        </div>
        <div className="project-status" data-error={!!graphError}>
          {graphError ? (
            <>
              <AlertCircle size={15} /> Grafo pendiente
            </>
          ) : (
            <>
              <span className="status-dot" /> Grafo válido
            </>
          )}
        </div>
      </div>

      <main className="workspace">
        <Graph
          project={project}
          positions={design.positions}
          selected={selected}
          pending={pending}
          onSelect={setSelected}
          onMove={(id, point) =>
            setDesign((current) => ({
              ...current,
              positions: { ...current.positions, [id]: point },
            }))
          }
          onPort={connect}
          onAdd={add}
          onCancel={() => setPending(null)}
        />
        <div className="center-stack">
          <Viewport
            playback={playback}
            view={design.view}
            playing={playing}
            onFrame={setTick}
            onGrid={() => changeView({ grid: !design.view.grid })}
            mode={live.mode}
            onMode={live.setMode}
            bitmap={live.bitmap}
            texture={live.texture}
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
            onRun={live.run}
            onCode={(code) => setDesign((current) => ({ ...current, code }))}
          />
        </div>
        <div className="panel inspector-panel">
          <div className="extra-actions">
            <button className="button" onClick={live.openProjection}>
              Proyectar
            </button>
            <button className="button" onClick={() => void live.showRemote()}>
              Celular
            </button>
            <button
              className="button"
              onClick={() => void live.toggleMicrophone()}
            >
              {live.microphone ? "Apagar micrófono" : "Micrófono"}
            </button>
            <button className="button" onClick={live.toggleRecording}>
              {live.recording ? "Detener grabación" : "Grabar video"}
            </button>
            <button
              className="button"
              aria-pressed={live.texture}
              onClick={() => {
                live.setTexture(!live.texture);
                live.setMode("3d");
              }}
            >
              Hydra en 3D
            </button>
            <button
              className="button"
              onClick={() => mediaInput.current?.click()}
            >
              Imagen / video
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
          <Assistant
            document={design}
            onApply={(code) => {
              live.setAutomatic(false);
              setDesign((current) => ({ ...current, code }));
            }}
          />
          <Inspector
            project={project}
            node={node}
            view={design.view}
            onNode={changeNode}
            onView={changeView}
            onUnlink={unlink}
            onRemove={remove}
            onScene={(id) => applyTopology({ ...project, scene: id })}
          />
        </div>
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
      <footer className="transport" aria-label="Reproducción">
        <div className="transport-controls">
          <button
            type="button"
            className="play-button"
            aria-label={playing ? "Pausar" : "Reproducir"}
            title={playing ? "Pausar" : "Reproducir"}
            onClick={togglePlayback}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button
            type="button"
            className="icon-button reset-time"
            aria-label="Reiniciar simulación"
            title="Reiniciar simulación"
            onClick={() => seek(0)}
          >
            <RotateCcw size={16} />
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
        <div className="transport-info">
          <Activity size={15} />{" "}
          <span>
            {playback.runtime.pointCount.toLocaleString("es-CO")} partículas
          </span>
        </div>
      </footer>
    </div>
  );
}
