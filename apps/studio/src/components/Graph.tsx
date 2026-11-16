import {
  Activity,
  Box,
  Calculator,
  CircleDot,
  Crosshair,
  Disc,
  LayoutGrid,
  Maximize,
  Minus,
  Palette,
  Plus,
  Radio,
  RotateCw,
  Search,
  Sparkles,
  Timer,
  Waves,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ClassicPreset, NodeEditor } from "rete";
import type { GetSchemes } from "rete";
import { AreaExtensions, AreaPlugin } from "rete-area-plugin";
import { ConnectionPlugin, Presets as ConnectionPresets } from "rete-connection-plugin";
import { Presets as ReactPresets, ReactPlugin } from "rete-react-plugin";
import type { ReactArea2D, RenderEmit } from "rete-react-plugin";
const { RefSocket, useConnection } = ReactPresets.classic;
import type { Edge, Node, PortType, Project } from "../../../../packages/engine/project.ts";
import { nodeTypes, positionFor } from "../studio.ts";
import type { Layout, NodeMeta, Position } from "../studio.ts";

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

const categoryColors: Record<string, string> = {
  Control: "#ae68ad",
  Anim: "#58c4dc",
  Math: "#6ed491",
  Hydra: "#f0b35a",
  Scene: "#cfb7cf",
};

const sockets: Record<PortType, ClassicPreset.Socket> = {
  number: new ClassicPreset.Socket("number"),
  points: new ClassicPreset.Socket("points"),
  hydra: new ClassicPreset.Socket("hydra"),
};

class ZenceReteNode extends ClassicPreset.Node {
  zenceNode: Node;
  customColor?: string;
  liveValue?: number;
  isSelected = false;
  onChangeValue?: (node: Node) => void;
  onSelectNode?: (id: string) => void;
  onDisconnectPort?: (nodeId: string, portKey: string) => void;

  constructor(node: Node) {
    super(nodeTypes[node.kind].name);
    this.id = node.id;
    this.zenceNode = node;
    const spec = nodeTypes[node.kind];
    for (const input of spec.inputs) {
      this.addInput(input.key, new ClassicPreset.Input(sockets[input.type], input.label, false));
    }
    for (const output of spec.outputs) {
      this.addOutput(output.key, new ClassicPreset.Output(sockets[output.type], output.label, true));
    }
  }
}

class ZenceConnection extends ClassicPreset.Connection<ZenceReteNode, ZenceReteNode> {
  socketType: PortType;
  constructor(
    source: ZenceReteNode,
    sourceOutput: string,
    target: ZenceReteNode,
    targetInput: string,
    socketType: PortType,
  ) {
    super(source, sourceOutput, target, targetInput);
    this.socketType = socketType;
  }
}

type Schemes = GetSchemes<ZenceReteNode, ZenceConnection>;
type AreaExtra = ReactArea2D<Schemes>;

function nodeSummary(node: Node): string {
  switch (node.kind) {
    case "control.number":
      return `${node.min}..${node.max}`;
    case "signal.lfo":
      return `${node.wave} · ${node.rate.toFixed(1)} Hz`;
    case "signal.timer":
      return `×${node.speed.toFixed(2)}`;
    case "signal.smooth":
      return `smooth ${node.smoothing.toFixed(2)}`;
    case "signal.mapRange":
      return `[${node.inMin}..${node.inMax}] → [${node.outMin}..${node.outMax}]`;
    case "signal.math":
      return `${node.op} (${node.factor.toFixed(1)})`;
    case "hydra.osc":
      return `freq ${node.freq} · sync ${node.sync}`;
    case "hydra.noise":
      return `scale ${node.scale} · off ${node.offset}`;
    case "hydra.shape":
      return `${node.sides} lados · r ${node.radius}`;
    case "hydra.kaleid":
      return `${node.sides} lados`;
    case "hydra.rotate":
      return `vel ${node.speed}`;
    case "hydra.modulate":
      return `amt ${node.amount}`;
    case "hydra.color":
      return `rgb(${node.r}, ${node.g}, ${node.b})`;
    case "hydra.out":
      return `buffer ${node.buffer}`;
    case "simulation.particles":
      return `${node.count} pts`;
    case "scene.points":
      return "Visor 3D";
  }
}

function ReteSocketDot({ data }: { data: ClassicPreset.Socket }) {
  return <span className={`rete-socket rete-socket-${data.name}`} title={data.name} />;
}

