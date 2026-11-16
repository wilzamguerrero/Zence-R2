/**
 * Retargeting directo de cuerpo y manos sobre cualquier modelo GLB/FBX cargado
 * (Adaptado de Posu: DirectRetargeter + HandRig + Character rest capture)
 */
import * as THREE from "three";
import {
  BONE_GROUP_OF,
  FINGERS,
  fingerKeys,
  resolveBones,
  type FingerName,
  type HandSide,
} from "./boneMap.ts";
import type { LandmarkPoint } from "./squarePad.ts";

const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

const SWAP: number[] = (() => {
  const s = Array.from({ length: 33 }, (_, i) => i);
  const pairs = [
    [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
    [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
  ];
  for (const [a, b] of pairs) {
    s[a] = b;
    s[b] = a;
  }
  return s;
})();

interface LimbChain {
  key: string;
  child: string;
  from: number;
  to?: number;
  toMid?: [number, number];
  late?: boolean;
}

const LIMB_CHAINS: LimbChain[] = [
  { key: "leftArm", child: "leftForeArm", from: LM.LEFT_SHOULDER, to: LM.LEFT_ELBOW },
  { key: "leftForeArm", child: "leftHand", from: LM.LEFT_ELBOW, to: LM.LEFT_WRIST },
  { key: "rightArm", child: "rightForeArm", from: LM.RIGHT_SHOULDER, to: LM.RIGHT_ELBOW },
  { key: "rightForeArm", child: "rightHand", from: LM.RIGHT_ELBOW, to: LM.RIGHT_WRIST },
  { key: "leftUpLeg", child: "leftLeg", from: LM.LEFT_HIP, to: LM.LEFT_KNEE },
  { key: "leftLeg", child: "leftFoot", from: LM.LEFT_KNEE, to: LM.LEFT_ANKLE },
  { key: "rightUpLeg", child: "rightLeg", from: LM.RIGHT_HIP, to: LM.RIGHT_KNEE },
  { key: "rightLeg", child: "rightFoot", from: LM.RIGHT_KNEE, to: LM.RIGHT_ANKLE },
  { key: "leftFoot", child: "leftToe", from: LM.LEFT_ANKLE, to: LM.LEFT_FOOT_INDEX },
  { key: "rightFoot", child: "rightToe", from: LM.RIGHT_ANKLE, to: LM.RIGHT_FOOT_INDEX },
  { key: "leftHand", child: "leftMiddle1", from: LM.LEFT_WRIST, toMid: [LM.LEFT_INDEX, LM.LEFT_PINKY], late: true },
  { key: "rightHand", child: "rightMiddle1", from: LM.RIGHT_WRIST, toMid: [LM.RIGHT_INDEX, LM.RIGHT_PINKY], late: true },
];

export interface RigRestData {
  local: Map<THREE.Bone, THREE.Quaternion>;
  world: Map<THREE.Bone, THREE.Quaternion>;
  position: Map<THREE.Bone, THREE.Vector3>;
}

export interface RigCharacter {
  root: THREE.Object3D;
  bonesList: THREE.Bone[];
  bones: Record<string, THREE.Bone>;
  skeleton: THREE.Skeleton | null;
  basis: THREE.Quaternion;
  rest: RigRestData;
  handRig: HandRig;
  loaded: boolean;
}

export function extractRigFromObject(root: THREE.Object3D): RigCharacter | null {
  root.updateMatrixWorld(true);
  let skeleton: THREE.Skeleton | null = null;
  const boneSet = new Set<THREE.Bone>();

  root.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && skinned.skeleton && !skeleton) {
      skeleton = skinned.skeleton;
    }
    if ((obj as THREE.Bone).isBone) {
      boneSet.add(obj as THREE.Bone);
    }
  });

  const bonesList = skeleton ? (skeleton as THREE.Skeleton).bones : Array.from(boneSet);
  if (!bonesList.length) return null;

  const { bones } = resolveBones(bonesList);
  const rest: RigRestData = {
    local: new Map(),
    world: new Map(),
    position: new Map(),
  };

  const bindWorld = new Map<THREE.Bone, THREE.Matrix4>();
  const activeSkel = skeleton as THREE.Skeleton | null;
  if (activeSkel && activeSkel.boneInverses.length === activeSkel.bones.length) {
    activeSkel.bones.forEach((b, idx) => {
      bindWorld.set(b, activeSkel.boneInverses[idx].clone().invert());
    });
  } else {
    for (const b of bonesList) {
      bindWorld.set(b, b.matrixWorld.clone());
    }
  }

  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const parentQuat = new THREE.Quaternion();

  for (const b of bonesList) {
    const m = bindWorld.get(b) ?? b.matrixWorld;
    m.decompose(pos, quat, scl);
    rest.position.set(b, pos.clone());
    rest.world.set(b, quat.clone());
    const pm = b.parent ? bindWorld.get(b.parent as THREE.Bone) : null;
    if (pm) pm.decompose(new THREE.Vector3(), parentQuat, new THREE.Vector3());
    else parentQuat.identity();
    rest.local.set(b, parentQuat.clone().invert().multiply(quat));
  }

  const getPos = (k: string) => (bones[k] ? rest.position.get(bones[k]) ?? null : null);
  const up = new THREE.Vector3(0, 1, 0);
  const left = new THREE.Vector3(1, 0, 0);
  const hipP = getPos("hips");
  const topP = getPos("spine2") ?? getPos("neck") ?? getPos("head");
  if (hipP && topP) up.copy(topP).sub(hipP).normalize();
  const ls = getPos("leftShoulder") ?? getPos("leftArm") ?? getPos("leftUpLeg");
  const rs = getPos("rightShoulder") ?? getPos("rightArm") ?? getPos("rightUpLeg");
  if (ls && rs) left.copy(ls).sub(rs).normalize();
  left.addScaledVector(up, -left.dot(up));
  if (left.lengthSq() > 1e-6) left.normalize();
  else left.set(1, 0, 0);
  const forward = new THREE.Vector3().crossVectors(left, up).normalize();
  const basis = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(left, up, forward),
  );

  const rig: RigCharacter = {
    root,
    bonesList,
    bones,
    skeleton,
    basis,
    rest,
    handRig: null as unknown as HandRig,
    loaded: Object.keys(bones).length > 0,
  };
  rig.handRig = new HandRig(rig);
  rig.handRig.rebuild();
  return rig;
}

