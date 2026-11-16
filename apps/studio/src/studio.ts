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

export type TdFamily = "TOP" | "CHOP" | "SOP" | "POP" | "MAT" | "DAT" | "COMP";

export type NodeMetaSpec = {
  label: string;
  name: string;
  namespace: string;
  category: TdFamily;
  description: string;
  inputs: Array<{ key: string; label: string; type: PortType; optional?: boolean }>;
  outputs: Array<{ key: string; label: string; type: PortType }>;
};

export const nodeTypes: Record<Node["kind"], NodeMetaSpec> = {
  "control.number": {
    label: "Constant CHOP",
    name: "Constant",
    namespace: "Ops.CHOP.Constant",
    category: "CHOP",
    description: "Control numérico manual y remoto (0..4)",
    inputs: [],
    outputs: [{ key: "value", label: "Canal", type: "number" }],
  },
  "signal.lfo": {
    label: "LFO CHOP",
    name: "LFO",
    namespace: "Ops.CHOP.LFO",
    category: "CHOP",
    description: "Oscilador determinista (Sine / Tri / Saw / Square)",
    inputs: [],
    outputs: [{ key: "value", label: "Canal", type: "number" }],
  },
  "chop.noise": {
    label: "Noise CHOP",
    name: "NoiseCHOP",
    namespace: "Ops.CHOP.Noise",
    category: "CHOP",
    description: "Ruido orgánico pseudoaleatorio continuo para canales",
    inputs: [],
    outputs: [{ key: "value", label: "Canal", type: "number" }],
  },
  "signal.timer": {
    label: "Timer CHOP",
    name: "Timer",
    namespace: "Ops.CHOP.Timer",
    category: "CHOP",
    description: "Reloj determinista continuo multiplicado por velocidad",
    inputs: [],
    outputs: [{ key: "value", label: "Tiempo", type: "number" }],
  },
  "chop.audioIn": {
    label: "Audio Device In CHOP",
    name: "AudioIn",
    namespace: "Ops.CHOP.AudioDeviceIn",
    category: "CHOP",
    description: "Entrada de micrófono FFT por bandas (Bass / Mid / High / Audio)",
    inputs: [],
    outputs: [{ key: "value", label: "Nivel", type: "number" }],
  },
  "chop.analyze": {
    label: "Beat / Analyze CHOP",
    name: "BeatCHOP",
    namespace: "Ops.CHOP.Analyze",
    category: "CHOP",
    description: "Pulso y fase sincronizados al BPM actual",
    inputs: [],
    outputs: [{ key: "value", label: "Pulso", type: "number" }],
  },
  "signal.smooth": {
    label: "Lag / Filter CHOP",
    name: "Lag",
    namespace: "Ops.CHOP.Lag",
    category: "CHOP",
    description: "Suavizado / inercia exponencial sobre un canal",
    inputs: [{ key: "in", label: "Entrada", type: "number" }],
    outputs: [{ key: "value", label: "Suave", type: "number" }],
  },
  "signal.mapRange": {
    label: "MapRange CHOP",
    name: "MapRange",
    namespace: "Ops.CHOP.MapRange",
    category: "CHOP",
    description: "Remapea rango [inMin..inMax] a [outMin..outMax]",
    inputs: [{ key: "in", label: "Valor", type: "number" }],
    outputs: [{ key: "value", label: "Salida", type: "number" }],
  },
  "signal.math": {
    label: "Math CHOP",
    name: "Math",
    namespace: "Ops.CHOP.Math",
    category: "CHOP",
    description: "Multiplica, suma, limita, abs o sin sobre una señal",
    inputs: [{ key: "in", label: "Entrada", type: "number" }],
    outputs: [{ key: "value", label: "Resultado", type: "number" }],
  },
  "chop.speed": {
    label: "Speed CHOP",
    name: "Speed",
    namespace: "Ops.CHOP.Speed",
    category: "CHOP",
    description: "Integra la velocidad entrante acumulando distancia/fase",
    inputs: [{ key: "in", label: "Entrada", type: "number" }],
    outputs: [{ key: "value", label: "Acumulado", type: "number" }],
  },
  "mocap.body": {
    label: "Pose Track CHOP",
    name: "BodyMocap",
    namespace: "Ops.CHOP.PoseTrack",
    category: "CHOP",
    description: "Seguimiento corporal (33 puntos) desde cámara, video o imagen",
    inputs: [],
    outputs: [
      { key: "skeleton", label: "Esqueleto", type: "skeleton" },
      { key: "value", label: "Actividad", type: "number" },
    ],
  },
  "mocap.hands": {
    label: "Hand Track CHOP",
    name: "HandsMocap",
    namespace: "Ops.CHOP.HandTrack",
    category: "CHOP",
    description: "Seguimiento dual de manos (21 pts/mano) y gestos de pinza",
    inputs: [{ key: "skeleton", label: "Esqueleto", type: "skeleton", optional: true }],
    outputs: [
      { key: "skeleton", label: "Esqueleto", type: "skeleton" },
      { key: "value", label: "Apertura", type: "number" },
    ],
  },
  "top.movieFileIn": {
    label: "Movie File In TOP",
    name: "MovieFileIn",
    namespace: "Ops.TOP.MovieFileIn",
    category: "TOP",
    description: "Carga imagen o video directo en el nodo hacia Hydra o materiales 3D",
    inputs: [],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "top.videoDeviceIn": {
    label: "Video Device In TOP",
    name: "VideoIn",
    namespace: "Ops.TOP.VideoDeviceIn",
    category: "TOP",
    description: "Entrada en vivo de cámara web o captura de pantalla como textura",
    inputs: [],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "top.ramp": {
    label: "Ramp TOP",
    name: "Ramp",
    namespace: "Ops.TOP.Ramp",
    category: "TOP",
    description: "Generador de rampa lineal, radial o circular",
    inputs: [{ key: "phase", label: "Fase", type: "number", optional: true }],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "top.text": {
    label: "Text TOP",
    name: "TextTOP",
    namespace: "Ops.TOP.Text",
    category: "TOP",
    description: "Renderiza tipografía viva (editable o desde Text DAT) como textura",
    inputs: [
      { key: "data", label: "Datos", type: "data", optional: true },
      { key: "mod", label: "Mod", type: "number", optional: true },
    ],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "top.chopTo": {
    label: "CHOP to TOP",
    name: "CHOPtoTOP",
    namespace: "Ops.TOP.ChopTo",
    category: "TOP",
    description: "Convierte cualquier señal CHOP en ondas visuales TOP",
    inputs: [{ key: "in", label: "Canal", type: "number" }],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "top.level": {
    label: "Level TOP",
    name: "Level",
    namespace: "Ops.TOP.Level",
    category: "TOP",
    description: "Ajusta brillo, contraste, saturación e inversión",
    inputs: [
      { key: "tex", label: "Textura", type: "hydra" },
      { key: "amount", label: "Mod", type: "number", optional: true },
    ],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "top.blur": {
    label: "Blur / Pixelate TOP",
    name: "Blur",
    namespace: "Ops.TOP.Blur",
    category: "TOP",
    description: "Suaviza o pixela la textura de entrada",
    inputs: [
      { key: "tex", label: "Textura", type: "hydra" },
      { key: "amount", label: "Fuerza", type: "number", optional: true },
    ],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "top.transform": {
    label: "Transform TOP",
    name: "TransformTOP",
    namespace: "Ops.TOP.Transform",
    category: "TOP",
    description: "Traslada, rota, escala o repite la textura 2D",
    inputs: [
      { key: "tex", label: "Textura", type: "hydra" },
      { key: "mod", label: "Mod", type: "number", optional: true },
    ],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "top.composite": {
    label: "Composite TOP",
    name: "Composite",
    namespace: "Ops.TOP.Composite",
    category: "TOP",
    description: "Combina dos texturas (blend, add, diff, mult)",
    inputs: [
      { key: "tex", label: "Base A", type: "hydra" },
      { key: "texB", label: "Capa B", type: "hydra", optional: true },
      { key: "amount", label: "Mezcla", type: "number", optional: true },
    ],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "top.displace": {
    label: "Displace TOP",
    name: "Displace",
    namespace: "Ops.TOP.Displace",
    category: "TOP",
    description: "Deforma una textura usando un mapa modTex",
    inputs: [
      { key: "tex", label: "Textura", type: "hydra" },
      { key: "modTex", label: "Mapa", type: "hydra", optional: true },
      { key: "mod", label: "Peso", type: "number", optional: true },
    ],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.osc": {
    label: "Osc TOP",
    name: "Osc",
    namespace: "Ops.TOP.Osc",
    category: "TOP",
    description: "Generador de ondas osc(freq, sync, offset)",
    inputs: [{ key: "mod", label: "Mod Freq", type: "number", optional: true }],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.noise": {
    label: "Noise TOP",
    name: "NoiseTOP",
    namespace: "Ops.TOP.Noise",
    category: "TOP",
    description: "Ruido Perlin generativo noise(scale, offset)",
    inputs: [],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.shape": {
    label: "Shape TOP",
    name: "Shape",
    namespace: "Ops.TOP.Shape",
    category: "TOP",
    description: "Polígono geométrico shape(sides, radius, smoothing)",
    inputs: [{ key: "mod", label: "Mod Radio", type: "number", optional: true }],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.kaleid": {
    label: "Kaleid TOP",
    name: "Kaleid",
    namespace: "Ops.TOP.Kaleid",
    category: "TOP",
    description: "Simetría caleidoscópica .kaleid(sides)",
    inputs: [{ key: "tex", label: "Textura", type: "hydra" }],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.rotate": {
    label: "Rotate TOP",
    name: "Rotate",
    namespace: "Ops.TOP.Rotate",
    category: "TOP",
    description: "Rotación continua .rotate(angle, speed)",
    inputs: [{ key: "tex", label: "Textura", type: "hydra" }],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.modulate": {
    label: "Modulate TOP",
    name: "Modulate",
    namespace: "Ops.TOP.Modulate",
    category: "TOP",
    description: "Distorsión espacial .modulate(modTex, amount)",
    inputs: [
      { key: "tex", label: "Textura", type: "hydra" },
      { key: "modTex", label: "Mod Tex", type: "hydra", optional: true },
      { key: "mod", label: "Mod Amt", type: "number", optional: true },
    ],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.color": {
    label: "Color TOP",
    name: "Color",
    namespace: "Ops.TOP.Color",
    category: "TOP",
    description: "Balance RGB .color(r, g, b)",
    inputs: [{ key: "tex", label: "Textura", type: "hydra" }],
    outputs: [{ key: "tex", label: "Textura", type: "hydra" }],
  },
  "hydra.out": {
    label: "Out TOP",
    name: "OutTOP",
    namespace: "Ops.TOP.Out",
    category: "TOP",
    description: "Compila la cadena TOP hacia el buffer de salida Hydra (o0..o3)",
    inputs: [{ key: "tex", label: "Textura", type: "hydra" }],
    outputs: [],
  },
  "sop.sphere": {
    label: "Sphere SOP",
    name: "Sphere",
    namespace: "Ops.SOP.Sphere",
    category: "SOP",
    description: "Geometría procedural esférica 3D",
    inputs: [{ key: "scale", label: "Radio", type: "number", optional: true }],
    outputs: [{ key: "geo", label: "Geometría", type: "geometry" }],
  },
  "sop.box": {
    label: "Box SOP",
    name: "Box",
    namespace: "Ops.SOP.Box",
    category: "SOP",
    description: "Primitiva 3D de caja subdividida",
    inputs: [{ key: "scale", label: "Escala", type: "number", optional: true }],
    outputs: [{ key: "geo", label: "Geometría", type: "geometry" }],
  },
  "sop.torus": {
    label: "Torus SOP",
    name: "Torus",
    namespace: "Ops.SOP.Torus",
    category: "SOP",
    description: "Toroide 3D paramétrico",
    inputs: [{ key: "scale", label: "Escala", type: "number", optional: true }],
    outputs: [{ key: "geo", label: "Geometría", type: "geometry" }],
  },
  "sop.grid": {
    label: "Grid SOP",
    name: "Grid",
    namespace: "Ops.SOP.Grid",
    category: "SOP",
    description: "Malla plana 3D deformable con ruido",
    inputs: [{ key: "scale", label: "Escala", type: "number", optional: true }],
    outputs: [{ key: "geo", label: "Geometría", type: "geometry" }],
  },
  "sop.fileIn": {
    label: "File In SOP (FBX/GLB)",
    name: "FileInSOP",
    namespace: "Ops.SOP.FileIn",
    category: "SOP",
    description: "Importa modelos 3D (.fbx con conversión a .glb, .glb, .obj)",
    inputs: [{ key: "scale", label: "Escala", type: "number", optional: true }],
    outputs: [{ key: "geo", label: "Geometría", type: "geometry" }],
  },
  "sop.transform": {
    label: "Transform SOP",
    name: "TransformSOP",
    namespace: "Ops.SOP.Transform",
    category: "SOP",
    description: "Posición, rotación y escala sobre geometría SOP",
    inputs: [
      { key: "geo", label: "Geometría", type: "geometry" },
      { key: "mod", label: "Rot Y Mod", type: "number", optional: true },
    ],
    outputs: [{ key: "geo", label: "Geometría", type: "geometry" }],
  },
  "sop.noise": {
    label: "Noise SOP",
    name: "NoiseSOP",
    namespace: "Ops.SOP.Noise",
    category: "SOP",
    description: "Desplazamiento orgánico de vértices sobre geometría 3D",
    inputs: [
      { key: "geo", label: "Geometría", type: "geometry" },
      { key: "ampMod", label: "Amplitud", type: "number", optional: true },
    ],
    outputs: [{ key: "geo", label: "Geometría", type: "geometry" }],
  },
  "sop.toPop": {
    label: "SOP to POP",
    name: "SOPtoPOP",
    namespace: "Ops.POP.FromSOP",
    category: "POP",
    description: "Convierte cualquier geometría 3D SOP en nube de partículas POP",
    inputs: [
      { key: "geo", label: "Geometría", type: "geometry" },
      { key: "intensity", label: "Dispersión", type: "number", optional: true },
    ],
    outputs: [{ key: "points", label: "Puntos", type: "points" }],
  },
  "simulation.particles": {
    label: "Particle POP",
    name: "Particles",
    namespace: "Ops.POP.Particles",
    category: "POP",
    description: "Emisor determinista de partículas 3D controlado por señal",
    inputs: [{ key: "intensity", label: "Intensidad", type: "number" }],
    outputs: [{ key: "points", label: "Puntos", type: "points" }],
  },
  "particles.skeleton": {
    label: "Skeleton POP",
    name: "SkeletonPOP",
    namespace: "Ops.POP.Skeleton",
    category: "POP",
    description: "Emite y enlaza partículas directamente a huesos y manos",
    inputs: [
      { key: "skeleton", label: "Esqueleto", type: "skeleton", optional: true },
      { key: "intensity", label: "Intensidad", type: "number", optional: true },
    ],
    outputs: [{ key: "points", label: "Puntos", type: "points" }],
  },
  "particles.merge": {
    label: "Merge POP",
    name: "MergePOP",
    namespace: "Ops.POP.Merge",
    category: "POP",
    description: "Combina dos nubes de puntos POP en una salida",
    inputs: [
      { key: "a", label: "Puntos A", type: "points" },
      { key: "b", label: "Puntos B", type: "points", optional: true },
    ],
    outputs: [{ key: "points", label: "Puntos", type: "points" }],
  },
  "scene.points": {
    label: "Points Render POP",
    name: "Scene3D",
    namespace: "Ops.POP.Out",
    category: "POP",
    description: "Salida activa de nube de puntos hacia el Visor 3D",
    inputs: [{ key: "points", label: "Puntos", type: "points" }],
    outputs: [],
  },
  "mat.phong": {
    label: "Phong MAT",
    name: "PhongMAT",
    namespace: "Ops.MAT.Phong",
    category: "MAT",
    description: "Material especular con soporte de textura TOP en 3D",
    inputs: [{ key: "tex", label: "Mapa Color", type: "hydra", optional: true }],
    outputs: [{ key: "mat", label: "Material", type: "material" }],
  },
  "mat.pbr": {
    label: "PBR MAT",
    name: "PbrMAT",
    namespace: "Ops.MAT.PBR",
    category: "MAT",
    description: "Material físico metálico/rugoso con textura TOP",
    inputs: [{ key: "tex", label: "Mapa Color", type: "hydra", optional: true }],
    outputs: [{ key: "mat", label: "Material", type: "material" }],
  },
  "mat.constant": {
    label: "Constant MAT",
    name: "ConstantMAT",
    namespace: "Ops.MAT.Constant",
    category: "MAT",
    description: "Material plano autoiluminado o wireframe",
    inputs: [{ key: "tex", label: "Mapa Color", type: "hydra", optional: true }],
    outputs: [{ key: "mat", label: "Material", type: "material" }],
  },
  "dat.text": {
    label: "Text DAT",
    name: "TextDAT",
    namespace: "Ops.DAT.Text",
    category: "DAT",
    description: "Contenedor de texto plano para alimentar Text TOP o notas",
    inputs: [],
    outputs: [{ key: "data", label: "Texto", type: "data" }],
  },
  "dat.table": {
    label: "Table DAT",
    name: "TableDAT",
    namespace: "Ops.DAT.Table",
    category: "DAT",
    description: "Tabla CSV por fila/columna con salida numérica y de texto",
    inputs: [],
    outputs: [
      { key: "data", label: "Tabla", type: "data" },
      { key: "value", label: "Celda", type: "number" },
    ],
  },
  "dat.evaluate": {
    label: "Evaluate DAT",
    name: "EvaluateDAT",
    namespace: "Ops.DAT.Evaluate",
    category: "DAT",
    description: "Evalúa expresiones seguras (sin, cos, abs, x, t) en tiempo real",
    inputs: [
      { key: "in", label: "Var x", type: "number", optional: true },
      { key: "data", label: "Datos", type: "data", optional: true },
    ],
    outputs: [
      { key: "value", label: "Resultado", type: "number" },
      { key: "data", label: "Texto", type: "data" },
    ],
  },
  "comp.geo": {
    label: "Geometry COMP",
    name: "GeometryCOMP",
    namespace: "Ops.COMP.Geometry",
    category: "COMP",
    description: "Renderiza una malla SOP con material MAT y textura TOP en el visor 3D",
    inputs: [
      { key: "geo", label: "SOP", type: "geometry" },
      { key: "mat", label: "MAT", type: "material", optional: true },
      { key: "scale", label: "Escala", type: "number", optional: true },
    ],
    outputs: [],
  },
  "comp.light": {
    label: "Light COMP",
    name: "LightCOMP",
    namespace: "Ops.COMP.Light",
    category: "COMP",
    description: "Controla color, intensidad y posición de la luz en la escena 3D",
    inputs: [{ key: "intensityMod", label: "Intensidad", type: "number", optional: true }],
    outputs: [],
  },
  "comp.camera": {
    label: "Camera COMP",
    name: "CameraCOMP",
    namespace: "Ops.COMP.Camera",
    category: "COMP",
    description: "Controla FOV y auto-órbita de la cámara 3D",
    inputs: [{ key: "fovMod", label: "FOV Mod", type: "number", optional: true }],
    outputs: [],
  },
  "scene.skeletonRig": {
    label: "Bone / Rig COMP",
    name: "SkeletonRig",
    namespace: "Ops.COMP.SkeletonRig",
    category: "COMP",
    description: "Visualiza el esqueleto 3D (cuerpo + manos) y retargetea modelos FBX/GLB",
    inputs: [
      { key: "skeleton", label: "Esqueleto", type: "skeleton", optional: true },
      { key: "scale", label: "Escala", type: "number", optional: true },
    ],
    outputs: [{ key: "skeleton", label: "Esqueleto", type: "skeleton" }],
  },
};

export const portLabels: Record<string, string> = {
  intensity: "Intensidad",
  in: "Entrada",
  value: "Valor",
  points: "Puntos",
  tex: "Textura",
  texB: "Capa B",
  modTex: "Mapa",
  mod: "Mod",
  phase: "Fase",
  amount: "Cantidad",
  skeleton: "Esqueleto",
  scale: "Escala",
  a: "Puntos A",
  b: "Puntos B",
  geo: "Geometría",
  mat: "Material",
  data: "Datos",
  ampMod: "Amp Mod",
  intensityMod: "Int Mod",
  fovMod: "FOV Mod",
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
    "control.number": "constant",
    "signal.lfo": "lfo",
    "signal.timer": "timer",
    "signal.smooth": "lag",
    "signal.mapRange": "mapRange",
    "signal.math": "math",
    "chop.noise": "noiseChop",
    "chop.audioIn": "audioIn",
    "chop.speed": "speed",
    "chop.analyze": "beatChop",
    "hydra.osc": "osc",
    "hydra.noise": "noise",
    "hydra.shape": "shape",
    "hydra.kaleid": "kaleid",
    "hydra.rotate": "rotate",
    "hydra.modulate": "modulate",
    "hydra.color": "color",
    "hydra.out": "out",
    "top.movieFileIn": "movieIn",
    "top.videoDeviceIn": "videoIn",
    "top.ramp": "ramp",
    "top.level": "level",
    "top.blur": "blur",
    "top.transform": "xformTop",
    "top.composite": "composite",
    "top.displace": "displace",
    "top.text": "textTop",
    "top.chopTo": "chopToTop",
    "sop.sphere": "sphere",
    "sop.box": "box",
    "sop.torus": "torus",
    "sop.grid": "grid",
    "sop.fileIn": "fileIn",
    "sop.transform": "xformSop",
    "sop.noise": "noiseSop",
    "sop.toPop": "sopToPop",
    "mat.phong": "phongMat",
    "mat.pbr": "pbrMat",
    "mat.constant": "constMat",
    "dat.text": "textDat",
    "dat.table": "tableDat",
    "dat.evaluate": "evalDat",
    "comp.geo": "geoComp",
    "comp.light": "lightComp",
    "comp.camera": "camComp",
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
    case "chop.noise": return { id, kind, seed: 12, rate: 0.8, amplitude: 1, offset: 0.5 };
    case "chop.audioIn": return { id, kind, band: "bass", gain: 1.8 };
    case "chop.speed": return { id, kind, gain: 1 };
    case "chop.analyze": return { id, kind, mode: "beat" };
    case "hydra.osc": return { id, kind, freq: 10, sync: 0.08, offset: 0.4 };
    case "hydra.noise": return { id, kind, scale: 3, offset: 0.15 };
    case "hydra.shape": return { id, kind, sides: 5, radius: 0.4, smoothing: 0.01 };
    case "hydra.kaleid": return { id, kind, sides: 5 };
    case "hydra.rotate": return { id, kind, angle: 0, speed: 0.08 };
    case "hydra.modulate": return { id, kind, amount: 0.12 };
    case "hydra.color": return { id, kind, r: 0.68, g: 0.4, b: 0.78 };
    case "hydra.out": return { id, kind, buffer: "o0" };
    case "top.movieFileIn": return { id, kind, sourceSlot: 0, fit: "cover", speed: 1, loop: true };
    case "top.videoDeviceIn": return { id, kind, deviceMode: "camera", sourceSlot: 1, mirror: true };
    case "top.ramp": return { id, kind, rampType: "radial", speed: 0.12, r1: 0.75, g1: 0.45, b1: 0.82, r2: 0.12, g2: 0.1, b2: 0.16 };
    case "top.level": return { id, kind, brightness: 0, contrast: 1.25, saturate: 1.15, invert: 0 };
    case "top.blur": return { id, kind, size: 1.5 };
    case "top.transform": return { id, kind, tx: 0, ty: 0, scale: 1, rotate: 0, repeat: 1 };
    case "top.composite": return { id, kind, op: "blend", amount: 0.5 };
    case "top.displace": return { id, kind, weight: 0.15 };
    case "top.text": return { id, kind, text: "ZENCE R2", fontSize: 72, color: "#cf8acc", sourceSlot: 2 };
    case "top.chopTo": return { id, kind, freq: 6 };
    case "sop.sphere": return { id, kind, radius: 1.4, segments: 24 };
    case "sop.box": return { id, kind, width: 2, height: 2, depth: 2, segments: 6 };
    case "sop.torus": return { id, kind, radius: 1.35, tube: 0.42, segments: 28 };
    case "sop.grid": return { id, kind, size: 4.5, divisions: 24 };
    case "sop.fileIn": return { id, kind, scale: 1, fileName: "" };
    case "sop.transform": return { id, kind, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0.4, rz: 0, scale: 1 };
    case "sop.noise": return { id, kind, amplitude: 0.25, freq: 1.8, speed: 1.2 };
    case "sop.toPop": return { id, kind, seed: 33, count: 640, spread: 0.04 };
    case "mat.phong": return { id, kind, color: "#cf8acc", specular: "#ffffff", shininess: 60, wireframe: false, opacity: 1 };
    case "mat.pbr": return { id, kind, color: "#ae68ad", metalness: 0.35, roughness: 0.38, emissiveIntensity: 0.2, wireframe: false };
    case "mat.constant": return { id, kind, color: "#f5f3f4", opacity: 1, wireframe: false };
    case "dat.text": return { id, kind, text: "ZENCE R2\nAUDIOVISUAL" };
    case "dat.table": return { id, kind, csv: "freq,amp\n8,1.2\n14,2.0", row: 1, col: 1 };
    case "dat.evaluate": return { id, kind, expr: "abs(sin(x + t)) * 1.5" };
    case "comp.geo": return { id, kind, visible: true, autoSpin: 0.35 };
    case "comp.light": return { id, kind, color: "#ffffff", intensity: 3, x: 5, y: 6, z: 4 };
    case "comp.camera": return { id, kind, fov: 37, autoRotate: false, speed: 1.6 };
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
      positions[node.id] = {
        x: Math.min(20_000, Math.max(-20_000, point.x)),
        y: Math.min(20_000, Math.max(-20_000, point.y)),
      };
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
