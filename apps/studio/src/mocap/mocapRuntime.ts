/**
 * Motor dual de captura de movimiento (Cuerpo completo + Ambas manos)
 * Fuentes soportadas: Camara web, Video e Imagen fija (portado de Posu)
 */
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type HandLandmarkerResult,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import * as THREE from "three";
import { OneEuroFilter } from "./oneEuroFilter.ts";
import {
  computeHandAngles,
  DirectRetargeter,
  resolveHandSide,
  type HandAnglesResult,
  type RigCharacter,
} from "./rigAdapter.ts";
import { SquarePad, type LandmarkPoint } from "./squarePad.ts";

export type MocapSourceKind = "off" | "webcam" | "video" | "image";
export type MocapQuality = "lite" | "full" | "heavy";

const WASM_PATH = `${import.meta.env.BASE_URL}wasm`;
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const POSE_MODELS: Record<MocapQuality, string> = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  heavy:
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
};

export interface HandTrackedState {
  detected: boolean;
  open: number;
  pinch: number;
  spread: number;
  points3D: [number, number, number][];
  angles: HandAnglesResult | null;
}

export interface MocapState {
  active: boolean;
  loading: boolean;
  sourceKind: MocapSourceKind;
  sourceLabel: string;
  bodyEnabled: boolean;
  handsEnabled: boolean;
  mirror: boolean;
  smoothing: number;
  quality: MocapQuality;
  statusMessage: string;
  error: string;
  poseDetected: boolean;
  poseConfidence: number;
  handsDetected: number;
  activity: number;
  headY: number;
  handsDist: number;
  joints: Record<string, [number, number, number]>;
  leftHand: HandTrackedState;
  rightHand: HandTrackedState;
}

const SWAP_INDICES: Record<number, number> = {
  7: 8, 8: 7, 11: 12, 12: 11, 13: 14, 14: 13, 15: 16, 16: 15,
  17: 18, 18: 17, 19: 20, 20: 19, 21: 22, 22: 21,
  23: 24, 24: 23, 25: 26, 26: 25, 27: 28, 28: 27, 31: 32, 32: 31,
};

function emptyHand(): HandTrackedState {
  return {
    detected: false,
    open: 0,
    pinch: 0,
    spread: 0,
    points3D: [],
    angles: null,
  };
}

export class MocapController {
  state: MocapState = {
    active: false,
    loading: false,
    sourceKind: "off",
    sourceLabel: "",
    bodyEnabled: true,
    handsEnabled: true,
    mirror: true,
    smoothing: 0.35,
    quality: "lite",
    statusMessage: "Sin fuente activa",
    error: "",
    poseDetected: false,
    poseConfidence: 0,
    handsDetected: 0,
    activity: 0,
    headY: 0,
    handsDist: 0,
    joints: {},
    leftHand: emptyHand(),
    rightHand: emptyHand(),
  };

  video: HTMLVideoElement;
  image: HTMLImageElement;
  private stream: MediaStream | null = null;
  private objectUrl: string | null = null;
  private fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private poseMode: "VIDEO" | "IMAGE" | null = null;
  private handMode: "VIDEO" | "IMAGE" | null = null;
  private poseQualityLoaded: MocapQuality | null = null;
  private delegate: "GPU" | "CPU" = "GPU";
  private posePad = new SquarePad(512);
  private handPad = new SquarePad(384);
  private filterPose = new OneEuroFilter({ freq: 30, minCutoff: 1.4, beta: 0.45 });
  private retargeter = new DirectRetargeter();
  private lastPoseResult: { landmarks: LandmarkPoint[]; worldLandmarks: LandmarkPoint[] } | null = null;
  private lastHandResult: {
    landmarks: LandmarkPoint[][];
    worldLandmarks: LandmarkPoint[][];
    labels: string[];
  } | null = null;
  private prevJoints = new Map<string, [number, number, number]>();
  private lastTickMs = 0;
  private lastPoseDetectMs = 0;
  private lastHandDetectMs = 0;
  private lastVideoTime = -1;
  private notifyTimer = 0;
  private listeners = new Set<() => void>();

