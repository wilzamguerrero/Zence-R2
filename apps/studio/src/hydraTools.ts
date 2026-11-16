import { javascriptLanguage } from "@codemirror/lang-javascript";
import type { Completion, CompletionContext } from "@codemirror/autocomplete";
import {
  Decoration,
  EditorView,
  StateEffect,
  StateField,
  keymap,
} from "@uiw/react-codemirror";
import type { DecorationSet, Extension } from "@uiw/react-codemirror";

const hydraCompletions: Completion[] = [
  // Zence R2 Live API
  { label: 'control("intensity")', type: "function", detail: "Zence · Nodo numérico o LFO", apply: 'control("intensity")' },
  { label: "audio()", type: "function", detail: "Zence · Nivel de micrófono (0..1)", apply: "audio()" },
  { label: "bass()", type: "function", detail: "Zence · Graves FFT (0..1)", apply: "bass()" },
  { label: "mid()", type: "function", detail: "Zence · Medios FFT (0..1)", apply: "mid()" },
  { label: "high()", type: "function", detail: "Zence · Agudos FFT (0..1)", apply: "high()" },
  { label: "beat()", type: "function", detail: "Zence · Fase de pulso BPM (0..1)", apply: "beat()" },
  { label: "bpm()", type: "function", detail: "Zence · Tempo actual en BPM", apply: "bpm()" },
  { label: "bodyActivity()", type: "function", detail: "Mocap · Energía de movimiento corporal (0..1)", apply: "bodyActivity()" },
  { label: 'hand("left", "open")', type: "function", detail: "Mocap · Apertura/pinza de mano (left/right)", apply: 'hand("left", "open")' },
  { label: "leftPinch()", type: "function", detail: "Mocap · Pinza pulgar-índice izquierda (0..1)", apply: "leftPinch()" },
  { label: "rightPinch()", type: "function", detail: "Mocap · Pinza pulgar-índice derecha (0..1)", apply: "rightPinch()" },
  { label: "leftOpen()", type: "function", detail: "Mocap · Apertura mano izquierda (0..1)", apply: "leftOpen()" },
  { label: "rightOpen()", type: "function", detail: "Mocap · Apertura mano derecha (0..1)", apply: "rightOpen()" },
  { label: "handsDist()", type: "function", detail: "Mocap · Distancia 3D entre ambas manos", apply: "handsDist()" },
  { label: "poseY()", type: "function", detail: "Mocap · Altura Y de cabeza/postura", apply: "poseY()" },

  // Hydra Sources
  { label: "osc", type: "function", detail: "Fuente · Oscilador (freq, sync, offset)", apply: "osc(10, 0.1, 0.5)" },
  { label: "noise", type: "function", detail: "Fuente · Ruido Perlin (scale, offset)", apply: "noise(4, 0.15)" },
  { label: "voronoi", type: "function", detail: "Fuente · Celdas Voronoi (scale, speed, blend)", apply: "voronoi(6, 0.3, 0.5)" },
  { label: "shape", type: "function", detail: "Fuente · Polígono (sides, radius, smoothing)", apply: "shape(4, 0.4, 0.01)" },
  { label: "gradient", type: "function", detail: "Fuente · Gradiente RGB (speed)", apply: "gradient(0.5)" },
  { label: "solid", type: "function", detail: "Fuente · Color sólido (r, g, b, a)", apply: "solid(0.68, 0.4, 0.68, 1)" },
  { label: "src", type: "function", detail: "Fuente · Buffer o medio (o0 / s0)", apply: "src(s0)" },

  // Geometry
  { label: "kaleid", type: "method", detail: "Geo · Caleidoscopio (nSides)", apply: "kaleid(5)" },
  { label: "rotate", type: "method", detail: "Geo · Rotar (angle, speed)", apply: "rotate(0.5, 0.1)" },
  { label: "scale", type: "method", detail: "Geo · Escalar (amount, xMult, yMult)", apply: "scale(1.1)" },
  { label: "pixelate", type: "method", detail: "Geo · Pixelar (x, y)", apply: "pixelate(32, 32)" },
  { label: "repeat", type: "method", detail: "Geo · Repetir grilla (x, y)", apply: "repeat(3, 3)" },
  { label: "repeatX", type: "method", detail: "Geo · Repetir X (reps, offset)", apply: "repeatX(3, 0)" },
  { label: "repeatY", type: "method", detail: "Geo · Repetir Y (reps, offset)", apply: "repeatY(3, 0)" },
  { label: "scrollX", type: "method", detail: "Geo · Desplazar X (scroll, speed)", apply: "scrollX(0.1, 0.05)" },
  { label: "scrollY", type: "method", detail: "Geo · Desplazar Y (scroll, speed)", apply: "scrollY(0.1, 0.05)" },

  // Color
  { label: "color", type: "method", detail: "Color · Multiplicar RGB (r, g, b, a)", apply: "color(0.68, 0.4, 0.68)" },
  { label: "colorama", type: "method", detail: "Color · Desplazamiento HSV (amount)", apply: "colorama(0.3)" },
  { label: "posterize", type: "method", detail: "Color · Cuantizar tonos (bins, gamma)", apply: "posterize(4, 0.6)" },
  { label: "saturate", type: "method", detail: "Color · Saturación (amount)", apply: "saturate(1.5)" },
  { label: "hue", type: "method", detail: "Color · Rotar tono (hue)", apply: "hue(0.2)" },
  { label: "contrast", type: "method", detail: "Color · Contraste (amount)", apply: "contrast(1.4)" },
  { label: "brightness", type: "method", detail: "Color · Brillo (amount)", apply: "brightness(0.1)" },
  { label: "invert", type: "method", detail: "Color · Invertir (amount)", apply: "invert(1)" },
  { label: "luma", type: "method", detail: "Color · Máscara por luminancia", apply: "luma(0.5, 0.1)" },
  { label: "thresh", type: "method", detail: "Color · Umbral binario", apply: "thresh(0.5, 0.04)" },
  { label: "shift", type: "method", detail: "Color · Desfase RGBA", apply: "shift(0.1, 0, 0.2)" },

  // Combine & Modulate
  { label: "modulate", type: "method", detail: "Mod · Distorsión XY (tex, amount)", apply: "modulate(noise(3), 0.1)" },
  { label: "modulateScale", type: "method", detail: "Mod · Escala por textura", apply: "modulateScale(osc(5), 0.2)" },
  { label: "modulateRotate", type: "method", detail: "Mod · Rotación por textura", apply: "modulateRotate(noise(2), 0.5)" },
  { label: "modulatePixelate", type: "method", detail: "Mod · Pixelado por textura", apply: "modulatePixelate(noise(3), 8)" },
  { label: "modulateHue", type: "method", detail: "Mod · Tono por textura", apply: "modulateHue(src(o0), 10)" },
  { label: "modulateKaleid", type: "method", detail: "Mod · Caleidoscopio modulado", apply: "modulateKaleid(noise(2), 4)" },
  { label: "blend", type: "method", detail: "Mezcla · Mezclar (tex, amount)", apply: "blend(o0, 0.5)" },
  { label: "add", type: "method", detail: "Mezcla · Sumar (tex, amount)", apply: "add(osc(4), 0.3)" },
  { label: "diff", type: "method", detail: "Mezcla · Diferencia (tex)", apply: "diff(o0)" },
  { label: "mult", type: "method", detail: "Mezcla · Multiplicar (tex, amount)", apply: "mult(shape(4), 1)" },
  { label: "layer", type: "method", detail: "Mezcla · Superponer con alfa", apply: "layer(shape(3).luma())" },
  { label: "mask", type: "method", detail: "Mezcla · Recortar por máscara", apply: "mask(shape(4))" },

  // Outputs & Globals
  { label: "out", type: "method", detail: "Salida · Enviar a buffer (o0..o3)", apply: "out(o0)" },
  { label: "render", type: "function", detail: "Salida · Mostrar buffer o grilla", apply: "render(o0)" },
  { label: "o0", type: "variable", detail: "Buffer principal de salida" },
  { label: "o1", type: "variable", detail: "Buffer secundario 1" },
  { label: "o2", type: "variable", detail: "Buffer secundario 2" },
  { label: "o3", type: "variable", detail: "Buffer secundario 3" },
  { label: "s0", type: "variable", detail: "Fuente externa (Imagen, Video, Cámara o Pantalla)" },
  { label: "time", type: "variable", detail: "Tiempo continuo en segundos" },
  { label: "mouse", type: "variable", detail: "Coordenadas del puntero { x, y }" },
];