/* ── Hand Angles & HandRig ──────────────────────────────────────────────── */

const DEG = Math.PI / 180;
const CHAINS: Record<FingerName, number[]> = {
  thumb: [0, 1, 2, 3, 4],
  index: [0, 5, 6, 7, 8],
  middle: [0, 9, 10, 11, 12],
  ring: [0, 13, 14, 15, 16],
  pinky: [0, 17, 18, 19, 20],
};
const SLACK: Record<FingerName, number> = {
  thumb: 8 * DEG,
  index: 12 * DEG,
  middle: 10 * DEG,
  ring: 10 * DEG,
  pinky: 12 * DEG,
};
const CURL_MAX: Record<FingerName, [number, number, number]> = {
  thumb: [30, 46, 58],
  index: [82, 100, 72],
  middle: [84, 102, 74],
  ring: [82, 100, 74],
  pinky: [80, 98, 72],
};
const FAN: Record<FingerName, number> = {
  thumb: 0,
  index: -1,
  middle: -0.15,
  ring: 0.55,
  pinky: 1.1,
};
const SPREAD_MAX = 22 * DEG;
const THUMB_OUT_MAX = 46 * DEG;
const SPREAD_SLACK = 18 * DEG;
const THUMB_SLACK = 30 * DEG;

export interface HandAnglesResult {
  thumb: [number, number, number];
  index: [number, number, number];
  middle: [number, number, number];
  ring: [number, number, number];
  pinky: [number, number, number];
  spread: number;
  thumbOut: number;
  openness: number;
  pinch: number;
}

function sub3(a: LandmarkPoint, b: LandmarkPoint) {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
}
function dot3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function len3(a: { x: number; y: number; z: number }) {
  return Math.hypot(a.x, a.y, a.z);
}
function vecAngle(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  const n = len3(a) * len3(b);
  if (n < 1e-9) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot3(a, b) / n)));
}

