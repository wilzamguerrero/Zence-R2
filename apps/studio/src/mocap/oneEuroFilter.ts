/**
 * Filtro One-Euro adaptativo para suavizar coordenadas de mocap sin añadir retardo en movimientos rapidos.
 */
import type * as THREE from "three";

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

class ScalarFilter {
  minCutoff: number;
  beta: number;
  dCutoff: number;
  x: number | null = null;
  dx = 0;

  constructor(minCutoff: number, beta: number, dCutoff: number) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  filter(value: number, dt: number): number {
    if (this.x === null) {
      this.x = value;
      return value;
    }
    const dxRaw = (value - this.x) / dt;
    const aD = alpha(this.dCutoff, dt);
    this.dx = aD * dxRaw + (1 - aD) * this.dx;

    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = alpha(cutoff, dt);
    this.x = a * value + (1 - a) * this.x;
    return this.x;
  }

  reset(): void {
    this.x = null;
    this.dx = 0;
  }
}

export class OneEuroFilter {
  freq: number;
  minCutoff: number;
  beta: number;
  dCutoff: number;
  private channels = new Map<string, ScalarFilter>();

  constructor(opts: { freq?: number; minCutoff?: number; beta?: number; dCutoff?: number } = {}) {
    this.freq = opts.freq ?? 30;
    this.minCutoff = opts.minCutoff ?? 1.2;
    this.beta = opts.beta ?? 0.35;
    this.dCutoff = opts.dCutoff ?? 1;
  }

  configure(opts: { freq?: number; minCutoff?: number; beta?: number; dCutoff?: number }): void {
    if (opts.freq !== undefined) this.freq = opts.freq;
    if (opts.minCutoff !== undefined) this.minCutoff = opts.minCutoff;
    if (opts.beta !== undefined) this.beta = opts.beta;
    if (opts.dCutoff !== undefined) this.dCutoff = opts.dCutoff;
    for (const ch of this.channels.values()) {
      ch.minCutoff = this.minCutoff;
      ch.beta = this.beta;
      ch.dCutoff = this.dCutoff;
    }
  }

  value(key: string, v: number, dt = 1 / this.freq): number {
    let ch = this.channels.get(key);
    if (!ch) {
      ch = new ScalarFilter(this.minCutoff, this.beta, this.dCutoff);
      this.channels.set(key, ch);
    }
    return ch.filter(v, Math.max(dt, 1e-3));
  }

  vector(key: string, vec: THREE.Vector3, dt: number): THREE.Vector3 {
    vec.x = this.value(`${key}.x`, vec.x, dt);
    vec.y = this.value(`${key}.y`, vec.y, dt);
    vec.z = this.value(`${key}.z`, vec.z, dt);
    return vec;
  }

  reset(): void {
    for (const ch of this.channels.values()) ch.reset();
  }
}