function hydraCompletionSource(context: CompletionContext) {
  const word = context.matchBefore(/[\w"]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: hydraCompletions,
  };
}

export const hydraAutocompleteExtension: Extension = javascriptLanguage.data.of({
  autocomplete: hydraCompletionSource,
});

// Flash-on-eval decoration inspired by Hydra's cm6-editor/flash-code
const setFlashEffect = StateEffect.define<boolean>();

const flashField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFlashEffect)) {
        if (effect.value && tr.state.doc.length > 0) {
          return Decoration.set([
            Decoration.mark({ class: "cm-eval-flash" }).range(0, tr.state.doc.length),
          ]);
        }
        return Decoration.none;
      }
    }
    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function triggerEditorFlash(view: EditorView | null | undefined): void {
  if (!view) return;
  view.dispatch({ effects: setFlashEffect.of(true) });
  window.setTimeout(() => {
    view.dispatch({ effects: setFlashEffect.of(false) });
  }, 520);
}

export function createHydraKeymapExtension(
  onEval: (view: EditorView) => void,
  onFormat?: () => void,
): Extension {
  return [
    flashField,
    keymap.of([
      {
        key: "Mod-Enter",
        run: (view) => {
          onEval(view);
          return true;
        },
      },
      {
        key: "Shift-Mod-Enter",
        run: (view) => {
          onEval(view);
          return true;
        },
      },
      {
        key: "Alt-Enter",
        run: (view) => {
          onEval(view);
          return true;
        },
      },
      ...(onFormat
        ? [
            {
              key: "Shift-Mod-f",
              run: () => {
                onFormat();
                return true;
              },
            },
          ]
        : []),
    ]),
  ];
}

