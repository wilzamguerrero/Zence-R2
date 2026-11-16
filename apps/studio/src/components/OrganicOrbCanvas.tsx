import { useEffect, useRef } from "react";

type OrganicOrbCanvasProps = {
  size?: number;
  paused?: boolean;
  thinking?: boolean;
  className?: string;
};

/**
 * Figura orgánica animada con ondas op-art en rosado #ae68ad,
 * heredada de la animación de entrada del estudio (con fondo transparente).
 * Cuando `thinking` está activo, traza una línea punteada que sigue su contorno irregular.
 */
export function OrganicOrbCanvas({
  size = 68,
  paused = false,
  thinking = false,
  className = "",
}: OrganicOrbCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thinkingRef = useRef(thinking);
  thinkingRef.current = thinking;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const reduced =
      paused ||
      (typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    const t0 = performance.now();
    let raf = 0;

    // Margen alrededor de la figura para alojar el borde punteado irregular sin recorte
    const coordScale = 1.16;

    function draw(now: number) {
      const elapsedSec = (now - t0) * 0.001;
      const t = reduced ? 0.6 : elapsedSec * 1.4;
      const isThinking = thinkingRef.current;
      let p = 0;

      for (let y = 0; y < h; y += 1) {
        const ny = ((y / h) * 2 - 1) * coordScale;
        for (let x = 0; x < w; x += 1) {
          const nx = ((x / w) * 2 - 1) * coordScale;
          const theta = Math.atan2(ny, nx);
          const r = Math.hypot(nx * 0.96, ny * 1.06);
          const blobR =
            0.66 +
            0.13 * Math.sin(theta * 2 + t * 1.05 + 0.4) +
            0.11 * Math.cos(theta * 3 - t * 0.85 - 0.6) +
            0.05 * Math.sin(theta * 5 + t * 1.35);
          const dist = r - blobR;

          // Anillo punteado exterior siguiendo exactamente la forma irregular cuando piensa/responde
          if (dist > 0.025) {
            if (isThinking && dist >= 0.045 && dist <= 0.112) {
              const radial = 1 - Math.abs(dist - 0.078) / 0.034;
              const dashPhase = reduced ? 0 : elapsedSec * 5.2;
              const dash = Math.sin(theta * 14 - dashPhase);
              const dashMask = dash > 0.12 ? 1 : dash < -0.12 ? 0 : (dash + 0.12) / 0.24;
              const alpha = Math.max(0, Math.min(1, radial * dashMask));
              if (alpha > 0.02) {
                data[p] = 228;
                data[p + 1] = 176;
                data[p + 2] = 227;
                data[p + 3] = Math.round(255 * alpha * 0.95);
                p += 4;
                continue;
              }
            }
            data[p] = 0;
            data[p + 1] = 0;
            data[p + 2] = 0;
            data[p + 3] = 0;
            p += 4;
            continue;
          }

          const dx = nx + 0.48;
          const dy = ny + 0.32;
          const r1 = Math.hypot(dx, dy);
          const r2 = Math.hypot(nx - 0.62, ny - 0.52);
          const warp =
            Math.sin(nx * 2.5 + Math.cos(ny * 2.2 - t * 0.9)) * 0.72 +
            Math.cos(ny * 2.7 - Math.sin(nx * 1.9 + t * 0.75)) * 0.54;
          const field = r1 * 4.5 - r2 * 1.9 + warp - t * 0.85;
          const stripe = Math.sin(field * Math.PI);
          const k = stripe > 0.06 ? 1 : stripe < -0.06 ? 0 : (stripe + 0.06) / 0.12;

          let cr = 32 + (174 - 32) * k;
          let cg = 32 + (104 - 32) * k;
          let cb = 32 + (173 - 32) * k;

          const edgeBand = 1 - Math.min(1, Math.abs(dist) / 0.022);
          const mask = dist < -0.014 ? 1 : dist > 0.025 ? 0 : (0.025 - dist) / 0.039;

          if (edgeBand > 0) {
            cr = cr * (1 - edgeBand) + 46 * edgeBand;
            cg = cg * (1 - edgeBand) + 46 * edgeBand;
            cb = cb * (1 - edgeBand) + 46 * edgeBand;
          }

          data[p] = cr;
          data[p + 1] = cg;
          data[p + 2] = cb;
          data[p + 3] = Math.round(255 * Math.max(mask, edgeBand * 0.85));
          p += 4;
        }
      }
      if (!ctx) return;
      ctx.putImageData(img, 0, 0);
      if (!reduced) raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  return (
    <canvas
      ref={canvasRef}
      width={84}
      height={76}
      className={className}
      style={{ width: `${size}px`, height: `${Math.round(size * 0.91)}px`, display: "block" }}
      aria-hidden="true"
    />
  );
}
