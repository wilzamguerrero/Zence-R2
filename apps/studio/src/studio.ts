import { readProject } from "../../../packages/engine/project.ts";
import type { Edge, Node, PortType, Project } from "../../../packages/engine/project.ts";
import { defaultCode, presets } from "./hydraFrame.ts";
import example from "../../../examples/particles.zence.json";

export type Position = { x: number; y: number };
export type Position3D = { x: number; y: number; z: number };
export type Layout = Record<string, Position>;
export type NodeMeta = {
  color?: string;
  comment?: string;
  pos3d?: Position3D;
};
export type ViewSettings = { grid: boolean; guides: boolean; color: string; size: number };
export type CueSlot = {
  id: string;
  name: string;
  code: string;
  color: string;
  size: number;
  controls: Record<string, number>;
};
export type StudioDocument = {
  title: string;
  project: Project;
  positions: Layout;
  nodeMeta?: Record<string, NodeMeta>;
  view: ViewSettings;
  code: string;
  bpm?: number;
  cues?: CueSlot[];
};

export const initialView: ViewSettings = { grid: true, guides: true, color: "#ae68ad", size: 3 };
export const loopSeconds = 10;
export const initialTick = 155;

export const cablesSwatches = [
  "#f5f3f4",
  "#58c4dc",
  "#6ed491",
  "#f0b35a",
  "#e25d6b",
  "#ae68ad",
  "#7aa2f7",
] as const;

export const defaultCues: CueSlot[] = [
  { id: "cue-1", name: "Órbitas", code: presets.Órbitas, color: "#ae68ad", size: 3, controls: { intensity: 1.4 } },
  { id: "cue-2", name: "Materia", code: presets.Materia, color: "#8c68ae", size: 4, controls: { intensity: 2.2 } },
  { id: "cue-3", name: "Pulso", code: presets.Pulso, color: "#d472d3", size: 4.5, controls: { intensity: 3.1 } },
  { id: "cue-4", name: "Caleido", code: presets.Caleido, color: "#7aa2f7", size: 3.5, controls: { intensity: 1.8 } },
];

export type NodeMetaSpec = {
  label: string;
  name: string;
  namespace: string;
  category: "Control" | "Anim" | "Math" | "Hydra" | "Mocap" | "Scene";
  description: string;
  inputs: Array<{ key: string; label: string; type: PortType; optional?: boolean }>;
  outputs: Array<{ key: string; label: string; type: PortType }>;
};

