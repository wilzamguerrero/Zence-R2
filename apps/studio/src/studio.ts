import { readProject } from "../../../packages/engine/project.ts";
import type { Node, Project } from "../../../packages/engine/project.ts";
import example from "../../../examples/particles.zence.json";

export type Position = { x: number; y: number };
export type Layout = Record<string, Position>;
export type ViewSettings = { grid: boolean; guides: boolean; color: string; size: number };
export type StudioDocument = { title: string; project: Project; positions: Layout; view: ViewSettings };

export const initialView: ViewSettings = { grid: true, guides: true, color: "#daff69", size: 3 };
export const loopSeconds = 10;
export const initialTick = 155;

export const nodeTypes = {
  "control.number": { label: "Control numérico", name: "Intensidad", category: "Señal", input: null, output: "value" },
  "simulation.particles": { label: "Simulación de partículas", name: "Emisor de partículas", category: "Simulación", input: "intensity", output: "points" },
  "scene.points": { label: "Escena de puntos", name: "Escena 3D", category: "Salida", input: "points", output: null },
} as const satisfies Record<Node["kind"], { label: string; name: string; category: string; input: string | null; output: string | null }>;

export const portLabels: Record<string, string> = {
  intensity: "Intensidad", value: "Valor", points: "Puntos",
};

export const initialDocument: StudioDocument = {
  title: "Campo de partículas",
  project: readProject(example),
  positions: { intensity: { x: 32, y: 35 }, particles: { x: 141, y: 190 }, stage: { x: 65, y: 345 } },
  view: initialView,
};

export function positionFor(node: Node, index: number, positions: Layout): Position {
  return Object.hasOwn(positions, node.id) ? positions[node.id] : { x: 48 + (index % 2) * 70, y: 38 + index * 144 };
}

export function makeNode(kind: Node["kind"], nodes: Node[]): Node {
  const base = { "control.number": "control", "simulation.particles": "emitter", "scene.points": "scene" }[kind];
  let suffix = 1;
  while (nodes.some((node) => node.id === `${base}-${suffix}`)) suffix += 1;
  const id = `${base}-${suffix}`;
  switch (kind) {
    case "control.number": return { id, kind, initial: 1, min: 0, max: 4 };
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
  return {
    title: typeof metadata?.title === "string" && metadata.title.trim()
      ? metadata.title.trim().slice(0, 72)
      : filename.replace(/(?:\.zence)?\.json$/i, "").slice(0, 72) || initialDocument.title,
    project,
    positions,
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
