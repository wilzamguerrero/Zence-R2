import {
  Activity,
  Box,
  Calculator,
  CircleDot,
  Crosshair,
  LayoutGrid,
  Maximize,
  Minus,
  Plus,
  Radio,
  Search,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { Edge, Node, Project } from "../../../../packages/engine/project.ts";
import { nodeTypes, portLabels, positionFor } from "../studio.ts";
import type { Layout, Position } from "../studio.ts";

const icons = {
  "control.number": Radio,
  "signal.lfo": Activity,
  "signal.math": Calculator,
  "simulation.particles": CircleDot,
  "scene.points": Box,
};

const cardWidth = 176;
const portTop = 81;
const secondPortOffset = 26;

type GraphProps = {
  project: Project;
  positions: Layout;
  values: Record<string, number>;
  selected: string;
  pending: Edge["from"] | null;
  hidden?: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, position: Position) => void;
  onPort: (node: string, port: string, direction: "in" | "out") => void;
  onAdd: (kind: Node["kind"]) => void;
  onDelete: (id: string) => void;
  onLayout: () => void;
  onCancel: () => void;
};

function nodeSubtitle(node: Node): string {
  switch (node.kind) {
    case "control.number":
      return `${node.min}..${node.max}`;
    case "signal.lfo":
      return `${node.wave} · ${node.rate.toFixed(1)} Hz`;
    case "signal.math":
      return `${node.op} · ${node.factor.toFixed(1)}`;
    case "simulation.particles":
      return `${node.count} pts`;
    case "scene.points":
      return "Visor 3D";
  }
}