export const nodeTypes: Record<Node["kind"], NodeMetaSpec> = {
  "control.number": {
    label: "Control numérico",
    name: "Number",
    namespace: "Ops.Control.Number",
    category: "Control",
    description: "Slider manual y remoto (0..4)",
    inputs: [],
    outputs: [{ key: "value", label: "Valor", type: "number" }],
  },
  "signal.lfo": {
    label: "Oscilador LFO",
    name: "LFO",
    namespace: "Ops.Anim.LFO",
    category: "Anim",
    description: "Onda periódica determinista (Sine / Tri / Saw / Square)",
    inputs: [],
    outputs: [{ key: "value", label: "Valor", type: "number" }],
  },
  "signal.timer": {
    label: "Temporizador",
    name: "Timer",
    namespace: "Ops.Anim.Timer",
    category: "Anim",
    description: "Reloj continuo determinista multiplicado por velocidad",
    inputs: [],
    outputs: [{ key: "value", label: "Tiempo", type: "number" }],
  },
  "signal.smooth": {
    label: "Suavizador",
    name: "Smooth",
    namespace: "Ops.Anim.Smooth",
    category: "Anim",
    description: "Interpolación exponencial suave de una señal",
    inputs: [{ key: "in", label: "Entrada", type: "number" }],
    outputs: [{ key: "value", label: "Suave", type: "number" }],
  },
  "signal.mapRange": {
    label: "Mapear Rango",
    name: "MapRange",
    namespace: "Ops.Math.MapRange",
    category: "Math",
    description: "Remapea un rango [inMin..inMax] a [outMin..outMax]",
    inputs: [{ key: "in", label: "Valor", type: "number" }],
    outputs: [{ key: "value", label: "Salida", type: "number" }],
  },
  "signal.math": {
    label: "Operador Math",
    name: "Math",
    namespace: "Ops.Math.Op",
    category: "Math",
    description: "Multiplica, suma, limita, abs o sin sobre una señal",
    inputs: [{ key: "in", label: "Entrada", type: "number" }],
    outputs: [{ key: "value", label: "Resultado", type: "number" }],
  },
  "hydra.osc": {
    label: "Hydra Osc",
    name: "Osc",
    namespace: "Ops.Hydra.Osc",
    category: "Hydra",
    description: "Generador de ondas osc(freq, sync, offset)",
    inputs: [{ key: "mod", label: "Mod Freq", type: "number", optional: true }],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.noise": {
    label: "Hydra Noise",
    name: "Noise",
    namespace: "Ops.Hydra.Noise",
    category: "Hydra",
    description: "Ruido Perlin generativo noise(scale, offset)",
    inputs: [],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.shape": {
    label: "Hydra Shape",
    name: "Shape",
    namespace: "Ops.Hydra.Shape",
    category: "Hydra",
    description: "Polígono geométrico shape(sides, radius, smoothing)",
    inputs: [{ key: "mod", label: "Mod Radio", type: "number", optional: true }],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.kaleid": {
    label: "Hydra Kaleid",
    name: "Kaleid",
    namespace: "Ops.Hydra.Kaleid",
    category: "Hydra",
    description: "Simetría caleidoscópica .kaleid(sides)",
    inputs: [{ key: "tex", label: "Textura", type: "hydra" }],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.rotate": {
    label: "Hydra Rotate",
    name: "Rotate",
    namespace: "Ops.Hydra.Rotate",
    category: "Hydra",
    description: "Rotación continua .rotate(angle, speed)",
    inputs: [{ key: "tex", label: "Textura", type: "hydra" }],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.modulate": {
    label: "Hydra Modulate",
    name: "Modulate",
    namespace: "Ops.Hydra.Modulate",
    category: "Hydra",
    description: "Distorsión espacial .modulate(modTex, amount)",
    inputs: [
      { key: "tex", label: "Textura", type: "hydra" },
      { key: "modTex", label: "Mod Tex", type: "hydra", optional: true },
      { key: "mod", label: "Mod Amt", type: "number", optional: true },
    ],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.color": {
    label: "Hydra Color",
    name: "Color",
    namespace: "Ops.Hydra.Color",
    category: "Hydra",
    description: "Balance RGB .color(r, g, b)",
    inputs: [{ key: "tex", label: "Textura", type: "hydra" }],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.out": {
    label: "Hydra Output",
    name: "Out",
    namespace: "Ops.Hydra.Out",
    category: "Hydra",
    description: "Compila la cadena nodal hacia el buffer Hydra (o0..o3)",
    inputs: [{ key: "tex", label: "Textura", type: "hydra" }],
    outputs: [],
  },
  "mocap.body": {
    label: "Mocap Cuerpo",
    name: "BodyMocap",
    namespace: "Ops.Mocap.Body",
    category: "Mocap",
    description: "Seguimiento de 33 puntos corporales desde cámara, video o imagen",
    inputs: [],
    outputs: [
      { key: "skeleton", label: "Esqueleto", type: "skeleton" },
      { key: "value", label: "Actividad", type: "number" },
    ],
  },
  "mocap.hands": {
    label: "Mocap Manos",
    name: "HandsMocap",
    namespace: "Ops.Mocap.Hands",
    category: "Mocap",
    description: "Seguimiento dual de manos (21 puntos/mano) y gestos de pinza/apertura",
    inputs: [{ key: "skeleton", label: "Esqueleto", type: "skeleton", optional: true }],
    outputs: [
      { key: "skeleton", label: "Esqueleto", type: "skeleton" },
      { key: "value", label: "Apertura", type: "number" },
    ],
  },
  "scene.skeletonRig": {
    label: "Esqueleto 3D",
    name: "SkeletonRig",
    namespace: "Ops.Mocap.SkeletonRig",
    category: "Mocap",
    description: "Visualiza huesos/articulaciones 3D y retargetea modelos GLB/FBX",
    inputs: [
      { key: "skeleton", label: "Esqueleto", type: "skeleton", optional: true },
      { key: "scale", label: "Escala", type: "number", optional: true },
    ],
    outputs: [{ key: "skeleton", label: "Esqueleto", type: "skeleton" }],
  },
  "particles.skeleton": {
    label: "Partículas Huesos",
    name: "SkeletonParticles",
    namespace: "Ops.Sim.SkeletonParticles",
    category: "Mocap",
    description: "Emite y enlaza partículas directamente a los huesos y articulaciones",
    inputs: [
      { key: "skeleton", label: "Esqueleto", type: "skeleton", optional: true },
      { key: "intensity", label: "Intensidad", type: "number", optional: true },
    ],
    outputs: [{ key: "points", label: "Puntos", type: "points" }],
  },
  "particles.merge": {
    label: "Combinar Puntos",
    name: "MergePoints",
    namespace: "Ops.Sim.MergePoints",
    category: "Scene",
    description: "Combina dos nubes de partículas (ej. ambiente + esqueleto)",
    inputs: [
      { key: "a", label: "Puntos A", type: "points" },
      { key: "b", label: "Puntos B", type: "points", optional: true },
    ],
    outputs: [{ key: "points", label: "Puntos", type: "points" }],
  },
  "simulation.particles": {
    label: "Emisor de partículas",
    name: "Particles",
    namespace: "Ops.Sim.Particles",
    category: "Scene",
    description: "Campo de partículas 3D controlado por señal",
    inputs: [{ key: "intensity", label: "Intensidad", type: "number" }],
    outputs: [{ key: "points", label: "Puntos", type: "points" }],
  },
  "scene.points": {
    label: "Escena 3D",
    name: "Scene3D",
    namespace: "Ops.Scene.Points",
    category: "Scene",
    description: "Salida activa de puntos al visor 3D",
    inputs: [{ key: "points", label: "Puntos", type: "points" }],
    outputs: [],
  },
};

