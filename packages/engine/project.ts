import { fixedStepSeconds } from "./clock.ts";

type Point3 = { x: number; y: number; z: number };

export type LfoWave = "sine" | "triangle" | "saw" | "square";
export type MathOp = "add" | "mul" | "clamp" | "abs" | "sin";
export type HydraBuffer = "o0" | "o1" | "o2" | "o3";
export type SkeletonZone = "all" | "hands" | "arms" | "spine" | "head" | "legs";
export type SkeletonEmitMode = "attach" | "aura" | "trail";

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
  | { id: string; kind: "mocap.body"; mirror: boolean; smoothing: number; scale: number }
  | { id: string; kind: "mocap.hands"; smoothing: number; fingers: boolean; spreadGain: number }
  | {
      id: string;
      kind: "scene.skeletonRig";
      showBones: boolean;
      showJoints: boolean;
      retargetModel: boolean;
      jointSize: number;
    }
  | {
      id: string;
      kind: "particles.skeleton";
      seed: number;
      count: number;
      spread: number;
      zone: SkeletonZone;
      attachMode: SkeletonEmitMode;
    }
  | { id: string; kind: "particles.merge" }
  | { id: string; kind: "simulation.particles"; seed: number; count: number }
  | { id: string; kind: "scene.points" };

export type Edge = {
  from: { node: string; port: string };
  to: { node: string; port: string };
};

export type Project = { schemaVersion: 1; nodes: Node[]; edges: Edge[]; scene: string };
type Particles = { positions: Point3[]; velocities: Point3[] };
type SkeletonParticles = {
  positions: Point3[];
  offsets: Point3[];
  segRatio: number[];
  phases: number[];
};
export type PortType = "number" | "points" | "hydra" | "skeleton";
type InputSpec = PortType | { type: PortType; optional?: boolean };
type Ports = { inputs: Record<string, InputSpec>; outputs: Record<string, PortType> };
type NodePlan = { node: Node; sources: Map<string, string> };

export type BoneSegment3 = [Point3, Point3];
export interface ExternalMocapInput {
  activity?: number;
  handOpen?: number;
  handPinch?: number;
  handsDist?: number;
  segmentsByZone?: Partial<Record<SkeletonZone, BoneSegment3[]>>;
}

const lfoWaves: readonly LfoWave[] = ["sine", "triangle", "saw", "square"];
const mathOps: readonly MathOp[] = ["add", "mul", "clamp", "abs", "sin"];
const hydraBuffers: readonly HydraBuffer[] = ["o0", "o1", "o2", "o3"];
const skeletonZones: readonly SkeletonZone[] = ["all", "hands", "arms", "spine", "head", "legs"];
const skeletonEmitModes: readonly SkeletonEmitMode[] = ["attach", "aura", "trail"];

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
  "mocap.body": { inputs: {}, outputs: { skeleton: "skeleton", value: "number" } },
  "mocap.hands": {
    inputs: { skeleton: { type: "skeleton", optional: true } },
    outputs: { skeleton: "skeleton", value: "number" },
  },
  "scene.skeletonRig": {
    inputs: {
      skeleton: { type: "skeleton", optional: true },
      scale: { type: "number", optional: true },
    },
    outputs: { skeleton: "skeleton" },
  },
  "particles.skeleton": {
    inputs: {
      skeleton: { type: "skeleton", optional: true },
      intensity: { type: "number", optional: true },
    },
    outputs: { points: "points" },
  },
  "particles.merge": {
    inputs: {
      a: "points",
      b: { type: "points", optional: true },
    },
    outputs: { points: "points" },
  },
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
    case "mocap.body": {
      const smoothing = number(node.smoothing);
      const scale = number(node.scale);
      if (smoothing < 0 || smoothing > 0.99) throw new RangeError(`Invalid smoothing for ${id}`);
      if (scale <= 0 || scale > 10) throw new RangeError(`Invalid scale for ${id}`);
      return { id, kind: node.kind, mirror: typeof node.mirror === "boolean" ? node.mirror : true, smoothing, scale };
    }
    case "mocap.hands": {
      const smoothing = number(node.smoothing);
      const spreadGain = number(node.spreadGain);
      if (smoothing < 0 || smoothing > 0.99) throw new RangeError(`Invalid smoothing for ${id}`);
      return {
        id,
        kind: node.kind,
        smoothing,
        fingers: typeof node.fingers === "boolean" ? node.fingers : true,
        spreadGain,
      };
    }
    case "scene.skeletonRig":
      return {
        id,
        kind: node.kind,
        showBones: typeof node.showBones === "boolean" ? node.showBones : true,
        showJoints: typeof node.showJoints === "boolean" ? node.showJoints : true,
        retargetModel: typeof node.retargetModel === "boolean" ? node.retargetModel : true,
        jointSize: number(node.jointSize),
      };
    case "particles.skeleton": {
      const zone =
        typeof node.zone === "string" && skeletonZones.includes(node.zone as SkeletonZone)
          ? (node.zone as SkeletonZone)
          : "all";
      const attachMode =
        typeof node.attachMode === "string" && skeletonEmitModes.includes(node.attachMode as SkeletonEmitMode)
          ? (node.attachMode as SkeletonEmitMode)
          : "aura";
      return {
        id,
        kind: node.kind,
        seed: integer(node.seed, 0, 0xffffffff),
        count: integer(node.count, 1, 10_000),
        spread: number(node.spread),
        zone,
        attachMode,
      };
    }
    case "particles.merge":
      return { id, kind: node.kind };
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

