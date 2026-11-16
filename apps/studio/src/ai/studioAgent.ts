import type { Edge, Node, Project } from "../../../../packages/engine/project.ts";
import { makeNode, nodeTypes, positionFor } from "../studio.ts";
import type { Layout, ViewSettings } from "../studio.ts";

export type StudioAiAction =
  | {
      type: "add_nodes";
      nodes: Array<{
        ref?: string;
        kind: Node["kind"];
        params?: Record<string, unknown>;
      }>;
      edges?: Array<{
        from: string;
        fromPort?: string;
        to: string;
        toPort?: string;
      }>;
    }
  | {
      type: "update_node";
      nodeId: string;
      patch: Record<string, unknown>;
    }
  | {
      type: "remove_nodes";
      nodeIds: string[];
    }
  | {
      type: "set_hydra_code";
      code: string;
    }
  | {
      type: "set_view";
      mode?: "3d" | "hydra" | "hydra3d";
      viewPatch?: Partial<ViewSettings>;
    }
  | {
      type: "run_action";
      action: "auto-layout" | "toggle-mic" | "mocap-cam";
    };

export interface StudioAgentContext {
  project: Project;
  positions: Layout;
  code: string;
  view: ViewSettings;
  mode: "3d" | "hydra";
  texture: boolean;
  onApplyGraph: (next: Project, extraPositions?: Layout, selectId?: string) => void;
  onRunHydra: (code: string) => void;
  onSetView: (patch: Partial<ViewSettings>) => void;
  onSetEngine: (engine: "3d" | "hydra" | "hydra3d") => void;
  onAutoLayout: () => void;
}

function catalogSummary(): string {
  return (Object.keys(nodeTypes) as Node["kind"][])
    .map((kind) => {
      const s = nodeTypes[kind];
      const ins = s.inputs.map((i) => `${i.key}:${i.type}${i.optional ? "?" : ""}`).join(", ");
      const outs = s.outputs.map((o) => `${o.key}:${o.type}`).join(", ");
      return `- ${kind} [${s.category} ${s.name}] in(${ins}) out(${outs})`;
    })
    .join("\n");
}

export function buildZenceSystemPrompt(ctx: Pick<StudioAgentContext, "project" | "code" | "mode" | "texture">): string {
  const existing = ctx.project.nodes.map((n) => `${n.id}(${n.kind})`).join(", ");
  const existingEdges = ctx.project.edges
    .map((e) => `${e.from.node}.${e.from.port}->${e.to.node}.${e.to.port}`)
    .join(", ");

  return `Eres el asistente integrado de Zence R2, un estudio audiovisual nodal estilo TouchDesigner + Cables.gl + Hydra 2D + Three.js 3D.
Responde en español claro y conciso.
Cuando el usuario pida crear, conectar, modificar o controlar nodos, escena 3D, Hydra o vista, incluye AL FINAL de tu respuesta un único bloque XML válido:
<zence_actions>
[ ...acciones JSON... ]
</zence_actions>

REGLAS DE PUERTOS Y ACCIONES:
1. Solo usa kinds exactos del catálogo y conecta únicamente puertos con el MISMO tipo (hydra->hydra, number->number, geometry->geometry, material->material, points->points, data->data, skeleton->skeleton).
2. En "add_nodes", asigna "ref" (ej: "n1", "n2") para conectarlos en "edges" dentro de la misma acción, o usa un ID existente en la escena. Si omites "fromPort"/"toPort", se emparejarán automáticamente los puertos del mismo tipo compatible.
3. Si creas una cadena TOP / Hydra visual que deba verse en 2D, asegúrate de terminar conectando al puerto "tex" de un nodo "hydra.out".
4. Si creas geometría 3D SOP ("sop.sphere", "sop.torus", "sop.box", etc.), conéctala a "comp.geo" (y opcionalmente un material "mat.pbr"/"mat.phong" a "comp.geo.mat", o "sop.toPop" -> "scene.points").
5. Para cargar imagen/video usa "top.movieFileIn"; para cámara/pantalla usa "top.videoDeviceIn"; para micrófono usa "chop.audioIn"; para texto 2D usa "top.text" + "dat.text"; para mocap cuerpo/manos usa "mocap.body" / "mocap.hands" + "scene.skeletonRig".

FORMATOS DE ACCIÓN DISPONIBLES:
- {"type":"add_nodes","nodes":[{"ref":"img","kind":"top.movieFileIn","params":{"sourceSlot":0}},{"ref":"lvl","kind":"top.level","params":{"contrast":1.4}},{"ref":"out1","kind":"hydra.out","params":{"buffer":"o0"}}],"edges":[{"from":"img","fromPort":"tex","to":"lvl","toPort":"tex"},{"from":"lvl","fromPort":"tex","to":"out1","toPort":"tex"}]}
- {"type":"update_node","nodeId":"idExistente","patch":{"contrast":1.5}}
- {"type":"remove_nodes","nodeIds":["id1"]}
- {"type":"set_hydra_code","code":"osc(12,0.08).out(o0)"}
- {"type":"set_view","mode":"hydra"|"3d"|"hydra3d","viewPatch":{"grid":true,"guides":true,"color":"#ae68ad"}}
- {"type":"run_action","action":"auto-layout"|"toggle-mic"|"mocap-cam"}

ESTADO ACTUAL DE LA ESCENA:
- Visor: ${ctx.mode === "hydra" ? "Hydra 2D" : ctx.texture ? "Hydra 3D" : "3D"} · scene.points activo: "${ctx.project.scene || "ninguno"}"
- Nodos actuales: ${existing || "vacío"}
- Cables actuales: ${existingEdges || "ninguno"}
- Código Hydra actual:\n${ctx.code}

CATÁLOGO DE OPERADORES ZENCE R2:
${catalogSummary()}`;
}

