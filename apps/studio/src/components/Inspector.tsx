import {
  Activity,
  BookmarkPlus,
  Box,
  Calculator,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  Disc,
  FileCode2,
  Film,
  Gauge,
  Grid,
  Hand,
  Image,
  Layers,
  Lightbulb,
  Link2Off,
  Mic,
  MonitorPlay,
  Move3d,
  Palette,
  PersonStanding,
  Pin,
  PinOff,
  Radio,
  RotateCw,
  Sliders,
  Smartphone,
  Sparkles,
  Sun,
  Table2,
  Timer,
  Trash2,
  Type,
  User,
  Video,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AnalyzeMode,
  AudioBand,
  CompositeOp,
  Edge,
  HydraBuffer,
  LfoWave,
  MathOp,
  Node,
  Project,
  RampType,
  SkeletonEmitMode,
  SkeletonZone,
  TopFitMode,
  VideoDeviceMode,
} from "../../../../packages/engine/project.ts";
import { nodeMediaHub } from "../nodeMediaHub.ts";
import { cablesSwatches, familyColors, nodeTypes, portLabels } from "../studio.ts";
import type { CueSlot, NodeMeta, ViewSettings } from "../studio.ts";
import { MocapPanel } from "./MocapPanel.tsx";

const icons: Record<Node["kind"], typeof Activity> = {
  "control.number": Radio,
  "signal.lfo": Activity,
  "signal.timer": Timer,
  "signal.smooth": Waves,
  "signal.mapRange": Calculator,
  "signal.math": Calculator,
  "chop.noise": Waves,
  "chop.audioIn": Mic,
  "chop.speed": Gauge,
  "chop.analyze": Sliders,
  "hydra.osc": Waves,
  "hydra.noise": Sparkles,
  "hydra.shape": Disc,
  "hydra.kaleid": Sparkles,
  "hydra.rotate": RotateCw,
  "hydra.modulate": Activity,
  "hydra.color": Palette,
  "hydra.out": Box,
  "top.movieFileIn": Film,
  "top.videoDeviceIn": Camera,
  "top.ramp": Image,
  "top.level": Sun,
  "top.blur": Sparkles,
  "top.transform": Move3d,
  "top.composite": Layers,
  "top.displace": Waves,
  "top.text": Type,
  "top.chopTo": Sliders,
  "sop.sphere": Disc,
  "sop.box": Box,
  "sop.torus": CircleDot,
  "sop.grid": Grid,
  "sop.fileIn": FileCode2,
  "sop.transform": Move3d,
  "sop.noise": Waves,
  "sop.toPop": Sparkles,
  "mat.phong": Palette,
  "mat.pbr": Palette,
  "mat.constant": Palette,
  "dat.text": Type,
  "dat.table": Table2,
  "dat.evaluate": FileCode2,
  "comp.geo": Box,
  "comp.light": Lightbulb,
  "comp.camera": Camera,
  "comp.output": MonitorPlay,
  "mocap.body": PersonStanding,
  "mocap.hands": Hand,
  "scene.skeletonRig": User,
  "particles.skeleton": Sparkles,
  "particles.merge": Layers,
  "simulation.particles": CircleDot,
  "scene.points": Box,
};

export type StageOutputBridge = {
  projecting: boolean;
  recording: boolean;
  blackout: boolean;
  cues: CueSlot[];
  activeCue: string;
  onOpenProjection: () => void;
  onShowRemote: () => void;
  onToggleRecording: () => void;
  onBlackout: (next: boolean) => void;
  onTriggerCue: (cue: CueSlot) => void;
  onCaptureCue: (id: string) => void;
};

type InspectorProps = {
  project: Project;
  nodes: Node[];
  pinnedIds: string[];
  nodeMeta?: Record<string, NodeMeta>;
  liveValues: Record<string, number>;
  view: ViewSettings;
  stageOutput?: StageOutputBridge;
  onNode: (node: Node) => void;
  onNodeMeta: (id: string, patch: Partial<NodeMeta>) => void;
  onTogglePin: (id: string) => void;
  onDismissNode: (id: string) => void;
  onClearPinned: () => void;
  onView: (patch: Partial<ViewSettings>) => void;
  onUnlink: (edge: Edge) => void;
  onRemove: (id: string) => void;
  onScene: (id: string) => void;
};

export function Inspector({
  project,
  nodes,
  pinnedIds,
  nodeMeta,
  liveValues,
  view,
  stageOutput,
  onNode,
  onNodeMeta,
  onTogglePin,
  onDismissNode,
  onClearPinned,
  onView,
  onUnlink,
  onRemove,
  onScene,
}: InspectorProps) {
  const [, setMediaRev] = useState(0);
  useEffect(() => nodeMediaHub.subscribe(() => setMediaRev((r) => r + 1)), []);
  const pinnedSet = new Set(pinnedIds);

  return (
    <div className="inspector-body" aria-label="Propiedades de operadores">
      {(nodes.length > 1 || pinnedIds.length > 0) && (
        <div className="props-bin-bar">
          <span>
            {nodes.length} {nodes.length === 1 ? "panel" : "paneles"}
            {pinnedIds.length > 0 ? ` · ${pinnedIds.length} fijado(s)` : ""}
          </span>
          {pinnedIds.length > 0 && (
            <button
              type="button"
              className="preset-pill"
              title="Desfijar todos los paneles"
              onClick={onClearPinned}
            >
              <PinOff size={11} /> Desfijar todo
            </button>
          )}
        </div>
      )}

      {nodes.length === 0 ? (
        <div className="inspector-section">
          <p className="inspector-note">
            Selecciona uno o más nodos en el grafo (clic, Área o Lazo) o fíjalos con el icono de pin para ver sus parámetros aquí.
          </p>
        </div>
      ) : (
        nodes.map((node) => (
          <NodePropertyCard
            key={node.id}
            project={project}
            node={node}
            pinned={pinnedSet.has(node.id)}
            meta={nodeMeta?.[node.id]}
            liveValue={liveValues[node.id]}
            view={view}
            stageOutput={stageOutput}
            onNode={onNode}
            onNodeMeta={onNodeMeta}
            onTogglePin={() => onTogglePin(node.id)}
            onDismiss={() => onDismissNode(node.id)}
            onView={onView}
            onUnlink={onUnlink}
            onRemove={onRemove}
            onScene={onScene}
          />
        ))
      )}
    </div>
  );
}

