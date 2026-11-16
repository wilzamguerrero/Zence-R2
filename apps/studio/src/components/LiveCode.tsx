import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { Code2, Play } from "lucide-react";
import { presets } from "../hydraFrame.ts";

type Props = {
  code: string;
  automatic: boolean;
  status: string;
  error: boolean;
  hidden?: boolean;
  onCode: (code: string) => void;
  onAuto: (value: boolean) => void;
  onRun: () => void;
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
                onClick={() => onCode(presets[name as keyof typeof presets])}
              >
                {name}
              </button>
            ))}
          </div>
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
            title="Ejecutar código (Ctrl + Enter)"
            aria-label="Ejecutar código"
            onClick={onRun}
          >
            <Play size={13} />
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
        <span>{status || "Ctrl + Enter para ejecutar"}</span>
        <span className="code-api">
          <code>control(&quot;id&quot;)</code> · <code>audio()</code> · <code>bass()</code> · <code>beat()</code> · <code>s0</code>
        </span>
      </div>
    </section>
  );
}
