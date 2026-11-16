import { useEffect, useRef } from "react";

/**
 * Cuadrado superior izquierdo con ondas op-art (#202020 / #ae68ad)
 * que reproduce su animacion de forma aleatoria cada cierto intervalo.
 */
export function BrandMark() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const triggerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let phase = 0.7;
    let timerId = 0;
    let rafId = 0;
    let animating = false;

    function renderFrame(t: number) {
      let p = 0;
      for (let y = 0; y < h; y++) {
        const ny = (y / h) * 2 - 1;
        for (let x = 0; x < w; x++) {
          const nx = (x / w) * 2 - 1;
          const r1 = Math.hypot(nx + 0.55, ny + 0.35);
          const r2 = Math.hypot(nx - 0.65, ny - 0.55);
          const warp =
            Math.sin(nx * 2.4 + Math.cos(ny * 2.1 - t * 0.9)) * 0.72 +
            Math.cos(ny * 2.7 - Math.sin(nx * 1.9 + t * 0.75)) * 0.54;
          const field = r1 * 4.4 - r2 * 1.95 + warp - t * 0.85;
          const stripe = Math.sin(field * Math.PI);
          const k = stripe > 0.08 ? 1 : stripe < -0.08 ? 0 : (stripe + 0.08) / 0.16;
          data[p] = 32 + (174 - 32) * k;
          data[p + 1] = 32 + (104 - 32) * k;
          data[p + 2] = 32 + (173 - 32) * k;
          data[p + 3] = 255;
          p += 4;
        }
      }
      ctx!.putImageData(img, 0, 0);
    }

    function playBurst() {
      if (reduced || animating) return;
      animating = true;
      const startPhase = phase;
      const dir = Math.random() < 0.25 ? -1 : 1;
      const travel = (1.3 + Math.random() * 1.6) * dir;
      const duration = 1350 + Math.random() * 1100;
      const startTime = performance.now();

      const step = (now: number) => {
        const raw = Math.min(1, (now - startTime) / duration);
        const eased = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
        phase = startPhase + travel * eased;
        renderFrame(phase);
        if (raw < 1) {
          rafId = requestAnimationFrame(step);
        } else {
          animating = false;
          scheduleNext();
        }
      };
      rafId = requestAnimationFrame(step);
    }

    function scheduleNext() {
      if (reduced) return;
      window.clearTimeout(timerId);
      const wait = 3200 + Math.random() * 5800;
      timerId = window.setTimeout(playBurst, wait);
    }

    triggerRef.current = playBurst;
    renderFrame(phase);
    scheduleNext();

    return () => {
      window.clearTimeout(timerId);
      cancelAnimationFrame(rafId);
      triggerRef.current = null;
    };
  }, []);

  return (
    <span
      className="brand-symbol"
      aria-hidden="true"
      onMouseEnter={() => triggerRef.current?.()}
    >
      <canvas ref={canvasRef} width={44} height={44} className="brand-canvas" />
    </span>
  );
}
