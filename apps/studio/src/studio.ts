import { readProject } from "../../../packages/engine/project.ts";
import type { Edge, Node, Project } from "../../../packages/engine/project.ts";
import { defaultCode, presets } from "./hydraFrame.ts";
import example from "../../../examples/particles.zence.json";

export type Position = { x: number; y: number };
export type Layout = Record<string, Position>;
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
  view: ViewSettings;
  code: string;
  bpm?: number;
  cues?: CueSlot[];
};

export const initialView: ViewSettings = { grid: true, guides: true, color: "#ae68ad", size: 3 };
export const loopSeconds = 10;
export const initialTick = 155;

export const defaultCues: CueSlot[] = [
  { id: "cue-1", name: "Órbitas", code: presets.Órbitas, color: "#ae68ad", size: 3, controls: { intensity: 1.4 } },
  { id: "cue-2", name: "Materia", code: presets.Materia, color: "#8c68ae", size: 4, controls: { intensity: 2.2 } },
  { id: "cue-3", name: "Pulso", code: presets.Pulso, color: "#d472d3", size: 4.5, controls: { intensity: 3.1 } },
  { id: "cue-4", name: "Medio", code: presets.Medio, color: "#cfb7cf", size: 2.5, controls: { intensity: 1.0 } },
];

export const nodeTypes = {
  "control.number": {
    label: "Control numérico",
    name: "Intensidad",
    category: "Señal",
    description: "Slider manual y remoto (0..4)",
    input: null,
    output: "value",
    inputType: null,
    outputType: "number",
  },
  "signal.lfo": {
    label: "Oscilador LFO",
    name: "LFO",
    category: "Modulación",
    description: "Onda periódica determinista (Sine / Tri / Saw / Square)",
    input: null,
    output: "value",
    inputType: null,
    outputType: "number",
  },
  "signal.math": {
    label: "Matemática / Map",
    name: "Math",
    category: "Modulación",
    description: "Escala, suma, recorta o transforma una señal numérica",
    input: "in",
    output: "value",
    inputType: "number",
    outputType: "number",
  },
  "simulation.particles": {
    label: "Simulación de partículas",
    name: "Emisor de partículas",
    category: "Simulación",
    description: "Campo de partículas 3D controlado por señal",
    input: "intensity",
    output: "points",
    inputType: "number",
    outputType: "points",
  },
  "scene.points": {
    label: "Escena de puntos",
    name: "Escena 3D",
    category: "Salida",
    description: "Salida activa al visor 3D y proyección",
    input: "points",
    output: null,
    inputType: "points",
    outputType: null,
  },
} as const satisfies Record<
  Node["kind"],
  {
    label: string;
    name: string;
    category: string;
    description: string;
    input: string | null;
    output: string | null;
    inputType: "number" | "points" | null;
    outputType: "number" | "points" | null;
  }
>;

export const portLabels: Record<string, string> = {
  intensity: "Intensidad",
  in: "Entrada",
  value: "Valor",
  points: "Puntos",
};

export const initialDocument: StudioDocument = {
  title: "Campo de partículas",
  project: readProject(example),
  positions: { intensity: { x: 24, y: 24 }, particles: { x: 118, y: 168 }, stage: { x: 48, y: 318 } },
  view: initialView,
  code: defaultCode,
  bpm: 120,
  cues: defaultCues,
};

export function positionFor(node: Node, index: number, positions: Layout): Position {
  return Object.hasOwn(positions, node.id) ? positions[node.id] : { x: 32 + (index % 2) * 70, y: 24 + index * 140 };
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
      next[node.id] = { x: 24 + index * 196, y: 24 + level * 144 };
    });
  }
  return next;
}

export function makeNode(kind: Node["kind"], nodes: Node[]): Node {
  const base = {
    "control.number": "control",
    "signal.lfo": "lfo",
    "signal.math": "math",
    "simulation.particles": "emitter",
    "scene.points": "scene",
  }[kind];
  let suffix = 1;
  while (nodes.some((node) => node.id === `${base}-${suffix}`)) suffix += 1;
  const id = `${base}-${suffix}`;
  switch (kind) {
    case "control.number": return { id, kind, initial: 1, min: 0, max: 4 };
    case "signal.lfo": return { id, kind, wave: "sine", rate: 0.5, amplitude: 1.2, offset: 1.5 };
    case "signal.math": return { id, kind, op: "mul", factor: 1, bias: 0 };
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
