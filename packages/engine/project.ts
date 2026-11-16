import { fixedStepSeconds } from "./clock.ts";
import {
  evaluateSafeExpr,
  readTableCell,
  sampleNoiseChop,
  sampleSopSurfacePoint,
  type Point3,
  type SopShapeSpec,
} from "./operators.ts";

export type LfoWave = "sine" | "triangle" | "saw" | "square";
export type MathOp = "add" | "mul" | "clamp" | "abs" | "sin";
export type HydraBuffer = "o0" | "o1" | "o2" | "o3";
export type SkeletonZone = "all" | "hands" | "arms" | "spine" | "head" | "legs";
export type SkeletonEmitMode = "attach" | "aura" | "trail";
export type TopFitMode = "contain" | "cover" | "stretch";
export type VideoDeviceMode = "camera" | "screen";
export type RampType = "linear" | "radial" | "circular";
export type CompositeOp = "blend" | "add" | "diff" | "mult";
export type AudioBand = "bass" | "mid" | "high" | "audio";
export type AnalyzeMode = "beat" | "bpmNorm" | "pulse";

export type Node =
  | { id: string; kind: "control.number"; initial: number; min: number; max: number }
  | { id: string; kind: "signal.lfo"; wave: LfoWave; rate: number; amplitude: number; offset: number }
  | { id: string; kind: "signal.timer"; speed: number }
  | { id: string; kind: "signal.smooth"; smoothing: number }
  | { id: string; kind: "signal.mapRange"; inMin: number; inMax: number; outMin: number; outMax: number; clamp: boolean }
  | { id: string; kind: "signal.math"; op: MathOp; factor: number; bias: number }
  | { id: string; kind: "chop.noise"; seed: number; rate: number; amplitude: number; offset: number }
  | { id: string; kind: "chop.audioIn"; band: AudioBand; gain: number }
  | { id: string; kind: "chop.speed"; gain: number }
  | { id: string; kind: "chop.analyze"; mode: AnalyzeMode }
  | { id: string; kind: "hydra.osc"; freq: number; sync: number; offset: number }
  | { id: string; kind: "hydra.noise"; scale: number; offset: number }
  | { id: string; kind: "hydra.shape"; sides: number; radius: number; smoothing: number }
  | { id: string; kind: "hydra.kaleid"; sides: number }
  | { id: string; kind: "hydra.rotate"; angle: number; speed: number }
  | { id: string; kind: "hydra.modulate"; amount: number }
  | { id: string; kind: "hydra.color"; r: number; g: number; b: number }
  | { id: string; kind: "hydra.out"; buffer: HydraBuffer }
  | { id: string; kind: "top.movieFileIn"; sourceSlot: 0 | 1 | 2 | 3; fit: TopFitMode; speed: number; loop: boolean }
  | { id: string; kind: "top.videoDeviceIn"; deviceMode: VideoDeviceMode; sourceSlot: 0 | 1 | 2 | 3; mirror: boolean }
  | { id: string; kind: "top.ramp"; rampType: RampType; speed: number; r1: number; g1: number; b1: number; r2: number; g2: number; b2: number }
  | { id: string; kind: "top.level"; brightness: number; contrast: number; saturate: number; invert: number }
  | { id: string; kind: "top.blur"; size: number }
  | { id: string; kind: "top.transform"; tx: number; ty: number; scale: number; rotate: number; repeat: number }
  | { id: string; kind: "top.composite"; op: CompositeOp; amount: number }
  | { id: string; kind: "top.displace"; weight: number }
  | { id: string; kind: "top.text"; text: string; fontSize: number; color: string; sourceSlot: 0 | 1 | 2 | 3 }
  | { id: string; kind: "top.chopTo"; freq: number }
  | { id: string; kind: "sop.sphere"; radius: number; segments: number }
  | { id: string; kind: "sop.box"; width: number; height: number; depth: number; segments: number }
  | { id: string; kind: "sop.torus"; radius: number; tube: number; segments: number }
  | { id: string; kind: "sop.grid"; size: number; divisions: number }
  | { id: string; kind: "sop.fileIn"; scale: number; fileName: string }
  | { id: string; kind: "sop.transform"; tx: number; ty: number; tz: number; rx: number; ry: number; rz: number; scale: number }
  | { id: string; kind: "sop.noise"; amplitude: number; freq: number; speed: number }
  | { id: string; kind: "sop.toPop"; seed: number; count: number; spread: number }
  | { id: string; kind: "mat.phong"; color: string; specular: string; shininess: number; wireframe: boolean; opacity: number }
  | { id: string; kind: "mat.pbr"; color: string; metalness: number; roughness: number; emissiveIntensity: number; wireframe: boolean }
  | { id: string; kind: "mat.constant"; color: string; opacity: number; wireframe: boolean }
  | { id: string; kind: "dat.text"; text: string }
  | { id: string; kind: "dat.table"; csv: string; row: number; col: number }
  | { id: string; kind: "dat.evaluate"; expr: string }
  | { id: string; kind: "comp.geo"; visible: boolean; autoSpin: number }
  | { id: string; kind: "comp.light"; color: string; intensity: number; x: number; y: number; z: number }
  | { id: string; kind: "comp.camera"; fov: number; autoRotate: boolean; speed: number }
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
export type PortType =
  | "number"
  | "points"
  | "hydra"
  | "skeleton"
  | "geometry"
  | "material"
  | "data";
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