function ReteFlowConnection({ data }: { data: ZenceConnection }) {
  const { path } = useConnection();
  if (!path) return null;
  return (
    <svg className={`rete-wire rete-wire-${data.socketType}`} data-testid="connection">
      <path className="rete-wire-shadow" d={path} />
      <path className="rete-wire-base" d={path} />
      <path className="rete-wire-flow" d={path} />
    </svg>
  );
}

function ReteNodeCard({
  data,
  emit,
}: {
  data: ZenceReteNode;
  emit: RenderEmit<Schemes>;
}) {
  const node = data.zenceNode;
  const spec = nodeTypes[node.kind];
  const Icon = icons[node.kind];
  const accent = data.customColor || categoryColors[spec.category] || "#ae68ad";
  const inputs = Object.entries(data.inputs);
  const outputs = Object.entries(data.outputs);

  return (
    <div
      className={`rete-node ${data.isSelected ? "is-selected" : ""}`}
      data-kind={node.kind}
      style={{ "--node-accent": accent } as React.CSSProperties}
      onPointerDown={() => data.onSelectNode?.(node.id)}
    >
      <div className="rete-node-bar" />
      <div className="rete-node-head">
        <span className="rete-node-icon">
          <Icon size={14} />
        </span>
        <div className="rete-node-titles">
          <small>{spec.namespace} · {node.id}</small>
          <strong>{spec.name}</strong>
        </div>
      </div>

      <div className="rete-node-sub">{nodeSummary(node)}</div>

      {node.kind === "control.number" && (
        <div
          className="rete-inline-control"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            type="range"
            min={node.min}
            max={node.max}
            step="any"
            value={node.initial}
            aria-label={`Valor de ${node.id}`}
            onChange={(e) =>
              data.onChangeValue?.({ ...node, initial: Number(e.target.value) })
            }
          />
          <output>{node.initial.toFixed(2)}</output>
        </div>
      )}

      <div className="rete-ports">
        {inputs.map(([key, input]) =>
          input ? (
            <div className="rete-port-row in" key={key}>
              <RefSocket
                name="input-socket"
                side="input"
                socketKey={key}
                nodeId={data.id}
                payload={input.socket}
                emit={emit}
              />
              <button
                type="button"
                className="rete-port-label"
                title="Clic para desconectar entrada"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  data.onDisconnectPort?.(data.id, key);
                }}
              >
                {input.label}
              </button>
            </div>
          ) : null,
        )}

        {outputs.map(([key, output]) =>
          output ? (
            <div className="rete-port-row out" key={key}>
              {output.socket.name === "number" && Number.isFinite(data.liveValue) && (
                <output className="rete-port-value">{data.liveValue!.toFixed(2)}</output>
              )}
              <span className="rete-port-label">{output.label}</span>
              <RefSocket
                name="output-socket"
                side="output"
                socketKey={key}
                nodeId={data.id}
                payload={output.socket}
                emit={emit}
              />
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

type GraphProps = {
  project: Project;
  positions: Layout;
  nodeMeta?: Record<string, NodeMeta>;
  values: Record<string, number>;
  selected: string;
  hidden?: boolean;
  onSelect: (id: string) => void;
  onChangeNode: (node: Node) => void;
  onMove: (id: string, position: Position) => void;
  onConnectEdge: (edge: Edge) => void;
  onRemoveEdge: (edge: Edge) => void;
  onAdd: (kind: Node["kind"]) => void;
  onAddHydraChain?: () => void;
  onDelete: (id: string) => void;
  onLayout: () => void;
};

export function Graph({
  project,
  positions,
  nodeMeta,
  values,
  selected,
  hidden,
  onSelect,
  onChangeNode,
  onMove,
  onConnectEdge,
  onRemoveEdge,
  onAdd,
  onAddHydraChain,
  onDelete,
  onLayout,
}: GraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const reteRef = useRef<{
    editor: NodeEditor<Schemes>;
    area: AreaPlugin<Schemes, AreaExtra>;
    syncing: boolean;
    topologyKey: string;
    chain: Promise<void>;
    didInitialFit: boolean;
  } | null>(null);
  const latestRef = useRef({
    project,
    positions,
    nodeMeta,
    values,
    selected,
    onSelect,
    onChangeNode,
    onMove,
    onConnectEdge,
    onRemoveEdge,
    onDelete,
  });
  latestRef.current = {
    project,
    positions,
    nodeMeta,
    values,
    selected,
    onSelect,
    onChangeNode,
    onMove,
    onConnectEdge,
    onRemoveEdge,
    onDelete,
  };

  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("Todas");
  const [paletteIndex, setPaletteIndex] = useState(0);

  const categories = ["Todas", "Control", "Anim", "Math", "Hydra", "Scene"];
  const kinds = (Object.keys(nodeTypes) as Node["kind"][]).filter((kind) => {
    const meta = nodeTypes[kind];
    if (categoryFilter !== "Todas" && meta.category !== categoryFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      meta.label.toLowerCase().includes(q) ||
      meta.name.toLowerCase().includes(q) ||
      meta.namespace.toLowerCase().includes(q) ||
      meta.category.toLowerCase().includes(q) ||
      meta.description.toLowerCase().includes(q)
    );
  });

  // Initialize Rete.js v2 editor once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const editor = new NodeEditor<Schemes>();
    const area = new AreaPlugin<Schemes, AreaExtra>(container);
    const connection = new ConnectionPlugin<Schemes, AreaExtra>();
    const render = new ReactPlugin<Schemes, AreaExtra>({ createRoot });

    render.addPreset(
      ReactPresets.classic.setup({
        customize: {
          node: () => ReteNodeCard as unknown as React.ComponentType<any>,
          socket: () => ReteSocketDot as unknown as React.ComponentType<any>,
          connection: () => ReteFlowConnection as unknown as React.ComponentType<any>,
        },
      }),
    );

    connection.addPreset(ConnectionPresets.classic.setup());

    editor.use(area);
    area.use(connection);
    area.use(render);

    AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
      accumulating: AreaExtensions.accumulateOnCtrl(),
    });
    AreaExtensions.snapGrid(area, { size: 12, dynamic: true });

    const state = {
      editor,
      area,
      syncing: false,
      topologyKey: "",
      chain: Promise.resolve(),
      didInitialFit: false,
    };
    reteRef.current = state;

    editor.addPipe((context) => {
      if (state.syncing) return context;
      if (context.type === "connectioncreate") {
        const { source, sourceOutput, target, targetInput } = context.data;
        if (source === target) return undefined;
        const srcNode = editor.getNode(source);
        const dstNode = editor.getNode(target);
        const outSock = srcNode?.outputs[sourceOutput]?.socket;
        const inSock = dstNode?.inputs[targetInput]?.socket;
        if (!outSock || !inSock || outSock.name !== inSock.name) {
          return undefined;
        }
        latestRef.current.onConnectEdge({
          from: { node: source, port: sourceOutput },
          to: { node: target, port: targetInput },
        });
        return undefined; // Let React topology sync create the validated connection cleanly
      }
      if (context.type === "connectionremove") {
        const { source, sourceOutput, target, targetInput } = context.data;
        latestRef.current.onRemoveEdge({
          from: { node: source, port: sourceOutput },
          to: { node: target, port: targetInput },
        });
        return undefined;
      }
      return context;
    });

    area.addPipe((context) => {
      if (state.syncing) return context;
      if (context.type === "nodetranslated") {
        const { id, position } = context.data;
        latestRef.current.onMove(id, {
          x: Math.max(0, Math.round(position.x)),
          y: Math.max(0, Math.round(position.y)),
        });
      }
      return context;
    });

    return () => {
      reteRef.current = null;
      area.destroy();
    };
  }, []);

  function queueSync() {
    const inst = reteRef.current;
    if (!inst) return;
    inst.chain = inst.chain.then(() => syncReteFromProps());
  }

  async function syncReteFromProps() {
    const inst = reteRef.current;
    if (!inst) return;
    const {
      project: curProject,
      positions: curPos,
      nodeMeta: curMeta,
      values: curValues,
      selected: curSelected,
      onSelect: curOnSelect,
      onChangeNode: curOnChange,
      onRemoveEdge: curOnRemoveEdge,
    } = latestRef.current;

    const nextKey = JSON.stringify({
      nodes: curProject.nodes.map((n) => [n.id, n.kind]),
      edges: curProject.edges,
    });

    inst.syncing = true;
    try {
      if (nextKey !== inst.topologyKey) {
        inst.topologyKey = nextKey;
        await inst.editor.clear();

        for (let i = 0; i < curProject.nodes.length; i += 1) {
          const n = curProject.nodes[i];
          const reteNode = new ZenceReteNode(n);
          reteNode.customColor = curMeta?.[n.id]?.color;
          reteNode.liveValue = curValues[n.id];
          reteNode.isSelected = n.id === curSelected;
          reteNode.onSelectNode = curOnSelect;
          reteNode.onChangeValue = curOnChange;
          reteNode.onDisconnectPort = (nodeId, portKey) => {
            const match = latestRef.current.project.edges.find(
              (e) => e.to.node === nodeId && e.to.port === portKey,
            );
            if (match) curOnRemoveEdge(match);
          };
          await inst.editor.addNode(reteNode);
          const pt = positionFor(n, i, curPos);
          await inst.area.translate(n.id, { x: pt.x, y: pt.y });
        }

        for (const edge of curProject.edges) {
          const src = inst.editor.getNode(edge.from.node);
          const dst = inst.editor.getNode(edge.to.node);
          if (!src || !dst) continue;
          const outPort = src.outputs[edge.from.port];
          const inPort = dst.inputs[edge.to.port];
          if (!outPort || !inPort) continue;
          const conn = new ZenceConnection(
            src,
            edge.from.port,
            dst,
            edge.to.port,
            outPort.socket.name as PortType,
          );
          await inst.editor.addConnection(conn);
        }

        if (!inst.didInitialFit) {
          inst.didInitialFit = true;
          requestAnimationFrame(() => {
            void AreaExtensions.zoomAt(inst.area, inst.editor.getNodes());
          });
        }
      } else {
        // Fast in-place update without rebuilding topology
        for (let i = 0; i < curProject.nodes.length; i += 1) {
          const n = curProject.nodes[i];
          const reteNode = inst.editor.getNode(n.id);
          if (!reteNode) continue;
          reteNode.zenceNode = n;
          reteNode.customColor = curMeta?.[n.id]?.color;
          reteNode.liveValue = curValues[n.id];
          reteNode.isSelected = n.id === curSelected;
          reteNode.onSelectNode = curOnSelect;
          reteNode.onChangeValue = curOnChange;
          await inst.area.update("node", n.id);
          const pt = positionFor(n, i, curPos);
          const view = inst.area.nodeViews.get(n.id);
          if (
            view &&
            (Math.abs(view.position.x - pt.x) > 1 || Math.abs(view.position.y - pt.y) > 1)
          ) {
            await inst.area.translate(n.id, { x: pt.x, y: pt.y });
          }
        }
      }
    } finally {
      inst.syncing = false;
    }
  }

  // Sync topology/node params/values/selection/positions into Rete
  useEffect(() => {
    queueSync();
  }, [project, positions, nodeMeta, values, selected]);

  useEffect(() => {
    if (showAdd) {
      setQuery("");
      setPaletteIndex(0);
      requestAnimationFrame(() => searchInput.current?.focus());
    }
  }, [showAdd]);

  function fitGraph() {
    const inst = reteRef.current;
    if (!inst) return;
    void AreaExtensions.zoomAt(inst.area, inst.editor.getNodes());
  }

  function stepZoom(delta: number) {
    const inst = reteRef.current;
    if (!inst) return;
    const { k, x, y } = inst.area.area.transform;
    const next = Math.max(0.25, Math.min(2.2, k + delta));
    void inst.area.area.zoom(next / k, x, y);
  }

  return (
    <section
      className={`panel graph-panel ${hidden ? "is-panel-hidden" : ""}`}
      aria-label="Grafo de nodos Rete"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
        if (event.key === "Tab") {
          event.preventDefault();
          setShowAdd((open) => !open);
        } else if (event.key === "Escape") {
          setShowAdd(false);
        } else if ((event.key === "Delete" || event.key === "Backspace") && selected) {
          event.preventDefault();
          onDelete(selected);
        }
      }}
    >
      <div className="panel-heading">
        <h2><Workflow size={14} /> Grafo Rete</h2>
        <div className="graph-add">
          {onAddHydraChain && (
            <button
              type="button"
              className="preset-pill"
              title="Crear cadena nodal Hydra (Osc → Kaleid → Color → Out)"
              onClick={onAddHydraChain}
            >
              + Hydra Ops
            </button>
          )}
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
                  placeholder="Buscar Op (MapRange, LFO, Osc, Kaleid…)"
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
              <div className="palette-tabs">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={categoryFilter === cat ? "is-active" : ""}
                    onClick={() => {
                      setCategoryFilter(cat);
                      setPaletteIndex(0);
                    }}
                  >
                    {cat}
                  </button>
                ))}
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
                        <span
                          className="palette-icon"
                          style={{ color: categoryColors[meta.category] }}
                        >
                          <Icon size={14} />
                        </span>
                        <span className="palette-meta">
                          <strong>{meta.namespace}</strong>
                          <small>{meta.description}</small>
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
        className="rete-canvas"
        ref={containerRef}
        onDoubleClick={(e) => {
          if (e.target === containerRef.current) setShowAdd(true);
        }}
      />

      <div className="graph-footer">
        <span>
          <Crosshair size={12} /> {project.nodes.length} ops · {project.edges.length} cables · Tab añade
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
            onClick={() => stepZoom(-0.15)}
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
            onClick={() => stepZoom(0.15)}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
    </section>
  );
}