  constructor() {
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.loop = true;
    this.image = document.createElement("img");
    this.image.crossOrigin = "anonymous";
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(force = false): void {
    const now = performance.now();
    if (!force && now - this.notifyTimer < 110) return;
    this.notifyTimer = now;
    for (const fn of this.listeners) fn();
  }

  setOptions(partial: Partial<Pick<MocapState, "bodyEnabled" | "handsEnabled" | "mirror" | "smoothing" | "quality">>): void {
    Object.assign(this.state, partial);
    if (!this.state.bodyEnabled) {
      this.state.poseDetected = false;
      this.state.poseConfidence = 0;
      this.state.joints = {};
    }
    if (!this.state.handsEnabled) {
      this.state.handsDetected = 0;
      this.state.leftHand = emptyHand();
      this.state.rightHand = emptyHand();
    }
    if (this.state.sourceKind === "image" && this.state.active) {
      void this.refreshStillDetection();
    }
    this.emit(true);
  }

  private async getFileset() {
    if (!this.fileset) {
      this.state.statusMessage = "Cargando runtime WASM de MediaPipe…";
      this.emit(true);
      this.fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    }
    return this.fileset;
  }

  private async ensurePose(mode: "VIDEO" | "IMAGE"): Promise<PoseLandmarker> {
    if (this.poseLandmarker && this.poseMode === mode && this.poseQualityLoaded === this.state.quality) {
      return this.poseLandmarker;
    }
    const fileset = await this.getFileset();
    this.poseLandmarker?.close?.();
    this.poseLandmarker = null;
    this.state.statusMessage = `Cargando modelo Pose (${this.state.quality})…`;
    this.emit(true);

    try {
      this.poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODELS[this.state.quality], delegate: this.delegate },
        runningMode: mode,
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
    } catch {
      this.delegate = "CPU";
      this.poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODELS[this.state.quality], delegate: "CPU" },
        runningMode: mode,
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
    }
    this.poseMode = mode;
    this.poseQualityLoaded = this.state.quality;
    return this.poseLandmarker;
  }

  private async ensureHands(mode: "VIDEO" | "IMAGE"): Promise<HandLandmarker> {
    if (this.handLandmarker && this.handMode === mode) {
      return this.handLandmarker;
    }
    const fileset = await this.getFileset();
    this.handLandmarker?.close?.();
    this.handLandmarker = null;
    this.state.statusMessage = "Cargando modelo Hand Landmarker…";
    this.emit(true);

    try {
      this.handLandmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: this.delegate },
        runningMode: mode,
        numHands: 2,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
    } catch {
      this.delegate = "CPU";
      this.handLandmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: "CPU" },
        runningMode: mode,
        numHands: 2,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
    }
    this.handMode = mode;
    return this.handLandmarker;
  }

  private async prepareModels(mode: "VIDEO" | "IMAGE"): Promise<void> {
    this.state.loading = true;
    this.state.error = "";
    this.emit(true);
    try {
      if (this.state.bodyEnabled) await this.ensurePose(mode);
      if (this.state.handsEnabled) await this.ensureHands(mode);
      this.state.statusMessage = "Tracking activo";
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : String(err);
      this.state.statusMessage = `Error MediaPipe: ${this.state.error}`;
    } finally {
      this.state.loading = false;
      this.emit(true);
    }
  }

  async startWebcam(): Promise<boolean> {
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      this.state.error = "Este navegador no soporta camara web";
      this.state.statusMessage = this.state.error;
      this.emit(true);
      return false;
    }
    this.state.loading = true;
    this.state.error = "";
    this.state.statusMessage = "Solicitando acceso a la camara…";
    this.emit(true);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.state.sourceKind = "webcam";
      this.state.sourceLabel = "Camara web";
      this.state.active = true;
      await this.prepareModels("VIDEO");
      return true;
    } catch (err) {
      this.state.loading = false;
      this.state.error = err instanceof Error ? err.message : String(err);
      this.state.statusMessage = `Camara no disponible: ${this.state.error}`;
      this.emit(true);
      return false;
    }
  }

  async loadFile(file: File): Promise<boolean> {
    this.stop();
    this.objectUrl = URL.createObjectURL(file);
    const isImage =
      file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);

    this.state.loading = true;
    this.state.error = "";
    this.state.sourceLabel = file.name;
    this.emit(true);

    if (isImage) {
      const ok = await new Promise<boolean>((resolve) => {
        this.image.onload = () => resolve(true);
        this.image.onerror = () => resolve(false);
        this.image.src = this.objectUrl!;
      });
      if (!ok) {
        this.state.loading = false;
        this.state.error = "No se pudo leer la imagen";
        this.state.statusMessage = this.state.error;
        this.emit(true);
        return false;
      }
      this.state.sourceKind = "image";
      this.state.active = true;
      await this.prepareModels("IMAGE");
      await this.refreshStillDetection();
      return true;
    }

    try {
      this.video.srcObject = null;
      this.video.src = this.objectUrl;
      await new Promise<void>((resolve, reject) => {
        if (this.video.readyState >= 2) return resolve();
        const ok = () => {
          cleanup();
          resolve();
        };
        const bad = () => {
          cleanup();
          reject(new Error("Formato de video no compatible"));
        };
        const cleanup = () => {
          this.video.removeEventListener("loadeddata", ok);
          this.video.removeEventListener("error", bad);
        };
        this.video.addEventListener("loadeddata", ok, { once: true });
        this.video.addEventListener("error", bad, { once: true });
      });
      await this.video.play();
      this.state.sourceKind = "video";
      this.state.active = true;
      await this.prepareModels("VIDEO");
      return true;
    } catch (err) {
      this.state.loading = false;
      this.state.error = err instanceof Error ? err.message : String(err);
      this.state.statusMessage = this.state.error;
      this.emit(true);
      return false;
    }
  }

  private async refreshStillDetection(): Promise<void> {
    if (this.state.sourceKind !== "image" || !this.state.active) return;
    if (this.state.bodyEnabled) {
      const pose = await this.ensurePose("IMAGE");
      const pad = this.posePad.input(this.image) ?? this.image;
      const res: PoseLandmarkerResult = pose.detect(pad);
      const lms = res.landmarks?.[0];
      if (lms?.length) {
        this.lastPoseResult = {
          landmarks: this.posePad.pad ? this.posePad.unpad(lms) : lms,
          worldLandmarks: res.worldLandmarks?.[0] ?? lms,
        };
      } else {
        this.lastPoseResult = null;
      }
    }
    if (this.state.handsEnabled) {
      const hand = await this.ensureHands("IMAGE");
      const pad = this.handPad.input(this.image) ?? this.image;
      const res: HandLandmarkerResult = hand.detect(pad);
      this.lastHandResult = {
        landmarks: (res.landmarks ?? []).map((h) => (this.handPad.pad ? this.handPad.unpad(h) : h)),
        worldLandmarks: res.worldLandmarks ?? [],
        labels: (res.handedness ?? []).map((arr) => arr?.[0]?.categoryName ?? ""),
      };
    }
    this.syncOutputs(1 / 30);
    this.emit(true);
  }

  step(rig: RigCharacter | null): void {
    const now = performance.now();
    const dt = this.lastTickMs > 0 ? Math.min(0.2, Math.max(1 / 180, (now - this.lastTickMs) / 1000)) : 1 / 60;
    this.lastTickMs = now;

    if (!this.state.active) return;

    if (this.state.sourceKind === "webcam" || this.state.sourceKind === "video") {
      if (this.video.readyState >= 2 && this.video.videoWidth > 0) {
        const videoTime = this.video.currentTime;
        const freshFrame = videoTime !== this.lastVideoTime || this.state.sourceKind === "webcam";
        if (freshFrame) {
          this.lastVideoTime = videoTime;
          if (this.state.bodyEnabled && this.poseLandmarker && this.poseMode === "VIDEO") {
            const interval = this.delegate === "CPU" ? 45 : 22;
            if (now - this.lastPoseDetectMs >= interval) {
              this.lastPoseDetectMs = now;
              try {
                const input = this.delegate === "CPU" ? (this.posePad.input(this.video) ?? this.video) : this.video;
                if (this.delegate !== "CPU") this.posePad.reset();
                const res = this.poseLandmarker.detectForVideo(input, now);
                const lms = res.landmarks?.[0];
                if (lms?.length) {
                  this.lastPoseResult = {
                    landmarks: this.posePad.pad ? this.posePad.unpad(lms) : lms,
                    worldLandmarks: res.worldLandmarks?.[0] ?? lms,
                  };
                } else {
                  this.lastPoseResult = null;
                }
              } catch {
                // Ignora fotograma puntual si el video reinicia loop
              }
            }
          }

          if (this.state.handsEnabled && this.handLandmarker && this.handMode === "VIDEO") {
            const interval = this.delegate === "CPU" ? 70 : 28;
            if (now - this.lastHandDetectMs >= interval) {
              this.lastHandDetectMs = now;
              try {
                const input = this.delegate === "CPU" ? (this.handPad.input(this.video) ?? this.video) : this.video;
                if (this.delegate !== "CPU") this.handPad.reset();
                const res = this.handLandmarker.detectForVideo(input, now);
                this.lastHandResult = {
                  landmarks: (res.landmarks ?? []).map((h) => (this.handPad.pad ? this.handPad.unpad(h) : h)),
                  worldLandmarks: res.worldLandmarks ?? [],
                  labels: (res.handedness ?? []).map((arr) => arr?.[0]?.categoryName ?? ""),
                };
              } catch {
                // Ignora fotograma puntual
              }
            }
          }
        }
      }
    }

    this.syncOutputs(dt, rig);
  }

  private syncOutputs(dt: number, rig: RigCharacter | null = null): void {
    const mirror = this.state.mirror;
    const poseFrame = this.state.bodyEnabled ? this.lastPoseResult : null;

    if (poseFrame?.landmarks?.length) {
      const world = poseFrame.worldLandmarks?.length ? poseFrame.worldLandmarks : poseFrame.landmarks;
      const smoothed: LandmarkPoint[] = world.map((p, idx) => {
        const v = new THREE.Vector3(p.x, p.y, p.z ?? 0);
        this.filterPose.vector(`p${idx}`, v, dt);
        return { x: v.x, y: v.y, z: v.z, visibility: p.visibility ?? 1 };
      });

      let confSum = 0;
      const scale = 1.65;
      const nextJoints: Record<string, [number, number, number]> = {};
      const pt = (idx: number): [number, number, number] => {
        const mappedIdx = mirror ? (SWAP_INDICES[idx] ?? idx) : idx;
        const p = smoothed[mappedIdx] ?? smoothed[idx];
        const rx = mirror ? -p.x : p.x;
        return [rx * scale, -p.y * scale + 0.15, -(p.z ?? 0) * scale];
      };
      const avg = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [
        (a[0] + b[0]) * 0.5,
        (a[1] + b[1]) * 0.5,
        (a[2] + b[2]) * 0.5,
      ];
      for (const p of smoothed) confSum += p.visibility ?? 1;

      const lHip = pt(23);
      const rHip = pt(24);
      const lSh = pt(11);
      const rSh = pt(12);
      const lEar = pt(7);
      const rEar = pt(8);
      const hips = avg(lHip, rHip);
      const chest = avg(lSh, rSh);
      const spine = avg(hips, chest);
      const earMid = avg(lEar, rEar);
      const neck = avg(chest, earMid);

      nextJoints.hips = hips;
      nextJoints.spine = spine;
      nextJoints.chest = chest;
      nextJoints.neck = neck;
      nextJoints.head = pt(0);
      nextJoints.leftShoulder = lSh;
      nextJoints.leftArm = lSh;
      nextJoints.leftForeArm = pt(13);
      nextJoints.leftHand = pt(15);
      nextJoints.rightShoulder = rSh;
      nextJoints.rightArm = rSh;
      nextJoints.rightForeArm = pt(14);
      nextJoints.rightHand = pt(16);
      nextJoints.leftUpLeg = lHip;
      nextJoints.leftLeg = pt(25);
      nextJoints.leftFoot = pt(27);
      nextJoints.rightUpLeg = rHip;
      nextJoints.rightLeg = pt(26);
      nextJoints.rightFoot = pt(28);

      let motion = 0;
      let nMotion = 0;
      for (const [k, pos] of Object.entries(nextJoints)) {
        const prev = this.prevJoints.get(k);
        if (prev) {
          motion += Math.hypot(pos[0] - prev[0], pos[1] - prev[1], pos[2] - prev[2]);
          nMotion++;
        }
        this.prevJoints.set(k, pos);
      }

      const lh = nextJoints.leftHand;
      const rh = nextJoints.rightHand;
      this.state.poseDetected = true;
      this.state.poseConfidence = confSum / smoothed.length;
      this.state.joints = nextJoints;
      this.state.headY = nextJoints.head[1];
      this.state.handsDist = Math.hypot(lh[0] - rh[0], lh[1] - rh[1], lh[2] - rh[2]);
      const instActivity = nMotion > 0 ? Math.min(1, (motion / nMotion) / Math.max(dt, 0.01) * 0.45) : 0;
      this.state.activity = this.state.activity * 0.8 + instActivity * 0.2;

      if (rig?.loaded) {
        this.retargeter.solveAndApply(smoothed, rig, {
          minVis: 0.4,
          mirror,
          smoothing: this.state.smoothing,
        });
      }
    } else {
      this.state.poseDetected = false;
      this.state.poseConfidence = 0;
      this.state.activity *= 0.88;
      this.state.joints = {};
    }

    // Manos (21 puntos por mano + dedos en el rig si existe)
    let leftState = emptyHand();
    let rightState = emptyHand();
    let handsFound = 0;

    if (this.state.handsEnabled && this.lastHandResult?.landmarks.length) {
      const done = new Set<"left" | "right">();
      for (let i = 0; i < this.lastHandResult.landmarks.length; i++) {
        const norm = this.lastHandResult.landmarks[i];
        const metric = this.lastHandResult.worldLandmarks[i] ?? norm;
        const label = this.lastHandResult.labels[i] ?? "";
        const angles = computeHandAngles(metric);
        if (!angles) continue;
        const side = resolveHandSide(norm[0], poseFrame?.landmarks ?? null, label, mirror);
        if (done.has(side)) continue;
        done.add(side);
        handsFound++;

        const anchor = this.state.joints[`${side}Hand`] ?? [side === "left" ? -0.55 : 0.55, 0.35, 0.2];
        const w0 = metric[0];
        const handScale = 1.85;
        const points3D: [number, number, number][] = metric.map((pt) => [
          anchor[0] + (mirror ? -(pt.x - w0.x) : pt.x - w0.x) * handScale,
          anchor[1] - (pt.y - w0.y) * handScale,
          anchor[2] - ((pt.z ?? 0) - (w0.z ?? 0)) * handScale,
        ]);

        const handObj: HandTrackedState = {
          detected: true,
          open: angles.openness,
          pinch: angles.pinch,
          spread: Math.min(1, angles.spread / 0.38),
          points3D,
          angles,
        };
        if (side === "left") leftState = handObj;
        else rightState = handObj;

        if (rig?.loaded && rig.handRig.ready) {
          rig.handRig.applyAngles(side, angles, 1 - Math.min(0.85, this.state.smoothing));
        }
      }
    }

    this.state.leftHand = leftState;
    this.state.rightHand = rightState;
    this.state.handsDetected = handsFound;
    this.emit(false);
  }

  stop(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.pause();
    this.video.srcObject = null;
    if (this.video.src) this.video.removeAttribute("src");
    this.video.load();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.filterPose.reset();
    this.retargeter.reset();
    this.lastPoseResult = null;
    this.lastHandResult = null;
    this.state.active = false;
    this.state.loading = false;
    this.state.sourceKind = "off";
    this.state.sourceLabel = "";
    this.state.statusMessage = "Sin fuente activa";
    this.state.poseDetected = false;
    this.state.poseConfidence = 0;
    this.state.handsDetected = 0;
    this.state.activity = 0;
    this.state.joints = {};
    this.state.leftHand = emptyHand();
    this.state.rightHand = emptyHand();
    this.emit(true);
  }

  dispose(): void {
    this.stop();
    this.poseLandmarker?.close?.();
    this.handLandmarker?.close?.();
    this.poseLandmarker = null;
    this.handLandmarker = null;
    this.posePad.dispose();
    this.handPad.dispose();
    this.listeners.clear();
  }
}

export const sharedMocap = new MocapController();
