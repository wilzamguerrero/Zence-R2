import {
  Activity,
  Box,
  BoxSelect,
  Calculator,
  Camera,
  CircleDot,
  Crosshair,
  Disc,
  FileCode2,
  FileUp,
  Grid2X2,
  Hand,
  ImagePlus,
  Lasso,
  Layers,
  LayoutGrid,
  Lightbulb,
  Maximize,
  Mic,
  Minus,
  MonitorPlay,
  Move,
  Palette,
  PersonStanding,
  Pin,
  Plus,
  Radio,
  RotateCw,
  Search,
  Sparkles,
  Table,
  Timer,
  Type,
  User,
  Video,
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
import { nodeMediaHub } from "../nodeMediaHub.ts";
import { defaultPreferences } from "../preferences.ts";
import type { StudioPreferences } from "../preferences.ts";
import { familyColors, nodeTypes, positionFor } from "../studio.ts";
import type { Layout, NodeMeta, Position } from "../studio.ts";

const icons: Record<Node["kind"], typeof Activity> = {
  "control.number": Radio,
  "signal.lfo": Activity,
  "signal.timer": Timer,
  "signal.smooth": Waves,
  "signal.mapRange": Calculator,
  "signal.math": Calculator,
  "chop.noise": Activity,
  "chop.audioIn": Mic,
  "chop.speed": Timer,
  "chop.analyze": Activity,
  "hydra.osc": Waves,
  "hydra.noise": Sparkles,
  "hydra.shape": Disc,
  "hydra.kaleid": Sparkles,
  "hydra.rotate": RotateCw,
  "hydra.modulate": Activity,
  "hydra.color": Palette,
  "hydra.out": Box,
  "top.movieFileIn": ImagePlus,
  "top.videoDeviceIn": Video,
  "top.ramp": Palette,
  "top.level": Sparkles,
  "top.blur": Disc,
  "top.transform": Move,
  "top.composite": Layers,
  "top.displace": Waves,
  "top.text": Type,
  "top.chopTo": Activity,
  "sop.sphere": Disc,
  "sop.box": Box,
  "sop.torus": CircleDot,
  "sop.grid": Grid2X2,
  "sop.fileIn": FileUp,
  "sop.transform": Move,
  "sop.noise": Sparkles,
  "sop.toPop": Sparkles,
  "mat.phong": Palette,
  "mat.pbr": Palette,
  "mat.constant": Palette,
  "dat.text": FileCode2,
  "dat.table": Table,
  "dat.evaluate": Calculator,
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

const categoryColors = familyColors;

const sockets: Record<PortType, ClassicPreset.Socket> = {
  number: new ClassicPreset.Socket("number"),
  points: new ClassicPreset.Socket("points"),
  hydra: new ClassicPreset.Socket("hydra"),
  skeleton: new ClassicPreset.Socket("skeleton"),
  geometry: new ClassicPreset.Socket("geometry"),
  material: new ClassicPreset.Socket("material"),
  data: new ClassicPreset.Socket("data"),
};

class ZenceReteNode extends ClassicPreset.Node {
  zenceNode: Node;
  customColor?: string;
  liveValue?: number;
  isSelected = false;
  isPinned = false;
  onChangeValue?: (node: Node) => void;
  onSelectNode?: (id: string) => void;
  onTogglePin?: (id: string) => void;
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
    case "chop.noise":
      return `seed ${node.seed} · ${node.rate} Hz`;
    case "chop.audioIn":
      return `mic ${node.band} ×${node.gain}`;
    case "chop.speed":
      return `gain ×${node.gain}`;
    case "chop.analyze":
      return `bpm ${node.mode}`;
    case "top.movieFileIn":
      return `slot s${node.sourceSlot} · ${node.fit}`;
    case "top.videoDeviceIn":
      return `${node.deviceMode} → s${node.sourceSlot}`;
    case "top.ramp":
      return `${node.rampType} · vel ${node.speed}`;
    case "top.level":
      return `ctr ${node.contrast} · sat ${node.saturate}`;
    case "top.blur":
      return `size ${node.size}`;
    case "top.transform":
      return `sc ${node.scale} · rep ${node.repeat}`;
    case "top.composite":
      return `${node.op}(${node.amount})`;
    case "top.displace":
      return `peso ${node.weight}`;
    case "top.text":
      return `"${node.text.slice(0, 12)}" → s${node.sourceSlot}`;
    case "top.chopTo":
      return `freq ${node.freq}`;
    case "sop.sphere":
      return `r ${node.radius} · seg ${node.segments}`;
    case "sop.box":
      return `${node.width}×${node.height}×${node.depth}`;
    case "sop.torus":
      return `r ${node.radius} · t ${node.tube}`;
    case "sop.grid":
      return `${node.size}m · div ${node.divisions}`;
    case "sop.fileIn":
      return node.fileName || "FBX / GLB / OBJ";
    case "sop.transform":
      return `sc ${node.scale} · ry ${node.ry}`;
    case "sop.noise":
      return `amp ${node.amplitude} · f ${node.freq}`;
    case "sop.toPop":
      return `${node.count} pts`;
    case "mat.phong":
      return `phong ${node.wireframe ? "wire" : "fill"}`;
    case "mat.pbr":
      return `m ${node.metalness} · r ${node.roughness}`;
    case "mat.constant":
      return `const ${node.wireframe ? "wire" : "solid"}`;
    case "dat.text":
      return `${node.text.length} chars`;
    case "dat.table":
      return `celda [${node.row},${node.col}]`;
    case "dat.evaluate":
      return node.expr.slice(0, 18);
    case "comp.geo":
      return node.visible ? `spin ${node.autoSpin}` : "oculto";
    case "comp.light":
      return `int ${node.intensity}`;
    case "comp.camera":
      return `fov ${node.fov}°`;
    case "comp.output":
      return node.blackout ? "BLACKOUT" : "Programa en vivo";
    case "mocap.body":
      return node.mirror ? `espejo · ${node.scale}×` : `directo · ${node.scale}×`;
    case "mocap.hands":
      return node.fingers ? "dedos activos" : "solo muñeca";
    case "scene.skeletonRig":
      return `${node.showBones ? "huesos" : "nodos"}${node.retargetModel ? " + rig" : ""}`;
    case "particles.skeleton":
      return `${node.count} pts · ${node.zone}`;
    case "particles.merge":
      return "A + B";
    case "simulation.particles":
      return `${node.count} pts`;
    case "scene.points":
      return "Visor 3D";
  }
}

function pointInPoly(px: number, py: number, poly: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-6) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function rectsOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function ReteSocketDot({ data }: { data: ClassicPreset.Socket }) {
  return <span className={`rete-socket rete-socket-${data.name}`} title={data.name} />;
}

function ReteFlowConnection({ data }: { data: ZenceConnection }) {
  const { path } = useConnection();
  if (!path) return null;
  return (
    <svg className={`rete-wire rete-wire-${data.socketType ?? "data"}`} data-testid="connection">
      <path className="rete-wire-line" d={path} />
    </svg>
  );
}

function InlineRangeSlider({
  nodeId,
  min,
  max,
  value,
  onChange,
}: {
  nodeId: string;
  min: number;
  max: number;
  value: number;
  onChange: (next: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  const activeRef = useRef(false);
  useEffect(() => {
    if (!activeRef.current) setDraft(value);
  }, [value]);

  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="rete-inline-control"
      onPointerDown={stop}
      onPointerMove={stop}
      onMouseDown={stop}
      onTouchStart={stop}
    >
      <input
        type="range"
        min={min}
        max={max}
        step="any"
        value={draft}
        aria-label={`Valor de ${nodeId}`}
        onPointerDown={(e) => {
          activeRef.current = true;
          e.stopPropagation();
        }}
        onPointerUp={() => {
          activeRef.current = false;
        }}
        onBlur={() => {
          activeRef.current = false;
        }}
        onChange={(e) => {
          const next = Number(e.target.value);
          setDraft(next);
          onChange(next);
        }}
      />
      <output>{draft.toFixed(2)}</output>
    </div>
  );
}

function NodeMediaInline({ node, onChange }: { node: Node; onChange?: (n: Node) => void }) {
  const [, setVersion] = useState(0);
  useEffect(() => nodeMediaHub.subscribe(() => setVersion((v) => v + 1)), []);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (node.kind === "top.movieFileIn") {
    const entry = nodeMediaHub.getEntry(node.id);
    return (
      <div className="rete-inline-media" onPointerDown={stop} onMouseDown={stop}>
        <label className="rete-inline-btn">
          {entry ? entry.label.slice(0, 16) : "Cargar Imagen / Video"}
          <input
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void nodeMediaHub.loadMediaFile(node.id, file, node.sourceSlot);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    );
  }
  if (node.kind === "top.videoDeviceIn") {
    const entry = nodeMediaHub.getEntry(node.id);
    return (
      <div className="rete-inline-media" onPointerDown={stop} onMouseDown={stop}>
        <button
          type="button"
          className={`rete-inline-btn ${entry?.active ? "is-active" : ""}`}
          onClick={() => {
            if (entry?.active) nodeMediaHub.stopMedia(node.id);
            else void nodeMediaHub.startDevice(node.id, node.deviceMode, node.sourceSlot);
          }}
        >
          {entry?.active ? "Detener señal" : node.deviceMode === "camera" ? "Activar Cámara" : "Capturar Pantalla"}
        </button>
      </div>
    );
  }
  if (node.kind === "sop.fileIn") {
    return (
      <div className="rete-inline-media" onPointerDown={stop} onMouseDown={stop}>
        <label className="rete-inline-btn">
          {node.fileName ? node.fileName.slice(0, 16) : "Cargar FBX / GLB"}
          <input
            type="file"
            accept=".fbx,.glb,.gltf,.obj"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                window.dispatchEvent(new CustomEvent("zence:load-model", { detail: file }));
                onChange?.({ ...node, fileName: file.name });
              }
              e.target.value = "";
            }}
          />
        </label>
      </div>
    );
  }
  if (node.kind === "chop.audioIn") {
    return (
      <div className="rete-inline-media" onPointerDown={stop} onMouseDown={stop}>
        <button
          type="button"
          className="rete-inline-btn"
          onClick={() => window.dispatchEvent(new CustomEvent("zence:toggle-mic"))}
        >
          Activar / Pausar Mic
        </button>
      </div>
    );
  }
  if (node.kind === "comp.output") {
    return (
      <div className="rete-inline-media" onPointerDown={stop} onMouseDown={stop}>
        <button
          type="button"
          className="rete-inline-btn"
          onClick={() => window.dispatchEvent(new CustomEvent("zence:stage-action", { detail: "project" }))}
        >
          Proyectar
        </button>
        <button
          type="button"
          className={`rete-inline-btn ${node.blackout ? "is-active" : ""}`}
          onClick={() => {
            const next = !node.blackout;
            onChange?.({ ...node, blackout: next });
            window.dispatchEvent(new CustomEvent("zence:stage-action", { detail: next ? "blackout-on" : "blackout-off" }));
          }}
        >
          Blackout
        </button>
      </div>
    );
  }
  if (node.kind === "mocap.body" || node.kind === "mocap.hands") {
    return (
      <div className="rete-inline-media" onPointerDown={stop} onMouseDown={stop}>
        <button
          type="button"
          className="rete-inline-btn"
          onClick={() => window.dispatchEvent(new CustomEvent("zence:mocap-toggle"))}
        >
          Cámara Mocap
        </button>
      </div>
    );
  }
  return null;
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
      data-node-id={node.id}
      data-kind={node.kind}
      style={{ "--node-accent": accent } as React.CSSProperties}
      onPointerDown={(e) => {
        const additive = e.ctrlKey || e.metaKey || e.shiftKey;
        data.onSelectNode?.(additive ? `__toggle__:${node.id}` : node.id);
      }}
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
        <button
          type="button"
          className={`rete-node-pin ${data.isPinned ? "is-active" : ""}`}
          title={data.isPinned ? "Desfijar parámetros (Nuke Pin)" : "Fijar parámetros en Inspector (Nuke Pin)"}
          aria-label={`Fijar parámetros de ${node.id}`}
          aria-pressed={data.isPinned}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            data.onTogglePin?.(node.id);
          }}
        >
          <Pin size={10} />
        </button>
        <span className="td-family-tag">{spec.category}</span>
      </div>

      <div className="rete-node-sub">{nodeSummary(node)}</div>

      {node.kind === "control.number" && (
        <InlineRangeSlider
          nodeId={node.id}
          min={node.min}
          max={node.max}
          value={node.initial}
          onChange={(next) => data.onChangeValue?.({ ...node, initial: next })}
        />
      )}

      <NodeMediaInline node={node} onChange={data.onChangeValue} />

      <div className="rete-ports">
        {inputs.map(([key, input]) =>
          input ? (
            <div
              className="rete-port-row in"
              key={key}
              data-port-node={data.id}
              data-port-key={key}
              data-port-side="input"
              data-port-type={input.socket.name}
            >
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
            <div
              className="rete-port-row out"
              key={key}
              data-port-node={data.id}
              data-port-key={key}
              data-port-side="output"
              data-port-type={output.socket.name}
            >
              {output.socket.name === "number" && (
                <output className="rete-port-value" data-live-value={data.id}>
                  {Number.isFinite(data.liveValue) ? data.liveValue!.toFixed(2) : ""}
                </output>
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
  selectedIds?: string[];
  pinnedIds?: string[];
  prefs?: StudioPreferences;
  hidden?: boolean;
  backdrop?: boolean;
  openPaletteSignal?: number;
  onCloseBackdrop?: () => void;
  onSelect: (id: string) => void;
  onSelectMany?: (ids: string[]) => void;
  onTogglePin?: (id: string) => void;
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
  selectedIds: externalSelectedIds,
  pinnedIds,
  prefs,
  hidden,
  backdrop,
  openPaletteSignal,
  onCloseBackdrop,
  onSelect,
  onSelectMany,
  onTogglePin,
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
    dragging: Set<string>;
    dragPrevPos: Map<string, Position>;
  } | null>(null);
  const [selectMode, setSelectMode] = useState<"pan" | "marquee" | "lasso">("pan");
  const [hitMode, setHitMode] = useState<"rect" | "center">("rect");
  const [passThrough, setPassThrough] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    externalSelectedIds ?? (selected ? [selected] : []),
  );
  const [marqueeShape, setMarqueeShape] = useState<{
    kind: "marquee" | "lasso";
    points: Array<{ x: number; y: number }>;
  } | null>(null);

  const selectedIdsRef = useRef<Set<string>>(
    new Set(externalSelectedIds ?? (selected ? [selected] : [])),
  );
  const activePrefs = prefs ?? defaultPreferences;
  const prefsRef = useRef(activePrefs);
  prefsRef.current = activePrefs;
  const selectModeRef = useRef(selectMode);
  const hitModeRef = useRef(hitMode);
  selectModeRef.current = selectMode;
  hitModeRef.current = hitMode;

  useEffect(() => {
    if (externalSelectedIds) {
      const extKey = externalSelectedIds.join(",");
      const curKey = Array.from(selectedIdsRef.current).join(",");
      if (extKey !== curKey) {
        selectedIdsRef.current = new Set(externalSelectedIds);
        setSelectedIds(externalSelectedIds);
      }
      return;
    }
    if (selected && !selectedIdsRef.current.has(selected)) {
      selectedIdsRef.current = new Set([selected]);
      setSelectedIds([selected]);
    } else if (!selected && selectedIdsRef.current.size === 1) {
      selectedIdsRef.current = new Set();
      setSelectedIds([]);
    }
  }, [selected, externalSelectedIds]);

  const handleSelectToken = (token: string) => {
    if (token.startsWith("__toggle__:")) {
      const id = token.slice("__toggle__:".length);
      const next = new Set(selectedIdsRef.current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const arr = Array.from(next);
      selectedIdsRef.current = next;
      setSelectedIds(arr);
      if (latestRef.current.onSelectMany) {
        latestRef.current.onSelectMany(arr);
      } else if (arr.length > 0) {
        onSelect(arr[arr.length - 1]);
      }
    } else {
      // Si el nodo ya pertenece a una multi-selección activa (Área / Lazo), mantenla intacta para poder arrastrar o inspeccionar juntos
      if (selectedIdsRef.current.has(token) && selectedIdsRef.current.size > 1) {
        return;
      }
      if (!selectedIdsRef.current.has(token) || selectedIdsRef.current.size !== 1) {
        selectedIdsRef.current = new Set([token]);
        setSelectedIds([token]);
        if (latestRef.current.onSelectMany) {
          latestRef.current.onSelectMany([token]);
        } else {
          onSelect(token);
        }
      } else {
        onSelect(token);
      }
    }
  };

  const latestRef = useRef({
    project,
    positions,
    nodeMeta,
    values,
    selected,
    pinnedIds,
    onSelect: handleSelectToken,
    onSelectMany,
    onTogglePin,
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
    pinnedIds,
    onSelect: handleSelectToken,
    onSelectMany,
    onTogglePin,
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

  const categories = ["Todas", "TOP", "CHOP", "SOP", "POP", "MAT", "DAT", "COMP"];
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
    AreaExtensions.simpleNodesOrder(area);

    const state = {
      editor,
      area,
      syncing: false,
      topologyKey: "",
      chain: Promise.resolve(),
      didInitialFit: false,
      dragging: new Set<string>(),
      dragPrevPos: new Map<string, Position>(),
    };
    reteRef.current = state;

    // Conexión magnética (detecta puerto compatible más cercano <= 36 px)
    let pickedSocket: { nodeId: string; key: string; side: "input" | "output"; type: string } | null = null;
    let magneticTarget: { nodeId: string; key: string; side: "input" | "output"; el: HTMLElement } | null = null;

    function clearMagnetic() {
      container?.querySelectorAll(".rete-socket.is-magnetic-target").forEach((el) => {
        el.classList.remove("is-magnetic-target");
      });
      magneticTarget = null;
    }

    connection.addPipe((context) => {
      if (context.type === "connectionpick") {
        const s = context.data.socket;
        const pickedNode = editor.getNode(s.nodeId);
        const portObj =
          s.side === "output" ? pickedNode?.outputs[s.key] : pickedNode?.inputs[s.key];
        const typeName = portObj?.socket?.name ?? "";
        pickedSocket = {
          nodeId: s.nodeId,
          key: s.key,
          side: s.side,
          type: typeName,
        };
      } else if (context.type === "connectiondrop") {
        const droppedTarget = magneticTarget;
        const picked = pickedSocket;
        clearMagnetic();
        pickedSocket = null;
        if (!context.data.created && picked && droppedTarget) {
          const isPickedOut = picked.side === "output";
          const from = isPickedOut
            ? { node: picked.nodeId, port: picked.key }
            : { node: droppedTarget.nodeId, port: droppedTarget.key };
          const to = isPickedOut
            ? { node: droppedTarget.nodeId, port: droppedTarget.key }
            : { node: picked.nodeId, port: picked.key };
          if (from.node !== to.node) {
            latestRef.current.onConnectEdge({ from, to });
          }
        }
      } else if (context.type === "pointermove" && pickedSocket) {
        if (!prefsRef.current.magneticSockets) {
          clearMagnetic();
          return context;
        }
        const ev = (context.data as { event?: PointerEvent }).event;
        if (ev) {
          let bestDist = 36;
          let best: { nodeId: string; key: string; side: "input" | "output"; el: HTMLElement } | null = null;
          const rows = Array.from(container.querySelectorAll<HTMLElement>(".rete-port-row"));
          for (const row of rows) {
            const nodeId = row.dataset.portNode;
            const key = row.dataset.portKey;
            const side = row.dataset.portSide as "input" | "output" | undefined;
            const ptype = row.dataset.portType;
            if (!nodeId || !key || !side || !ptype) continue;
            if (nodeId === pickedSocket.nodeId || side === pickedSocket.side || ptype !== pickedSocket.type) continue;
            const dot = row.querySelector<HTMLElement>(".rete-socket");
            if (!dot) continue;
            const r = dot.getBoundingClientRect();
            const dist = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
            if (dist < bestDist) {
              bestDist = dist;
              best = { nodeId, key, side, el: dot };
            }
          }
          if (magneticTarget?.el !== best?.el) {
            clearMagnetic();
            magneticTarget = best;
            if (magneticTarget) magneticTarget.el.classList.add("is-magnetic-target");
          }
        }
      }
      return context;
    });

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
        return undefined; // React topology sync creates the validated connection cleanly
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

    let multiMoving = false;
    area.addPipe((context) => {
      if (state.syncing) return context;
      if (context.type === "nodetranslate") {
        const curPrefs = prefsRef.current;
        if (curPrefs.snapToGrid) {
          const step = Math.max(4, curPrefs.gridStep);
          context.data.position.x = Math.round(context.data.position.x / step) * step;
          context.data.position.y = Math.round(context.data.position.y / step) * step;
        }
      } else if (context.type === "nodepicked") {
        const { id } = context.data;
        state.dragging.add(id);
        const view = area.nodeViews.get(id);
        if (view) state.dragPrevPos.set(id, { ...view.position });
      } else if (context.type === "nodetranslated") {
        const { id, position } = context.data;
        const prev = state.dragPrevPos.get(id);
        const rounded = { x: Math.round(position.x), y: Math.round(position.y) };
        latestRef.current.onMove(id, rounded);

        // Arrastre conjunto de nodos multi-seleccionados
        if (!multiMoving && state.dragging.has(id) && selectedIdsRef.current.has(id) && selectedIdsRef.current.size > 1 && prev) {
          const dx = position.x - prev.x;
          const dy = position.y - prev.y;
          if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
            multiMoving = true;
            for (const otherId of selectedIdsRef.current) {
              if (otherId === id) continue;
              const ov = area.nodeViews.get(otherId);
              if (!ov) continue;
              const nx = ov.position.x + dx;
              const ny = ov.position.y + dy;
              void area.translate(otherId, { x: nx, y: ny });
              latestRef.current.onMove(otherId, { x: Math.round(nx), y: Math.round(ny) });
            }
            multiMoving = false;
          }
        }
        state.dragPrevPos.set(id, { x: position.x, y: position.y });
      } else if (context.type === "nodedragged") {
        const { id } = context.data;
        state.dragging.delete(id);
        state.dragPrevPos.delete(id);

        if (!prefsRef.current.wireAutoInsert) return context;
        // Inserción automática sobre cable si es un nodo passthrough sin cables previos
        const curProj = latestRef.current.project;
        const draggedNode = curProj.nodes.find((n) => n.id === id);
        const hasAnyEdge = curProj.edges.some((e) => e.from.node === id || e.to.node === id);
        const el = container?.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
        if (draggedNode && !hasAnyEdge && el) {
          const spec = nodeTypes[draggedNode.kind];
          if (spec.inputs.length > 0 && spec.outputs.length > 0) {
            const box = el.getBoundingClientRect();
            for (const edge of curProj.edges) {
              const srcMeta = nodeTypes[curProj.nodes.find((n) => n.id === edge.from.node)?.kind ?? "control.number"];
              const outSpec = srcMeta.outputs.find((o) => o.key === edge.from.port);
              const inPort = spec.inputs.find((i) => i.type === outSpec?.type);
              const outPort = spec.outputs.find((o) => o.type === outSpec?.type);
              if (!outSpec || !inPort || !outPort) continue;

              const srcEl = container.querySelector<HTMLElement>(`[data-node-id="${edge.from.node}"]`);
              const dstEl = container.querySelector<HTMLElement>(`[data-node-id="${edge.to.node}"]`);
              if (!srcEl || !dstEl) continue;
              const sr = srcEl.getBoundingClientRect();
              const dr = dstEl.getBoundingClientRect();
              const midX = (sr.right + dr.left) * 0.5;
              const midY = (sr.top + sr.height * 0.5 + dr.top + dr.height * 0.5) * 0.5;
              if (midX >= box.left - 18 && midX <= box.right + 18 && midY >= box.top - 18 && midY <= box.bottom + 18) {
                latestRef.current.onRemoveEdge(edge);
                latestRef.current.onConnectEdge({ from: edge.from, to: { node: id, port: inPort.key } });
                latestRef.current.onConnectEdge({ from: { node: id, port: outPort.key }, to: edge.to });
                break;
              }
            }
          }
        }
      }
      return context;
    });

    const resetStalePointer = () => {
      state.dragging.clear();
      state.dragPrevPos.clear();
      clearMagnetic();
      pickedSocket = null;
    };
    window.addEventListener("pointerup", resetStalePointer);
    window.addEventListener("pointercancel", resetStalePointer);
    window.addEventListener("blur", resetStalePointer);

    return () => {
      window.removeEventListener("pointerup", resetStalePointer);
      window.removeEventListener("pointercancel", resetStalePointer);
      window.removeEventListener("blur", resetStalePointer);
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
      pinnedIds: curPinnedIds,
      onSelect: curOnSelect,
      onTogglePin: curOnTogglePin,
      onChangeNode: curOnChange,
      onRemoveEdge: curOnRemoveEdge,
    } = latestRef.current;
    const pinnedSet = new Set(curPinnedIds ?? []);

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
          reteNode.isSelected = selectedIdsRef.current.has(n.id) || n.id === curSelected;
          reteNode.isPinned = pinnedSet.has(n.id);
          reteNode.onSelectNode = curOnSelect;
          reteNode.onTogglePin = curOnTogglePin;
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
        // Actualización ligera sin interrumpir sliders ni nodos siendo arrastrados
        const focusedNode = document.activeElement?.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId;
        for (let i = 0; i < curProject.nodes.length; i += 1) {
          const n = curProject.nodes[i];
          const reteNode = inst.editor.getNode(n.id);
          if (!reteNode) continue;
          reteNode.zenceNode = n;
          reteNode.customColor = curMeta?.[n.id]?.color;
          reteNode.liveValue = curValues[n.id];
          reteNode.isSelected = selectedIdsRef.current.has(n.id) || n.id === curSelected;
          reteNode.isPinned = pinnedSet.has(n.id);
          reteNode.onSelectNode = curOnSelect;
          reteNode.onTogglePin = curOnTogglePin;
          reteNode.onChangeValue = curOnChange;
          if (focusedNode !== n.id && !inst.dragging.has(n.id)) {
            await inst.area.update("node", n.id);
          }
          const pt = positionFor(n, i, curPos);
          const view = inst.area.nodeViews.get(n.id);
          if (
            view &&
            !inst.dragging.has(n.id) &&
            (Math.abs(view.position.x - pt.x) > 3 || Math.abs(view.position.y - pt.y) > 3)
          ) {
            await inst.area.translate(n.id, { x: pt.x, y: pt.y });
          }
        }
      }
    } finally {
      inst.syncing = false;
    }
  }

  // Sincronización de topología, parámetros, selección y posiciones (sin depender de ticks de `values`)
  useEffect(() => {
    queueSync();
  }, [project, positions, nodeMeta, selected, selectedIds, pinnedIds]);

  // Lectura numérica en vivo directo en el DOM a 60fps sin re-renderizar nodos ni trabar sliders
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll<HTMLOutputElement>("[data-live-value]").forEach((el) => {
      const id = el.dataset.liveValue;
      if (!id) return;
      const val = values[id];
      el.textContent = Number.isFinite(val) ? val.toFixed(2) : "";
    });
  }, [values]);

  // Recuperación limpia al salir y volver al panel de grafo
  useEffect(() => {
    const inst = reteRef.current;
    if (!inst) return;
    inst.dragging.clear();
    inst.dragPrevPos.clear();
    setMarqueeShape(null);
    if (!hidden) {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
    }
  }, [hidden]);

  useEffect(() => {
    if (openPaletteSignal && openPaletteSignal > 0) {
      setShowAdd((open) => !open);
    }
  }, [openPaletteSignal]);

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
      className={`panel graph-panel ${backdrop ? "is-backdrop" : ""} ${backdrop && passThrough ? "is-pass-through" : ""} ${activePrefs.animatedWires ? "" : "no-wire-flow"} ${activePrefs.backdropBlur ? "" : "no-backdrop-blur"} ${activePrefs.showPinButtonsOnNodes ? "" : "hide-node-pins"} ${hidden ? "is-panel-hidden" : ""}`}
      aria-label="Grafo de nodos Rete"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
        if (event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          setShowAdd((open) => !open);
        } else if (event.key === "Escape") {
          setShowAdd(false);
        } else if (event.key === "Delete" || event.key === "Backspace") {
          const targets = selectedIdsRef.current.size > 0
            ? Array.from(selectedIdsRef.current)
            : selected
              ? [selected]
              : [];
          if (targets.length > 0) {
            event.preventDefault();
            for (const id of targets) onDelete(id);
            selectedIdsRef.current = new Set();
            setSelectedIds([]);
            latestRef.current.onSelectMany?.([]);
          }
        }
      }}
    >
      <div className="panel-heading">
        <h2><Workflow size={14} /> {backdrop ? "Backdrop Nodos" : "Grafo Rete"}</h2>
        <div className="graph-add">
          {backdrop && (
            <button
              type="button"
              className={`preset-pill ${passThrough ? "is-active" : ""}`}
              title="Al activar, el fondo vacío deja rotar/interactuar con el visor detrás mientras los nodos siguen activos"
              onClick={() => setPassThrough((v) => !v)}
            >
              {passThrough ? "Fondo: Visor" : "Fondo: Grafo"}
            </button>
          )}
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
          {backdrop && onCloseBackdrop && (
            <button
              type="button"
              className="preset-pill"
              title="Ocultar grafo sobre visor (Alt+1)"
              onClick={onCloseBackdrop}
            >
              Ocultar
            </button>
          )}
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
        onPointerDownCapture={(e) => {
          const host = containerRef.current;
          if (!host) return;
          const targetEl = e.target as HTMLElement | null;
          if (targetEl?.closest(".rete-node") || targetEl?.closest(".rete-socket")) return;
          const shouldSelect = e.button === 0 && (e.shiftKey || selectModeRef.current !== "pan");
          if (!shouldSelect) return;

          e.stopPropagation();
          e.preventDefault();
          const hostRect = host.getBoundingClientRect();
          const kind: "marquee" | "lasso" =
            selectModeRef.current === "lasso" ? "lasso" : "marquee";
          const start = { x: e.clientX - hostRect.left, y: e.clientY - hostRect.top };
          const pts = [start];
          setMarqueeShape({ kind, points: pts });

          const updateHitSelection = (curPts: Array<{ x: number; y: number }>) => {
            const minX = Math.min(...curPts.map((p) => p.x));
            const maxX = Math.max(...curPts.map((p) => p.x));
            const minY = Math.min(...curPts.map((p) => p.y));
            const maxY = Math.max(...curPts.map((p) => p.y));
            const picked: string[] = [];

            host.querySelectorAll<HTMLElement>("[data-node-id]").forEach((el) => {
              const id = el.dataset.nodeId;
              if (!id) return;
              const r = el.getBoundingClientRect();
              const nodeRect = {
                left: r.left - hostRect.left,
                right: r.right - hostRect.left,
                top: r.top - hostRect.top,
                bottom: r.bottom - hostRect.top,
              };
              const cx = (nodeRect.left + nodeRect.right) * 0.5;
              const cy = (nodeRect.top + nodeRect.bottom) * 0.5;

              let match = false;
              if (kind === "marquee") {
                match =
                  hitModeRef.current === "center"
                    ? cx >= minX && cx <= maxX && cy >= minY && cy <= maxY
                    : rectsOverlap(nodeRect, { left: minX, right: maxX, top: minY, bottom: maxY });
              } else {
                if (hitModeRef.current === "center") {
                  match = pointInPoly(cx, cy, curPts);
                } else {
                  const corners = [
                    { x: nodeRect.left, y: nodeRect.top },
                    { x: nodeRect.right, y: nodeRect.top },
                    { x: nodeRect.right, y: nodeRect.bottom },
                    { x: nodeRect.left, y: nodeRect.bottom },
                    { x: cx, y: cy },
                  ];
                  match = corners.some((c) => pointInPoly(c.x, c.y, curPts));
                }
              }
              if (match) picked.push(id);
            });

            selectedIdsRef.current = new Set(picked);
            setSelectedIds(picked);
            if (latestRef.current.onSelectMany) {
              latestRef.current.onSelectMany(picked);
            } else if (picked.length > 0) {
              onSelect(picked[0]);
            }
          };

          const onMoveEv = (moveEv: PointerEvent) => {
            const pt = { x: moveEv.clientX - hostRect.left, y: moveEv.clientY - hostRect.top };
            if (kind === "marquee") {
              pts[1] = pt;
              setMarqueeShape({ kind, points: [pts[0], pt] });
            } else {
              const last = pts[pts.length - 1];
              if (Math.hypot(pt.x - last.x, pt.y - last.y) > 4) {
                pts.push(pt);
                setMarqueeShape({ kind, points: [...pts] });
              }
            }
            updateHitSelection(pts);
          };

          const onUpEv = () => {
            window.removeEventListener("pointermove", onMoveEv);
            window.removeEventListener("pointerup", onUpEv);
            window.removeEventListener("pointercancel", onUpEv);
            setMarqueeShape(null);
          };

          window.addEventListener("pointermove", onMoveEv);
          window.addEventListener("pointerup", onUpEv);
          window.addEventListener("pointercancel", onUpEv);
        }}
      >
        {marqueeShape && (
          <svg className="rete-select-overlay" aria-hidden="true">
            {marqueeShape.kind === "marquee" && marqueeShape.points.length >= 2 ? (
              <rect
                className="rete-select-shape"
                x={Math.min(marqueeShape.points[0].x, marqueeShape.points[1].x)}
                y={Math.min(marqueeShape.points[0].y, marqueeShape.points[1].y)}
                width={Math.abs(marqueeShape.points[1].x - marqueeShape.points[0].x)}
                height={Math.abs(marqueeShape.points[1].y - marqueeShape.points[0].y)}
              />
            ) : marqueeShape.kind === "lasso" && marqueeShape.points.length >= 2 ? (
              <polygon
                className="rete-select-shape"
                points={marqueeShape.points.map((p) => `${p.x},${p.y}`).join(" ")}
              />
            ) : null}
          </svg>
        )}
      </div>

      <div className="graph-footer">
        <span>
          <Crosshair size={12} />{" "}
          {selectedIds.length > 1
            ? `${selectedIds.length} seleccionados · Supr elimina`
            : `${project.nodes.length} ops · ${project.edges.length} cables · Shift+Arrastra selecciona`}
        </span>
        <div className="graph-select-tools" role="group" aria-label="Herramienta de selección">
          <button
            type="button"
            className={`icon-button ${selectMode === "pan" ? "is-active" : ""}`}
            title="Mover lienzo (arrastre normal)"
            aria-label="Modo mover lienzo"
            onClick={() => setSelectMode("pan")}
          >
            <Move size={12} />
          </button>
          <button
            type="button"
            className={`icon-button ${selectMode === "marquee" ? "is-active" : ""}`}
            title="Selección rectangular (Marquee)"
            aria-label="Selección rectangular"
            onClick={() => setSelectMode("marquee")}
          >
            <BoxSelect size={12} />
          </button>
          <button
            type="button"
            className={`icon-button ${selectMode === "lasso" ? "is-active" : ""}`}
            title="Selección por lazo libre (Lasso)"
            aria-label="Selección por lazo"
            onClick={() => setSelectMode("lasso")}
          >
            <Lasso size={12} />
          </button>
          <button
            type="button"
            className="preset-pill"
            title="Alternar detección por área del nodo o por centro"
            onClick={() => setHitMode((m) => (m === "rect" ? "center" : "rect"))}
          >
            {hitMode === "rect" ? "Área" : "Centro"}
          </button>
        </div>
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