export function computeHandAngles(p: LandmarkPoint[] | null | undefined): HandAnglesResult | null {
  if (!p || p.length < 21) return null;
  const result = {
    thumb: [0, 0, 0] as [number, number, number],
    index: [0, 0, 0] as [number, number, number],
    middle: [0, 0, 0] as [number, number, number],
    ring: [0, 0, 0] as [number, number, number],
    pinky: [0, 0, 0] as [number, number, number],
    spread: 0,
    thumbOut: 0,
    openness: 0,
    pinch: 0,
  };

  let curlSum = 0;
  for (const finger of FINGERS) {
    const idx = CHAINS[finger];
    const m = sub3(p[idx[1]], p[idx[0]]);
    const v1 = sub3(p[idx[2]], p[idx[1]]);
    const v2 = sub3(p[idx[3]], p[idx[2]]);
    const v3 = sub3(p[idx[4]], p[idx[3]]);
    const c1 = Math.max(0, vecAngle(m, v1) - SLACK[finger]);
    const c2 = vecAngle(v1, v2);
    const c3 = vecAngle(v2, v3);
    result[finger] = [c1, c2, c3];
    curlSum += Math.min(1, (c1 + c2 + c3) / (Math.PI * 1.15));
  }

  const fan = vecAngle(sub3(p[6], p[5]), sub3(p[18], p[17]));
  result.spread = Math.max(0, Math.min(SPREAD_MAX, (fan - SPREAD_SLACK) * 0.5));
  const palmAxis = sub3(p[9], p[0]);
  result.thumbOut = Math.max(0, Math.min(THUMB_OUT_MAX, vecAngle(sub3(p[2], p[1]), palmAxis) - THUMB_SLACK));
  result.openness = Math.max(0, Math.min(1, 1 - curlSum / 5));

  const palmSize = Math.max(0.03, len3(palmAxis));
  const pinchDist = len3(sub3(p[4], p[8]));
  result.pinch = Math.max(0, Math.min(1, 1 - pinchDist / (palmSize * 0.72)));
  return result;
}

export function resolveHandSide(
  wrist: LandmarkPoint | null | undefined,
  pose: LandmarkPoint[] | null | undefined,
  label: string,
  mirror: boolean,
): HandSide {
  let anatomical: HandSide | null = null;
  const lWrist = pose?.[15];
  const rWrist = pose?.[16];
  if (wrist && lWrist && rWrist) {
    const da = Math.hypot(lWrist.x - wrist.x, lWrist.y - wrist.y);
    const db = Math.hypot(rWrist.x - wrist.x, rWrist.y - wrist.y);
    if (Math.abs(da - db) > 0.04) anatomical = da < db ? "left" : "right";
  }
  if (!anatomical) anatomical = label === "Left" ? "right" : "left";
  if (!mirror) return anatomical;
  return anatomical === "left" ? "right" : "left";
}

interface PhalanxPart {
  bone: THREE.Bone;
  curlAxis: THREE.Vector3;
  spreadAxis: THREE.Vector3;
  restLocal: THREE.Quaternion;
  max: number;
}

interface FingerChain {
  parts: PhalanxPart[];
  fan: number;
}

interface SideHandRig {
  chains: Partial<Record<FingerName, FingerChain>>;
}

const _ha = new THREE.Vector3();
const _hb = new THREE.Vector3();
const _hd = new THREE.Vector3();
const _hn = new THREE.Vector3();
const _hw = new THREE.Vector3();
const _hq1 = new THREE.Quaternion();
const _hq2 = new THREE.Quaternion();

export class HandRig {
  private rig: RigCharacter;
  private sides: Record<HandSide, SideHandRig | null> = { left: null, right: null };

  constructor(rig: RigCharacter) {
    this.rig = rig;
  }

  get ready(): boolean {
    return Boolean(this.sides.left || this.sides.right);
  }

  rebuild(): boolean {
    this.sides = {
      left: this.deriveSide("left"),
      right: this.deriveSide("right"),
    };
    return this.ready;
  }

