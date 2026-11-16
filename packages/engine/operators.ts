/**
 * Helpers deterministas para operadores CHOP, SOP, POP y DAT
 */

export type Point3 = { x: number; y: number; z: number };

export function sampleNoiseChop(seed: number, rate: number, time: number): number {
  const phase = time * rate + seed * 0.137;
  const n =
    Math.sin(phase * 1.7 + Math.cos(phase * 0.83)) * 0.52 +
    Math.sin(phase * 3.1 + seed * 0.41) * 0.31 +
    Math.cos(phase * 5.7 - seed * 0.29) * 0.17;
  return n;
}

/**
 * Evaluador matemático determinista y seguro para `dat.evaluate` (sin eval).
 * Soporta variables `x` (entrada CHOP), `t` (tiempo en segundos) y expresiones
 * simples con +, -, *, /, ^, paréntesis y funciones sin, cos, abs, sqrt, min, max, clamp.
 */
export function evaluateSafeExpr(expr: string, x: number, t: number): number {
  const src = String(expr ?? "").trim();
  if (!src) return x;

  let pos = 0;
  const skipWs = () => {
    while (pos < src.length && /\s/.test(src[pos])) pos++;
  };

  function parseExpr(): number {
    let val = parseTerm();
    while (true) {
      skipWs();
      const ch = src[pos];
      if (ch === "+") {
        pos++;
        val += parseTerm();
      } else if (ch === "-") {
        pos++;
        val -= parseTerm();
      } else {
        break;
      }
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseFactor();
    while (true) {
      skipWs();
      const ch = src[pos];
      if (ch === "*") {
        pos++;
        val *= parseFactor();
      } else if (ch === "/") {
        pos++;
        const d = parseFactor();
        val = Math.abs(d) < 1e-9 ? 0 : val / d;
      } else {
        break;
      }
    }
    return val;
  }

  function parseFactor(): number {
    skipWs();
    if (src[pos] === "-") {
      pos++;
      return -parseFactor();
    }
    if (src[pos] === "+") {
      pos++;
      return parseFactor();
    }
    if (src[pos] === "(") {
      pos++;
      const inner = parseExpr();
      skipWs();
      if (src[pos] === ")") pos++;
      return inner;
    }

    const numMatch = src.slice(pos).match(/^(?:\d+\.?\d*|\.\d+)/);
    if (numMatch) {
      pos += numMatch[0].length;
      return Number(numMatch[0]);
    }

    const idMatch = src.slice(pos).match(/^[A-Za-z_]\w*/);
    if (idMatch) {
      const ident = idMatch[0].toLowerCase();
      pos += idMatch[0].length;
      skipWs();
      if (src[pos] === "(") {
        pos++;
        const args: number[] = [];
        skipWs();
        if (src[pos] !== ")") {
          args.push(parseExpr());
          while (true) {
            skipWs();
            if (src[pos] === ",") {
              pos++;
              args.push(parseExpr());
            } else {
              break;
            }
          }
        }
        skipWs();
        if (src[pos] === ")") pos++;
        const a = args[0] ?? 0;
        const b = args[1] ?? 0;
        const c = args[2] ?? 1;
        switch (ident) {
          case "sin":
            return Math.sin(a);
          case "cos":
            return Math.cos(a);
          case "tan":
            return Math.tan(a);
          case "abs":
            return Math.abs(a);
          case "sqrt":
            return Math.sqrt(Math.max(0, a));
          case "floor":
            return Math.floor(a);
          case "ceil":
            return Math.ceil(a);
          case "round":
            return Math.round(a);
          case "min":
            return Math.min(a, b);
          case "max":
            return Math.max(a, b);
          case "pow":
            return Math.pow(a, b);
          case "clamp":
            return Math.min(Math.max(a, b), Math.max(b, c));
          default:
            return 0;
        }
      }
      if (ident === "x") return x;
      if (ident === "t" || ident === "time") return t;
      if (ident === "pi") return Math.PI;
      if (ident === "e") return Math.E;
      return 0;
    }
    return 0;
  }

  const out = parseExpr();
  return Number.isFinite(out) ? out : 0;
}

export function readTableCell(csv: string, row: number, col: number): { text: string; num: number } {
  const rows = String(csv ?? "")
    .split(/\r?\n/)
    .map((line) => line.split(",").map((c) => c.trim()));
  const r = Math.max(0, Math.min(rows.length - 1, Math.floor(row)));
  const cols = rows[r] ?? [];
  const c = Math.max(0, Math.min(cols.length - 1, Math.floor(col)));
  const text = cols[c] ?? "";
  const parsed = Number(text);
  return { text, num: Number.isFinite(parsed) ? parsed : 0 };
}

export type SopShapeSpec = {
  primitive: "sphere" | "box" | "torus" | "grid" | "fileIn";
  radius: number;
  tube: number;
  width: number;
  height: number;
  depth: number;
  size: number;
  segments: number;
  scale: number;
  tx: number;
  ty: number;
  tz: number;
  rx: number;
  ry: number;
  rz: number;
  noiseAmp: number;
  noiseFreq: number;
  noiseSpeed: number;
};

export function sampleSopSurfacePoint(
  shape: SopShapeSpec,
  u: number,
  v: number,
  w: number,
  time: number,
): Point3 {
  let x = 0;
  let y = 0;
  let z = 0;

  if (shape.primitive === "box") {
    const face = Math.floor(w * 6) % 6;
    const a = (u - 0.5) * shape.width;
    const b = (v - 0.5) * shape.height;
    const c = (u - 0.5) * shape.depth;
    if (face === 0) { x = shape.width * 0.5; y = b; z = (v - 0.5) * shape.depth; }
    else if (face === 1) { x = -shape.width * 0.5; y = b; z = (v - 0.5) * shape.depth; }
    else if (face === 2) { x = a; y = shape.height * 0.5; z = (v - 0.5) * shape.depth; }
    else if (face === 3) { x = a; y = -shape.height * 0.5; z = (v - 0.5) * shape.depth; }
    else if (face === 4) { x = a; y = b; z = shape.depth * 0.5; }
    else { x = c; y = b; z = -shape.depth * 0.5; }
  } else if (shape.primitive === "torus") {
    const phi = u * Math.PI * 2;
    const theta = v * Math.PI * 2;
    const r = shape.radius + shape.tube * Math.cos(theta);
    x = r * Math.cos(phi);
    y = shape.tube * Math.sin(theta);
    z = r * Math.sin(phi);
  } else if (shape.primitive === "grid") {
    x = (u - 0.5) * shape.size;
    y = 0;
    z = (v - 0.5) * shape.size;
  } else {
    // sphere / fileIn fallback
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    x = shape.radius * Math.sin(phi) * Math.cos(theta);
    y = shape.radius * Math.cos(phi);
    z = shape.radius * Math.sin(phi) * Math.sin(theta);
  }

  if (shape.noiseAmp !== 0) {
    const ph = time * shape.noiseSpeed;
    const disp =
      Math.sin(x * shape.noiseFreq + ph) *
      Math.cos(y * shape.noiseFreq - ph * 0.7) *
      Math.sin(z * shape.noiseFreq + ph * 0.5) *
      shape.noiseAmp;
    const len = Math.hypot(x, y, z) || 1;
    x += (x / len) * disp;
    y += (y / len) * disp + (shape.primitive === "grid" ? disp : 0);
    z += (z / len) * disp;
  }

  x *= shape.scale;
  y *= shape.scale;
  z *= shape.scale;

  // Rotación Euler simple Y -> X -> Z
  if (shape.ry !== 0) {
    const c = Math.cos(shape.ry);
    const s = Math.sin(shape.ry);
    const nx = x * c + z * s;
    const nz = -x * s + z * c;
    x = nx;
    z = nz;
  }
  if (shape.rx !== 0) {
    const c = Math.cos(shape.rx);
    const s = Math.sin(shape.rx);
    const ny = y * c - z * s;
    const nz = y * s + z * c;
    y = ny;
    z = nz;
  }
  if (shape.rz !== 0) {
    const c = Math.cos(shape.rz);
    const s = Math.sin(shape.rz);
    const nx = x * c - y * s;
    const ny = x * s + y * c;
    x = nx;
    y = ny;
  }

  return { x: x + shape.tx, y: y + shape.ty, z: z + shape.tz };
}
