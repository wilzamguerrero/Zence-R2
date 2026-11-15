import { Box, CircleDot, Link2Off, Radio, SlidersHorizontal, Trash2 } from "lucide-react";
import type { Edge, Node, Project } from "../../../../packages/engine/project.ts";
import { nodeTypes, portLabels } from "../studio.ts";
import type { ViewSettings } from "../studio.ts";

type InspectorProps = {
  project: Project;
  node: Node | undefined;
  view: ViewSettings;
  onNode: (node: Node) => void;
  onView: (patch: Partial<ViewSettings>) => void;
  onUnlink: (edge: Edge) => void;
  onRemove: (id: string) => void;
  onScene: (id: string) => void;
};

export function Inspector({ project, node, view, onNode, onView, onUnlink, onRemove, onScene }: InspectorProps) {
  const description = node ? nodeTypes[node.kind] : undefined;
  const Icon = node?.kind === "control.number" ? Radio : node?.kind === "simulation.particles" ? CircleDot : Box;
  const incoming = project.edges.filter((edge) => edge.to.node === node?.id);

  return <aside className="panel inspector-panel" aria-label="Inspector">
    <div className="panel-heading"><h2><SlidersHorizontal size={15} /> Inspector</h2></div>
    <div className="inspector-body">
      {node && description ? <>
        <div className="inspector-title">
          <span className="node-icon"><Icon size={20} /></span>
          <div><small>{description.category}</small><h3>{description.name}</h3></div>
        </div>
        <div className="inspector-section">
          <h4>Parámetros</h4>
          {node.kind === "control.number" && <>
            <label className="range-label" htmlFor="intensity"><span>Intensidad</span><output>{node.initial.toFixed(2)}</output></label>
            <input id="intensity" type="range" min={node.min} max={node.max} step="any" value={node.initial} onChange={(event) => onNode({ ...node, initial: Number(event.target.value) })} />
            <div className="range-ends"><span>{node.min.toFixed(1)}</span><span>{node.max.toFixed(1)}</span></div>
          </>}
          {node.kind === "simulation.particles" && <>
            <label className="field">Partículas
              <input type="number" key={`${node.id}-${node.count}`} min={1} max={10000} step={1} defaultValue={node.count}
                onBlur={(event) => {
                  const value = event.target.valueAsNumber;
                  if (Number.isInteger(value) && value >= 1 && value <= 10000) onNode({ ...node, count: value });
                  else event.target.value = String(node.count);
                }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
            </label>
            <label className="field">Semilla
              <input type="number" key={`${node.id}-${node.seed}`} min={0} max={4294967295} step={1} defaultValue={node.seed}
                onBlur={(event) => {
                  const value = event.target.valueAsNumber;
                  if (Number.isInteger(value) && value >= 0 && value <= 4294967295) onNode({ ...node, seed: value });
                  else event.target.value = String(node.seed);
                }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
            </label>
          </>}
          {node.kind === "scene.points" && (project.scene === node.id
            ? <p className="inspector-note"><span className="status-dot" /> Salida activa</p>
            : <button className="button button-subtle" type="button" onClick={() => onScene(node.id)}>Mostrar en el visor</button>)}
        </div>
        <div className="inspector-section connections">
          <h4>Entradas</h4>
          {incoming.length > 0 ? incoming.map((edge) => <div className="input-link" key={edge.to.port}>
            <span>{portLabels[edge.to.port] ?? edge.to.port}<small>{edge.from.node}</small></span>
            <button className="icon-button" type="button" title="Desconectar entrada" aria-label={`Desconectar ${portLabels[edge.to.port] ?? edge.to.port}`} onClick={() => onUnlink(edge)}><Link2Off size={15} /></button>
          </div>) : <p className="inspector-note">Sin entradas conectadas.</p>}
        </div>
      </> : <p className="inspector-note">Selecciona un nodo para editarlo.</p>}
      <div className="inspector-section appearance">
        <h4>Aspecto de la escena</h4>
        <label className="field">Color de partículas
          <input type="color" value={view.color} onChange={(event) => onView({ color: event.target.value })} />
        </label>
        <label className="field">Tamaño
          <input type="range" min={1} max={9} step={0.5} value={view.size} onChange={(event) => onView({ size: Number(event.target.value) })} />
        </label>
        <label className="field">Cuadrícula
          <input type="checkbox" role="switch" checked={view.grid} onChange={(event) => onView({ grid: event.target.checked })} />
        </label>
        <label className="field">Órbitas de referencia
          <input type="checkbox" role="switch" checked={view.guides} onChange={(event) => onView({ guides: event.target.checked })} />
        </label>
      </div>
      {node && <button className="button remove-node" type="button" onClick={() => onRemove(node.id)}><Trash2 size={14} /> Eliminar nodo</button>}
    </div>
  </aside>;
}