  private deriveSide(side: HandSide): SideHandRig | null {
    const ch = this.rig;
    if (!ch.loaded) return null;
    const bone = (k: string) => ch.bones[k] ?? null;
    const pos = (k: string) => {
      const b = bone(k);
      return b ? ch.rest.position.get(b) ?? null : null;
    };

    const rawChains: Partial<Record<FingerName, { bones: THREE.Bone[] }>> = {};
    for (const f of FINGERS) {
      const found = fingerKeys(side, f).map(bone).filter((b): b is THREE.Bone => Boolean(b));
      if (found.length) rawChains[f] = { bones: found };
    }
    if (!Object.keys(rawChains).length) return null;

    const pHand = pos(`${side}Hand`);
    const pMid1 = pos(`${side}Middle1`) ?? pos(`${side}Index1`);
    const pMidTip = pos(`${side}Middle3`) ?? pos(`${side}Middle2`) ?? pos(`${side}Index3`);
    if (pMid1 && pMidTip) _hd.copy(pMidTip).sub(pMid1);
    else if (pHand && pMid1) _hd.copy(pMid1).sub(pHand);
    else return null;
    if (_hd.lengthSq() < 1e-12) return null;
    _hd.normalize();

    const pIndex = pos(`${side}Index1`);
    const pPinky = pos(`${side}Pinky1`);
    if (pIndex && pPinky) _hw.copy(pPinky).sub(pIndex);
    else _hw.set(1, 0, 0).applyQuaternion(ch.basis).multiplyScalar(side === "left" ? -1 : 1);
    _hw.addScaledVector(_hd, -_hw.dot(_hd));
    if (_hw.lengthSq() < 1e-12) return null;
    _hw.normalize();

    _hn.crossVectors(_hd, _hw).normalize();
    const scale = pHand && pMidTip ? pMidTip.distanceTo(pHand) : 1;
    const pThumb = pos(`${side}Thumb3`) ?? pos(`${side}Thumb2`);
    const ref = pIndex ?? pMid1;
    let s = 0;
    if (pThumb && ref) s = _hn.dot(_hb.copy(pThumb).sub(ref));
    const modelUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ch.basis);
    if (Math.abs(s) < scale * 0.02) s = -_hn.dot(modelUp);
    if (s < 0) _hn.negate();

    const sgn = Math.sign(_ha.crossVectors(_hn, _hd).dot(_hw)) || 1;
    const dedo = new THREE.Vector3();
    const curl = new THREE.Vector3();
    const chains: Partial<Record<FingerName, FingerChain>> = {};

    for (const [f, info] of Object.entries(rawChains) as [FingerName, { bones: THREE.Bone[] }][]) {
      const b0 = info.bones[0];
      const p0 = ch.rest.position.get(b0);
      const p1 = info.bones[1] ? ch.rest.position.get(info.bones[1]) : null;
      if (p0 && p1) dedo.copy(p1).sub(p0);
      else if (pHand && p0) dedo.copy(p0).sub(pHand);
      else dedo.copy(_hd);
      if (dedo.lengthSq() < 1e-12) dedo.copy(_hd);
      dedo.normalize();

      curl.crossVectors(dedo, _hn);
      if (curl.lengthSq() < 1e-10) curl.crossVectors(_hd, _hn);
      curl.normalize();

      const parts: PhalanxPart[] = info.bones.map((b, i) => {
        const restLocal = ch.rest.local.get(b)?.clone() ?? b.quaternion.clone();
        const parentWorld = b.parent ? ch.rest.world.get(b.parent as THREE.Bone) : null;
        _hq1.copy(parentWorld ?? _hq2.identity()).invert();
        return {
          bone: b,
          curlAxis: curl.clone().applyQuaternion(_hq1),
          spreadAxis: _hn.clone().applyQuaternion(_hq1),
          restLocal,
          max: (CURL_MAX[f]?.[i] ?? 80) * DEG,
        };
      });
      chains[f] = {
        parts,
        fan: (f === "thumb" ? -1 : FAN[f]) * sgn,
      };
    }

