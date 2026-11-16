import { useState } from "react";
import type { StudioDocument } from "../studio.ts";

export function Assistant({
  document,
  onApply,
}: {
  document: StudioDocument;
  onApply: (code: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true);
    setStatus("");
    setCode("");
    try {
      const session = await fetch("/api/session").then((r) => r.json());
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ prompt, project: document }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCode(data.code);
      setStatus("Propuesta lista para revisar.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo conectar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="assistant">
      <summary>Asistente IA</summary>
      <p>
        Envía el código, los nodos y los ajustes del proyecto al proveedor
        configurado en tu computador.
      </p>
      <label>
        Describe el visual
        <textarea
          value={prompt}
          maxLength={8000}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Un campo violeta que responda a la intensidad…"
        />
      </label>
      <button
        className="button"
        disabled={busy || !prompt.trim()}
        onClick={() => void generate()}
      >
        {busy ? "Generando…" : "Generar propuesta"}
      </button>
      <p role="status">{status}</p>
      {code && (
        <>
          <textarea
            aria-label="Propuesta de código"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="button" onClick={() => onApply(code)}>
            Llevar al editor
          </button>
        </>
      )}
    </details>
  );
}
