/**
 * Concentrador de medios por nodo (TouchDesigner TOP / SOP File In)
 * Gestiona imágenes, videos, cámara/pantalla y canvas de texto generados desde nodos.
 */
import * as THREE from "three";

export interface NodeMediaEntry {
  nodeId: string;
  kind: "image" | "video" | "stream" | "text";
  label: string;
  slot: number;
  el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  objectUrl?: string;
  stream?: MediaStream;
  active: boolean;
}

class NodeMediaHub {
  private entries = new Map<string, NodeMediaEntry>();
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private createCanvasEntry(
    nodeId: string,
    kind: NodeMediaEntry["kind"],
    label: string,
    slot: number,
    el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    extra: { objectUrl?: string; stream?: MediaStream } = {},
  ): NodeMediaEntry {
    this.stopMedia(nodeId, false);
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const entry: NodeMediaEntry = {
      nodeId,
      kind,
      label,
      slot,
      el,
      canvas,
      ctx,
      texture,
      objectUrl: extra.objectUrl,
      stream: extra.stream,
      active: true,
    };
    this.entries.set(nodeId, entry);
    this.paintEntry(entry);
    this.emit();
    return entry;
  }

  private paintEntry(entry: NodeMediaEntry): boolean {
    if (!entry.active) return false;
    const { el, ctx, canvas } = entry;
    if (el instanceof HTMLImageElement) {
      if (!el.complete || !el.naturalWidth) return false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      entry.texture.needsUpdate = true;
      return true;
    }
    if (el instanceof HTMLVideoElement) {
      if (el.readyState < 2 || !el.videoWidth) return false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      entry.texture.needsUpdate = true;
      return true;
    }
    if (el instanceof HTMLCanvasElement) {
      if (el !== canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      }
      entry.texture.needsUpdate = true;
      return true;
    }
    return false;
  }

  async loadMediaFile(nodeId: string, file: File, slot = 0): Promise<void> {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name);
    if (isVideo) {
      const video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.src = url;
      try {
        await video.play();
      } catch {
        // Autoplay puede quedar pendiente hasta interacción
      }
      this.createCanvasEntry(nodeId, "video", file.name, slot, video, { objectUrl: url });
    } else {
      const img = document.createElement("img");
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Imagen no compatible"));
        img.src = url;
      });
      this.createCanvasEntry(nodeId, "image", file.name, slot, img, { objectUrl: url });
    }
  }

  async startDevice(nodeId: string, mode: "camera" | "screen", slot = 0): Promise<boolean> {
    try {
      const stream =
        mode === "camera"
          ? await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 540 } }, audio: false })
          : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      stream.getVideoTracks()[0]?.addEventListener("ended", () => this.stopMedia(nodeId));
      this.createCanvasEntry(
        nodeId,
        "stream",
        mode === "camera" ? "Cámara web" : "Captura pantalla",
        slot,
        video,
        { stream },
      );
      return true;
    } catch {
      return false;
    }
  }

  syncTextNode(nodeId: string, text: string, fontSize: number, color: string, slot: number): void {
    let entry = this.entries.get(nodeId);
    if (!entry || entry.kind !== "text") {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      entry = {
        nodeId,
        kind: "text",
        label: "Text TOP",
        slot,
        el: canvas,
        canvas,
        ctx: canvas.getContext("2d")!,
        texture: new THREE.CanvasTexture(canvas),
        active: true,
      };
      entry.texture.colorSpace = THREE.SRGBColorSpace;
      this.entries.set(nodeId, entry);
    }
    entry.slot = slot;
    const { ctx, canvas } = entry;
    const sig = `${text}|${fontSize}|${color}`;
    if (canvas.dataset.sig === sig) return;
    canvas.dataset.sig = sig;

    ctx.fillStyle = "#141216";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color || "#cf8acc";
    const px = Math.max(16, Math.min(180, fontSize || 72));
    ctx.font = `800 ${px}px "Syne", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = String(text || "ZENCE R2").split(/\r?\n/);
    const lineHeight = px * 1.15;
    const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, idx) => {
      ctx.fillText(line, canvas.width / 2, startY + idx * lineHeight);
    });
    entry.texture.needsUpdate = true;
  }

  getEntry(nodeId: string): NodeMediaEntry | undefined {
    return this.entries.get(nodeId);
  }

  getThreeTexture(nodeId: string | null): THREE.Texture | null {
    if (!nodeId) return null;
    const entry = this.entries.get(nodeId);
    if (!entry?.active) return null;
    this.paintEntry(entry);
    return entry.texture;
  }

  getActiveBySlot(slot: number): NodeMediaEntry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.active && entry.slot === slot) {
        this.paintEntry(entry);
        return entry;
      }
    }
    return undefined;
  }

  stopMedia(nodeId: string, notify = true): void {
    const prev = this.entries.get(nodeId);
    if (!prev) return;
    if (prev.stream) {
      for (const t of prev.stream.getTracks()) t.stop();
    }
    if (prev.el instanceof HTMLVideoElement) {
      prev.el.pause();
      prev.el.srcObject = null;
      prev.el.removeAttribute("src");
    }
    if (prev.objectUrl) URL.revokeObjectURL(prev.objectUrl);
    prev.texture.dispose();
    this.entries.delete(nodeId);
    if (notify) this.emit();
  }
}

export const nodeMediaHub = new NodeMediaHub();