    return { chains };
  }

  applyAngles(side: HandSide, angles: HandAnglesResult, smooth = 0.45): boolean {
    const rig = this.sides[side];
    if (!rig) return false;
    for (const [f, chain] of Object.entries(rig.chains) as [FingerName, FingerChain][]) {
      const curls = angles[f];
      if (!curls) continue;
      const spread = f === "thumb" ? chain.fan * angles.thumbOut : chain.fan * angles.spread;
      chain.parts.forEach((part, i) => {
        const clamped = Math.max(-0.25 * part.max, Math.min(1.2 * part.max, curls[i] ?? 0));
        _hq1.setFromAxisAngle(part.curlAxis, clamped);
        if (i === 0 && Math.abs(spread) > 1e-6) {
          _hq2.setFromAxisAngle(part.spreadAxis, spread);
          _hq1.premultiply(_hq2);
        }
        _hq1.multiply(part.restLocal);
        if (smooth >= 1) part.bone.quaternion.copy(_hq1);
        else part.bone.quaternion.slerp(_hq1, smooth);
      });
    }
    return true;
  }
}

/* ── DirectRetargeter ───────────────────────────────────────────────────── */

const IDENTITY = new THREE.Quaternion();
const _fu = new THREE.Vector3();
const _fl = new THREE.Vector3();
const _ff = new THREE.Vector3();
const _fm = new THREE.Matrix4();
const _rv1 = new THREE.Vector3();
const _rv2 = new THREE.Vector3();
const _rv3 = new THREE.Vector3();
const _rn1 = new THREE.Vector3();
const _rn2 = new THREE.Vector3();
const _rq1 = new THREE.Quaternion();
const _rq2 = new THREE.Quaternion();
const _rpq = new THREE.Quaternion();
const _rpq2 = new THREE.Quaternion();

function frameFrom(left: THREE.Vector3, up: THREE.Vector3, out = new THREE.Quaternion()) {
  const u = _fu.copy(up).normalize();
  const l = _fl.copy(left).normalize();
  l.addScaledVector(u, -l.dot(u));
  if (l.lengthSq() < 1e-8) return null;
  l.normalize();
  const f = _ff.crossVectors(l, u);
  return out.setFromRotationMatrix(_fm.makeBasis(l, u, f));
}

function lmVis(lm: LandmarkPoint | undefined): number {
  if (!lm) return 0;
  return typeof lm.visibility === "number" ? lm.visibility : 1;
}

interface RestFrames {
  pelvis?: THREE.Quaternion | null;
  chest?: THREE.Quaternion | null;
  head?: THREE.Quaternion | null;
  hipMid?: THREE.Vector3 | null;
  shMid?: THREE.Vector3 | null;
  leftPalm?: THREE.Vector3;
  rightPalm?: THREE.Vector3;
}

export class DirectRetargeter {
  private points: THREE.Vector3[] = Array.from({ length: 33 }, () => new THREE.Vector3());
  private ok: boolean[] = new Array(33).fill(false);
  private worldByBone = new Map<THREE.Bone, THREE.Quaternion>();
  private worldPool = new Map<string, THREE.Quaternion>();
  private local = new Map<string, THREE.Quaternion>();
  private cache: { rig: RigCharacter | null; frames: RestFrames } = { rig: null, frames: {} };
  private _hipMid = new THREE.Vector3();
  private _shMid = new THREE.Vector3();
  private _earMid = new THREE.Vector3();
  private _dPelvis = new THREE.Quaternion();
  private _dChest = new THREE.Quaternion();
  private _dHead = new THREE.Quaternion();
  private _tq = new THREE.Quaternion();

  private mid(a: number, b: number, out: THREE.Vector3): THREE.Vector3 | null {
    if (!this.ok[a] || !this.ok[b]) return null;
    return out.copy(this.points[a]).add(this.points[b]).multiplyScalar(0.5);
  }

