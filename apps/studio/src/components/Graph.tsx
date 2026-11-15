import { Box, CircleDot, Crosshair, Maximize, Minus, Plus, Radio, Workflow } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { Edge, Node, Project } from "../../../../packages/engine/project.ts";
import { nodeTypes, portLabels, positionFor } from "../studio.ts";
import type { Layout, Position } from "../studio.ts";

const icons = { "control.number": Radio, "simulation.particles": CircleDot, "scene.points": Box };
const cardWidth = 166;
const portTop = 75;
const secondPortOffset = 26;

type GraphProps = {
  project: Project;
  positions: Layout;
  selected: string;
  pending: Edge["from"] | null;
  onSelect: (id: string) => void;
  onMove: (id: string, position: Position) => void;
  onPort: (node: string, port: string, direction: "in" | "out") => void;
  onAdd: (kind: Node["kind"]) => void;
  onCancel: () => void;
};

export function Graph({ project, positions, selected, pending, onSelect, onMove, onPort, onAdd, onCancel }: GraphProps) {
  const scroll = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; origin: Position; pointer: Position } | null>(null);
  const [size, setSize] = useState({ width: 360, height: 475 });
  const [zoom, setZoom] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const placed = project.nodes.map((node, index) => ({ node, point: positionFor(node, index, positions) }));
  const width = Math.max(360, ...placed.map(({ point }) => point.x + cardWidth + 42));
  const height = Math.max(475, ...placed.map(({ point }) => point.y + 142));
  const defaultScale = Math.max(0.4, Math.min(1.2, (size.width - 2) / 360, (size.height - 8) / 487));
  const scale = defaultScale * zoom;

  useEffect(() => {
    const target = scroll.current!;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  function fitGraph() {
    const fitted = Math.max(0.25, Math.min(defaultScale, (size.width - 2) / width, (size.height - 8) / height));
    setZoom(fitted / defaultScale);
    scroll.current?.scrollTo(0, 0);
  }

  function startDrag(event: PointerEvent<HTMLElement>, id: string, origin: Position) {
    if (event.button !== 0) return;
    onSelect(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, origin, pointer: { x: event.clientX, y: event.clientY } };
  }

  function move(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current) return;
    onMove(current.id, {
      x: Math.max(8, current.origin.x + (event.clientX - current.pointer.x) / scale),
      y: Math.max(8, current.origin.y + (event.clientY - current.pointer.y) / scale),
    });
  }

  return (
    <section className="panel graph-panel" aria-label="Grafo de nodos">
      <div className="panel-heading">
        <h2><Workflow size={15} /> Grafo de nodos</h2>
        <div className="graph-add">
          <button className="icon-button" type="button" aria-label="Agregar nodo" aria-expanded={showAdd} title="Agregar nodo" onClick={() => setShowAdd(!showAdd)}><Plus size={17} /></button>
          {showAdd && <div className="node-menu">
            {(Object.keys(nodeTypes) as Node["kind"][]).map((kind) => <button type="button" key={kind} onClick={() => { onAdd(kind); setShowAdd(false); }}>{nodeTypes[kind].label}</button>)}
          </div>}
        </div>
      </div>
      <div className="graph-body" ref={scroll} onKeyDown={(event) => { if (event.key === "Escape") { onCancel(); setShowAdd(false); } }}>
        <div className="graph-scroll-space" style={{ width: width * scale, height: height * scale }}>
          <div className="graph-surface" style={{ width, height, transform: `scale(${scale})` }}>
            <svg className="wires" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
              {project.edges.map(({ from, to }) => {
                const source = placed.find(({ node }) => node.id === from.node);
                const target = placed.find(({ node }) => node.id === to.node);
                if (!source || !target) return null;
                const x1 = source.point.x + cardWidth;
                const y1 = source.point.y + portTop + (nodeTypes[source.node.kind].input ? secondPortOffset : 0);
                const x2 = target.point.x;
                const y2 = target.point.y + portTop;
                const curve = Math.max(43, Math.abs(y2 - y1) * 0.65, (x2 - x1) * 0.45);
                const path = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
                return <g key={`${from.node}-${from.port}-${to.node}-${to.port}`} className={from.port === "value" ? "wire-signal" : "wire-points"}>
                  <path className="wire-shadow" d={path} /><path className="wire-line" d={path} />
                </g>;
              })}
            </svg>
            {placed.map(({ node, point }) => {
              const type = nodeTypes[node.kind];
              const Icon = icons[node.kind];
              return <article key={node.id} className={`node-card ${selected === node.id ? "is-selected" : ""}`} data-kind={node.kind} style={{ left: point.x, top: point.y, width: cardWidth }} onClick={() => onSelect(node.id)}>
                <button type="button" className="node-grip" aria-pressed={selected === node.id}
                  onPointerDown={(event) => startDrag(event, node.id, point)} onPointerMove={move}
                  onLostPointerCapture={() => { drag.current = null; }} onClick={() => onSelect(node.id)}>
                  <span className="node-icon"><Icon size={16} /></span>
                  <span><small>{type.category}</small><strong>{type.name}</strong></span>
                </button>
                {type.input && <div className="port-row in">
                  <button type="button" className="port" aria-label={`Entrada ${portLabels[type.input]} de ${node.id}`} title="Conectar entrada" onClick={(event) => { event.stopPropagation(); onPort(node.id, type.input, "in"); }} />
                  <span>{portLabels[type.input]}</span>
                </div>}
                {type.output && <div className="port-row out" data-port={type.output}>
                  <span>{portLabels[type.output]}</span>
                  {node.kind === "control.number" && <output>{node.initial.toFixed(2)}</output>}
                  <button type="button" className="port" aria-label={`Salida ${portLabels[type.output]} de ${node.id}`} aria-pressed={pending?.node === node.id} title="Conectar salida" onClick={(event) => { event.stopPropagation(); onPort(node.id, type.output, "out"); }} />
                </div>}
              </article>;
            })}
          </div>
        </div>
      </div>
      <div className="graph-footer">
        <span><Crosshair size={13} /> {pending ? "Elige una entrada" : `${project.nodes.length} nodos · ${project.edges.length} conexiones`}</span>
        <div className="graph-zoom">
          <button type="button" className="icon-button" aria-label="Alejar grafo" title="Alejar grafo" onClick={() => setZoom((value) => Math.max(0.25, value - 0.15))}><Minus size={14} /></button>
          <button type="button" className="icon-button" aria-label="Ajustar grafo" title="Ajustar grafo" onClick={fitGraph}><Maximize size={13} /></button>
          <button type="button" className="icon-button" aria-label="Acercar grafo" title="Acercar grafo" onClick={() => setZoom((value) => Math.min(2, value + 0.15))}><Plus size={14} /></button>
        </div>
      </div>
    </section>
  );
}