export interface RenderedMaterialSpec {
  id: string;
  kind: "phong" | "pbr" | "constant";
  color: string;
  specular: string;
  shininess: number;
  metalness: number;
  roughness: number;
  emissiveIntensity: number;
  opacity: number;
  wireframe: boolean;
  textureNodeId: string | null;
  textureSlot: number | null;
}

export interface RenderedGeoComp {
  id: string;
  visible: boolean;
  autoSpin: number;
  scale: number;
  shape: SopShapeSpec;
  material: RenderedMaterialSpec | null;
}

export interface SceneDescriptor {
  geos: RenderedGeoComp[];
  light: { color: string; intensity: number; x: number; y: number; z: number } | null;
  camera: { fov: number; autoRotate: boolean; speed: number } | null;
  mediaNodes: Array<{
    id: string;
    kind: "top.movieFileIn" | "top.videoDeviceIn" | "top.text";
    slot: number;
    text?: string;
    fontSize?: number;
    color?: string;
  }>;
}

const lfoWaves: readonly LfoWave[] = ["sine", "triangle", "saw", "square"];
const mathOps: readonly MathOp[] = ["add", "mul", "clamp", "abs", "sin"];
const hydraBuffers: readonly HydraBuffer[] = ["o0", "o1", "o2", "o3"];
const skeletonZones: readonly SkeletonZone[] = ["all", "hands", "arms", "spine", "head", "legs"];
const skeletonEmitModes: readonly SkeletonEmitMode[] = ["attach", "aura", "trail"];
const topFits: readonly TopFitMode[] = ["contain", "cover", "stretch"];
const videoDevices: readonly VideoDeviceMode[] = ["camera", "screen"];
const rampTypes: readonly RampType[] = ["linear", "radial", "circular"];
const compositeOps: readonly CompositeOp[] = ["blend", "add", "diff", "mult"];
const audioBands: readonly AudioBand[] = ["bass", "mid", "high", "audio"];
const analyzeModes: readonly AnalyzeMode[] = ["beat", "bpmNorm", "pulse"];

