import {
  Activity,
  Box,
  Calculator,
  CircleDot,
  Copy,
  Link2Off,
  Radio,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type {
  Edge,
  LfoWave,
  MathOp,
  Node,
  Project,
} from "../../../../packages/engine/project.ts";
import { nodeTypes, portLabels } from "../studio.ts";
import type { ViewSettings } from "../studio.ts";

const icons = {
  "control.number": Radio,
  "signal.lfo": Activity,
  "signal.math": Calculator,
  "simulation.particles": CircleDot,
  "scene.points": Box,
};

type InspectorProps = {
  project: Project;
  node: Node | undefined;
  liveValue?: number;
  view: ViewSettings;
  onNode: (node: Node) => void;
  onView: (patch: Partial<ViewSettings>) => void;
  onUnlink: (edge: Edge) => void;
  onRemove: (id: string) => void;
  onScene: (id: string) => void;
};

export function Inspector({
  project,
  node,
  liveValue,
  view,
  onNode,
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
    node?.kind === "signal.math";

  function copyRef(id: string) {
    void navigator.clipboard?.writeText(`control("${id}")`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="inspector-body" aria-label="Inspector de nodo">
      {node && description ? (
        <>
          <div className="inspector-title">
            <span className="node-icon">
              <Icon size={17} />
            </span>
            <div className="inspector-title-text">
              <small>{description.category} · {node.id}</small>
              <h3>{description.name}</h3>
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
          {copied && <div className="inspector-copied">Copiado: control(&quot;{node.id}&quot;)</div>}

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
                {Number.isFinite(liveValue) && (
                  <div className="range-label">
                    <span>Salida</span>
                    <output>{liveValue!.toFixed(2)}</output>
                  </div>
                )}
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
                <label className="field">
                  Frec. (Hz)
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.1}
                    value={node.rate}
                    onChange={(e) => {
                      const rate = Number(e.target.value);
                      if (Number.isFinite(rate) && rate >= 0 && rate <= 100) {
                        onNode({ ...node, rate });
                      }
                    }}
                  />
                </label>
                <label className="field">
                  Amplitud
                  <input
                    type="number"
                    step={0.1}
                    value={node.amplitude}
                    onChange={(e) => {
                      const amplitude = Number(e.target.value);
                      if (Number.isFinite(amplitude)) onNode({ ...node, amplitude });
                    }}
                  />
                </label>
                <label className="field">
                  Offset
                  <input
                    type="number"
                    step={0.1}
                    value={node.offset}
                    onChange={(e) => {
                      const offset = Number(e.target.value);
                      if (Number.isFinite(offset)) onNode({ ...node, offset });
                    }}
                  />
                </label>
              </>
            )}

            {node.kind === "signal.math" && (
              <>
                {Number.isFinite(liveValue) && (
                  <div className="range-label">
                    <span>Salida</span>
                    <output>{liveValue!.toFixed(2)}</output>
                  </div>
                )}
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
                <label className="field">
                  {node.op === "clamp" ? "Máximo" : "Factor"}
                  <input
                    type="number"
                    step={0.1}
                    value={node.factor}
                    onChange={(e) => {
                      const factor = Number(e.target.value);
                      if (Number.isFinite(factor)) onNode({ ...node, factor });
                    }}
                  />
                </label>
                <label className="field">
                  {node.op === "clamp" ? "Mínimo" : "Sesgo"}
                  <input
                    type="number"
                    step={0.1}
                    value={node.bias}
                    onChange={(e) => {
                      const bias = Number(e.target.value);
                      if (Number.isFinite(bias)) onNode({ ...node, bias });
                    }}
                  />
                </label>
              </>
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

          <div className="inspector-section connections">
            <h4>Entradas</h4>
            {incoming.length > 0 ? (
              incoming.map((edge) => (
                <div className="input-link" key={edge.to.port}>
                  <span>
                    {portLabels[edge.to.port] ?? edge.to.port}
                    <small>{edge.from.node}</small>
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
