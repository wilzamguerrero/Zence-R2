import {
  Activity,
  Box,
  Calculator,
  CircleDot,
  Copy,
  Disc,
  Link2Off,
  Palette,
  Radio,
  RotateCw,
  Sparkles,
  Timer,
  Trash2,
  Waves,
} from "lucide-react";
import { useState } from "react";
import type {
  Edge,
  HydraBuffer,
  LfoWave,
  MathOp,
  Node,
  Project,
} from "../../../../packages/engine/project.ts";
import { cablesSwatches, nodeTypes, portLabels } from "../studio.ts";
import type { NodeMeta, ViewSettings } from "../studio.ts";

const icons: Record<Node["kind"], typeof Activity> = {
  "control.number": Radio,
  "signal.lfo": Activity,
  "signal.timer": Timer,
  "signal.smooth": Waves,
  "signal.mapRange": Calculator,
  "signal.math": Calculator,
  "hydra.osc": Waves,
  "hydra.noise": Sparkles,
  "hydra.shape": Disc,
  "hydra.kaleid": Sparkles,
  "hydra.rotate": RotateCw,
  "hydra.modulate": Activity,
  "hydra.color": Palette,
  "hydra.out": Box,
  "simulation.particles": CircleDot,
  "scene.points": Box,
};

type InspectorProps = {
  project: Project;
  node: Node | undefined;
  meta?: NodeMeta;
  liveValue?: number;
  view: ViewSettings;
  onNode: (node: Node) => void;
  onNodeMeta: (id: string, patch: Partial<NodeMeta>) => void;
  onView: (patch: Partial<ViewSettings>) => void;
  onUnlink: (edge: Edge) => void;
  onRemove: (id: string) => void;
  onScene: (id: string) => void;
};

export function Inspector({
  project,
  node,
  meta,
  liveValue,
  view,
  onNode,
  onNodeMeta,
  onView,
  onUnlink,
  onRemove,
  onScene,
}: InspectorProps) {
  const [copied, setCopied] = useState(false);
  const description = node ? nodeTypes[node.kind] : undefined;
  const Icon = node ? icons[node.kind] : Box;
  const incoming = project.edges.filter((edge) => edge.to.node === node?.id);
  const isSignal =
    node?.kind === "control.number" ||
    node?.kind === "signal.lfo" ||
    node?.kind === "signal.timer" ||
    node?.kind === "signal.smooth" ||
    node?.kind === "signal.mapRange" ||
    node?.kind === "signal.math";

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

  return (
    <div className="inspector-body" aria-label="Inspector de operador">
      {node && description ? (
        <>
          <div className="inspector-title">
            <span
              className="node-icon"
              style={meta?.color ? { color: meta.color } : undefined}
            >
              <Icon size={17} />
            </span>
            <div className="inspector-title-text">
              <small>{description.namespace} · {node.id}</small>
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
                <Copy size={13} />
              </button>
            )}
          </div>
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
          </div>

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
        </>
      ) : (
        <div className="inspector-section">
          <p className="inspector-note">Selecciona un nodo para editarlo.</p>
        </div>
      )}

      <div className="inspector-section appearance">
        <h4>Aspecto de la escena</h4>
        <label className="field">
          Color
          <input
            type="color"
            value={view.color}
            onChange={(event) => onView({ color: event.target.value })}
          />
        </label>
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
        <label className="field">
          Cuadrícula
          <input
            type="checkbox"
            role="switch"
            checked={view.grid}
            onChange={(event) => onView({ grid: event.target.checked })}
          />
        </label>
        <label className="field">
          Órbitas guía
          <input
            type="checkbox"
            role="switch"
            checked={view.guides}
            onChange={(event) => onView({ guides: event.target.checked })}
          />
        </label>
      </div>

      {node && (
        <button
          className="button remove-node"
          type="button"
          onClick={() => onRemove(node.id)}
        >
          <Trash2 size={13} /> Eliminar nodo
        </button>
      )}
    </div>
  );
}