const ports: Record<Node["kind"], Ports> = {
  "control.number": { inputs: {}, outputs: { value: "number" } },
  "signal.lfo": { inputs: {}, outputs: { value: "number" } },
  "signal.timer": { inputs: {}, outputs: { value: "number" } },
  "signal.smooth": { inputs: { in: "number" }, outputs: { value: "number" } },
  "signal.mapRange": { inputs: { in: "number" }, outputs: { value: "number" } },
  "signal.math": { inputs: { in: "number" }, outputs: { value: "number" } },
  "chop.noise": { inputs: {}, outputs: { value: "number" } },
  "chop.audioIn": { inputs: {}, outputs: { value: "number" } },
  "chop.speed": { inputs: { in: "number" }, outputs: { value: "number" } },
  "chop.analyze": { inputs: {}, outputs: { value: "number" } },
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
  "top.movieFileIn": { inputs: {}, outputs: { tex: "hydra" } },
  "top.videoDeviceIn": { inputs: {}, outputs: { tex: "hydra" } },
  "top.ramp": { inputs: { phase: { type: "number", optional: true } }, outputs: { tex: "hydra" } },
  "top.level": { inputs: { tex: "hydra", amount: { type: "number", optional: true } }, outputs: { tex: "hydra" } },
  "top.blur": { inputs: { tex: "hydra", amount: { type: "number", optional: true } }, outputs: { tex: "hydra" } },
  "top.transform": { inputs: { tex: "hydra", mod: { type: "number", optional: true } }, outputs: { tex: "hydra" } },
  "top.composite": {
    inputs: { tex: "hydra", texB: { type: "hydra", optional: true }, amount: { type: "number", optional: true } },
    outputs: { tex: "hydra" },
  },
  "top.displace": {
    inputs: { tex: "hydra", modTex: { type: "hydra", optional: true }, mod: { type: "number", optional: true } },
    outputs: { tex: "hydra" },
  },
  "top.text": { inputs: { data: { type: "data", optional: true }, mod: { type: "number", optional: true } }, outputs: { tex: "hydra" } },
  "top.chopTo": { inputs: { in: "number" }, outputs: { tex: "hydra" } },
  "sop.sphere": { inputs: { scale: { type: "number", optional: true } }, outputs: { geo: "geometry" } },
  "sop.box": { inputs: { scale: { type: "number", optional: true } }, outputs: { geo: "geometry" } },
  "sop.torus": { inputs: { scale: { type: "number", optional: true } }, outputs: { geo: "geometry" } },
  "sop.grid": { inputs: { scale: { type: "number", optional: true } }, outputs: { geo: "geometry" } },
  "sop.fileIn": { inputs: { scale: { type: "number", optional: true } }, outputs: { geo: "geometry" } },
  "sop.transform": { inputs: { geo: "geometry", mod: { type: "number", optional: true } }, outputs: { geo: "geometry" } },
  "sop.noise": { inputs: { geo: "geometry", ampMod: { type: "number", optional: true } }, outputs: { geo: "geometry" } },
  "sop.toPop": { inputs: { geo: "geometry", intensity: { type: "number", optional: true } }, outputs: { points: "points" } },
  "mat.phong": { inputs: { tex: { type: "hydra", optional: true } }, outputs: { mat: "material" } },
  "mat.pbr": { inputs: { tex: { type: "hydra", optional: true } }, outputs: { mat: "material" } },
  "mat.constant": { inputs: { tex: { type: "hydra", optional: true } }, outputs: { mat: "material" } },
  "dat.text": { inputs: {}, outputs: { data: "data" } },
  "dat.table": { inputs: {}, outputs: { data: "data", value: "number" } },
  "dat.evaluate": { inputs: { in: { type: "number", optional: true }, data: { type: "data", optional: true } }, outputs: { value: "number", data: "data" } },
  "comp.geo": {
    inputs: {
      geo: "geometry",
      mat: { type: "material", optional: true },
      scale: { type: "number", optional: true },
    },
    outputs: {},
  },
  "comp.light": { inputs: { intensityMod: { type: "number", optional: true } }, outputs: {} },
  "comp.camera": { inputs: { fovMod: { type: "number", optional: true } }, outputs: {} },
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
    case "chop.noise":
      return {
        id,
        kind: node.kind,
        seed: integer(node.seed, 0, 0xffffffff),
        rate: number(node.rate),
        amplitude: number(node.amplitude),
        offset: number(node.offset),
      };
    case "chop.audioIn":
      return {
        id,
        kind: node.kind,
        band: typeof node.band === "string" && audioBands.includes(node.band as AudioBand) ? (node.band as AudioBand) : "bass",
        gain: number(node.gain),
      };
    case "chop.speed":
      return { id, kind: node.kind, gain: number(node.gain) };
    case "chop.analyze":
      return {
        id,
        kind: node.kind,
        mode: typeof node.mode === "string" && analyzeModes.includes(node.mode as AnalyzeMode) ? (node.mode as AnalyzeMode) : "beat",
      };
    case "top.movieFileIn": {
      const slot = Math.min(3, Math.max(0, Math.round(number(node.sourceSlot ?? 0)))) as 0 | 1 | 2 | 3;
      return {
        id,
        kind: node.kind,
        sourceSlot: slot,
        fit: typeof node.fit === "string" && topFits.includes(node.fit as TopFitMode) ? (node.fit as TopFitMode) : "cover",
        speed: number(node.speed ?? 1),
        loop: typeof node.loop === "boolean" ? node.loop : true,
      };
    }
    case "top.videoDeviceIn": {
      const slot = Math.min(3, Math.max(0, Math.round(number(node.sourceSlot ?? 0)))) as 0 | 1 | 2 | 3;
      return {
        id,
        kind: node.kind,
        deviceMode: typeof node.deviceMode === "string" && videoDevices.includes(node.deviceMode as VideoDeviceMode) ? (node.deviceMode as VideoDeviceMode) : "camera",
        sourceSlot: slot,
        mirror: typeof node.mirror === "boolean" ? node.mirror : true,
      };
    }
    case "top.ramp":
      return {
        id,
        kind: node.kind,
        rampType: typeof node.rampType === "string" && rampTypes.includes(node.rampType as RampType) ? (node.rampType as RampType) : "linear",
        speed: number(node.speed),
        r1: number(node.r1),
        g1: number(node.g1),
        b1: number(node.b1),
        r2: number(node.r2),
        g2: number(node.g2),
        b2: number(node.b2),
      };
    case "top.level":
      return {
        id,
        kind: node.kind,
        brightness: number(node.brightness),
        contrast: number(node.contrast),
        saturate: number(node.saturate),
        invert: number(node.invert),
      };
    case "top.blur":
      return { id, kind: node.kind, size: number(node.size) };
    case "top.transform":
      return {
        id,
        kind: node.kind,
        tx: number(node.tx),
        ty: number(node.ty),
        scale: number(node.scale),
        rotate: number(node.rotate),
        repeat: number(node.repeat),
      };
    case "top.composite":
      return {
        id,
        kind: node.kind,
        op: typeof node.op === "string" && compositeOps.includes(node.op as CompositeOp) ? (node.op as CompositeOp) : "blend",
        amount: number(node.amount),
      };
    case "top.displace":
      return { id, kind: node.kind, weight: number(node.weight) };
    case "top.text": {
      const slot = Math.min(3, Math.max(0, Math.round(number(node.sourceSlot ?? 2)))) as 0 | 1 | 2 | 3;
      return {
        id,
        kind: node.kind,
        text: typeof node.text === "string" ? node.text : "ZENCE R2",
        fontSize: number(node.fontSize ?? 72),
        color: typeof node.color === "string" ? node.color : "#cf8acc",
        sourceSlot: slot,
      };
    }
    case "top.chopTo":
      return { id, kind: node.kind, freq: number(node.freq) };
    case "sop.sphere":
      return { id, kind: node.kind, radius: number(node.radius), segments: integer(node.segments, 4, 64) };
    case "sop.box":
      return {
        id,
        kind: node.kind,
        width: number(node.width),
        height: number(node.height),
        depth: number(node.depth),
        segments: integer(node.segments, 1, 16),
      };
    case "sop.torus":
      return { id, kind: node.kind, radius: number(node.radius), tube: number(node.tube), segments: integer(node.segments, 6, 64) };
    case "sop.grid":
      return { id, kind: node.kind, size: number(node.size), divisions: integer(node.divisions, 2, 64) };
    case "sop.fileIn":
      return {
        id,
        kind: node.kind,
        scale: number(node.scale ?? 1),
        fileName: typeof node.fileName === "string" ? node.fileName : "",
      };
    case "sop.transform":
      return {
        id,
        kind: node.kind,
        tx: number(node.tx),
        ty: number(node.ty),
        tz: number(node.tz),
        rx: number(node.rx),
        ry: number(node.ry),
        rz: number(node.rz),
        scale: number(node.scale),
      };
    case "sop.noise":
      return { id, kind: node.kind, amplitude: number(node.amplitude), freq: number(node.freq), speed: number(node.speed) };
    case "sop.toPop":
      return {
        id,
        kind: node.kind,
        seed: integer(node.seed, 0, 0xffffffff),
        count: integer(node.count, 1, 10_000),
        spread: number(node.spread),
      };
    case "mat.phong":
      return {
        id,
        kind: node.kind,
        color: typeof node.color === "string" ? node.color : "#cf8acc",
        specular: typeof node.specular === "string" ? node.specular : "#ffffff",
        shininess: number(node.shininess ?? 60),
        wireframe: typeof node.wireframe === "boolean" ? node.wireframe : false,
        opacity: number(node.opacity ?? 1),
      };
    case "mat.pbr":
      return {
        id,
        kind: node.kind,
        color: typeof node.color === "string" ? node.color : "#ae68ad",
        metalness: number(node.metalness ?? 0.35),
        roughness: number(node.roughness ?? 0.4),
        emissiveIntensity: number(node.emissiveIntensity ?? 0.25),
        wireframe: typeof node.wireframe === "boolean" ? node.wireframe : false,
      };
    case "mat.constant":
      return {
        id,
        kind: node.kind,
        color: typeof node.color === "string" ? node.color : "#f5f3f4",
        opacity: number(node.opacity ?? 1),
        wireframe: typeof node.wireframe === "boolean" ? node.wireframe : false,
      };
    case "dat.text":
      return { id, kind: node.kind, text: typeof node.text === "string" ? node.text : "ZENCE R2\nLIVE" };
    case "dat.table":
      return {
        id,
        kind: node.kind,
        csv: typeof node.csv === "string" ? node.csv : "freq,amp\n8,1.5\n12,2.4",
        row: integer(node.row ?? 1, 0, 999),
        col: integer(node.col ?? 1, 0, 99),
      };
    case "dat.evaluate":
      return { id, kind: node.kind, expr: typeof node.expr === "string" ? node.expr : "abs(sin(x + t))" };
    case "comp.geo":
      return {
        id,
        kind: node.kind,
        visible: typeof node.visible === "boolean" ? node.visible : true,
        autoSpin: number(node.autoSpin ?? 0.4),
      };
    case "comp.light":
      return {
        id,
        kind: node.kind,
        color: typeof node.color === "string" ? node.color : "#ffffff",
        intensity: number(node.intensity ?? 3),
        x: number(node.x ?? 5),
        y: number(node.y ?? 6),
        z: number(node.z ?? 4),
      };
    case "comp.camera":
      return {
        id,
        kind: node.kind,
        fov: number(node.fov ?? 37),
        autoRotate: typeof node.autoRotate === "boolean" ? node.autoRotate : false,
        speed: number(node.speed ?? 1.6),
      };
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
    scene: data.scene === "" ? "" : name(data.scene),
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
  if (project.scene !== "" && nodes.get(project.scene)?.node.kind !== "scene.points") {
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
      case "top.movieFileIn":
        return `src(s${node.sourceSlot})`;
      case "top.videoDeviceIn":
        return `src(s${node.sourceSlot})`;
      case "top.text":
        return `src(s${node.sourceSlot})`;
      case "top.ramp": {
        const ph = sources?.get("phase");
        const spd = ph ? `() => ${node.speed} + control(${JSON.stringify(ph)}) * 0.4` : String(node.speed);
        const base =
          node.rampType === "radial"
            ? `shape(64, 0.45, 0.45)`
            : node.rampType === "circular"
              ? `osc(4, ${spd}, 1.2)`
              : `gradient(${spd})`;
        return `${base}\n  .color(${node.r1}, ${node.g1}, ${node.b1})`;
      }
      case "top.level": {
        const tex = sources?.get("tex");
        const base = tex ? buildChain(tex, new Set(visited)) : null;
        if (!base) return null;
        const mod = sources?.get("amount");
        const br = mod ? `() => ${node.brightness} + control(${JSON.stringify(mod)}) * 0.2` : String(node.brightness);
        let outChain = `${base}\n  .brightness(${br})\n  .contrast(${node.contrast})\n  .saturate(${node.saturate})`;
        if (node.invert > 0.01) outChain += `\n  .invert(${node.invert})`;
        return outChain;
      }
      case "top.blur": {
        const tex = sources?.get("tex");
        const base = tex ? buildChain(tex, new Set(visited)) : null;
        if (!base) return null;
        const px = Math.max(8, Math.round(256 / Math.max(1, node.size * 12)));
        return `${base}\n  .pixelate(${px}, ${px})`;
      }
      case "top.transform": {
        const tex = sources?.get("tex");
        const base = tex ? buildChain(tex, new Set(visited)) : null;
        if (!base) return null;
        const mod = sources?.get("mod");
        const sc = mod ? `() => ${node.scale} + control(${JSON.stringify(mod)}) * 0.25` : String(node.scale);
        let outChain = `${base}\n  .scale(${sc})\n  .rotate(${node.rotate}, 0)`;
        if (Math.abs(node.tx) > 0.001) outChain += `\n  .scrollX(${node.tx}, 0)`;
        if (Math.abs(node.ty) > 0.001) outChain += `\n  .scrollY(${node.ty}, 0)`;
        if (node.repeat > 1.05) {
          const r = Math.max(1, Math.round(node.repeat));
          outChain += `\n  .repeat(${r}, ${r})`;
        }
        return outChain;
      }
      case "top.composite": {
        const texA = sources?.get("tex");
        const base = texA ? buildChain(texA, new Set(visited)) : null;
        if (!base) return null;
        const texB = sources?.get("texB");
        const layerB = (texB ? buildChain(texB, new Set(visited)) : null) ?? "noise(3, 0.1)";
        const mod = sources?.get("amount");
        const amt = mod ? `() => control(${JSON.stringify(mod)}) * ${node.amount}` : String(node.amount);
        return `${base}\n  .${node.op}(${layerB.replace(/\n\s+/g, "")}, ${amt})`;
      }
      case "top.displace": {
        const tex = sources?.get("tex");
        const base = tex ? buildChain(tex, new Set(visited)) : null;
        if (!base) return null;
        const modTexId = sources?.get("modTex");
        const modTex = (modTexId ? buildChain(modTexId, new Set(visited)) : null) ?? "noise(3, 0.15)";
        const mod = sources?.get("mod");
        const w = mod ? `() => control(${JSON.stringify(mod)}) * ${node.weight}` : String(node.weight);
        return `${base}\n  .modulate(${modTex.replace(/\n\s+/g, "")}, ${w})`;
      }
      case "top.chopTo": {
        const inp = sources?.get("in");
        const fExpr = inp ? `() => ${node.freq} + control(${JSON.stringify(inp)}) * 8` : String(node.freq);
        return `osc(${fExpr}, 0.12, 0.6)`;
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
  private readonly planById = new Map<string, NodePlan>();
  private readonly sceneId: string;
  private readonly controls = new Map<string, { min: number; max: number; value: number }>();
  private readonly numbers = new Map<string, number>();
  private readonly smoothState = new Map<string, number>();
  private readonly speedState = new Map<string, number>();
  private readonly dataTexts = new Map<string, string>();
  private readonly particles = new Map<string, Particles>();
  private readonly skeletonParticles = new Map<string, SkeletonParticles>();
  private readonly sopParticles = new Map<
    string,
    { positions: Point3[]; u: number[]; v: number[]; w: number[] }
  >();
  private readonly pointOutputs = new Map<string, Point3[]>();
  private readonly scenes = new Map<string, Point3[]>();
  private externalMocap: ExternalMocapInput = {};
  private externalChannels: Record<string, number> = {};
  private stepCount = 0;

  constructor(data: unknown) {
    const project = readProject(data);
    this.sceneId = project.scene;
    this.plan = compile(project);
    for (const item of this.plan) {
      this.planById.set(item.node.id, item);
      const { node, sources } = item;
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
      if (node.kind === "sop.toPop") {
        const seeded = seedSkeletonParticles(node.seed, node.count);
        const entry = {
          positions: seeded.positions,
          u: seeded.segRatio,
          v: seeded.offsets.map((o) => (o.x + 1) * 0.5),
          w: seeded.offsets.map((o) => (o.y + 1) * 0.5),
        };
        this.sopParticles.set(node.id, entry);
        this.pointOutputs.set(node.id, entry.positions);
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
    this.updateSopParticles(0);
  }

  setExternalMocap(input: ExternalMocapInput): void {
    this.externalMocap = input;
  }

  setExternalChannels(channels: Record<string, number>): void {
    this.externalChannels = channels;
  }

  private resolveSopChain(sopId: string): SopShapeSpec | null {
    const spec: SopShapeSpec = {
      primitive: "sphere",
      radius: 1.2,
      tube: 0.38,
      width: 2,
      height: 2,
      depth: 2,
      size: 4,
      segments: 24,
      scale: 1,
      tx: 0,
      ty: 0,
      tz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      noiseAmp: 0,
      noiseFreq: 1.6,
      noiseSpeed: 1.2,
    };

    let curId: string | undefined = sopId;
    const visited = new Set<string>();
    while (curId && !visited.has(curId)) {
      visited.add(curId);
      const item = this.planById.get(curId);
      if (!item) return null;
      const { node, sources } = item;
      if (node.kind === "sop.transform") {
        const modId = sources.get("mod");
        const modVal = modId ? (this.numbers.get(modId) ?? 1) : 1;
        spec.tx += node.tx;
        spec.ty += node.ty;
        spec.tz += node.tz;
        spec.rx += node.rx;
        spec.ry += node.ry * modVal;
        spec.rz += node.rz;
        spec.scale *= node.scale;
        curId = sources.get("geo");
      } else if (node.kind === "sop.noise") {
        const ampId = sources.get("ampMod");
        const ampMod = ampId ? (this.numbers.get(ampId) ?? 1) : 1;
        spec.noiseAmp += node.amplitude * ampMod;
        spec.noiseFreq = node.freq;
        spec.noiseSpeed = node.speed;
        curId = sources.get("geo");
      } else if (node.kind === "sop.sphere") {
        const sId = sources.get("scale");
        const sVal = sId ? Math.max(0.1, this.numbers.get(sId) ?? 1) : 1;
        spec.primitive = "sphere";
        spec.radius = node.radius * sVal;
        spec.segments = node.segments;
        return spec;
      } else if (node.kind === "sop.box") {
        const sId = sources.get("scale");
        const sVal = sId ? Math.max(0.1, this.numbers.get(sId) ?? 1) : 1;
        spec.primitive = "box";
        spec.width = node.width * sVal;
        spec.height = node.height * sVal;
        spec.depth = node.depth * sVal;
        spec.segments = node.segments;
        return spec;
      } else if (node.kind === "sop.torus") {
        const sId = sources.get("scale");
        const sVal = sId ? Math.max(0.1, this.numbers.get(sId) ?? 1) : 1;
        spec.primitive = "torus";
        spec.radius = node.radius * sVal;
        spec.tube = node.tube * sVal;
        spec.segments = node.segments;
        return spec;
      } else if (node.kind === "sop.grid") {
        const sId = sources.get("scale");
        const sVal = sId ? Math.max(0.1, this.numbers.get(sId) ?? 1) : 1;
        spec.primitive = "grid";
        spec.size = node.size * sVal;
        spec.segments = node.divisions;
        return spec;
      } else if (node.kind === "sop.fileIn") {
        const sId = sources.get("scale");
        const sVal = sId ? Math.max(0.1, this.numbers.get(sId) ?? 1) : 1;
        spec.primitive = "fileIn";
        spec.scale *= node.scale * sVal;
        return spec;
      } else {
        return null;
      }
    }
    return null;
  }

  private findUpstreamMediaNode(topId: string | undefined): { id: string; slot: number } | null {
    let curId = topId;
    const visited = new Set<string>();
    while (curId && !visited.has(curId)) {
      visited.add(curId);
      const item = this.planById.get(curId);
      if (!item) return null;
      const { node, sources } = item;
      if (
        node.kind === "top.movieFileIn" ||
        node.kind === "top.videoDeviceIn" ||
        node.kind === "top.text"
      ) {
        return { id: node.id, slot: node.sourceSlot };
      }
      curId = sources.get("tex");
    }
    return null;
  }

  getSceneDescriptor(): SceneDescriptor {
    const geos: RenderedGeoComp[] = [];
    let light: SceneDescriptor["light"] = null;
    let camera: SceneDescriptor["camera"] = null;
    const mediaNodes: SceneDescriptor["mediaNodes"] = [];

    for (const { node, sources } of this.plan) {
      if (node.kind === "top.movieFileIn" || node.kind === "top.videoDeviceIn") {
        mediaNodes.push({ id: node.id, kind: node.kind, slot: node.sourceSlot });
      } else if (node.kind === "top.text") {
        const dataSrc = sources.get("data");
        const resolvedText = dataSrc ? (this.dataTexts.get(dataSrc) ?? node.text) : node.text;
        mediaNodes.push({
          id: node.id,
          kind: "top.text",
          slot: node.sourceSlot,
          text: resolvedText,
          fontSize: node.fontSize,
          color: node.color,
        });
      } else if (node.kind === "comp.light") {
        const modId = sources.get("intensityMod");
        const modVal = modId ? (this.numbers.get(modId) ?? 1) : 1;
        light = {
          color: node.color,
          intensity: Math.max(0, node.intensity * modVal),
          x: node.x,
          y: node.y,
          z: node.z,
        };
      } else if (node.kind === "comp.camera") {
        const fovId = sources.get("fovMod");
        const fovDelta = fovId ? (this.numbers.get(fovId) ?? 0) * 6 : 0;
        camera = {
          fov: Math.max(15, Math.min(110, node.fov + fovDelta)),
          autoRotate: node.autoRotate,
          speed: node.speed,
        };
      } else if (node.kind === "comp.geo") {
        const geoSrc = sources.get("geo");
        const shape = geoSrc ? this.resolveSopChain(geoSrc) : null;
        if (!shape) continue;
        const scaleId = sources.get("scale");
        const scaleVal = scaleId ? Math.max(0.05, this.numbers.get(scaleId) ?? 1) : 1;
        const matId = sources.get("mat");
        let material: RenderedMaterialSpec | null = null;
        if (matId) {
          const matItem = this.planById.get(matId);
          const mNode = matItem?.node;
          if (mNode?.kind === "mat.phong" || mNode?.kind === "mat.pbr" || mNode?.kind === "mat.constant") {
            const mediaRef = this.findUpstreamMediaNode(matItem?.sources.get("tex"));
            material = {
              id: mNode.id,
              kind: mNode.kind === "mat.phong" ? "phong" : mNode.kind === "mat.pbr" ? "pbr" : "constant",
              color: mNode.color,
              specular: mNode.kind === "mat.phong" ? mNode.specular : "#ffffff",
              shininess: mNode.kind === "mat.phong" ? mNode.shininess : 30,
              metalness: mNode.kind === "mat.pbr" ? mNode.metalness : 0.2,
              roughness: mNode.kind === "mat.pbr" ? mNode.roughness : 0.5,
              emissiveIntensity: mNode.kind === "mat.pbr" ? mNode.emissiveIntensity : 0,
              opacity: mNode.kind === "mat.pbr" ? 1 : mNode.opacity,
              wireframe: mNode.wireframe,
              textureNodeId: mediaRef?.id ?? null,
              textureSlot: mediaRef?.slot ?? null,
            };
          }
        }
        geos.push({ id: node.id, visible: node.visible, autoSpin: node.autoSpin, scale: scaleVal, shape, material });
      }
    }

    return { geos, light, camera, mediaNodes };
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
      } else if (node.kind === "chop.noise") {
        this.numbers.set(node.id, node.offset + sampleNoiseChop(node.seed, node.rate, time) * node.amplitude);
      } else if (node.kind === "chop.audioIn") {
        this.numbers.set(node.id, (this.externalChannels[node.band] ?? 0) * node.gain);
      } else if (node.kind === "chop.speed") {
        const inp = this.numbers.get(sources.get("in")!) ?? 0;
        const prev = initial ? 0 : (this.speedState.get(node.id) ?? 0);
        const next = initial ? 0 : prev + inp * node.gain * fixedStepSeconds;
        this.speedState.set(node.id, next);
        this.numbers.set(node.id, next);
      } else if (node.kind === "chop.analyze") {
        const beat = this.externalChannels.beat ?? ((time * 2) % 1);
        if (node.mode === "pulse") this.numbers.set(node.id, beat < 0.18 ? 1 : 0);
        else if (node.mode === "bpmNorm") this.numbers.set(node.id, (this.externalChannels.bpm ?? 120) / 120);
        else this.numbers.set(node.id, beat);
      } else if (node.kind === "dat.text") {
        this.dataTexts.set(node.id, node.text);
      } else if (node.kind === "dat.table") {
        const cell = readTableCell(node.csv, node.row, node.col);
        this.dataTexts.set(node.id, cell.text);
        this.numbers.set(node.id, cell.num);
      } else if (node.kind === "dat.evaluate") {
        const inId = sources.get("in");
        const x = inId ? (this.numbers.get(inId) ?? 0) : 0;
        const val = evaluateSafeExpr(node.expr, x, time);
        this.numbers.set(node.id, val);
        this.dataTexts.set(node.id, val.toFixed(2));
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

  private updateSopParticles(time: number): void {
    for (const { node, sources } of this.plan) {
      if (node.kind !== "sop.toPop") continue;
      const entry = this.sopParticles.get(node.id);
      const geoId = sources.get("geo");
      const shape = geoId ? this.resolveSopChain(geoId) : null;
      if (!entry || !shape) continue;
      const intId = sources.get("intensity");
      const intVal = intId ? (this.numbers.get(intId) ?? 1) : 1;
      const { positions, u, v, w } = entry;
      for (let i = 0; i < positions.length; i += 1) {
        const pt = sampleSopSurfacePoint(shape, u[i], v[i], w[i], time);
        const jx = (w[i] - 0.5) * node.spread * intVal;
        const jy = (u[i] - 0.5) * node.spread * intVal;
        positions[i].x = pt.x + jx;
        positions[i].y = pt.y + jy;
        positions[i].z = pt.z;
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
    this.updateSopParticles(time);
    this.stepCount += 1;
  }

  get pointCount(): number {
    return (this.scenes.get(this.sceneId) ?? []).length;
  }

  writePositions(buffer: Float32Array): void {
    const points = this.scenes.get(this.sceneId) ?? [];
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
    return (this.scenes.get(this.sceneId) ?? []).map((point) => ({ ...point }));
  }
}