  private restFrames(rig: RigCharacter): RestFrames {
    if (this.cache.rig === rig) return this.cache.frames;
    const P = (k: string) => (rig.bones[k] ? rig.rest.position.get(rig.bones[k]) ?? null : null);
    const frames: RestFrames = {};

    const lh = P("leftUpLeg");
    const rh = P("rightUpLeg");
    const ls = P("leftArm");
    const rs = P("rightArm");
    const hipMid = lh && rh ? _rv1.copy(lh).add(rh).multiplyScalar(0.5).clone() : null;
    const shMid = ls && rs ? _rv2.copy(ls).add(rs).multiplyScalar(0.5).clone() : null;

    if (lh && rh && hipMid && shMid) {
      frames.pelvis = frameFrom(_rv3.copy(lh).sub(rh), _rn1.copy(shMid).sub(hipMid), new THREE.Quaternion());
    }
    if (ls && rs && shMid) {
      const neck = P("neck") ?? P("spine2");
      frames.chest = frameFrom(
        _rv3.copy(ls).sub(rs),
        neck ? _rn1.copy(neck).sub(shMid) : _rn1.set(0, 1, 0),
        new THREE.Quaternion(),
      );
    }
    const head = P("head");
    const neck = P("neck");
    if (head && neck) {
      const leftAxis = ls && rs ? _rv3.copy(ls).sub(rs) : _rv3.set(1, 0, 0);
      frames.head = frameFrom(leftAxis, _rn1.copy(head).sub(neck), new THREE.Quaternion());
    }
    frames.hipMid = hipMid;
    frames.shMid = shMid;

    for (const side of ["left", "right"] as const) {
      const w = P(`${side}Hand`);
      const idx = P(`${side}Index1`);
      const pky = P(`${side}Pinky1`);
      if (w && idx && pky) {
        frames[`${side}Palm`] = new THREE.Vector3()
          .crossVectors(_rv3.copy(idx).sub(w), _rn1.copy(pky).sub(w))
          .normalize();
      }
    }
    this.cache = { rig, frames };
    return frames;
  }

