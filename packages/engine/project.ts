import { fixedStepSeconds } from "./clock.ts";

type Point3 = { x: number; y: number; z: number };

export type Node =
  | { id: string; kind: "control.number"; initial: number; min: number; max: number }
  | { id: string; kind: "simulation.particles"; seed: number; count: number }
  | { id: string; kind: "scene.points" };

export type Edge = {
  from: { node: string; port: string };
  to: { node: string; port: string };
};

export type Project = { schemaVersion: 1; nodes: Node[]; edges: Edge[]; scene: string };
type Particles = { positions: Point3[]; velocities: Point3[] };
type PortType = "number" | "points";
type Ports = { inputs: Record<string, PortType>; outputs: Record<string, PortType> };
type NodePlan = { node: Node; sources: Map<string, string> };

const ports: Record<Node["kind"], Ports> = {
  "control.number": { inputs: {}, outputs: { value: "number" } },
  "simulation.particles": { inputs: { intensity: "number" }, outputs: { points: "points" } },
  "scene.points": { inputs: { points: "points" }, outputs: {} },
};

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected an object");
  }
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError("Expected an array");
  return value;
}

function name(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z][\w.-]*$/.test(value)) {
    throw new TypeError("Expected a valid node ID or port name");
  }
  return value;
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Expected a finite number");
  }
  return value;
}

function integer(value: unknown, min: number, max: number): number {
  const result = number(value);
  if (!Number.isInteger(result) || result < min || result > max) {
    throw new RangeError(`Expected an integer between ${min} and ${max}`);
  }
  return result;
}

function readNode(value: unknown): Node {
  const node = object(value);
  const id = name(node.id);
  switch (node.kind) {
    case "control.number": {
      const initial = number(node.initial);
      const min = number(node.min);
      const max = number(node.max);
      if (min > initial || initial > max) throw new RangeError(`Invalid bounds for ${id}`);
      return { id, kind: node.kind, initial, min, max };
    }
    case "simulation.particles":
      return { id, kind: node.kind, seed: integer(node.seed, 0, 0xffffffff), count: integer(node.count, 1, 10_000) };
    case "scene.points":
      return { id, kind: node.kind };
    default:
      throw new TypeError(`Unknown node type for ${id}`);
  }
}

function readEndpoint(value: unknown): Edge["from"] {
  const endpoint = object(value);
  return { node: name(endpoint.node), port: name(endpoint.port) };
}

export function readProject(value: unknown): Project {
  const data = object(value);
  if (data.schemaVersion !== 1) throw new TypeError("Unsupported project version");
  return {
    schemaVersion: 1,
    scene: name(data.scene),
    nodes: list(data.nodes).map(readNode),
    edges: list(data.edges).map((value) => {
      const edge = object(value);
      return { from: readEndpoint(edge.from), to: readEndpoint(edge.to) };
    }),
  };
}

function compile(project: Project): NodePlan[] {
  const nodes = new Map<string, NodePlan>();
  const consumers = new Map<string, NodePlan[]>();
  for (const node of project.nodes) {
    if (nodes.has(node.id)) throw new Error(`Duplicate node ${node.id}`);
    nodes.set(node.id, { node, sources: new Map() });
    consumers.set(node.id, []);
  }
  if (nodes.get(project.scene)?.node.kind !== "scene.points") {
    throw new Error("Scene must reference a scene.points node");
  }

  for (const { from, to } of project.edges) {
    const source = nodes.get(from.node);
    const target = nodes.get(to.node);
    if (!source || !target) throw new Error("Connection references a missing node");
    const outputs = ports[source.node.kind].outputs;
    const inputs = ports[target.node.kind].inputs;
    if (!Object.hasOwn(outputs, from.port) || !Object.hasOwn(inputs, to.port) ||
        outputs[from.port] !== inputs[to.port]) {
      throw new Error(`Incompatible connection ${from.node}.${from.port} → ${to.node}.${to.port}`);
    }
    if (target.sources.has(to.port)) throw new Error(`Multiple connections to ${to.node}.${to.port}`);
    target.sources.set(to.port, from.node);
    consumers.get(from.node)!.push(target);
  }

  const queue: NodePlan[] = [];
  const pending = new Map<string, number>();
  for (const plan of nodes.values()) {
    for (const input of Object.keys(ports[plan.node.kind].inputs)) {
      if (!plan.sources.has(input)) throw new Error(`Missing input ${plan.node.id}.${input}`);
    }
    pending.set(plan.node.id, plan.sources.size);
    if (plan.sources.size === 0) queue.push(plan);
  }
  for (const plan of queue) {
    for (const target of consumers.get(plan.node.id)!) {
      const remaining = pending.get(target.node.id)! - 1;
      pending.set(target.node.id, remaining);
      if (remaining === 0) queue.push(target);
    }
  }
  if (queue.length !== nodes.size) throw new Error("Graph contains a cycle");
  return queue;
}

function seedParticles(seed: number, count: number): Particles {
  let state = seed;
  function component(): number {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return (state / 0x1_0000_0000) * 2 - 1;
  }

  return {
    positions: Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0 })),
    velocities: Array.from({ length: count }, () => ({ x: component(), y: component(), z: component() })),
  };
}

export class ProjectRuntime {
  private readonly plan: NodePlan[];
  private readonly sceneId: string;
  private readonly controls = new Map<string, { min: number; max: number; value: number }>();
  private readonly particles = new Map<string, Particles>();
  private readonly scenes = new Map<string, Point3[]>();

  constructor(data: unknown) {
    const project = readProject(data);
    this.sceneId = project.scene;
    this.plan = compile(project);
    for (const { node, sources } of this.plan) {
      if (node.kind === "control.number") {
        this.controls.set(node.id, { min: node.min, max: node.max, value: node.initial });
      }
      if (node.kind === "simulation.particles") {
        this.particles.set(node.id, seedParticles(node.seed, node.count));
      }
      if (node.kind === "scene.points") {
        this.scenes.set(node.id, this.particles.get(sources.get("points")!)!.positions);
      }
    }
  }

  setNumber(id: string, value: number): number {
    const control = this.controls.get(id);
    if (!control) throw new Error(`Unknown control ${id}`);
    control.value = Math.min(control.max, Math.max(control.min, number(value)));
    return control.value;
  }

  tick(): void {
    for (const { node, sources } of this.plan) {
      if (node.kind !== "simulation.particles") continue;
      const { positions, velocities } = this.particles.get(node.id)!;
      const distance = fixedStepSeconds * this.controls.get(sources.get("intensity")!)!.value;
      for (let index = 0; index < positions.length; index += 1) {
        const position = positions[index];
        const velocity = velocities[index];
        position.x += velocity.x * distance;
        position.y += velocity.y * distance;
        position.z += velocity.z * distance;
      }
    }
  }

  get pointCount(): number {
    return this.scenes.get(this.sceneId)!.length;
  }

  writePositions(buffer: Float32Array): void {
    const points = this.scenes.get(this.sceneId)!;
    if (buffer.length < points.length * 3) throw new RangeError("Position buffer is too small");
    for (let index = 0; index < points.length; index += 1) {
      const { x, y, z } = points[index];
      const offset = index * 3;
      buffer[offset] = x;
      buffer[offset + 1] = y;
      buffer[offset + 2] = z;
    }
  }

  snapshot(): Point3[] {
    return this.scenes.get(this.sceneId)!.map((point) => ({ ...point }));
  }
}