export function Graph({
  project,
  positions,
  values,
  selected,
  pending,
  hidden,
  onSelect,
  onMove,
  onPort,
  onAdd,
  onDelete,
  onLayout,
  onCancel,
}: GraphProps) {
  const scroll = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ id: string; origin: Position; pointer: Position } | null>(null);
  const pan = useRef<{ left: number; top: number; x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 360, height: 475 });
  const [zoom, setZoom] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [cursor, setCursor] = useState<Position | null>(null);

  const placed = project.nodes.map((node, index) => ({
    node,
    point: positionFor(node, index, positions),
  }));
  const width = Math.max(360, ...placed.map(({ point }) => point.x + cardWidth + 42));
  const height = Math.max(460, ...placed.map(({ point }) => point.y + 142));
  const defaultScale = Math.max(0.4, Math.min(1.15, (size.width - 4) / 360, (size.height - 8) / 475));
  const scale = defaultScale * zoom;

  const kinds = (Object.keys(nodeTypes) as Node["kind"][]).filter((kind) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const meta = nodeTypes[kind];
    return (
      meta.label.toLowerCase().includes(q) ||
      meta.name.toLowerCase().includes(q) ||
      meta.category.toLowerCase().includes(q) ||
      meta.description.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    const target = scroll.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (showAdd) {
      setQuery("");
      setPaletteIndex(0);
      requestAnimationFrame(() => searchInput.current?.focus());
    }
  }, [showAdd]);

  useEffect(() => {
    if (!pending) setCursor(null);
  }, [pending]);

  function fitGraph() {
    const fitted = Math.max(0.25, Math.min(defaultScale, (size.width - 4) / width, (size.height - 8) / height));
    setZoom(fitted / defaultScale);
    scroll.current?.scrollTo(0, 0);
  }

  function startDrag(event: PointerEvent<HTMLElement>, id: string, origin: Position) {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelect(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, origin, pointer: { x: event.clientX, y: event.clientY } };
  }

  function moveNode(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current) return;
    onMove(current.id, {
      x: Math.max(8, current.origin.x + (event.clientX - current.pointer.x) / scale),
      y: Math.max(8, current.origin.y + (event.clientY - current.pointer.y) / scale),
    });
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    if (pending) {
      onCancel();
      return;
    }
    const container = scroll.current;
    if (!container) return;
    pan.current = {
      left: container.scrollLeft,
      top: container.scrollTop,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handleCanvasPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (pan.current && scroll.current) {
      scroll.current.scrollLeft = pan.current.left - (event.clientX - pan.current.x);
      scroll.current.scrollTop = pan.current.top - (event.clientY - pan.current.y);
    }
    if (pending && surface.current) {
      const rect = surface.current.getBoundingClientRect();
      setCursor({
        x: (event.clientX - rect.left) / scale,
        y: (event.clientY - rect.top) / scale,
      });
    }
  }

  function stopPan() {
    pan.current = null;
  }

  const pendingSource = pending ? placed.find(({ node }) => node.id === pending.node) : undefined;
  const pendingOutputType = pendingSource ? nodeTypes[pendingSource.node.kind].outputType : null;

  return (
    <section
      className={`panel graph-panel ${hidden ? "is-panel-hidden" : ""}`}
      aria-label="Grafo de nodos"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
        if (event.key === "Tab") {
          event.preventDefault();
          setShowAdd((open) => !open);
        } else if (event.key === "Escape") {
          onCancel();
          setShowAdd(false);
        } else if ((event.key === "Delete" || event.key === "Backspace") && selected) {
          event.preventDefault();
          onDelete(selected);
        }
      }}
    >
      <div className="panel-heading">
        <h2><Workflow size={14} /> Grafo</h2>
        <div className="graph-add">
          <button
            className="icon-button"
            type="button"
            aria-label="Agregar operador (Tab)"
            aria-expanded={showAdd}
            title="Agregar operador (Tab)"
            onClick={() => setShowAdd(!showAdd)}
          >
            <Plus size={15} />
          </button>
          {showAdd && (
            <div className="node-palette" role="dialog" aria-label="Buscar operador">
              <div className="palette-search">
                <Search size={13} />
                <input
                  ref={searchInput}
                  type="text"
                  value={query}
                  placeholder="Buscar operador (LFO, Math, Partículas…)"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPaletteIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setPaletteIndex((i) => Math.min(kinds.length - 1, i + 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setPaletteIndex((i) => Math.max(0, i - 1));
                    } else if (e.key === "Enter" && kinds[paletteIndex]) {
                      e.preventDefault();
                      onAdd(kinds[paletteIndex]);
                      setShowAdd(false);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setShowAdd(false);
                    }
                  }}
                />
              </div>
              <div className="palette-list">
                {kinds.length > 0 ? (
                  kinds.map((kind, index) => {
                    const meta = nodeTypes[kind];
                    const Icon = icons[kind];
                    return (
                      <button
                        type="button"
                        key={kind}
                        className={index === paletteIndex ? "is-active" : ""}
                        onMouseEnter={() => setPaletteIndex(index)}
                        onClick={() => {
                          onAdd(kind);
                          setShowAdd(false);
                        }}
                      >
                        <span className="palette-icon"><Icon size={14} /></span>
                        <span className="palette-meta">
                          <strong>{meta.label}</strong>
                          <small>{meta.category} · {meta.description}</small>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="palette-empty">Sin operadores coincidentes.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className="graph-body"
        ref={scroll}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={stopPan}
        onPointerCancel={stopPan}
        onDoubleClick={(e) => {
          if (e.target === scroll.current || e.target === surface.current) {
            setShowAdd(true);
          }
        }}
      >
        <div className="graph-scroll-space" style={{ width: width * scale, height: height * scale }}>
          <div className="graph-surface" ref={surface} style={{ width, height, transform: `scale(${scale})` }}>
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
                return (
                  <g
                    key={`${from.node}-${from.port}-${to.node}-${to.port}`}
                    className={from.port === "value" ? "wire-signal" : "wire-points"}
                  >
                    <path className="wire-shadow" d={path} />
                    <path className="wire-line" d={path} />
                  </g>
                );
              })}
              {pendingSource && cursor && (
                (() => {
                  const x1 = pendingSource.point.x + cardWidth;
                  const y1 =
                    pendingSource.point.y +
                    portTop +
                    (nodeTypes[pendingSource.node.kind].input ? secondPortOffset : 0);
                  const x2 = cursor.x;
                  const y2 = cursor.y;
                  const curve = Math.max(40, Math.abs(x2 - x1) * 0.45);
                  const path = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
                  return (
                    <path
                      className={`wire-preview ${pendingOutputType === "number" ? "wire-signal" : "wire-points"}`}
                      d={path}
                    />
                  );
                })()
              )}
            </svg>
            {placed.map(({ node, point }) => {
              const type = nodeTypes[node.kind];
              const Icon = icons[node.kind];
              const liveValue = values[node.id];
              const compatibleIn =
                pending && pending.node !== node.id && type.inputType === pendingOutputType;
              return (
                <article
                  key={node.id}
                  className={`node-card ${selected === node.id ? "is-selected" : ""}`}
                  data-kind={node.kind}
                  style={{ left: point.x, top: point.y, width: cardWidth }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(node.id);
                  }}
                >
                  <button
                    type="button"
                    className="node-grip"
                    aria-pressed={selected === node.id}
                    onPointerDown={(event) => startDrag(event, node.id, point)}
                    onPointerMove={moveNode}
                    onLostPointerCapture={() => {
                      drag.current = null;
                    }}
                    onClick={() => onSelect(node.id)}
                  >
                    <span className="node-icon"><Icon size={15} /></span>
                    <span className="node-head-meta">
                      <small>{type.category} · {node.id}</small>
                      <strong>{type.name}</strong>
                    </span>
                  </button>
                  <div className="node-sub">{nodeSubtitle(node)}</div>
                  {type.input && (
                    <div className="port-row in">
                      <button
                        type="button"
                        className="port"
                        data-compatible={pending ? (compatibleIn ? "true" : "false") : undefined}
                        aria-label={`Entrada ${portLabels[type.input]} de ${node.id}`}
                        title="Conectar entrada"
                        onClick={(event) => {
                          event.stopPropagation();
                          onPort(node.id, type.input, "in");
                        }}
                      />
                      <span>{portLabels[type.input]}</span>
                    </div>
                  )}
                  {type.output && (
                    <div className="port-row out" data-port={type.output}>
                      <span>{portLabels[type.output]}</span>
                      {type.outputType === "number" && Number.isFinite(liveValue) && (
                        <output>{liveValue.toFixed(2)}</output>
                      )}
                      <button
                        type="button"
                        className="port"
                        aria-label={`Salida ${portLabels[type.output]} de ${node.id}`}
                        aria-pressed={pending?.node === node.id}
                        title="Conectar salida"
                        onClick={(event) => {
                          event.stopPropagation();
                          onPort(node.id, type.output, "out");
                        }}
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <div className="graph-footer">
        <span>
          <Crosshair size={12} />{" "}
          {pending
            ? "Haz clic en un puerto de entrada (Esc cancela)"
            : `${project.nodes.length} ops · ${project.edges.length} cables · Tab añade`}
        </span>
        <div className="graph-zoom">
          <button
            type="button"
            className="icon-button"
            aria-label="Auto-ordenar grafo"
            title="Auto-ordenar grafo"
            onClick={onLayout}
          >
            <LayoutGrid size={13} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Alejar grafo"
            title="Alejar grafo"
            onClick={() => setZoom((value) => Math.max(0.25, value - 0.15))}
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Ajustar grafo"
            title="Ajustar grafo"
            onClick={fitGraph}
          >
            <Maximize size={12} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Acercar grafo"
            title="Acercar grafo"
            onClick={() => setZoom((value) => Math.min(2, value + 0.15))}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
    </section>
  );
}
