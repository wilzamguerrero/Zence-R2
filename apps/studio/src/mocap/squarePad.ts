/**
 * SquarePad: encuadre cuadrado para inferencia MediaPipe sin errores NORM_RECT/ROI.
 */
export interface PadRect {
  S: number;
  offX: number;
  offY: number;
  w: number;
  h: number;
}

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
}

export function mediaSizeOf(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null): {
  w: number;
  h: number;
} {
  if (!el) return { w: 0, h: 0 };
  const vid = el as HTMLVideoElement;
  const img = el as HTMLImageElement;
  const w = vid.videoWidth || img.naturalWidth || el.width || 0;
  const h = vid.videoHeight || img.naturalHeight || el.height || 0;
  return { w, h };
}

export class SquarePad {
  max: number;
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  pad: PadRect | null = null;

  constructor(max = 512) {
    this.max = max;
  }

  input(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null, max = this.max): HTMLCanvasElement | null {
    const { w, h } = mediaSizeOf(el);
    if (!el || !w || !h) return null;
    const lado = Math.max(w, h);
    const k = Math.min(1, max / lado);
    const S = Math.round(lado * k);
    const w2 = Math.max(1, Math.round(w * k));
    const h2 = Math.max(1, Math.round(h * k));
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d", { alpha: false, willReadFrequently: false });
    }
    if (!this.ctx) return null;
    if (this.canvas.width !== S || this.canvas.height !== S) {
      this.canvas.width = S;
      this.canvas.height = S;
    }
    const offX = Math.round((S - w2) / 2);
    const offY = Math.round((S - h2) / 2);
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, S, S);
    this.ctx.drawImage(el, offX, offY, w2, h2);
    this.pad = { S, offX, offY, w: w2, h: h2 };
    return this.canvas;
  }

  unpad<T extends LandmarkPoint>(list: T[]): T[] {
    const pad = this.pad;
    if (!Array.isArray(list) || !pad) return list;
    const { S, offX, offY, w, h } = pad;
    return list.map((p) => ({
      ...p,
      x: (p.x * S - offX) / w,
      y: (p.y * S - offY) / h,
      z: typeof p.z === "number" ? (p.z * S) / w : p.z,
    }));
  }

  reset(): void {
    this.pad = null;
  }

  dispose(): void {
    this.canvas = null;
    this.ctx = null;
    this.pad = null;
  }
}
