import {
  Camera,
  Download,
  FileUp,
  Hand,
  PersonStanding,
  Square,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { convertFbxToGlb, humanBytes, type FbxConversionStats } from "../mocap/fbxToGlb.ts";
import { sharedMocap, type MocapQuality } from "../mocap/mocapRuntime.ts";

type MocapPanelProps = {
  section?: "mocap" | "fbx" | "all";
  onLoadModelFile?: (file: File) => void;
};

export function MocapPanel({ section = "all", onLoadModelFile }: MocapPanelProps) {
  const [, setTick] = useState(0);
  const [fbxBusy, setFbxBusy] = useState(false);
  const [fbxStatus, setFbxStatus] = useState("");
  const [converted, setConverted] = useState<FbxConversionStats | null>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const fbxInput = useRef<HTMLInputElement>(null);

  useEffect(() => sharedMocap.subscribe(() => setTick((t) => t + 1)), []);

  const st = sharedMocap.state;

  async function handleFbxFile(file: File) {
    setFbxBusy(true);
    setFbxStatus("Convirtiendo FBX a GLB…");
    try {
      const stats = await convertFbxToGlb(file, (msg) => setFbxStatus(msg));
      setConverted(stats);
      setFbxStatus(
        `GLB listo (${humanBytes(stats.bytes)} · ${stats.bones} huesos · ${stats.meshes} mallas)`,
      );
      const glbFile = new File([stats.blob], stats.name, { type: "model/gltf-binary" });
      if (onLoadModelFile) {
        onLoadModelFile(glbFile);
      } else {
        window.dispatchEvent(new CustomEvent("zence:load-model", { detail: glbFile }));
      }
    } catch (err) {
      setFbxStatus(`Error al convertir FBX: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFbxBusy(false);
    }
  }

  function downloadConvertedGlb() {
    if (!converted) return;
    const url = URL.createObjectURL(converted.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = converted.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const showMocap = section === "all" || section === "mocap";
  const showFbx = section === "all" || section === "fbx";

  return (
    <>
      {showMocap && <div className="inspector-section mocap-panel">
        <h4>
          <PersonStanding size={13} /> Mocap Cuerpo + Manos
        </h4>

        <div className="mocap-status-row">
          <span className={`mocap-pill ${st.poseDetected ? "is-ok" : ""}`}>
            Cuerpo {st.poseDetected ? `${Math.round(st.poseConfidence * 100)}%` : "—"}
          </span>
          <span className={`mocap-pill ${st.handsDetected > 0 ? "is-ok" : ""}`}>
            <Hand size={11} /> Manos: {st.handsDetected}
          </span>
        </div>

        <div className="mocap-actions">
          <button
            type="button"
            className={`button ${st.sourceKind === "webcam" && st.active ? "is-active" : ""}`}
            onClick={() => void sharedMocap.startWebcam()}
            disabled={st.loading}
          >
            <Camera size={13} /> Cámara
          </button>
          <button
            type="button"
            className="button button-subtle"
            onClick={() => mediaInput.current?.click()}
            disabled={st.loading}
          >
            <Upload size={13} /> Video / Imagen
          </button>
          {st.active && (
            <button
              type="button"
              className="icon-button"
              title="Detener seguimiento"
              aria-label="Detener seguimiento"
              onClick={() => sharedMocap.stop()}
            >
              <Square size={13} />
            </button>
          )}
          <input
            ref={mediaInput}
            type="file"
            accept="video/*,image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void sharedMocap.loadFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {st.statusMessage && <p className="inspector-note">{st.statusMessage}</p>}

        <label className="field">
          Cuerpo completo (33 pts)
          <input
            type="checkbox"
            role="switch"
            checked={st.bodyEnabled}
            onChange={(e) => sharedMocap.setOptions({ bodyEnabled: e.target.checked })}
          />
        </label>
        <label className="field">
          Seguimiento de manos (21 pts)
          <input
            type="checkbox"
            role="switch"
            checked={st.handsEnabled}
            onChange={(e) => sharedMocap.setOptions({ handsEnabled: e.target.checked })}
          />
        </label>
        <label className="field">
          Vista espejo
          <input
            type="checkbox"
            role="switch"
            checked={st.mirror}
            onChange={(e) => sharedMocap.setOptions({ mirror: e.target.checked })}
          />
        </label>
        <label className="field">
          Suavizado ({Math.round(st.smoothing * 100)}%)
          <input
            type="range"
            min={0}
            max={0.85}
            step={0.05}
            value={st.smoothing}
            onChange={(e) => sharedMocap.setOptions({ smoothing: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          Modelo Pose
          <select
            className="mode-select"
            value={st.quality}
            onChange={(e) => sharedMocap.setOptions({ quality: e.target.value as MocapQuality })}
          >
            <option value="lite">Lite (Rápido)</option>
            <option value="full">Full (Balanceado)</option>
            <option value="heavy">Heavy (Precisión)</option>
          </select>
        </label>
      </div>}

      {showFbx && <div className="inspector-section fbx-panel">
        <h4>Conversor FBX → GLB</h4>
        <div className="mocap-actions">
          <button
            type="button"
            className="button button-subtle"
            disabled={fbxBusy}
            onClick={() => fbxInput.current?.click()}
          >
            <FileUp size={13} /> {fbxBusy ? "Convirtiendo…" : "Importar / Convertir .FBX"}
          </button>
          {converted && (
            <button
              type="button"
              className="icon-button"
              title={`Descargar ${converted.name}`}
              aria-label="Descargar GLB convertido"
              onClick={downloadConvertedGlb}
            >
              <Download size={13} />
            </button>
          )}
          <input
            ref={fbxInput}
            type="file"
            accept=".fbx"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFbxFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {fbxStatus && <p className="inspector-note">{fbxStatus}</p>}
      </div>}
    </>
  );
}