export const portLabels: Record<string, string> = {
  intensity: "Intensidad",
  in: "Entrada",
  value: "Valor",
  points: "Puntos",
  tex: "Textura",
  modTex: "Mod Tex",
  mod: "Mod",
  skeleton: "Esqueleto",
  scale: "Escala",
  a: "Puntos A",
  b: "Puntos B",
};

export const initialDocument: StudioDocument = {
  title: "dev by wilzamguerrero",
  project: readProject(example),
  positions: { intensity: { x: 40, y: 30 }, particles: { x: 300, y: 110 }, stage: { x: 560, y: 190 } },
  nodeMeta: {},
  view: initialView,
  code: defaultCode,
  bpm: 120,
  cues: defaultCues,
};

export function positionFor(node: Node, index: number, positions: Layout): Position {
  return Object.hasOwn(positions, node.id)
    ? positions[node.id]
    : { x: 40 + (index % 3) * 240, y: 30 + Math.floor(index / 3) * 180 };
}

export function defaultPosition3D(index: number, total: number): Position3D {
  const half = Math.max(1, Math.ceil(total / 2));
  const isLeft = index < half;
  const sideIndex = isLeft ? index : index - half;
  const sideCount = isLeft ? half : Math.max(1, total - half);
  const spread = sideIndex - (sideCount - 1) / 2;
  return {
    x: isLeft ? -4.8 - Math.abs(spread) * 0.35 : 4.8 + Math.abs(spread) * 0.35,
    y: 0.7 - spread * 1.65,
    z: 0.9 + Math.abs(spread) * 0.5,
  };
}

export function autoLayout(nodes: Node[], edges: Edge[]): Layout {
  const depth = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const node of nodes) {
    depth.set(node.id, 0);
    incoming.set(node.id, []);
  }
  for (const edge of edges) {
    incoming.get(edge.to.node)?.push(edge.from.node);
  }
  for (let pass = 0; pass < nodes.length; pass += 1) {
    for (const node of nodes) {
      const parents = incoming.get(node.id) ?? [];
      if (parents.length > 0) {
        const next = Math.max(...parents.map((id) => (depth.get(id) ?? 0) + 1));
        depth.set(node.id, next);
      }
    }
  }
  const buckets = new Map<number, Node[]>();
  for (const node of nodes) {
    const level = depth.get(node.id) ?? 0;
    const list = buckets.get(level) ?? [];
    list.push(node);
    buckets.set(level, list);
  }
  const next: Layout = Object.create(null);
  for (const [level, group] of buckets) {
    group.forEach((node, index) => {
      next[node.id] = { x: 36 + level * 255, y: 30 + index * 175 };
    });
  }
  return next;
}

