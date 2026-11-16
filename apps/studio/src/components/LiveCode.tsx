import CodeMirror from "@uiw/react-codemirror";
import type { EditorView } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { Code2, Dices, EyeOff, Play, Wand2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { presets } from "../hydraFrame.ts";
import {
  createHydraKeymapExtension,
  formatHydraCode,
  hydraAutocompleteExtension,
  hydraOverlayTheme,
  mutateHydraCode,
  triggerEditorFlash,
} from "../hydraTools.ts";

type Props = {
  code: string;
  automatic: boolean;
  status: string;
  error: boolean;
  hidden?: boolean;
  onCode: (code: string) => void;
  onAuto: (value: boolean) => void;
  onRun: (overrideCode?: string) => void;
};

export function LiveCode({
  code,
  automatic,
  status,
  error,
  hidden,
  onCode,
  onAuto,
  onRun,
}: Props) {
  const editorView = useRef<EditorView | null>(null);
  const latest = useRef({ code, onCode, onRun });
  latest.current = { code, onCode, onRun };

  function handleRun(nextCode?: string) {
    triggerEditorFlash(editorView.current);
    latest.current.onRun(nextCode);
  }

  function handleFormat() {
    const formatted = formatHydraCode(latest.current.code);
    latest.current.onCode(formatted);
  }

  function handleMutate() {
    const mutated = mutateHydraCode(latest.current.code);
    latest.current.onCode(mutated);
    handleRun(mutated);
  }

  const extensions = useMemo(
    () => [
      javascript(),
      hydraAutocompleteExtension,
      createHydraKeymapExtension(
        (view) => {
          triggerEditorFlash(view);
          latest.current.onRun(view.state.doc.toString());
        },
        () => {
          const formatted = formatHydraCode(latest.current.code);
          latest.current.onCode(formatted);
        },
      ),
    ],
    [],
  );

  return (
    <section className={`panel live-code ${hidden ? "is-panel-hidden" : ""}`}>
      <div className="panel-heading">
        <h2>
          <Code2 size={14} /> Código Hydra
        </h2>
        <div className="live-toolbar">
          <div className="preset-pills" role="group" aria-label="Ejemplos Hydra">
            {Object.keys(presets).map((name) => (
              <button
                key={name}
                type="button"
                className="preset-pill"
                onClick={() => {
                  const next = presets[name as keyof typeof presets];
                  onCode(next);
                  handleRun(next);
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-button"
            title="Mutar parámetros (Hydra Randomizer)"
            aria-label="Mutar parámetros"
            onClick={handleMutate}
          >
            <Dices size={13} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Formatear código (Ctrl+Shift+F)"
            aria-label="Formatear código"
            onClick={handleFormat}
          >
            <Wand2 size={13} />
          </button>
          <label>
            <input
              type="checkbox"
              checked={automatic}
              onChange={(e) => onAuto(e.target.checked)}
            />{" "}
            Auto
          </label>
          <button
            type="button"
            className="icon-button"
            title="Ejecutar código (Ctrl + Enter)"
            aria-label="Ejecutar código"
            onClick={() => handleRun()}
          >
            <Play size={13} />
          </button>
        </div>
      </div>
      <div className="code-scroll">
        <CodeMirror
          value={code}
          theme="dark"
          extensions={extensions}
          onCreateEditor={(view) => {
            editorView.current = view;
          }}
          onChange={onCode}
          basicSetup={{ foldGutter: false, highlightActiveLine: true }}
          aria-label="Código Hydra"
        />
      </div>
      <div role="status" className={`code-status ${error ? "code-error" : ""}`}>
        <span>{status || "Ctrl + Enter ejecuta · Ctrl + Espacio autocompleta"}</span>
        <span className="code-api">
          <code>control(&quot;id&quot;)</code> · <code>audio()</code> · <code>bass()</code> · <code>beat()</code> · <code>s0</code>
        </span>
      </div>
    </section>
  );
}

type OverlayProps = {
  code: string;
  status: string;
  error: boolean;
  onCode: (code: string) => void;
  onRun: (overrideCode?: string) => void;
  onClose: () => void;
};

export function OverlayCode({
  code,
  status,
  error,
  onCode,
  onRun,
  onClose,
}: OverlayProps) {
  const [fontSize, setFontSize] = useState(16);
  const editorView = useRef<EditorView | null>(null);
  const latest = useRef({ code, onCode, onRun });
  latest.current = { code, onCode, onRun };

  function handleRun(nextCode?: string) {
    triggerEditorFlash(editorView.current);
    latest.current.onRun(nextCode);
  }

  function handleFormat() {
    const formatted = formatHydraCode(latest.current.code);
    latest.current.onCode(formatted);
  }

  function handleMutate() {
    const mutated = mutateHydraCode(latest.current.code);
    latest.current.onCode(mutated);
    handleRun(mutated);
  }

  const extensions = useMemo(
    () => [
      javascript(),
      hydraAutocompleteExtension,
      hydraOverlayTheme,
      createHydraKeymapExtension(
        (view) => {
          triggerEditorFlash(view);
          latest.current.onRun(view.state.doc.toString());
        },
        () => {
          const formatted = formatHydraCode(latest.current.code);
          latest.current.onCode(formatted);
        },
      ),
    ],
    [],
  );

  return (
    <div className="overlay-code-layer" aria-label="Editor flotante sobre el visor">
      <div className="overlay-code-bar">
        <span className="overlay-badge">LIVE CODE</span>
        <button
          type="button"
          className="overlay-btn"
          title="Ejecutar (Ctrl + Enter)"
          onClick={() => handleRun()}
        >
          <Play size={12} /> Ejecutar
        </button>
        <button
          type="button"
          className="overlay-btn"
          title="Mutar parámetros"
          onClick={handleMutate}
        >
          <Dices size={12} /> Mutar
        </button>
        <button
          type="button"
          className="overlay-btn"
          title="Formatear (Ctrl+Shift+F)"
          onClick={handleFormat}
        >
          <Wand2 size={12} /> Formatear
        </button>
        <button
          type="button"
          className="overlay-btn"
          title="Reducir letra"
          onClick={() => setFontSize((s) => Math.max(12, s - 2))}
        >
          A-
        </button>
        <button
          type="button"
          className="overlay-btn"
          title="Aumentar letra"
          onClick={() => setFontSize((s) => Math.min(26, s + 2))}
        >
          A+
        </button>
        <button
          type="button"
          className="overlay-btn"
          title="Ocultar código sobre visor (Alt+C)"
          onClick={onClose}
        >
          <EyeOff size={12} />
        </button>
      </div>

      <div className="overlay-code-scroll" style={{ fontSize }}>
        <CodeMirror
          value={code}
          theme="none"
          extensions={extensions}
          onCreateEditor={(view) => {
            editorView.current = view;
          }}
          onChange={onCode}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: true,
            highlightActiveLineGutter: false,
          }}
          aria-label="Código Hydra sobre el visor"
        />
      </div>

      {(error || status) && (
        <div className={`overlay-code-status ${error ? "is-error" : ""}`}>
          &gt;&gt; {status}
        </div>
      )}
    </div>
  );
}
