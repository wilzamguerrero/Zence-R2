import { fixedStepSeconds } from "./clock.ts";

type Point3 = { x: number; y: number; z: number };

export type LfoWave = "sine" | "triangle" | "saw" | "square";
export type MathOp = "add" | "mul" | "clamp" | "abs" | "sin";
export type HydraBuffer = "o0" | "o1" | "o2" | "o3";

export type Node =
  | { id: string; kind: "control.number"; initial: number; min: number; max: number }
  | { id: string; kind: "signal.lfo"; wave: LfoWave; rate: number; amplitude: number; offset: number }
  | { id: string; kind: "signal.timer"; speed: number }
  | { id: string; kind: "signal.smooth"; smoothing: number }
  | { id: string; kind: "signal.mapRange"; inMin: number; inMax: number; outMin: number; outMax: number; clamp: boolean }
  | { id: string; kind: "signal.math"; op: MathOp; factor: number; bias: number }
  | { id: string; kind: "hydra.osc"; freq: number; sync: number; offset: number }
  | { id: string; kind: "hydra.noise"; scale: number; offset: number }
  | { id: string; kind: "hydra.shape"; sides: number; radius: number; smoothing: number }
  | { id: string; kind: "hydra.kaleid"; sides: number }
  | { id: string; kind: "hydra.rotate"; angle: number; speed: number }
  | { id: string; kind: "hydra.modulate"; amount: number }
  | { id: string; kind: "hydra.color"; r: number; g: number; b: number }
  | { id: string; kind: "hydra.out"; buffer: HydraBuffer }
  | { id: string; kind: "simulation.particles"; seed: number; count: number }
  | { id: string; kind: "scene.points" };

export type Edge = {
  from: { node: string; port: string };
  to: { node: string; port: string };
};

export type Project = { schemaVersion: 1; nodes: Node[]; edges: Edge[]; scene: string };
type Particles = { positions: Point3[]; velocities: Point3[] };
export type PortType = "number" | "points" | "hydra";
type InputSpec = PortType | { type: PortType; optional?: boolean };
type Ports = { inputs: Record<string, InputSpec>; outputs: Record<string, PortType> };
type NodePlan = { node: Node; sources: Map<string, string> };

const lfoWaves: readonly LfoWave[] = ["sine", "triangle", "saw", "square"];
const mathOps: readonly MathOp[] = ["add", "mul", "clamp", "abs", "sin"];
const hydraBuffers: readonly HydraBuffer[] = ["o0", "o1", "o2", "o3"];

const ports: Record<Node["kind"], Ports> = {
  "control.number": { inputs: {}, outputs: { value: "number" } },
  "signal.lfo": { inputs: {}, outputs: { value: "number" } },
  "signal.timer": { inputs: {}, outputs: { value: "number" } },
  "signal.smooth": { inputs: { in: "number" }, outputs: { value: "number" } },
  "signal.mapRange": { inputs: { in: "number" }, outputs: { value: "number" } },
  "signal.math": { inputs: { in: "number" }, outputs: { value: "number" } },
  "hydra.osc": { inputs: { mod: { type: "number", optional: true } }, outputs: { tex: "hydra" } },
  "hydra.noise": { inputs: {}, outputs: { tex: "hydra" } },
  "hydra.shape": { inputs: { mod: { type: "number", optional: true } }, outputs: { tex: "hydra" } },
  "hydra.kaleid": { inputs: { tex: "hydra" }, outputs: { tex: "hydra" } },
  "hydra.rotate": { inputs: { tex: "hydra" }, outputs: { tex: "hydra" } },
  "hydra.modulate": {
    inputs: {
      tex: "hydra",
      modTex: { type: "hydra", optional: true },
      mod: { type: "number", optional: true },
    },
    outputs: { tex: "hydra" },
  },
  "hydra.color": { inputs: { tex: "hydra" }, outputs: { tex: "hydra" } },
  "hydra.out": { inputs: { tex: "hydra" }, outputs: {} },
  "simulation.particles": { inputs: { intensity: "number" }, outputs: { points: "points" } },
  "scene.points": { inputs: { points: "points" }, outputs: {} },
};

function specType(spec: InputSpec): PortType {
  return typeof spec === "string" ? spec : spec.type;
}