export function extractStudioActions(raw: string): {
  cleanText: string;
  actions: StudioAiAction[];
} {
  const match = /<zence_actions>([\s\S]*?)<\/zence_actions>/i.exec(raw);
  if (!match) {
    return { cleanText: raw.trim(), actions: [] };
  }
  const cleanText = raw.replace(match[0], "").trim();
  const jsonText = match[1]
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(jsonText);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return {
      cleanText,
      actions: list.filter((x): x is StudioAiAction => !!x && typeof x === "object" && typeof x.type === "string"),
    };
  } catch {
    return { cleanText: raw.trim(), actions: [] };
  }
}

export function executeStudioActions(actions: StudioAiAction[], ctx: StudioAgentContext): string[] {
  const summaries: string[] = [];
  let nextProject: Project = {
    ...ctx.project,
    nodes: [...ctx.project.nodes],
    edges: [...ctx.project.edges],
  };
  const nextPositions: Layout = { ...ctx.positions };
  let graphDirty = false;
  let lastAddedId = "";

  for (const act of actions) {
    if (act.type === "add_nodes" && Array.isArray(act.nodes)) {
      const refToId = new Map<string, string>();
      const baseBottom = Math.max(
        20,
        ...nextProject.nodes.map((n, idx) => positionFor(n, idx, nextPositions).y),
      );
      const startY = nextProject.nodes.length > 0 ? baseBottom + 170 : 30;
      const createdIds: string[] = [];

      act.nodes.forEach((spec, index) => {
        if (!spec || typeof spec.kind !== "string" || !Object.hasOwn(nodeTypes, spec.kind)) return;
        const baseNode = makeNode(spec.kind, nextProject.nodes);
        const merged: Record<string, unknown> = { ...baseNode };
        if (spec.params && typeof spec.params === "object") {
          for (const [k, v] of Object.entries(spec.params)) {
            if (k !== "id" && k !== "kind" && k in merged) {
              merged[k] = v;
            }
          }
        }
        const finalNode = merged as Node;
        nextProject.nodes.push(finalNode);
        if (spec.kind === "scene.points" && !nextProject.scene) {
          nextProject.scene = finalNode.id;
        }
        if (spec.ref) refToId.set(spec.ref, finalNode.id);
        refToId.set(finalNode.id, finalNode.id);
        nextPositions[finalNode.id] = { x: 40 + index * 245, y: startY };
        createdIds.push(finalNode.id);
        lastAddedId = finalNode.id;
      });

      if (Array.isArray(act.edges)) {
        for (const edgeSpec of act.edges) {
          const fromId = refToId.get(edgeSpec.from) ?? edgeSpec.from;
          const toId = refToId.get(edgeSpec.to) ?? edgeSpec.to;
          if (!fromId || !toId || fromId === toId) continue;
          const srcNode = nextProject.nodes.find((n) => n.id === fromId);
          const dstNode = nextProject.nodes.find((n) => n.id === toId);
          if (!srcNode || !dstNode) continue;

          const srcSpec = nodeTypes[srcNode.kind];
          const dstSpec = nodeTypes[dstNode.kind];
          let outPort = srcSpec.outputs.find((o) => o.key === edgeSpec.fromPort);
          let inPort = dstSpec.inputs.find((i) => i.key === edgeSpec.toPort);

          if (!outPort || !inPort || outPort.type !== inPort.type) {
            outer: for (const o of srcSpec.outputs) {
              for (const i of dstSpec.inputs) {
                if (o.type === i.type) {
                  outPort = o;
                  inPort = i;
                  break outer;
                }
              }
            }
          }
          if (!outPort || !inPort) continue;

          nextProject.edges = nextProject.edges.filter(
            (e) => e.to.node !== toId || e.to.port !== inPort!.key,
          );
          const newEdge: Edge = {
            from: { node: fromId, port: outPort.key },
            to: { node: toId, port: inPort.key },
          };
          nextProject.edges.push(newEdge);
        }
      }

      if (createdIds.length > 0) {
        graphDirty = true;
        summaries.push(`Creados ${createdIds.length} nodos (${createdIds.join(", ")})`);
      }
    } else if (act.type === "update_node" && act.nodeId && act.patch) {
      const idx = nextProject.nodes.findIndex((n) => n.id === act.nodeId);
      if (idx >= 0) {
        const cur = nextProject.nodes[idx] as Record<string, unknown>;
        const patched = { ...cur };
        for (const [k, v] of Object.entries(act.patch)) {
          if (k !== "id" && k !== "kind" && k in patched) patched[k] = v;
        }
        nextProject.nodes[idx] = patched as Node;
        graphDirty = true;
        summaries.push(`Actualizado ${act.nodeId}`);
      }
    } else if (act.type === "remove_nodes" && Array.isArray(act.nodeIds)) {
      const rm = new Set(act.nodeIds);
      const before = nextProject.nodes.length;
      nextProject.nodes = nextProject.nodes.filter((n) => !rm.has(n.id));
      nextProject.edges = nextProject.edges.filter((e) => !rm.has(e.from.node) && !rm.has(e.to.node));
      if (rm.has(nextProject.scene)) {
        nextProject.scene = nextProject.nodes.find((n) => n.kind === "scene.points")?.id ?? "";
      }
      if (nextProject.nodes.length !== before) {
        graphDirty = true;
        summaries.push(`Eliminados ${before - nextProject.nodes.length} nodos`);
      }
    } else if (act.type === "set_hydra_code" && typeof act.code === "string" && act.code.trim()) {
      ctx.onRunHydra(act.code.trim());
      summaries.push("Código Hydra aplicado");
    } else if (act.type === "set_view") {
      if (act.mode) ctx.onSetEngine(act.mode);
      if (act.viewPatch) ctx.onSetView(act.viewPatch);
      summaries.push("Vista actualizada");
    } else if (act.type === "run_action") {
      if (act.action === "auto-layout") ctx.onAutoLayout();
      else if (act.action === "toggle-mic") window.dispatchEvent(new CustomEvent("zence:toggle-mic"));
      else if (act.action === "mocap-cam") window.dispatchEvent(new CustomEvent("zence:mocap-toggle"));
      summaries.push(`Acción: ${act.action}`);
    }
  }

  if (graphDirty) {
    ctx.onApplyGraph(nextProject, nextPositions, lastAddedId || undefined);
  }
  return summaries;
}