export function makeNode(kind: Node["kind"], nodes: Node[]): Node {
  const baseMap: Record<Node["kind"], string> = {
    "control.number": "control",
    "signal.lfo": "lfo",
    "signal.timer": "timer",
    "signal.smooth": "smooth",
    "signal.mapRange": "mapRange",
    "signal.math": "math",
    "hydra.osc": "osc",
    "hydra.noise": "noise",
    "hydra.shape": "shape",
    "hydra.kaleid": "kaleid",
    "hydra.rotate": "rotate",
    "hydra.modulate": "modulate",
    "hydra.color": "color",
    "hydra.out": "out",
    "mocap.body": "bodyMocap",
    "mocap.hands": "handsMocap",
    "scene.skeletonRig": "skeletonRig",
    "particles.skeleton": "boneParticles",
    "particles.merge": "merge",
    "simulation.particles": "emitter",
    "scene.points": "scene",
  };
  const base = baseMap[kind];
  let suffix = 1;
  while (nodes.some((node) => node.id === `${base}-${suffix}`)) suffix += 1;
  const id = `${base}-${suffix}`;
  switch (kind) {
    case "control.number": return { id, kind, initial: 1, min: 0, max: 4 };
    case "signal.lfo": return { id, kind, wave: "sine", rate: 0.5, amplitude: 1.2, offset: 1.5 };
    case "signal.timer": return { id, kind, speed: 1 };
    case "signal.smooth": return { id, kind, smoothing: 0.85 };
    case "signal.mapRange": return { id, kind, inMin: 0, inMax: 4, outMin: 0.2, outMax: 2.5, clamp: true };
    case "signal.math": return { id, kind, op: "mul", factor: 1, bias: 0 };
    case "hydra.osc": return { id, kind, freq: 10, sync: 0.08, offset: 0.4 };
    case "hydra.noise": return { id, kind, scale: 3, offset: 0.15 };
    case "hydra.shape": return { id, kind, sides: 5, radius: 0.4, smoothing: 0.01 };
    case "hydra.kaleid": return { id, kind, sides: 5 };
    case "hydra.rotate": return { id, kind, angle: 0, speed: 0.08 };
    case "hydra.modulate": return { id, kind, amount: 0.12 };
    case "hydra.color": return { id, kind, r: 0.68, g: 0.4, b: 0.78 };
    case "hydra.out": return { id, kind, buffer: "o0" };
    case "mocap.body": return { id, kind, mirror: true, smoothing: 0.35, scale: 1 };
    case "mocap.hands": return { id, kind, smoothing: 0.4, fingers: true, spreadGain: 1 };
    case "scene.skeletonRig": return { id, kind, showBones: true, showJoints: true, retargetModel: true, jointSize: 1 };
    case "particles.skeleton": return { id, kind, seed: 77, count: 512, spread: 0.16, zone: "all", attachMode: "aura" };
    case "particles.merge": return { id, kind };
    case "simulation.particles": return { id, kind, seed: 42, count: 768 };
    case "scene.points": return { id, kind };
  }
}

export function loadDocument(input: unknown, filename: string): StudioDocument {
  const project = readProject(input);
  const metadata = (input as { studio?: Partial<StudioDocument> }).studio;
  const positions: Layout = Object.create(null);
  for (const node of project.nodes) {
    const point = metadata?.positions?.[node.id];
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      positions[node.id] = { x: Math.min(10_000, Math.max(0, point.x)), y: Math.min(10_000, Math.max(0, point.y)) };
    }
  }
  const view = metadata?.view;
  const bpm = typeof metadata?.bpm === "number" && Number.isFinite(metadata.bpm)
    ? Math.max(40, Math.min(240, Math.round(metadata.bpm)))
    : 120;
  const cues = Array.isArray(metadata?.cues) && metadata.cues.length > 0
    ? metadata.cues.slice(0, 8).map((cue, index) => ({
        id: typeof cue?.id === "string" ? cue.id : `cue-${index + 1}`,
        name: typeof cue?.name === "string" && cue.name.trim() ? cue.name.trim().slice(0, 24) : `Cue ${index + 1}`,
        code: typeof cue?.code === "string" ? cue.code.slice(0, 100000) : defaultCode,
        color: typeof cue?.color === "string" && /^#[0-9a-f]{6}$/i.test(cue.color) ? cue.color : initialView.color,
        size: typeof cue?.size === "number" && Number.isFinite(cue.size) ? Math.max(1, Math.min(9, cue.size)) : initialView.size,
        controls: cue?.controls && typeof cue.controls === "object" ? cue.controls : {},
      }))
    : defaultCues;
  return {
    title: typeof metadata?.title === "string" && metadata.title.trim()
      ? metadata.title.trim().slice(0, 72)
      : filename.replace(/(?:\.zence)?\.json$/i, "").slice(0, 72) || initialDocument.title,
    project,
    positions,
    nodeMeta: metadata?.nodeMeta && typeof metadata.nodeMeta === "object" ? metadata.nodeMeta : {},
    code: typeof metadata?.code === "string" ? metadata.code.slice(0, 100000) : defaultCode,
    bpm,
    cues,
    view: {
      grid: typeof view?.grid === "boolean" ? view.grid : initialView.grid,
      guides: typeof view?.guides === "boolean" ? view.guides : initialView.guides,
      color: typeof view?.color === "string" && /^#[0-9a-f]{6}$/i.test(view.color) ? view.color : initialView.color,
      size: typeof view?.size === "number" && Number.isFinite(view.size)
        ? Math.max(1, Math.min(9, view.size)) : initialView.size,
    },
  };
}

export function saveDocument(document: StudioDocument): void {
  const { project, ...studio } = document;
  const file = new Blob([JSON.stringify({ ...project, studio }, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = (studio.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "zence") + ".zence.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