function specOptional(spec: InputSpec): boolean {
  return typeof spec === "object" && !!spec.optional;
}

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
    case "signal.lfo": {
      if (typeof node.wave !== "string" || !lfoWaves.includes(node.wave as LfoWave)) {
        throw new TypeError(`Invalid wave for ${id}`);
      }
      const rate = number(node.rate);
      if (rate < 0 || rate > 100) throw new RangeError(`Invalid rate for ${id}`);
      return {
        id,
        kind: node.kind,
        wave: node.wave as LfoWave,
        rate,
        amplitude: number(node.amplitude),
        offset: number(node.offset),
      };
    }
    case "signal.timer":
      return { id, kind: node.kind, speed: number(node.speed) };
    case "signal.smooth": {
      const smoothing = number(node.smoothing);
      if (smoothing < 0 || smoothing > 0.999) throw new RangeError(`Invalid smoothing for ${id}`);
      return { id, kind: node.kind, smoothing };
    }
    case "signal.mapRange":
      return {
        id,
        kind: node.kind,
        inMin: number(node.inMin),
        inMax: number(node.inMax),
        outMin: number(node.outMin),
        outMax: number(node.outMax),
        clamp: typeof node.clamp === "boolean" ? node.clamp : true,
      };
    case "signal.math": {
      if (typeof node.op !== "string" || !mathOps.includes(node.op as MathOp)) {
        throw new TypeError(`Invalid op for ${id}`);
      }
      return {
        id,
        kind: node.kind,
        op: node.op as MathOp,
        factor: number(node.factor),
        bias: number(node.bias),
      };
    }
    case "hydra.osc":
      return { id, kind: node.kind, freq: number(node.freq), sync: number(node.sync), offset: number(node.offset) };
    case "hydra.noise":
      return { id, kind: node.kind, scale: number(node.scale), offset: number(node.offset) };
    case "hydra.shape":
      return {
        id,
        kind: node.kind,
        sides: number(node.sides),
        radius: number(node.radius),
        smoothing: number(node.smoothing),
      };
    case "hydra.kaleid":
      return { id, kind: node.kind, sides: number(node.sides) };
    case "hydra.rotate":
      return { id, kind: node.kind, angle: number(node.angle), speed: number(node.speed) };
    case "hydra.modulate":
      return { id, kind: node.kind, amount: number(node.amount) };
    case "hydra.color":
      return { id, kind: node.kind, r: number(node.r), g: number(node.g), b: number(node.b) };
    case "hydra.out": {
      if (typeof node.buffer !== "string" || !hydraBuffers.includes(node.buffer as HydraBuffer)) {
        throw new TypeError(`Invalid buffer for ${id}`);
      }
      return { id, kind: node.kind, buffer: node.buffer as HydraBuffer };
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
    if (
      !Object.hasOwn(outputs, from.port) ||
      !Object.hasOwn(inputs, to.port) ||
      outputs[from.port] !== specType(inputs[to.port])
    ) {
      throw new Error(`Incompatible connection ${from.node}.${from.port} → ${to.node}.${to.port}`);
    }
    if (target.sources.has(to.port)) throw new Error(`Multiple connections to ${to.node}.${to.port}`);
    target.sources.set(to.port, from.node);
    consumers.get(from.node)!.push(target);
  }

  const queue: NodePlan[] = [];
  const pending = new Map<string, number>();
  for (const plan of nodes.values()) {
    for (const [input, spec] of Object.entries(ports[plan.node.kind].inputs)) {
      if (!specOptional(spec) && !plan.sources.has(input)) {
        throw new Error(`Missing input ${plan.node.id}.${input}`);
      }
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

export function compileHydraCode(project: Project): string | null {
  const outs = project.nodes.filter((n): n is Extract<Node, { kind: "hydra.out" }> => n.kind === "hydra.out");
  if (outs.length === 0) return null;

  const nodeMap = new Map(project.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, Map<string, string>>();
  for (const edge of project.edges) {
    let map = incoming.get(edge.to.node);
    if (!map) {
      map = new Map();
      incoming.set(edge.to.node, map);
    }
    map.set(edge.to.port, edge.from.node);
  }

  function buildChain(nodeId: string, visited = new Set<string>()): string | null {
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node) return null;
    const sources = incoming.get(nodeId);
    switch (node.kind) {
      case "hydra.osc": {
        const mod = sources?.get("mod");
        const freqExpr = mod ? `() => ${node.freq} + control(${JSON.stringify(mod)}) * 6` : String(node.freq);
        return `osc(${freqExpr}, ${node.sync}, ${node.offset})`;
      }
      case "hydra.noise":
        return `noise(${node.scale}, ${node.offset})`;
      case "hydra.shape": {
        const mod = sources?.get("mod");
        const radiusExpr = mod
          ? `() => Math.max(0.05, ${node.radius} + control(${JSON.stringify(mod)}) * 0.15)`
          : String(node.radius);
        return `shape(${Math.max(1, Math.round(node.sides))}, ${radiusExpr}, ${node.smoothing})`;
      }
      case "hydra.kaleid": {
        const tex = sources?.get("tex");
        const base = tex ? buildChain(tex, new Set(visited)) : null;
        if (!base) return null;
        return `${base}\n  .kaleid(${Math.max(1, Math.round(node.sides))})`;
      }
      case "hydra.rotate": {
        const tex = sources?.get("tex");
        const base = tex ? buildChain(tex, new Set(visited)) : null;
        if (!base) return null;
        return `${base}\n  .rotate(${node.angle}, ${node.speed})`;
      }
      case "hydra.modulate": {
        const tex = sources?.get("tex");
        const base = tex ? buildChain(tex, new Set(visited)) : null;
        if (!base) return null;
        const modTexId = sources?.get("modTex");
        const modTex = (modTexId ? buildChain(modTexId, new Set(visited)) : null) ?? "noise(3, 0.15)";
        const modVal = sources?.get("mod");
        const amt = modVal ? `() => control(${JSON.stringify(modVal)}) * ${node.amount}` : String(node.amount);
        return `${base}\n  .modulate(${modTex.replace(/\n\s+/g, "")}, ${amt})`;
      }
      case "hydra.color": {
        const tex = sources?.get("tex");
        const base = tex ? buildChain(tex, new Set(visited)) : null;
        if (!base) return null;
        return `${base}\n  .color(${node.r}, ${node.g}, ${node.b})`;
      }
      default:
        return null;
    }
  }

  const lines: string[] = [];
  for (const out of outs) {
    const tex = incoming.get(out.id)?.get("tex");
    if (!tex) continue;
    const chain = buildChain(tex);
    if (chain) lines.push(`${chain}\n  .out(${out.buffer})`);
  }
  return lines.length > 0 ? lines.join("\n\n") : null;
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

function evalLfo(node: Extract<Node, { kind: "signal.lfo" }>, time: number): number {
  const phase = ((time * node.rate) % 1 + 1) % 1;
  let wave = 0;
  switch (node.wave) {
    case "sine":
      wave = Math.sin(phase * Math.PI * 2);
      break;
    case "triangle":
      wave = phase < 0.25 ? phase * 4 : phase < 0.75 ? 2 - phase * 4 : phase * 4 - 4;
      break;
    case "saw":
      wave = phase * 2 - 1;
      break;
    case "square":
      wave = phase < 0.5 ? 1 : -1;
      break;
  }
  return node.offset + wave * node.amplitude;
}

function evalMath(node: Extract<Node, { kind: "signal.math" }>, input: number): number {
  switch (node.op) {
    case "add":
      return input + node.factor + node.bias;
    case "mul":
      return input * node.factor + node.bias;
    case "clamp":
      return Math.min(Math.max(input, node.bias), Math.max(node.bias, node.factor));
    case "abs":
      return Math.abs(input) * node.factor + node.bias;
    case "sin":
      return Math.sin(input * node.factor) + node.bias;
  }
}

function evalMapRange(node: Extract<Node, { kind: "signal.mapRange" }>, input: number): number {
  const span = node.inMax - node.inMin;
  let t = span === 0 ? 0 : (input - node.inMin) / span;
  if (node.clamp) t = Math.max(0, Math.min(1, t));
  return node.outMin + t * (node.outMax - node.outMin);
}

export class ProjectRuntime {
  private readonly plan: NodePlan[];
  private readonly sceneId: string;
  private readonly controls = new Map<string, { min: number; max: number; value: number }>();
  private readonly numbers = new Map<string, number>();
  private readonly smoothState = new Map<string, number>();
  private readonly particles = new Map<string, Particles>();
  private readonly scenes = new Map<string, Point3[]>();
  private stepCount = 0;

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
    this.evaluateSignals(true);
  }

  private evaluateSignals(initial = false): void {
    const time = this.stepCount * fixedStepSeconds;
    for (const { node, sources } of this.plan) {
      if (node.kind === "control.number") {
        this.numbers.set(node.id, this.controls.get(node.id)!.value);
      } else if (node.kind === "signal.lfo") {
        this.numbers.set(node.id, evalLfo(node, time));
      } else if (node.kind === "signal.timer") {
        this.numbers.set(node.id, time * node.speed);
      } else if (node.kind === "signal.smooth") {
        const input = this.numbers.get(sources.get("in")!) ?? 0;
        const prev = this.smoothState.get(node.id);
        const next = initial || prev === undefined ? input : prev + (input - prev) * (1 - node.smoothing);
        this.smoothState.set(node.id, next);
        this.numbers.set(node.id, next);
      } else if (node.kind === "signal.mapRange") {
        const input = this.numbers.get(sources.get("in")!) ?? 0;
        this.numbers.set(node.id, evalMapRange(node, input));
      } else if (node.kind === "signal.math") {
        const input = this.numbers.get(sources.get("in")!) ?? 0;
        this.numbers.set(node.id, evalMath(node, input));
      }
    }
  }

  setNumber(id: string, value: number): number {
    const control = this.controls.get(id);
    if (!control) throw new Error(`Unknown control ${id}`);
    control.value = Math.min(control.max, Math.max(control.min, number(value)));
    this.evaluateSignals();
    return control.value;
  }

  getNumber(id: string): number | undefined {
    return this.numbers.get(id);
  }

  getNumbers(): Record<string, number> {
    return Object.fromEntries(this.numbers);
  }

  tick(): void {
    this.evaluateSignals();
    for (const { node, sources } of this.plan) {
      if (node.kind !== "simulation.particles") continue;
      const { positions, velocities } = this.particles.get(node.id)!;
      const intensity = this.numbers.get(sources.get("intensity")!) ?? 0;
      const distance = fixedStepSeconds * intensity;
      for (let index = 0; index < positions.length; index += 1) {
        const position = positions[index];
        const velocity = velocities[index];
        position.x += velocity.x * distance;
        position.y += velocity.y * distance;
        position.z += velocity.z * distance;
      }
    }
    this.stepCount += 1;
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