function seedSkeletonParticles(seed: number, count: number): SkeletonParticles {
  let state = seed || 1;
  function rand01(): number {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  }

  const positions = Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0 }));
  const offsets = Array.from({ length: count }, () => ({
    x: rand01() * 2 - 1,
    y: rand01() * 2 - 1,
    z: rand01() * 2 - 1,
  }));
  const segRatio = Array.from({ length: count }, () => rand01());
  const phases = Array.from({ length: count }, () => rand01() * Math.PI * 2);
  return { positions, offsets, segRatio, phases };
}

function proceduralHumanoidSegments(time: number, zone: SkeletonZone): BoneSegment3[] {
  const sway = Math.sin(time * 1.4) * 0.08;
  const waveL = Math.sin(time * 2.1) * 0.14;
  const waveR = Math.cos(time * 2.1) * 0.14;
  const hips: Point3 = { x: sway, y: -0.1, z: 0 };
  const chest: Point3 = { x: sway * 0.7, y: 0.48, z: 0 };
  const neck: Point3 = { x: sway * 0.5, y: 0.66, z: 0 };
  const head: Point3 = { x: sway * 0.4, y: 0.88, z: 0.03 };
  const lElb: Point3 = { x: -0.44 + sway, y: 0.35 + waveL * 0.5, z: 0.08 };
  const lHnd: Point3 = { x: -0.68 + sway, y: 0.52 + waveL, z: 0.16 };
  const rElb: Point3 = { x: 0.44 + sway, y: 0.35 + waveR * 0.5, z: 0.08 };
  const rHnd: Point3 = { x: 0.68 + sway, y: 0.52 + waveR, z: 0.16 };
  const lKnee: Point3 = { x: -0.2 + sway * 0.5, y: -0.56, z: 0.04 };
  const lFoot: Point3 = { x: -0.22 + sway * 0.4, y: -1.04, z: 0 };
  const rKnee: Point3 = { x: 0.2 + sway * 0.5, y: -0.56, z: -0.04 };
  const rFoot: Point3 = { x: 0.22 + sway * 0.4, y: -1.04, z: 0 };

  if (zone === "hands") {
    return [
      [lElb, lHnd],
      [rElb, rHnd],
    ];
  }
  if (zone === "arms") {
    return [
      [chest, lElb],
      [lElb, lHnd],
      [chest, rElb],
      [rElb, rHnd],
    ];
  }
  if (zone === "head") return [[neck, head]];
  if (zone === "spine") {
    return [
      [hips, chest],
      [chest, neck],
      [neck, head],
    ];
  }
  if (zone === "legs") {
    return [
      [hips, lKnee],
      [lKnee, lFoot],
      [hips, rKnee],
      [rKnee, rFoot],
    ];
  }
  return [
    [hips, chest],
    [chest, neck],
    [neck, head],
    [chest, lElb],
    [lElb, lHnd],
    [chest, rElb],
    [rElb, rHnd],
    [hips, lKnee],
    [lKnee, lFoot],
    [hips, rKnee],
    [rKnee, rFoot],
  ];
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
  private readonly skeletonParticles = new Map<string, SkeletonParticles>();
  private readonly pointOutputs = new Map<string, Point3[]>();
  private readonly scenes = new Map<string, Point3[]>();
  private externalMocap: ExternalMocapInput = {};
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
        const sim = seedParticles(node.seed, node.count);
        this.particles.set(node.id, sim);
        this.pointOutputs.set(node.id, sim.positions);
      }
      if (node.kind === "particles.skeleton") {
        const skel = seedSkeletonParticles(node.seed, node.count);
        this.skeletonParticles.set(node.id, skel);
        this.pointOutputs.set(node.id, skel.positions);
      }
      if (node.kind === "particles.merge") {
        const a = this.pointOutputs.get(sources.get("a")!) ?? [];
        const bId = sources.get("b");
        const b = bId ? this.pointOutputs.get(bId) ?? [] : [];
        this.pointOutputs.set(node.id, [...a, ...b]);
      }
      if (node.kind === "scene.points") {
        this.scenes.set(node.id, this.pointOutputs.get(sources.get("points")!)!);
      }
    }
    this.evaluateSignals(true);
    this.updateSkeletonParticles(0);
  }

  setExternalMocap(input: ExternalMocapInput): void {
    this.externalMocap = input;
  }

  getSkeletonDisplay(): {
    hasRigNode: boolean;
    hasBodyNode: boolean;
    hasHandsNode: boolean;
    showBones: boolean;
    showJoints: boolean;
    retargetModel: boolean;
    jointSize: number;
    bodyMirror: boolean;
    bodySmoothing: number;
    bodyScale: number;
    handFingers: boolean;
  } {
    let hasRigNode = false;
    let hasBodyNode = false;
    let hasHandsNode = false;
    let showBones = true;
    let showJoints = true;
    let retargetModel = true;
    let jointSize = 1;
    let bodyMirror = true;
    let bodySmoothing = 0.35;
    let bodyScale = 1;
    let handFingers = true;

    for (const { node } of this.plan) {
      if (node.kind === "mocap.body") {
        hasBodyNode = true;
        bodyMirror = node.mirror;
        bodySmoothing = node.smoothing;
        bodyScale = node.scale;
      } else if (node.kind === "mocap.hands") {
        hasHandsNode = true;
        handFingers = node.fingers;
      } else if (node.kind === "scene.skeletonRig") {
        hasRigNode = true;
        showBones = node.showBones;
        showJoints = node.showJoints;
        retargetModel = node.retargetModel;
        jointSize = node.jointSize;
      }
    }
    return {
      hasRigNode,
      hasBodyNode,
      hasHandsNode,
      showBones,
      showJoints,
      retargetModel,
      jointSize,
      bodyMirror,
      bodySmoothing,
      bodyScale,
      handFingers,
    };
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
      } else if (node.kind === "mocap.body") {
        this.numbers.set(node.id, this.externalMocap.activity ?? 0);
      } else if (node.kind === "mocap.hands") {
        this.numbers.set(node.id, (this.externalMocap.handOpen ?? 0) * node.spreadGain);
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

  private updateSkeletonParticles(time: number): void {
    for (const { node, sources } of this.plan) {
      if (node.kind !== "particles.skeleton") continue;
      const sp = this.skeletonParticles.get(node.id)!;
      const extSegs = this.externalMocap.segmentsByZone?.[node.zone] ?? this.externalMocap.segmentsByZone?.all;
      const segs = extSegs && extSegs.length > 0 ? extSegs : proceduralHumanoidSegments(time, node.zone);
      const intensityId = sources.get("intensity");
      const intensity = intensityId ? (this.numbers.get(intensityId) ?? 1) : 1;
      const amp = Math.max(0.05, Math.abs(intensity));
      const { positions, offsets, segRatio, phases } = sp;
      const segCount = segs.length;

      for (let i = 0; i < positions.length; i += 1) {
        const [a, b] = segs[i % segCount];
        const t = segRatio[i];
        const bx = a.x + (b.x - a.x) * t;
        const by = a.y + (b.y - a.y) * t;
        const bz = a.z + (b.z - a.z) * t;
        const off = offsets[i];
        const ph = phases[i];
        const spread = node.spread * amp;

        if (node.attachMode === "attach") {
          const jitter = 0.25 + 0.15 * Math.sin(time * 3 + ph);
          positions[i].x = bx + off.x * spread * jitter;
          positions[i].y = by + off.y * spread * jitter;
          positions[i].z = bz + off.z * spread * jitter;
        } else if (node.attachMode === "trail") {
          const cycle = ((time * 0.75 * amp + ph / (Math.PI * 2)) % 1 + 1) % 1;
          positions[i].x = bx + off.x * spread * (0.2 + cycle * 1.15);
          positions[i].y = by + off.y * spread * (0.2 + cycle) + cycle * 0.45 * amp;
          positions[i].z = bz + off.z * spread * (0.2 + cycle * 1.15);
        } else {
          // "aura"
          const ang = time * (1.2 + (i % 5) * 0.18) + ph;
          const r = spread * (0.35 + 0.65 * Math.abs(off.x));
          positions[i].x = bx + Math.cos(ang) * r;
          positions[i].y = by + off.y * spread * 0.55 + Math.sin(ang * 0.7) * r * 0.45;
          positions[i].z = bz + Math.sin(ang) * r;
        }
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
    const time = this.stepCount * fixedStepSeconds;
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
    this.updateSkeletonParticles(time);
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
