/**
 * Mapa canonico de huesos y conexiones anatomicas (portado de Posu)
 */
import type * as THREE from "three";

export type HandSide = "left" | "right";
export type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";
export type BoneGroup = "torso" | "head" | "arms" | "hands" | "fingers" | "legs";

export const FINGERS: readonly FingerName[] = ["thumb", "index", "middle", "ring", "pinky"];

export function fingerKeys(side: HandSide, finger: FingerName): string[] {
  const cap = finger[0].toUpperCase() + finger.slice(1);
  return [1, 2, 3].map((i) => `${side}${cap}${i}`);
}

export const FINGER_BONES: string[] = (["left", "right"] as const).flatMap((side) =>
  FINGERS.flatMap((f) => fingerKeys(side, f)),
);

export const BONE_ALIASES: Record<string, string[]> = {
  hips: ["hips", "pelvis", "root", "cog"],
  spine: ["spine", "spine01", "abdomen", "waist"],
  spine1: ["spine1", "spine02", "chestlower"],
  spine2: ["spine2", "spine03", "chest", "upperchest"],
  neck: ["neck", "neck01"],
  head: ["head"],
  headTop: ["headtopend", "headtop", "headend"],

  leftShoulder: ["leftshoulder", "shoulderl", "lshoulder", "claviclel", "leftclavicle"],
  leftArm: ["leftarm", "leftupperarm", "upperarml", "larm"],
  leftForeArm: ["leftforearm", "leftlowerarm", "forearml", "lowerarml"],
  leftHand: ["lefthand", "handl", "lhand"],

  rightShoulder: ["rightshoulder", "shoulderr", "rshoulder", "clavicler", "rightclavicle"],
  rightArm: ["rightarm", "rightupperarm", "upperarmr", "rarm"],
  rightForeArm: ["rightforearm", "rightlowerarm", "forearmr", "lowerarmr"],
  rightHand: ["righthand", "handr", "rhand"],

  leftUpLeg: ["leftupleg", "leftupperleg", "thighl", "upperlegl", "lthigh"],
  leftLeg: ["leftleg", "leftlowerleg", "shinl", "lowerlegl", "calfl"],
  leftFoot: ["leftfoot", "footl", "lfoot"],
  leftToe: ["lefttoebase", "toebasel", "lefttoe", "toel"],

  rightUpLeg: ["rightupleg", "rightupperleg", "thighr", "upperlegr", "rthigh"],
  rightLeg: ["rightleg", "rightlowerleg", "shinr", "lowerlegr", "calfr"],
  rightFoot: ["rightfoot", "footr", "rfoot"],
  rightToe: ["righttoebase", "toebaser", "righttoe", "toer"],
};

for (const side of ["left", "right"] as const) {
  for (const finger of ["Thumb", "Index", "Middle", "Ring", "Pinky"] as const) {
    for (let i = 1; i <= 3; i++) {
      const key = `${side}${finger}${i}`;
      const s = side === "left" ? "l" : "r";
      BONE_ALIASES[key] = [
        `${side}hand${finger.toLowerCase()}${i}`,
        `${finger.toLowerCase()}${i}${s}`,
        `${side}${finger.toLowerCase()}${i}`,
      ];
    }
  }
}

export const BONE_GROUPS: Record<BoneGroup, string[]> = {
  torso: ["hips", "spine", "spine1", "spine2"],
  head: ["neck", "head"],
  arms: ["leftShoulder", "leftArm", "leftForeArm", "rightShoulder", "rightArm", "rightForeArm"],
  hands: ["leftHand", "rightHand"],
  fingers: FINGER_BONES,
  legs: ["leftUpLeg", "leftLeg", "leftFoot", "leftToe", "rightUpLeg", "rightLeg", "rightFoot", "rightToe"],
};

export const BONE_GROUP_OF: Record<string, BoneGroup> = (() => {
  const map: Record<string, BoneGroup> = {};
  for (const [group, keys] of Object.entries(BONE_GROUPS) as [BoneGroup, string[]][]) {
    for (const k of keys) map[k] = group;
  }
  return map;
})();

export function normalizeBoneName(name = ""): string {
  return String(name)
    .toLowerCase()
    .replace(/mixamorig\d*/g, "")
    .replace(/^bip\d*/g, "")
    .replace(/[\s:._\-|]/g, "");
}

export function resolveBones(bonesList: THREE.Bone[]): {
  bones: Record<string, THREE.Bone>;
  missing: string[];
} {
  const byNormalized = new Map<string, THREE.Bone>();
  for (const bone of bonesList) {
    const key = normalizeBoneName(bone.name);
    if (!byNormalized.has(key)) byNormalized.set(key, bone);
  }
  const bones: Record<string, THREE.Bone> = {};
  const missing: string[] = [];
  for (const [canonical, aliases] of Object.entries(BONE_ALIASES)) {
    const found = aliases.map((a) => byNormalized.get(a)).find(Boolean);
    if (found) bones[canonical] = found;
    else missing.push(canonical);
  }
  return { bones, missing };
}

/** Pares canonicos de articulaciones para dibujar el esqueleto 3D y emitir particulas. */
export const SKELETON_SEGMENTS: readonly [string, string][] = [
  ["hips", "spine"],
  ["spine", "chest"],
  ["chest", "neck"],
  ["neck", "head"],
  ["chest", "leftArm"],
  ["leftArm", "leftForeArm"],
  ["leftForeArm", "leftHand"],
  ["chest", "rightArm"],
  ["rightArm", "rightForeArm"],
  ["rightForeArm", "rightHand"],
  ["hips", "leftUpLeg"],
  ["leftUpLeg", "leftLeg"],
  ["leftLeg", "leftFoot"],
  ["hips", "rightUpLeg"],
  ["rightUpLeg", "rightLeg"],
  ["rightLeg", "rightFoot"],
];

/** Conexiones internas de la mano de 21 landmarks de MediaPipe HandLandmarker. */
export const HAND_SEGMENTS: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

export const JOINT_ZONES: Record<string, readonly string[]> = {
  all: [
    "hips", "spine", "chest", "neck", "head",
    "leftArm", "leftForeArm", "leftHand",
    "rightArm", "rightForeArm", "rightHand",
    "leftUpLeg", "leftLeg", "leftFoot",
    "rightUpLeg", "rightLeg", "rightFoot",
  ],
  hands: ["leftHand", "rightHand", "leftForeArm", "rightForeArm"],
  arms: ["leftArm", "leftForeArm", "leftHand", "rightArm", "rightForeArm", "rightHand"],
  spine: ["hips", "spine", "chest", "neck", "head"],
  head: ["neck", "head"],
  legs: ["hips", "leftUpLeg", "leftLeg", "leftFoot", "rightUpLeg", "rightLeg", "rightFoot"],
};