export const hydraOverlayTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent !important",
    fontFamily: "var(--font-mono)",
    height: "100%",
  },
  "& .cm-scroller": {
    fontFamily: "var(--font-mono)",
    overflow: "auto",
  },
  "& .cm-content": {
    padding: "12px 14px",
    caretColor: "#ffffff",
  },
  "& .cm-line": {
    width: "fit-content",
    maxWidth: "100%",
    backgroundColor: "rgba(18, 16, 22, 0.64)",
    backdropFilter: "blur(6px)",
    padding: "1px 6px",
    marginBottom: "2px",
    color: "#f5f3f4",
  },
  "& .cm-activeLine": {
    backgroundColor: "rgba(32, 24, 38, 0.82) !important",
  },
  "& .cm-gutters": {
    display: "none",
  },
  "&.cm-focused": {
    outline: "none",
  },
  "& .cm-cursor": {
    borderLeft: "2px solid #ffffff",
  },
});

export function formatHydraCode(source: string): string {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line, index, arr) => line.length > 0 || (index > 0 && arr[index - 1].length > 0));

  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith("//")) {
      out.push(line);
      continue;
    }
    // Split top-level chained method calls like `osc(9).kaleid(5).out(o0)` without breaking inner parens
    let depth = 0;
    let inString: string | null = null;
    let current = "";
    const parts: string[] = [];
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const prev = line[i - 1];
      if (inString) {
        current += ch;
        if (ch === inString && prev !== "\\") inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        current += ch;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") depth += 1;
      else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);

      if (ch === "." && depth === 0 && current.trim().length > 0 && !current.endsWith(" ")) {
        parts.push(current.trim());
        current = ".";
      } else {
        current += ch;
      }
    }
    if (current.trim().length > 0) parts.push(current.trim());

    parts.forEach((part, idx) => {
      if (idx === 0) out.push(part);
      else out.push(`  ${part}`);
    });
  }
  return out.join("\n");
}

export function mutateHydraCode(source: string): string {
  // Safely mutate standalone numeric literals outside strings, comments, o0..o3, s0..s3
  const lines = source.split(/\r?\n/);
  const numberToken = /(^|[(,\s+\-*/])(-?\d+(?:\.\d+)?)(?=[),\s+\-*/]|$)/g;
  const matches: Array<{ lineIndex: number; start: number; end: number; prefix: string; value: number; hasDot: boolean }> = [];

  lines.forEach((line, lineIndex) => {
    if (line.trim().startsWith("//")) return;
    let match: RegExpExecArray | null;
    numberToken.lastIndex = 0;
    while ((match = numberToken.exec(line)) !== null) {
      const prefix = match[1];
      const raw = match[2];
      const numStart = match.index + prefix.length;
      const before = line.slice(Math.max(0, numStart - 1), numStart);
      if (before === "o" || before === "s" || before === '"' || before === "'") continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      matches.push({
        lineIndex,
        start: numStart,
        end: numStart + raw.length,
        prefix,
        value,
        hasDot: raw.includes("."),
      });
    }
  });

  if (matches.length === 0) return source;
  // Mutate 1 to 3 numeric parameters gently for expressive live variation
  const count = Math.min(matches.length, 1 + Math.floor(Math.random() * 3));
  const chosen = [...matches].sort(() => Math.random() - 0.5).slice(0, count);
  chosen.sort((a, b) => b.lineIndex - a.lineIndex || b.start - a.start);

  for (const item of chosen) {
    const line = lines[item.lineIndex];
    const scale = 0.65 + Math.random() * 0.85;
    let next = item.value === 0 ? (Math.random() > 0.5 ? 0.25 : 1) : item.value * scale;
    if (!item.hasDot && Math.abs(item.value) >= 2) {
      next = Math.max(1, Math.round(next));
    } else {
      next = Number(next.toFixed(2));
    }
    lines[item.lineIndex] =
      line.slice(0, item.start) + String(next) + line.slice(item.end);
  }
  return lines.join("\n");
}