export const STUDIO_AI_SEEDS: ReadonlyArray<{ label: string; prompt: string }> = [
  {
    label: "Imagen → Efectos TOP → Hydra",
    prompt: "Crea una cadena de nodos para cargar una imagen, ajustarle el nivel y enviarla a la salida Hydra",
  },
  {
    label: "Cámara / Captura → Hydra",
    prompt: "Crea nodos de captura de cámara o pantalla con transformación y desplazamiento hacia Hydra",
  },
  {
    label: "Esfera 3D + Material PBR",
    prompt: "Crea un grafo 3D con una esfera SOP, ruido orgánico, material PBR y Geometry COMP + luz",
  },
  {
    label: "Audio Mic → Partículas",
    prompt: "Crea un nodo de micrófono AudioIn CHOP conectado a un emisor de partículas hacia el visor 3D",
  },
];

/**
 * Plantillas rápidas locales cuando aún no hay proveedor de IA autenticado.
 * Siempre informa explícitamente que es una plantilla local.
 */
export function buildOfflineQuickActions(prompt: string): {
  reply: string;
  actions: StudioAiAction[];
} | null {
  const q = prompt.toLowerCase();
  if (/(imagen|foto|video|movie)/.test(q)) {
    return {
      reply:
        "Modo rápido local (sin proveedor IA autenticado): creé la cadena TOP para cargar una imagen o video y enviarla a Hydra (`MovieFileIn → Level → Out`). Usa el botón de cargar archivo en la tarjeta del nodo.",
      actions: [
        {
          type: "add_nodes",
          nodes: [
            { ref: "img", kind: "top.movieFileIn", params: { sourceSlot: 0 } },
            { ref: "lvl", kind: "top.level", params: { contrast: 1.25, saturate: 1.15 } },
            { ref: "out", kind: "hydra.out", params: { buffer: "o0" } },
          ],
          edges: [
            { from: "img", fromPort: "tex", to: "lvl", toPort: "tex" },
            { from: "lvl", fromPort: "tex", to: "out", toPort: "tex" },
          ],
        },
      ],
    };
  }
  if (/(captura|c[aá]mara|webcam|pantalla|screen)/.test(q)) {
    return {
      reply:
        "Modo rápido local (sin proveedor IA autenticado): creé la cadena `VideoDeviceIn → TransformTOP → Out` lista para activar tu cámara web o compartir pantalla.",
      actions: [
        {
          type: "add_nodes",
          nodes: [
            { ref: "cam", kind: "top.videoDeviceIn", params: { deviceMode: /pantalla|screen/.test(q) ? "screen" : "camera", sourceSlot: 1 } },
            { ref: "xf", kind: "top.transform", params: { scale: 1, rotate: 0 } },
            { ref: "out", kind: "hydra.out", params: { buffer: "o0" } },
          ],
          edges: [
            { from: "cam", fromPort: "tex", to: "xf", toPort: "tex" },
            { from: "xf", fromPort: "tex", to: "out", toPort: "tex" },
          ],
        },
      ],
    };
  }
  if (/(3d|esfera|sphere|toro|torus|cubo|box|geometr)/.test(q)) {
    const primKind: Node["kind"] = /toro|torus/.test(q) ? "sop.torus" : /cubo|box/.test(q) ? "sop.box" : "sop.sphere";
    return {
      reply:
        "Modo rápido local (sin proveedor IA autenticado): creé la cadena 3D TouchDesigner (`SOP → NoiseSOP → GeometryCOMP` + `Material PBR` + `LightCOMP`).",
      actions: [
        {
          type: "add_nodes",
          nodes: [
            { ref: "prim", kind: primKind },
            { ref: "ns", kind: "sop.noise", params: { amplitude: 0.25, freq: 1.8 } },
            { ref: "mat", kind: "mat.pbr", params: { color: "#ae68ad", metalness: 0.45, roughness: 0.3 } },
            { ref: "geo", kind: "comp.geo", params: { visible: true, autoSpin: 0.4 } },
            { ref: "lgt", kind: "comp.light", params: { intensity: 3.5 } },
          ],
          edges: [
            { from: "prim", fromPort: "geo", to: "ns", toPort: "geo" },
            { from: "ns", fromPort: "geo", to: "geo", toPort: "geo" },
            { from: "mat", fromPort: "mat", to: "geo", toPort: "mat" },
          ],
        },
      ],
    };
  }
  if (/(mic|audio|sonido|m[uú]sica|part[ií]cul)/.test(q)) {
    return {
      reply:
        "Modo rápido local (sin proveedor IA autenticado): creé la cadena audio-reactiva `AudioIn CHOP → MapRange → Particles → Scene3D`.",
      actions: [
        {
          type: "add_nodes",
          nodes: [
            { ref: "aud", kind: "chop.audioIn", params: { band: "bass", gain: 2.2 } },
            { ref: "map", kind: "signal.mapRange", params: { inMin: 0, inMax: 1, outMin: 0.4, outMax: 3.2 } },
            { ref: "emit", kind: "simulation.particles", params: { count: 900, seed: 88 } },
            { ref: "st", kind: "scene.points" },
          ],
          edges: [
            { from: "aud", fromPort: "value", to: "map", toPort: "in" },
            { from: "map", fromPort: "value", to: "emit", toPort: "intensity" },
            { from: "emit", fromPort: "points", to: "st", toPort: "points" },
          ],
        },
      ],
    };
  }
  return null;
}