type CardProps = {
  project: Project;
  node: Node;
  pinned: boolean;
  meta?: NodeMeta;
  liveValue?: number;
  view: ViewSettings;
  stageOutput?: StageOutputBridge;
  onNode: (node: Node) => void;
  onNodeMeta: (id: string, patch: Partial<NodeMeta>) => void;
  onTogglePin: () => void;
  onDismiss: () => void;
  onView: (patch: Partial<ViewSettings>) => void;
  onUnlink: (edge: Edge) => void;
  onRemove: (id: string) => void;
  onScene: (id: string) => void;
};

function NodePropertyCard({
  project,
  node,
  pinned,
  meta,
  liveValue,
  view,
  stageOutput,
  onNode,
  onNodeMeta,
  onTogglePin,
  onDismiss,
  onView,
  onUnlink,
  onRemove,
  onScene,
}: CardProps) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const description = nodeTypes[node.kind];
  const Icon = icons[node.kind];
  const incoming = project.edges.filter((edge) => edge.to.node === node.id);
  const isSignal =
    node.kind === "control.number" ||
    node.kind === "signal.lfo" ||
    node.kind === "signal.timer" ||
    node.kind === "signal.smooth" ||
    node.kind === "signal.mapRange" ||
    node.kind === "signal.math" ||
    node.kind === "chop.noise" ||
    node.kind === "chop.audioIn" ||
    node.kind === "chop.speed" ||
    node.kind === "chop.analyze" ||
    node.kind === "dat.evaluate" ||
    node.kind === "dat.table";

  function copyRef(id: string) {
    void navigator.clipboard?.writeText(`control("${id}")`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  function numInput(
    label: string,
    value: number,
    onChange: (next: number) => void,
    opts?: { min?: number; max?: number; step?: number },
  ) {
    return (
      <label className="field">
        {label}
        <input
          type="number"
          min={opts?.min}
          max={opts?.max}
          step={opts?.step ?? 0.1}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
        />
      </label>
    );
  }

  function boolInput(label: string, checked: boolean, onChange: (next: boolean) => void) {
    return (
      <label className="field">
        {label}
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    );
  }

  function colorInput(label: string, value: string, onChange: (next: string) => void) {
    return (
      <label className="field">
        {label}
        <span className="field-color">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
          <small>{value}</small>
        </span>
      </label>
    );
  }

  const nodeAccent = meta?.color || familyColors[description.category] || "#ae68ad";

  return (
    <div
      className={`prop-card ${pinned ? "is-pinned" : ""}`}
      data-prop-node={node.id}
      style={{ "--prop-accent": nodeAccent } as React.CSSProperties}
    >
      <div className="inspector-title">
        <button
          type="button"
          className="icon-button"
          title={collapsed ? "Expandir parámetros" : "Contraer parámetros"}
          aria-label={collapsed ? "Expandir" : "Contraer"}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
        <span
          className="node-icon"
          style={{ color: nodeAccent, borderColor: nodeAccent }}
        >
          <Icon size={16} />
        </span>
        <div className="inspector-title-text">
          <small>
            <span className="td-family-tag prop-family-tag">{description.category}</span>{" "}
            {node.id}
          </small>
          <h3>Op {description.name}</h3>
        </div>
        {isSignal && (
          <button
            type="button"
            className="icon-button"
            title={`Copiar control("${node.id}")`}
            aria-label={`Copiar control("${node.id}")`}
            onClick={() => copyRef(node.id)}
          >
            <Copy size={12} />
          </button>
        )}
        <button
          type="button"
          className={`icon-button prop-pin-btn ${pinned ? "is-active" : ""}`}
          title={pinned ? "Desfijar este panel (Nuke Pin)" : "Fijar este panel para ver varios nodos a la vez"}
          aria-label={`Fijar ${node.id}`}
          aria-pressed={pinned}
          onClick={onTogglePin}
        >
          <Pin size={12} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Cerrar panel de propiedades"
          aria-label={`Cerrar ${node.id}`}
          onClick={onDismiss}
        >
          <X size={12} />
        </button>
      </div>
      {!collapsed && (
        <>
          <p className="inspector-desc">{description.description}</p>
          {copied && (
            <div className="inspector-copied">
              Copiado: control(&quot;{node.id}&quot;)
            </div>
          )}

          <div className="inspector-section">
            <h4>Parámetros</h4>

            {node.kind === "control.number" && (
              <>
                <label className="range-label" htmlFor="intensity">
                  <span>Valor</span>
                  <output>{node.initial.toFixed(2)}</output>
                </label>
                <input
                  id="intensity"
                  type="range"
                  min={node.min}
                  max={node.max}
                  step="any"
                  value={node.initial}
                  onChange={(event) =>
                    onNode({ ...node, initial: Number(event.target.value) })
                  }
                />
                <div className="range-ends">
                  <span>{node.min.toFixed(1)}</span>
                  <span>{node.max.toFixed(1)}</span>
                </div>
                <div className="field-pair">
                  <label className="field">
                    Min
                    <input
                      type="number"
                      step="any"
                      value={node.min}
                      onChange={(e) => {
                        const min = Number(e.target.value);
                        if (Number.isFinite(min) && min <= node.max) {
                          onNode({
                            ...node,
                            min,
                            initial: Math.max(min, node.initial),
                          });
                        }
                      }}
                    />
                  </label>
                  <label className="field">
                    Max
                    <input
                      type="number"
                      step="any"
                      value={node.max}
                      onChange={(e) => {
                        const max = Number(e.target.value);
                        if (Number.isFinite(max) && max >= node.min) {
                          onNode({
                            ...node,
                            max,
                            initial: Math.min(max, node.initial),
                          });
                        }
                      }}
                    />
                  </label>
                </div>
              </>
            )}

            {node.kind === "signal.lfo" && (
              <>
                <label className="field">
                  Onda
                  <select
                    className="mode-select"
                    value={node.wave}
                    onChange={(e) =>
                      onNode({ ...node, wave: e.target.value as LfoWave })
                    }
                  >
                    <option value="sine">Senoidal</option>
                    <option value="triangle">Triangular</option>
                    <option value="saw">Sierra</option>
                    <option value="square">Cuadrada</option>
                  </select>
                </label>
                {numInput("Frec. (Hz)", node.rate, (rate) => {
                  if (rate >= 0 && rate <= 100) onNode({ ...node, rate });
                }, { min: 0, max: 20, step: 0.1 })}
                {numInput("Amplitud", node.amplitude, (amplitude) =>
                  onNode({ ...node, amplitude }),
                )}
                {numInput("Offset", node.offset, (offset) =>
                  onNode({ ...node, offset }),
                )}
              </>
            )}

            {node.kind === "signal.timer" &&
              numInput("Velocidad", node.speed, (speed) =>
                onNode({ ...node, speed }),
              )}

            {node.kind === "signal.smooth" && (
              <label className="field">
                Suavizado
                <input
                  type="range"
                  min={0}
                  max={0.98}
                  step={0.02}
                  value={node.smoothing}
                  onChange={(e) =>
                    onNode({ ...node, smoothing: Number(e.target.value) })
                  }
                />
              </label>
            )}

            {node.kind === "signal.mapRange" && (
              <>
                <div className="field-pair">
                  {numInput("In Min", node.inMin, (inMin) =>
                    onNode({ ...node, inMin }),
                  )}
                  {numInput("In Max", node.inMax, (inMax) =>
                    onNode({ ...node, inMax }),
                  )}
                </div>
                <div className="field-pair">
                  {numInput("Out Min", node.outMin, (outMin) =>
                    onNode({ ...node, outMin }),
                  )}
                  {numInput("Out Max", node.outMax, (outMax) =>
                    onNode({ ...node, outMax }),
                  )}
                </div>
                <label className="field">
                  Clamp
                  <input
                    type="checkbox"
                    checked={node.clamp}
                    onChange={(e) =>
                      onNode({ ...node, clamp: e.target.checked })
                    }
                  />
                </label>
              </>
            )}

            {node.kind === "signal.math" && (
              <>
                <label className="field">
                  Operación
                  <select
                    className="mode-select"
                    value={node.op}
                    onChange={(e) =>
                      onNode({ ...node, op: e.target.value as MathOp })
                    }
                  >
                    <option value="mul">Multiplicar (×)</option>
                    <option value="add">Sumar (+)</option>
                    <option value="clamp">Limitar (clamp)</option>
                    <option value="abs">Absoluto</option>
                    <option value="sin">Seno</option>
                  </select>
                </label>
                {numInput(
                  node.op === "clamp" ? "Máximo" : "Factor",
                  node.factor,
                  (factor) => onNode({ ...node, factor }),
                )}
                {numInput(
                  node.op === "clamp" ? "Mínimo" : "Sesgo",
                  node.bias,
                  (bias) => onNode({ ...node, bias }),
                )}
              </>
            )}

            {node.kind === "hydra.osc" && (
              <>
                {numInput("Frecuencia", node.freq, (freq) => onNode({ ...node, freq }), { step: 1 })}
                {numInput("Sync", node.sync, (sync) => onNode({ ...node, sync }), { step: 0.02 })}
                {numInput("Offset", node.offset, (offset) => onNode({ ...node, offset }), { step: 0.1 })}
              </>
            )}

            {node.kind === "hydra.noise" && (
              <>
                {numInput("Escala", node.scale, (scale) => onNode({ ...node, scale }), { step: 0.5 })}
                {numInput("Offset", node.offset, (offset) => onNode({ ...node, offset }), { step: 0.05 })}
              </>
            )}

            {node.kind === "hydra.shape" && (
              <>
                {numInput("Lados", node.sides, (sides) => onNode({ ...node, sides }), { min: 1, step: 1 })}
                {numInput("Radio", node.radius, (radius) => onNode({ ...node, radius }), { step: 0.05 })}
                {numInput("Suavizado", node.smoothing, (smoothing) => onNode({ ...node, smoothing }), { min: 0, step: 0.01 })}
              </>
            )}

            {node.kind === "hydra.kaleid" &&
              numInput("Lados", node.sides, (sides) => onNode({ ...node, sides }), { min: 1, step: 1 })}

            {node.kind === "hydra.rotate" && (
              <>
                {numInput("Ángulo", node.angle, (angle) => onNode({ ...node, angle }), { step: 0.1 })}
                {numInput("Velocidad", node.speed, (speed) => onNode({ ...node, speed }), { step: 0.02 })}
              </>
            )}

            {node.kind === "hydra.modulate" &&
              numInput("Cantidad", node.amount, (amount) => onNode({ ...node, amount }), { step: 0.02 })}

            {node.kind === "hydra.color" && (
              <>
                {numInput("Rojo (R)", node.r, (r) => onNode({ ...node, r }), { step: 0.05 })}
                {numInput("Verde (G)", node.g, (g) => onNode({ ...node, g }), { step: 0.05 })}
                {numInput("Azul (B)", node.b, (b) => onNode({ ...node, b }), { step: 0.05 })}
              </>
            )}

            {node.kind === "hydra.out" && (
              <label className="field">
                Buffer
                <select
                  className="mode-select"
                  value={node.buffer}
                  onChange={(e) =>
                    onNode({ ...node, buffer: e.target.value as HydraBuffer })
                  }
                >
                  <option value="o0">o0 (Principal)</option>
                  <option value="o1">o1</option>
                  <option value="o2">o2</option>
                  <option value="o3">o3</option>
                </select>
              </label>
            )}

            {node.kind === "mocap.body" && (
              <>
                <label className="field">
                  Vista espejo
                  <input
                    type="checkbox"
                    checked={node.mirror}
                    onChange={(e) => onNode({ ...node, mirror: e.target.checked })}
                  />
                </label>
                {numInput("Suavizado", node.smoothing, (smoothing) => onNode({ ...node, smoothing }), {
                  min: 0,
                  max: 0.95,
                  step: 0.05,
                })}
                {numInput("Escala", node.scale, (scale) => onNode({ ...node, scale }), {
                  min: 0.2,
                  max: 5,
                  step: 0.1,
                })}
              </>
            )}

            {node.kind === "mocap.hands" && (
              <>
                <label className="field">
                  Seguimiento de dedos
                  <input
                    type="checkbox"
                    checked={node.fingers}
                    onChange={(e) => onNode({ ...node, fingers: e.target.checked })}
                  />
                </label>
                {numInput("Suavizado", node.smoothing, (smoothing) => onNode({ ...node, smoothing }), {
                  min: 0,
                  max: 0.95,
                  step: 0.05,
                })}
                {numInput("Ganancia", node.spreadGain, (spreadGain) => onNode({ ...node, spreadGain }), {
                  min: 0.1,
                  max: 4,
                  step: 0.1,
                })}
              </>
            )}

            {node.kind === "scene.skeletonRig" && (
              <>
                <label className="field">
                  Mostrar huesos
                  <input
                    type="checkbox"
                    checked={node.showBones}
                    onChange={(e) => onNode({ ...node, showBones: e.target.checked })}
                  />
                </label>
                <label className="field">
                  Mostrar nodos
                  <input
                    type="checkbox"
                    checked={node.showJoints}
                    onChange={(e) => onNode({ ...node, showJoints: e.target.checked })}
                  />
                </label>
                <label className="field">
                  Animar modelo GLB/FBX
                  <input
                    type="checkbox"
                    checked={node.retargetModel}
                    onChange={(e) => onNode({ ...node, retargetModel: e.target.checked })}
                  />
                </label>
                {numInput("Tamaño junta", node.jointSize, (jointSize) => onNode({ ...node, jointSize }), {
                  min: 0.2,
                  max: 4,
                  step: 0.1,
                })}
              </>
            )}

            {node.kind === "particles.skeleton" && (
              <>
                <label className="field">
                  Zona del esqueleto
                  <select
                    className="mode-select"
                    value={node.zone}
                    onChange={(e) =>
                      onNode({ ...node, zone: e.target.value as SkeletonZone })
                    }
                  >
                    <option value="all">Cuerpo completo</option>
                    <option value="hands">Manos y muñecas</option>
                    <option value="arms">Brazos</option>
                    <option value="spine">Columna y torso</option>
                    <option value="head">Cabeza y cuello</option>
                    <option value="legs">Piernas</option>
                  </select>
                </label>
                <label className="field">
                  Modo de enlace
                  <select
                    className="mode-select"
                    value={node.attachMode}
                    onChange={(e) =>
                      onNode({ ...node, attachMode: e.target.value as SkeletonEmitMode })
                    }
                  >
                    <option value="aura">Aura orbital</option>
                    <option value="attach">Adherido al hueso</option>
                    <option value="trail">Estela ascendente</option>
                  </select>
                </label>
                {numInput("Dispersión", node.spread, (spread) => onNode({ ...node, spread }), {
                  min: 0.01,
                  max: 2,
                  step: 0.02,
                })}
                {numInput("Partículas", node.count, (count) => {
                  const n = Math.round(count);
                  if (n >= 1 && n <= 10000) onNode({ ...node, count: n });
                }, { min: 1, max: 10000, step: 64 })}
              </>
            )}

            {node.kind === "particles.merge" && (
              <p className="inspector-note">Combina las entradas A y B en una sola nube 3D.</p>
            )}

            {node.kind === "simulation.particles" && (
              <>
                <label className="field">
                  Partículas
                  <input
                    type="number"
                    key={`${node.id}-${node.count}`}
                    min={1}
                    max={10000}
                    step={1}
                    defaultValue={node.count}
                    onBlur={(event) => {
                      const value = event.target.valueAsNumber;
                      if (Number.isInteger(value) && value >= 1 && value <= 10000) {
                        onNode({ ...node, count: value });
                      } else {
                        event.target.value = String(node.count);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                </label>
                <label className="field">
                  Semilla
                  <input
                    type="number"
                    key={`${node.id}-${node.seed}`}
                    min={0}
                    max={4294967295}
                    step={1}
                    defaultValue={node.seed}
                    onBlur={(event) => {
                      const value = event.target.valueAsNumber;
                      if (Number.isInteger(value) && value >= 0 && value <= 4294967295) {
                        onNode({ ...node, seed: value });
                      } else {
                        event.target.value = String(node.seed);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                </label>
              </>
            )}

            {node.kind === "scene.points" &&
              (project.scene === node.id ? (
                <p className="inspector-note">
                  <span className="status-dot" /> Salida activa
                </p>
              ) : (
                <button
                  className="button button-subtle"
                  type="button"
                  onClick={() => onScene(node.id)}
                >
                  Mostrar en el visor
                </button>
              ))}

            {/* TouchDesigner CHOP */}
            {node.kind === "chop.noise" && (
              <>
                {numInput("Velocidad / Frecuencia", node.rate, (rate) => onNode({ ...node, rate }), { min: 0.05, max: 60, step: 0.1 })}
                {numInput("Amplitud", node.amplitude, (amplitude) => onNode({ ...node, amplitude }), { min: 0, max: 10, step: 0.05 })}
                {numInput("Offset", node.offset, (offset) => onNode({ ...node, offset }), { step: 0.05 })}
                {numInput("Seed", node.seed, (seed) => onNode({ ...node, seed: Math.round(seed) }), { min: 0, step: 1 })}
              </>
            )}

            {node.kind === "chop.audioIn" && (
              <>
                <label className="field">
                  Banda de frecuencia
                  <select
                    value={node.band}
                    onChange={(e) => onNode({ ...node, band: e.target.value as AudioBand })}
                  >
                    <option value="bass">Graves (Bass)</option>
                    <option value="mid">Medios (Mid)</option>
                    <option value="high">Agudos (High)</option>
                    <option value="audio">Nivel Global</option>
                  </select>
                </label>
                {numInput("Ganancia", node.gain, (gain) => onNode({ ...node, gain }), { min: 0, max: 10, step: 0.1 })}
                <button
                  type="button"
                  className="button button-subtle"
                  onClick={() => window.dispatchEvent(new CustomEvent("zence:toggle-mic"))}
                >
                  <Mic size={13} /> Activar / Detener micrófono
                </button>
              </>
            )}

            {node.kind === "chop.speed" && (
              <>
                {numInput("Ganancia", node.gain, (gain) => onNode({ ...node, gain }), { min: -20, max: 20, step: 0.1 })}
              </>
            )}

            {node.kind === "chop.analyze" && (
              <label className="field">
                Modo de análisis
                <select
                  value={node.mode}
                  onChange={(e) => onNode({ ...node, mode: e.target.value as AnalyzeMode })}
                >
                  <option value="beat">Fase de Beat (0..1)</option>
                  <option value="pulse">Pulso de Impacto</option>
                  <option value="bpmNorm">BPM Normalizado</option>
                </select>
              </label>
            )}

            {/* TouchDesigner TOP */}
            {node.kind === "top.movieFileIn" && (() => {
              const media = nodeMediaHub.getEntry(node.id);
              return (
                <>
                  <label className="field">
                    Buffer de textura
                    <select
                      value={node.sourceSlot}
                      onChange={(e) =>
                        onNode({ ...node, sourceSlot: Number(e.target.value) as 0 | 1 | 2 | 3 })
                      }
                    >
                      <option value={0}>s0</option>
                      <option value={1}>s1</option>
                      <option value={2}>s2</option>
                      <option value={3}>s3</option>
                    </select>
                  </label>
                  <label className="field">
                    Ajuste (Fit)
                    <select
                      value={node.fit}
                      onChange={(e) => onNode({ ...node, fit: e.target.value as TopFitMode })}
                    >
                      <option value="cover">Cover</option>
                      <option value="contain">Contain</option>
                      <option value="stretch">Stretch</option>
                    </select>
                  </label>
                  {numInput("Velocidad", node.speed, (speed) => onNode({ ...node, speed }), { min: 0.1, max: 4, step: 0.1 })}
                  {boolInput("Loop", node.loop, (loop) => onNode({ ...node, loop }))}
                  <label className="button button-subtle" style={{ cursor: "pointer" }}>
                    <Film size={13} /> Cargar Imagen / Video
                    <input
                      type="file"
                      accept="image/*,video/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void nodeMediaHub.loadMediaFile(node.id, file, node.sourceSlot);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {media?.label && <p className="inspector-note">Activo: {media.label}</p>}
                  {media && (
                    <button
                      type="button"
                      className="button button-subtle"
                      onClick={() => nodeMediaHub.stopMedia(node.id)}
                    >
                      Limpiar medio
                    </button>
                  )}
                </>
              );
            })()}

            {node.kind === "top.videoDeviceIn" && (() => {
              const media = nodeMediaHub.getEntry(node.id);
              return (
                <>
                  <label className="field">
                    Dispositivo
                    <select
                      value={node.deviceMode}
                      onChange={(e) =>
                        onNode({ ...node, deviceMode: e.target.value as VideoDeviceMode })
                      }
                    >
                      <option value="camera">Cámara Web</option>
                      <option value="screen">Capturar Pantalla</option>
                    </select>
                  </label>
                  <label className="field">
                    Buffer de textura
                    <select
                      value={node.sourceSlot}
                      onChange={(e) =>
                        onNode({ ...node, sourceSlot: Number(e.target.value) as 0 | 1 | 2 | 3 })
                      }
                    >
                      <option value={0}>s0</option>
                      <option value={1}>s1</option>
                      <option value={2}>s2</option>
                      <option value={3}>s3</option>
                    </select>
                  </label>
                  {boolInput("Espejo horizontal", node.mirror, (mirror) => onNode({ ...node, mirror }))}
                  <button
                    type="button"
                    className="button button-subtle"
                    onClick={() => {
                      if (media?.active) nodeMediaHub.stopMedia(node.id);
                      else void nodeMediaHub.startDevice(node.id, node.deviceMode, node.sourceSlot);
                    }}
                  >
                    <Camera size={13} /> {media?.active ? "Detener captura" : "Iniciar captura"}
                  </button>
                  {media?.label && <p className="inspector-note">Fuente: {media.label}</p>}
                </>
              );
            })()}

            {node.kind === "top.ramp" && (
              <>
                <label className="field">
                  Tipo de rampa
                  <select
                    value={node.rampType}
                    onChange={(e) => onNode({ ...node, rampType: e.target.value as RampType })}
                  >
                    <option value="linear">Lineal</option>
                    <option value="radial">Radial</option>
                    <option value="circular">Circular</option>
                  </select>
                </label>
                {numInput("Velocidad", node.speed, (speed) => onNode({ ...node, speed }), { step: 0.05 })}
                {numInput("Color 1 R", node.r1, (r1) => onNode({ ...node, r1 }), { min: 0, max: 1, step: 0.05 })}
                {numInput("Color 1 G", node.g1, (g1) => onNode({ ...node, g1 }), { min: 0, max: 1, step: 0.05 })}
                {numInput("Color 1 B", node.b1, (b1) => onNode({ ...node, b1 }), { min: 0, max: 1, step: 0.05 })}
                {numInput("Color 2 R", node.r2, (r2) => onNode({ ...node, r2 }), { min: 0, max: 1, step: 0.05 })}
                {numInput("Color 2 G", node.g2, (g2) => onNode({ ...node, g2 }), { min: 0, max: 1, step: 0.05 })}
                {numInput("Color 2 B", node.b2, (b2) => onNode({ ...node, b2 }), { min: 0, max: 1, step: 0.05 })}
              </>
            )}

            {node.kind === "top.level" && (
              <>
                {numInput("Brillo", node.brightness, (brightness) => onNode({ ...node, brightness }), { min: -1, max: 1, step: 0.05 })}
                {numInput("Contraste", node.contrast, (contrast) => onNode({ ...node, contrast }), { min: 0, max: 4, step: 0.05 })}
                {numInput("Saturación", node.saturate, (saturate) => onNode({ ...node, saturate }), { min: 0, max: 4, step: 0.05 })}
                {numInput("Invertir", node.invert, (invert) => onNode({ ...node, invert }), { min: 0, max: 1, step: 0.05 })}
              </>
            )}

            {node.kind === "top.blur" && (
              numInput("Pixelado / Difuminado", node.size, (size) => onNode({ ...node, size }), { min: 0, max: 1, step: 0.05 })
            )}

            {node.kind === "top.transform" && (
              <>
                {numInput("Mover X", node.tx, (tx) => onNode({ ...node, tx }), { step: 0.05 })}
                {numInput("Mover Y", node.ty, (ty) => onNode({ ...node, ty }), { step: 0.05 })}
                {numInput("Escala", node.scale, (scale) => onNode({ ...node, scale }), { min: 0.05, max: 10, step: 0.05 })}
                {numInput("Rotación", node.rotate, (rotate) => onNode({ ...node, rotate }), { step: 0.05 })}
                {numInput("Repetición", node.repeat, (repeat) => onNode({ ...node, repeat: Math.max(1, Math.round(repeat)) }), { min: 1, max: 16, step: 1 })}
              </>
            )}

            {node.kind === "top.composite" && (
              <>
                <label className="field">
                  Operación
                  <select
                    value={node.op}
                    onChange={(e) => onNode({ ...node, op: e.target.value as CompositeOp })}
                  >
                    <option value="blend">Blend</option>
                    <option value="add">Add</option>
                    <option value="diff">Diff</option>
                    <option value="mult">Multiply</option>
                  </select>
                </label>
                {numInput("Mezcla", node.amount, (amount) => onNode({ ...node, amount }), { min: 0, max: 1, step: 0.05 })}
              </>
            )}

            {node.kind === "top.displace" && (
              numInput("Peso", node.weight, (weight) => onNode({ ...node, weight }), { min: -2, max: 2, step: 0.05 })
            )}

            {node.kind === "top.text" && (
              <>
                <label className="field">
                  Texto
                  <input
                    type="text"
                    value={node.text}
                    onChange={(e) => onNode({ ...node, text: e.target.value })}
                  />
                </label>
                {numInput("Tamaño fuente", node.fontSize, (fontSize) => onNode({ ...node, fontSize }), { min: 12, max: 256, step: 4 })}
                {colorInput("Color", node.color, (color) => onNode({ ...node, color }))}
                <label className="field">
                  Buffer de textura
                  <select
                    value={node.sourceSlot}
                    onChange={(e) =>
                      onNode({ ...node, sourceSlot: Number(e.target.value) as 0 | 1 | 2 | 3 })
                    }
                  >
                    <option value={0}>s0</option>
                    <option value={1}>s1</option>
                    <option value={2}>s2</option>
                    <option value={3}>s3</option>
                  </select>
                </label>
              </>
            )}

            {node.kind === "top.chopTo" && (
              numInput("Frecuencia base", node.freq, (freq) => onNode({ ...node, freq }), { min: 1, max: 60, step: 0.5 })
            )}

            {/* TouchDesigner SOP */}
            {node.kind === "sop.sphere" && (
              <>
                {numInput("Radio", node.radius, (radius) => onNode({ ...node, radius }), { min: 0.1, max: 20, step: 0.1 })}
                {numInput("Segmentos", node.segments, (segments) => onNode({ ...node, segments: Math.max(4, Math.round(segments)) }), { min: 4, max: 64, step: 2 })}
              </>
            )}

            {node.kind === "sop.box" && (
              <>
                {numInput("Ancho", node.width, (width) => onNode({ ...node, width }), { min: 0.1, max: 20, step: 0.1 })}
                {numInput("Alto", node.height, (height) => onNode({ ...node, height }), { min: 0.1, max: 20, step: 0.1 })}
                {numInput("Profundidad", node.depth, (depth) => onNode({ ...node, depth }), { min: 0.1, max: 20, step: 0.1 })}
                {numInput("Divisiones", node.segments, (segments) => onNode({ ...node, segments: Math.max(1, Math.round(segments)) }), { min: 1, max: 16, step: 1 })}
              </>
            )}

            {node.kind === "sop.torus" && (
              <>
                {numInput("Radio", node.radius, (radius) => onNode({ ...node, radius }), { min: 0.1, max: 20, step: 0.1 })}
                {numInput("Tubo", node.tube, (tube) => onNode({ ...node, tube }), { min: 0.05, max: 5, step: 0.05 })}
                {numInput("Segmentos", node.segments, (segments) => onNode({ ...node, segments: Math.max(6, Math.round(segments)) }), { min: 6, max: 64, step: 2 })}
              </>
            )}

            {node.kind === "sop.grid" && (
              <>
                {numInput("Tamaño", node.size, (size) => onNode({ ...node, size }), { min: 0.2, max: 40, step: 0.2 })}
                {numInput("Divisiones", node.divisions, (divisions) => onNode({ ...node, divisions: Math.max(2, Math.round(divisions)) }), { min: 2, max: 64, step: 2 })}
              </>
            )}

            {node.kind === "sop.fileIn" && (
              <>
                {numInput("Escala", node.scale, (scale) => onNode({ ...node, scale }), { min: 0.05, max: 20, step: 0.05 })}
                <label className="field">
                  Archivo 3D (.glb / .fbx / .obj)
                  <input
                    type="text"
                    value={node.fileName}
                    onChange={(e) => onNode({ ...node, fileName: e.target.value })}
                  />
                </label>
                <label className="button button-subtle" style={{ cursor: "pointer" }}>
                  <FileCode2 size={13} /> Cargar archivo 3D
                  <input
                    type="file"
                    accept=".fbx,.glb,.gltf,.obj"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onNode({ ...node, fileName: file.name });
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </>
            )}

            {node.kind === "sop.transform" && (
              <>
                {numInput("Pos X", node.tx, (tx) => onNode({ ...node, tx }), { step: 0.1 })}
                {numInput("Pos Y", node.ty, (ty) => onNode({ ...node, ty }), { step: 0.1 })}
                {numInput("Pos Z", node.tz, (tz) => onNode({ ...node, tz }), { step: 0.1 })}
                {numInput("Rot X", node.rx, (rx) => onNode({ ...node, rx }), { step: 0.1 })}
                {numInput("Rot Y", node.ry, (ry) => onNode({ ...node, ry }), { step: 0.1 })}
                {numInput("Rot Z", node.rz, (rz) => onNode({ ...node, rz }), { step: 0.1 })}
                {numInput("Escala", node.scale, (scale) => onNode({ ...node, scale }), { min: 0.05, max: 10, step: 0.05 })}
              </>
            )}

            {node.kind === "sop.noise" && (
              <>
                {numInput("Amplitud", node.amplitude, (amplitude) => onNode({ ...node, amplitude }), { min: 0, max: 5, step: 0.05 })}
                {numInput("Frecuencia", node.freq, (freq) => onNode({ ...node, freq }), { min: 0.1, max: 20, step: 0.1 })}
                {numInput("Velocidad", node.speed, (speed) => onNode({ ...node, speed }), { min: -10, max: 10, step: 0.1 })}
              </>
            )}

            {node.kind === "sop.toPop" && (
              <>
                {numInput("Partículas", node.count, (count) => onNode({ ...node, count: Math.max(1, Math.min(10000, Math.round(count))) }), { min: 1, max: 10000, step: 64 })}
                {numInput("Seed", node.seed, (seed) => onNode({ ...node, seed: Math.round(seed) }), { min: 0, step: 1 })}
                {numInput("Dispersión", node.spread, (spread) => onNode({ ...node, spread }), { min: 0, max: 5, step: 0.05 })}
              </>
            )}

            {/* TouchDesigner MAT */}
            {node.kind === "mat.phong" && (
              <>
                {colorInput("Color base", node.color, (color) => onNode({ ...node, color }))}
                {colorInput("Especular", node.specular, (specular) => onNode({ ...node, specular }))}
                {numInput("Brillo", node.shininess, (shininess) => onNode({ ...node, shininess }), { min: 0, max: 200, step: 5 })}
                {numInput("Opacidad", node.opacity, (opacity) => onNode({ ...node, opacity }), { min: 0, max: 1, step: 0.05 })}
                {boolInput("Wireframe", node.wireframe, (wireframe) => onNode({ ...node, wireframe }))}
              </>
            )}

            {node.kind === "mat.pbr" && (
              <>
                {colorInput("Color base", node.color, (color) => onNode({ ...node, color }))}
                {numInput("Metalness", node.metalness, (metalness) => onNode({ ...node, metalness }), { min: 0, max: 1, step: 0.05 })}
                {numInput("Roughness", node.roughness, (roughness) => onNode({ ...node, roughness }), { min: 0, max: 1, step: 0.05 })}
                {numInput("Emisivo", node.emissiveIntensity, (emissiveIntensity) => onNode({ ...node, emissiveIntensity }), { min: 0, max: 5, step: 0.1 })}
                {boolInput("Wireframe", node.wireframe, (wireframe) => onNode({ ...node, wireframe }))}
              </>
            )}

            {node.kind === "mat.constant" && (
              <>
                {colorInput("Color", node.color, (color) => onNode({ ...node, color }))}
                {numInput("Opacidad", node.opacity, (opacity) => onNode({ ...node, opacity }), { min: 0, max: 1, step: 0.05 })}
                {boolInput("Wireframe", node.wireframe, (wireframe) => onNode({ ...node, wireframe }))}
              </>
            )}

            {/* TouchDesigner DAT */}
            {node.kind === "dat.text" && (
              <textarea
                className="inspector-textarea"
                value={node.text}
                onChange={(e) => onNode({ ...node, text: e.target.value })}
              />
            )}

            {node.kind === "dat.table" && (
              <>
                <textarea
                  className="inspector-textarea"
                  value={node.csv}
                  onChange={(e) => onNode({ ...node, csv: e.target.value })}
                />
                {numInput("Fila (row)", node.row, (row) => onNode({ ...node, row: Math.max(0, Math.round(row)) }), { min: 0, step: 1 })}
                {numInput("Columna (col)", node.col, (col) => onNode({ ...node, col: Math.max(0, Math.round(col)) }), { min: 0, step: 1 })}
              </>
            )}

            {node.kind === "dat.evaluate" && (
              <label className="field">
                Expresión (x, t, sin, cos, clamp...)
                <input
                  type="text"
                  value={node.expr}
                  onChange={(e) => onNode({ ...node, expr: e.target.value })}
                />
              </label>
            )}

            {/* TouchDesigner COMP */}
            {node.kind === "comp.geo" && (
              <>
                {boolInput("Visible en visor 3D", node.visible, (visible) => onNode({ ...node, visible }))}
                {numInput("Auto Spin", node.autoSpin, (autoSpin) => onNode({ ...node, autoSpin }), { min: -10, max: 10, step: 0.05 })}
              </>
            )}

            {node.kind === "comp.light" && (
              <>
                {colorInput("Color de luz", node.color, (color) => onNode({ ...node, color }))}
                {numInput("Intensidad", node.intensity, (intensity) => onNode({ ...node, intensity }), { min: 0, max: 20, step: 0.1 })}
                {numInput("Pos X", node.x, (x) => onNode({ ...node, x }), { step: 0.25 })}
                {numInput("Pos Y", node.y, (y) => onNode({ ...node, y }), { step: 0.25 })}
                {numInput("Pos Z", node.z, (z) => onNode({ ...node, z }), { step: 0.25 })}
              </>
            )}

            {node.kind === "comp.camera" && (
              <>
                {numInput("FOV (°)", node.fov, (fov) => onNode({ ...node, fov }), { min: 15, max: 120, step: 1 })}
                {boolInput("Auto Rotación", node.autoRotate, (autoRotate) => onNode({ ...node, autoRotate }))}
                {numInput("Velocidad órbita", node.speed, (speed) => onNode({ ...node, speed }), { min: 0, max: 10, step: 0.1 })}
              </>
            )}

            {node.kind === "comp.output" && stageOutput && (
              <>
                <div className="extra-actions" style={{ padding: 0, borderBottom: 0 }}>
                  <button
                    type="button"
                    className="button"
                    aria-pressed={stageOutput.projecting}
                    onClick={stageOutput.onOpenProjection}
                  >
                    <MonitorPlay size={13} /> Proyectar
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={stageOutput.onShowRemote}
                  >
                    <Smartphone size={13} /> Celular
                  </button>
                  <button
                    type="button"
                    className="button"
                    data-recording={stageOutput.recording}
                    aria-pressed={stageOutput.recording}
                    onClick={stageOutput.onToggleRecording}
                  >
                    <Video size={13} /> {stageOutput.recording ? "Detener" : "Grabar"}
                  </button>
                  <button
                    type="button"
                    className="button blackout-button"
                    aria-pressed={stageOutput.blackout}
                    title="Blackout de salida (Alt+B)"
                    onClick={() => {
                      const nextB = !stageOutput.blackout;
                      stageOutput.onBlackout(nextB);
                      onNode({ ...node, blackout: nextB });
                    }}
                  >
                    <Zap size={13} /> Blackout
                  </button>
                </div>
                <div className="cue-deck" style={{ padding: "8px 0 0", borderBottom: 0 }} aria-label="Banco de cues">
                  <div className="cue-deck-head">
                    <span>Banco de Cues</span>
                    <small>Clic dispara · icono guarda</small>
                  </div>
                  <div className="cue-grid">
                    {stageOutput.cues.map((cue) => (
                      <div
                        key={cue.id}
                        className={`cue-slot ${stageOutput.activeCue === cue.id ? "is-active" : ""}`}
                      >
                        <button
                          type="button"
                          className="cue-trigger"
                          onClick={() => stageOutput.onTriggerCue(cue)}
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
                          onClick={() => stageOutput.onCaptureCue(cue.id)}
                        >
                          <BookmarkPlus size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {(node.kind === "mocap.body" || node.kind === "mocap.hands") && (
            <MocapPanel section="mocap" />
          )}
          {node.kind === "scene.skeletonRig" && <MocapPanel section="all" />}
          {node.kind === "sop.fileIn" && <MocapPanel section="fbx" />}

          {node.kind === "scene.points" && (
            <div className="inspector-section appearance">
              <h4>Aspecto de Partículas y Escena</h4>
              {colorInput("Color partículas", view.color, (color) => onView({ color }))}
              <label className="field">
                Tamaño
                <input
                  type="range"
                  min={1}
                  max={9}
                  step={0.5}
                  value={view.size}
                  onChange={(event) => onView({ size: Number(event.target.value) })}
                />
              </label>
              {boolInput("Cuadrícula", view.grid, (grid) => onView({ grid }))}
              {boolInput("Órbitas guía", view.guides, (guides) => onView({ guides }))}
            </div>
          )}

          {isSignal && Number.isFinite(liveValue) && (
            <div className="inspector-section">
              <h4>Output</h4>
              <div className="range-label">
                <span>Result</span>
                <output>{liveValue!.toFixed(3)}</output>
              </div>
            </div>
          )}

          <div className="inspector-section connections">
            <h4>Inputs</h4>
            {incoming.length > 0 ? (
              incoming.map((edge) => (
                <div className="input-link" key={`${edge.to.port}-${edge.from.node}`}>
                  <span>
                    {portLabels[edge.to.port] ?? edge.to.port}
                    <small>× {edge.from.node}</small>
                  </span>
                  <button
                    className="icon-button"
                    type="button"
                    title="Desconectar entrada"
                    aria-label={`Desconectar ${portLabels[edge.to.port] ?? edge.to.port}`}
                    onClick={() => onUnlink(edge)}
                  >
                    <Link2Off size={14} />
                  </button>
                </div>
              ))
            ) : (
              <p className="inspector-note">Sin entradas conectadas.</p>
            )}
          </div>

          <div className="inspector-section">
            <h4>Misc</h4>
            <div className="swatch-row" role="group" aria-label="Color del nodo">
              {cablesSwatches.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={`swatch-btn ${meta?.color === hex ? "is-active" : ""}`}
                  style={{ background: hex }}
                  aria-label={`Color ${hex}`}
                  onClick={() => onNodeMeta(node.id, { color: hex })}
                />
              ))}
              <button
                type="button"
                className="swatch-btn swatch-clear"
                title="Color por defecto"
                onClick={() => onNodeMeta(node.id, { color: undefined })}
              >
                ×
              </button>
            </div>
            <textarea
              className="node-comment"
              placeholder="Comentario del operador…"
              value={meta?.comment ?? ""}
              onChange={(e) => onNodeMeta(node.id, { comment: e.target.value })}
            />
          </div>

          <button
            className="button remove-node"
            type="button"
            onClick={() => onRemove(node.id)}
          >
            <Trash2 size={13} /> Eliminar nodo
          </button>
        </>
      )}
    </div>
  );
}
