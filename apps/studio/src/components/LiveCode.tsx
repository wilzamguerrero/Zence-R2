import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { Code2, Play } from "lucide-react";
import { presets } from "../hydraFrame.ts";

type Props = {
  code: string;
  automatic: boolean;
  status: string;
  error: boolean;
  onCode: (code: string) => void;
  onAuto: (value: boolean) => void;
  onRun: () => void;
};

export function LiveCode({
  code,
  automatic,
  status,
  error,
  onCode,
  onAuto,
  onRun,
}: Props) {
  return (
    <section className="panel live-code">
      <div className="panel-heading">
        <h2>
          <Code2 size={15} /> Código Hydra
        </h2>
        <div className="live-toolbar">
          <select
            className="mode-select"
            aria-label="Ejemplo Hydra"
            value=""
            onChange={(e) =>
              onCode(presets[e.target.value as keyof typeof presets])
            }
          >
            <option value="" disabled>
              Ejemplos
            </option>
            {Object.keys(presets).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={automatic}
              onChange={(e) => onAuto(e.target.checked)}
            />{" "}
            Auto
          </label>
          <button
            className="icon-button"
            title="Ejecutar código"
            aria-label="Ejecutar código"
            onClick={onRun}
          >
            <Play size={14} />
          </button>
        </div>
      </div>
      <div
        className="code-scroll"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            onRun();
          }
        }}
      >
        <CodeMirror
          value={code}
          theme="dark"
          extensions={[javascript()]}
          onChange={onCode}
          basicSetup={{ foldGutter: false, highlightActiveLine: true }}
          aria-label="Código Hydra"
        />
      </div>
      <div role="status" className={`code-status ${error ? "code-error" : ""}`}>
        {status || 'control("intensity") · Ctrl + Enter para ejecutar'}
      </div>
    </section>
  );
}