  solveAndApply(
    landmarks: LandmarkPoint[],
    rig: RigCharacter,
    opts: { minVis?: number; mirror?: boolean; smoothing?: number; gains?: Record<string, number> } = {},
  ): boolean {
    if (!landmarks.length || !rig.loaded) return false;
    const minVis = opts.minVis ?? 0.45;
    const mirror = opts.mirror ?? true;
    const gains = opts.gains ?? {};

    for (let i = 0; i < 33; i++) {
      const lm = landmarks[mirror ? SWAP[i] : i];
      const v = lmVis(lm);
      this.ok[i] = Boolean(lm) && v >= minVis;
      if (!lm) continue;
      this.points[i].set(mirror ? -lm.x : lm.x, -lm.y, -(lm.z ?? 0)).applyQuaternion(rig.basis);
    }

    const rest = this.restFrames(rig);
    this.worldByBone.clear();
    const B = rig.bones;
    const RW = (k: string) => (B[k] ? rig.rest.world.get(B[k]) ?? null : null);
    const RP = (k: string) => (B[k] ? rig.rest.position.get(B[k]) ?? null : null);
    const gain = (k: string) => gains[BONE_GROUP_OF[k]] ?? 1;
    const soften = (q: THREE.Quaternion, g: number) => (g >= 0.999 ? q : q.slerp(IDENTITY, 1 - g));

    const parentWorld = (bone: THREE.Bone) => {
      const p = bone.parent as THREE.Bone | null;
      if (p && this.worldByBone.has(p)) return this.worldByBone.get(p)!;
      if (p && rig.rest.world.has(p)) return rig.rest.world.get(p)!;
      const bw = rig.rest.world.get(bone);
      const bl = rig.rest.local.get(bone);
      if (bw && bl) return _rpq.copy(bw).multiply(_rpq2.copy(bl).invert());
      return _rpq.identity();
    };

    const updated = new Set<string>();
    const commit = (key: string, worldQuat: THREE.Quaternion) => {
      const bone = B[key];
      if (!bone) return;
      let w = this.worldPool.get(key);
      if (!w) {
        w = new THREE.Quaternion();
        this.worldPool.set(key, w);
      }
      w.copy(worldQuat);
      this.worldByBone.set(bone, w);
      let loc = this.local.get(key);
      if (!loc) {
        loc = new THREE.Quaternion();
        this.local.set(key, loc);
      }
      loc.copy(parentWorld(bone)).invert().multiply(w);
      updated.add(key);
    };

    const hipMid = this.mid(LM.LEFT_HIP, LM.RIGHT_HIP, this._hipMid);
    const shMid = this.mid(LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, this._shMid);
    const earMid = this.mid(LM.LEFT_EAR, LM.RIGHT_EAR, this._earMid);

    let dPelvis: THREE.Quaternion | null = null;
    if (rest.pelvis && hipMid && shMid) {
      const f = frameFrom(_rv1.copy(this.points[LM.LEFT_HIP]).sub(this.points[LM.RIGHT_HIP]), _rv2.copy(shMid).sub(hipMid), _rq1);
      if (f) dPelvis = soften(this._dPelvis.copy(f).multiply(_rq2.copy(rest.pelvis).invert()), gain("hips"));
    }

    let dChest: THREE.Quaternion | null = null;
    if (rest.chest && shMid) {
      const upRef = earMid ? _rv2.copy(earMid).sub(shMid) : hipMid ? _rv2.copy(shMid).sub(hipMid) : null;
      if (upRef) {
        const f = frameFrom(_rv1.copy(this.points[LM.LEFT_SHOULDER]).sub(this.points[LM.RIGHT_SHOULDER]), upRef, _rq1);
        if (f) dChest = soften(this._dChest.copy(f).multiply(_rq2.copy(rest.chest).invert()), gain("spine2"));
      }
    }

    let dHead: THREE.Quaternion | null = null;
    if (rest.head && earMid && this.ok[LM.NOSE]) {
      const left = _rv1.copy(this.points[LM.LEFT_EAR]).sub(this.points[LM.RIGHT_EAR]);
      const fwd = _rv2.copy(this.points[LM.NOSE]).sub(earMid);
      const up = _rv3.crossVectors(fwd, left);
      const f = frameFrom(left, up, _rq1);
      if (f) dHead = soften(this._dHead.copy(f).multiply(_rq2.copy(rest.head).invert()), gain("head"));
    }

    const base = dPelvis ?? dChest;
    const hipsRW = RW("hips");
    if (dPelvis && hipsRW) commit("hips", _rq1.copy(dPelvis).multiply(hipsRW));
    for (const [key, t] of [["spine", 1 / 3], ["spine1", 2 / 3], ["spine2", 1]] as const) {
      const rw = RW(key);
      if (!rw || !base) continue;
      const d = _rq1.copy(base);
      if (dChest && dPelvis) d.slerp(dChest, t);
      commit(key, d.multiply(rw));
    }
    const neckRW = RW("neck");
    if (neckRW) {
      const d = _rq1.copy(dChest ?? dPelvis ?? IDENTITY);
      if (dHead) d.slerp(dHead, 0.45);
      if (dChest || dPelvis || dHead) commit("neck", d.multiply(neckRW));
    }
    const headRW = RW("head");
    if (dHead && headRW) commit("head", _rq1.copy(dHead).multiply(headRW));

    for (const side of ["left", "right"] as const) {
      const key = `${side}Shoulder`;
      const armKey = `${side}Arm`;
      const idx = side === "left" ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER;
      const rw = RW(key);
      const armRP = RP(armKey);
      if (!rw || !armRP || !rest.shMid || !shMid || !this.ok[idx]) continue;
      const restDir = _rv1.copy(armRP).sub(rest.shMid);
      const liveDir = _rv2.copy(this.points[idx]).sub(shMid);
      if (restDir.lengthSq() < 1e-10 || liveDir.lengthSq() < 1e-10) continue;
      const d = soften(_rq1.setFromUnitVectors(restDir.normalize(), liveDir.normalize()), gain(key) * 0.6);
      commit(key, _rq2.copy(d).multiply(rw));
    }

    const solveChain = (c: LimbChain) => {
      const rw = RW(c.key);
      const rp = RP(c.key);
      const childP = RP(c.child);
      if (!rw || !rp || !childP || !this.ok[c.from]) return;
      const to = c.toMid
        ? this.mid(c.toMid[0], c.toMid[1], _rv3)
        : c.to !== undefined && this.ok[c.to]
          ? this.points[c.to]
          : null;
      if (!to) return;
      const restDir = _rv1.copy(childP).sub(rp);
      const liveDir = _rv2.copy(to).sub(this.points[c.from]);
      if (restDir.lengthSq() < 1e-10 || liveDir.lengthSq() < 1e-10) return;
      const d = soften(_rq1.setFromUnitVectors(restDir.normalize(), liveDir.normalize()), gain(c.key));
      commit(c.key, _rq2.copy(d).multiply(rw));
    };

    for (const c of LIMB_CHAINS) if (!c.late) solveChain(c);

    for (const side of ["left", "right"] as const) {
      const key = `${side}ForeArm`;
      const palmRest = rest[`${side}Palm`];
      const bone = B[key];
      const w = bone ? this.worldByBone.get(bone) : null;
      const handRest = RP(`${side}Hand`);
      const faRP = RP(key);
      const faRW = RW(key);
      if (!palmRest || !w || !handRest || !faRP || !faRW) continue;

      const iIdx = side === "left" ? LM.LEFT_INDEX : LM.RIGHT_INDEX;
      const pIdx = side === "left" ? LM.LEFT_PINKY : LM.RIGHT_PINKY;
      const wIdx = side === "left" ? LM.LEFT_WRIST : LM.RIGHT_WRIST;
      if (!this.ok[iIdx] || !this.ok[pIdx] || !this.ok[wIdx]) continue;

      const delta = this._tq.copy(w).multiply(_rq2.copy(faRW).invert());
      const axis = _rv1.copy(handRest).sub(faRP).normalize().applyQuaternion(delta);
      const nRest = _rv2.copy(palmRest).applyQuaternion(delta);
      const nLive = _rn1.crossVectors(
        _rv3.copy(this.points[iIdx]).sub(this.points[wIdx]),
        _rn2.copy(this.points[pIdx]).sub(this.points[wIdx]),
      );
      if (nLive.lengthSq() < 1e-10) continue;
      nLive.normalize();
      nRest.addScaledVector(axis, -nRest.dot(axis));
      nLive.addScaledVector(axis, -nLive.dot(axis));
      if (nRest.lengthSq() < 1e-8 || nLive.lengthSq() < 1e-8) continue;
      nRest.normalize();
      nLive.normalize();
      const angle = Math.atan2(_rn2.crossVectors(nRest, nLive).dot(axis), nRest.dot(nLive));
      commit(key, _rq1.setFromAxisAngle(axis, angle * gain("hands")).multiply(w));
    }

    for (const c of LIMB_CHAINS) if (c.late) solveChain(c);

    const inertia = Math.min(0.95, Math.max(0, opts.smoothing ?? 0.35));
    const alpha = inertia <= 0.001 ? 1 : 1 - inertia;
    for (const key of updated) {
      const bone = B[key];
      const target = this.local.get(key);
      if (!bone || !target) continue;
      if (alpha >= 1) bone.quaternion.copy(target);
      else bone.quaternion.slerp(target, alpha);
    }
    return updated.size > 0;
  }

  reset(): void {
    this.worldByBone.clear();
  }
}

export function extractRigJointPositions(
  rig: RigCharacter,
  out: Record<string, [number, number, number]>,
): void {
  const v = new THREE.Vector3();
  const readBone = (key: string): THREE.Vector3 | null => {
    const b = rig.bones[key];
    if (!b) return null;
    b.getWorldPosition(v);
    out[key] = [v.x, v.y, v.z];
    return v.clone();
  };

  for (const key of [
    "hips", "spine", "neck", "head",
    "leftShoulder", "leftArm", "leftForeArm", "leftHand",
    "rightShoulder", "rightArm", "rightForeArm", "rightHand",
    "leftUpLeg", "leftLeg", "leftFoot",
    "rightUpLeg", "rightLeg", "rightFoot",
  ]) {
    readBone(key);
  }
  const ch = readBone("spine2") ?? readBone("spine1") ?? readBone("spine");
  if (ch) out.chest = [ch.x, ch.y, ch.z];
}
