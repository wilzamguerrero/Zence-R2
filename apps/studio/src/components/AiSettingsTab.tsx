import { Check, Copy, ExternalLink, KeyRound, Plus, RefreshCw, Trash2, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { streamChat } from "../ai/chat.ts";
import {
  activeProvider,
  addCustomProvider,
  aiConfig,
  browserKey,
  chosenModel,
  clearKey,
  customProvider,
  hasCredential,
  probeServerKeys,
  providerIds,
  providerLabel,
  removeCustomProvider,
  serverKeys,
  setKey,
  setModel,
  setProvider,
} from "../ai/config.ts";
import { startDeviceFlow, waitForDeviceToken } from "../ai/device.ts";
import type { DeviceStart } from "../ai/device.ts";
import { freePiAccount, startFreePiFlow, waitForFreePiToken } from "../ai/freepiDevice.ts";
import type { FreePiAccount, FreePiStart } from "../ai/freepiDevice.ts";
import { cachedCatalog, forgetCatalog, listModels } from "../ai/models.ts";
import { loadDirectory } from "../ai/registry.ts";
import type { DirectoryEntry } from "../ai/registry.ts";
import { builtinInfo, isBuiltin, isCustom } from "../ai/types.ts";
import type { AiModel, ProviderId } from "../ai/types.ts";

export function AiSettingsTab() {
  const [, setRev] = useState(0);
  const [addingCustom, setAddingCustom] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [models, setModels] = useState<AiModel[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [status, setStatus] = useState<{ text: string; bad?: boolean }>({ text: "" });
  const [probing, setProbing] = useState(false);

  // Device auth state
  const [freepiStart, setFreepiStart] = useState<FreePiStart | null>(null);
  const [freepiMe, setFreepiMe] = useState<FreePiAccount | null>(null);
  const [ghStart, setGhStart] = useState<DeviceStart | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const authAbort = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  async function copyDeviceCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // Ignore clipboard errors.
      }
      document.body.removeChild(ta);
    }
    setCopiedCode(true);
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopiedCode(false), 1800);
    setStatus({ text: `Código ${code} copiado al portapapeles.` });
  }

  // Custom provider form
  const [customLabel, setCustomLabel] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customFormat, setCustomFormat] = useState<"openai" | "anthropic">("openai");
  const [customKeyHdr, setCustomKeyHdr] = useState("");
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);

  useEffect(() => {
    void probeServerKeys();
    const u1 = aiConfig.subscribe(() => setRev((r) => r + 1));
    const u2 = serverKeys.subscribe(() => setRev((r) => r + 1));
    return () => {
      u1();
      u2();
      authAbort.current?.abort();
    };
  }, []);

  const provider = activeProvider();
  const info = builtinInfo(provider);
  const custom = customProvider(provider);
  const savedKey = browserKey(provider);
  const serverConfigured = isBuiltin(provider) && serverKeys.get()?.[provider] === true;
  const selectedModel = chosenModel(provider) ?? defaultModel;
  const authed = hasCredential(provider);

  // Refresh free-pi account info when selected & has token
  useEffect(() => {
    if (provider !== "freepi" || !savedKey) {
      setFreepiMe(null);
      return;
    }
    const ac = new AbortController();
    void freePiAccount(savedKey, ac.signal).then((me) => {
      if (!ac.signal.aborted) setFreepiMe(me);
    });
    return () => ac.abort();
  }, [provider, savedKey]);

  // Load model catalog for active provider
  useEffect(() => {
    if (addingCustom) return;
    const cached = cachedCatalog(provider);
    if (cached) {
      setModels(cached.models);
      setDefaultModel(cached.defaultModel);
    } else {
      setModels([]);
      setDefaultModel("");
    }
    if (!authed && !info?.publicCatalog) return;
    const ac = new AbortController();
    setLoadingModels(true);
    void listModels(provider, { signal: ac.signal })
      .then((cat) => {
        if (ac.signal.aborted) return;
        setModels(cat.models);
        setDefaultModel(cat.defaultModel);
      })
      .catch(() => {})
      .finally(() => {
        if (!ac.signal.aborted) setLoadingModels(false);
      });
    return () => ac.abort();
  }, [provider, authed, addingCustom, info?.publicCatalog]);

  async function refreshCatalog() {
    forgetCatalog(provider);
    setLoadingModels(true);
    setStatus({ text: "Actualizando lista de modelos…" });
    try {
      const cat = await listModels(provider, { force: true });
      setModels(cat.models);
      setDefaultModel(cat.defaultModel);
      setStatus({ text: `${cat.models.length} modelos disponibles.` });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : "No se pudieron cargar los modelos.", bad: true });
    } finally {
      setLoadingModels(false);
    }
  }

  async function connectFreePi() {
    authAbort.current?.abort();
    const ac = new AbortController();
    authAbort.current = ac;
    setAuthBusy(true);
    setStatus({ text: "Solicitando código de free-pi en GitHub…" });
    try {
      const start = await startFreePiFlow(ac.signal);
      setFreepiStart(start);
      setStatus({ text: `Introduce el código ${start.userCode} en GitHub para activar free-pi.` });
      const tok = await waitForFreePiToken(start, ac.signal);
      setKey("freepi", tok.token);
      setFreepiStart(null);
      setStatus({ text: "free-pi conectado y listo para usar." });
    } catch (e) {
      if (!ac.signal.aborted) {
        setStatus({ text: e instanceof Error ? e.message : "Error conectando free-pi.", bad: true });
      }
      setFreepiStart(null);
    } finally {
      setAuthBusy(false);
    }
  }

  async function connectGithubCopilot() {
    authAbort.current?.abort();
    const ac = new AbortController();
    authAbort.current = ac;
    setAuthBusy(true);
    setStatus({ text: "Solicitando código de dispositivo en GitHub…" });
    try {
      const start = await startDeviceFlow(ac.signal);
      setGhStart(start);
      setStatus({ text: `Introduce el código ${start.userCode} en GitHub.` });
      const token = await waitForDeviceToken(start, ac.signal);
      setKey("github", token);
      setGhStart(null);
      setStatus({ text: "GitHub Copilot conectado." });
    } catch (e) {
      if (!ac.signal.aborted) {
        setStatus({ text: e instanceof Error ? e.message : "Error conectando GitHub.", bad: true });
      }
      setGhStart(null);
    } finally {
      setAuthBusy(false);
    }
  }

  async function testConnection() {
    setProbing(true);
    setStatus({ text: "Probando respuesta del modelo…" });
    try {
      const reply = await streamChat({
        provider,
        model: selectedModel || undefined,
        messages: [
          { role: "system", content: "Contesta brevemente: listo." },
          { role: "user", content: "ping" },
        ],
      });
      setStatus({ text: `Conexión OK: "${reply.replace(/\s+/g, " ").trim().slice(0, 60)}"` });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : "Fallo al probar conexión.", bad: true });
    } finally {
      setProbing(false);
    }
  }

  function openAddCustom() {
    setAddingCustom(true);
    setStatus({ text: "" });
    void loadDirectory()
      .then((dir) => setDirectory(dir.providers.slice(0, 32)))
      .catch(() => {});
  }

  function submitCustomProvider() {
    if (!customUrl.trim()) {
      setStatus({ text: "Escribe la URL base (ej. http://localhost:11434/v1).", bad: true });
      return;
    }
    const id = addCustomProvider({
      label: customLabel.trim() || "API Propia",
      baseUrl: customUrl.trim(),
      format: customFormat,
      keyHeader: customKeyHdr.trim() || undefined,
    });
    if (keyDraft.trim()) {
      setKey(id, keyDraft.trim());
      setKeyDraft("");
    }
    setCustomLabel("");
    setCustomUrl("");
    setCustomKeyHdr("");
    setAddingCustom(false);
    setStatus({ text: "Proveedor añadido." });
  }

  const filteredModels = models.filter((m) => {
    const q = modelFilter.trim().toLowerCase();
    if (!q) return true;
    return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
  });

  const ids = providerIds();

  return (
    <div className="ai-settings">
      <div className="ai-provider-row" role="group" aria-label="Proveedor de IA">
        {ids.map((id: ProviderId) => (
          <button
            key={id}
            type="button"
            className={`ai-prov-btn ${!addingCustom && provider === id ? "is-active" : ""}`}
            onClick={() => {
              authAbort.current?.abort();
              setAddingCustom(false);
              setFreepiStart(null);
              setGhStart(null);
              setProvider(id);
              setStatus({ text: "" });
            }}
          >
            {providerLabel(id)}
          </button>
        ))}
        <button
          type="button"
          className={`ai-prov-btn ${addingCustom ? "is-active" : ""}`}
          onClick={openAddCustom}
        >
          <Plus size={11} /> Otro
        </button>
      </div>

      {addingCustom ? (
        <div className="ai-custom-box">
          <div className="ai-box-head">
            <strong>Añadir proveedor compatible (OpenAI / Ollama / Anthropic)</strong>
          </div>
          {directory.length > 0 && (
            <label className="field">
              Plantilla rápida
              <select
                className="mode-select"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value === "__ollama") {
                    setCustomLabel("Ollama");
                    setCustomUrl("http://localhost:11434/v1");
                    return;
                  }
                  const found = directory.find((d) => d.id === e.target.value);
                  if (found) {
                    setCustomLabel(found.name);
                    if (found.api) setCustomUrl(found.api);
                  }
                }}
              >
                <option value="">Elegir de models.dev…</option>
                <option value="__ollama">
                  Ollama local (localhost:11434)
                </option>
                {directory.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.models} modelos)
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Nombre
            <input
              type="text"
              placeholder="Ej: Ollama / DeepSeek / LM Studio"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
            />
          </label>
          <label className="field">
            URL Base
            <input
              type="url"
              placeholder="http://localhost:11434/v1"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
            />
          </label>
          <label className="field">
            Formato API
            <select
              className="mode-select"
              value={customFormat}
              onChange={(e) => setCustomFormat(e.target.value as "openai" | "anthropic")}
            >
              <option value="openai">OpenAI (/chat/completions)</option>
              <option value="anthropic">Anthropic (/messages)</option>
            </select>
          </label>
          <label className="field">
            API Key (opcional en local)
            <input
              type="password"
              placeholder="Opcional para Ollama / LM Studio"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
            />
          </label>
          <div className="ai-btn-row">
            <button type="button" className="button button-save" onClick={submitCustomProvider}>
              Guardar proveedor
            </button>
            <button type="button" className="button button-subtle" onClick={() => setAddingCustom(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="ai-hint">
            {info ? info.hint : custom ? `Endpoint personalizado: ${custom.baseUrl}` : ""}
          </p>

          {/* Credenciales */}
          {provider === "freepi" && (
            <div className="ai-cred-box">
              {freepiStart ? (
                <div className="ai-device-code">
                  <span>Código GitHub:</span>
                  <button
                    type="button"
                    className={`ai-code-copy ${copiedCode ? "is-copied" : ""}`}
                    title="Clic para copiar el código"
                    onClick={() => void copyDeviceCode(freepiStart.userCode)}
                  >
                    <strong>{freepiStart.userCode}</strong>
                    <span className="ai-code-copy-tag">
                      {copiedCode ? <Check size={11} /> : <Copy size={11} />}
                      {copiedCode ? "Copiado" : "Copiar"}
                    </span>
                  </button>
                  <a
                    href={freepiStart.verificationUriComplete || freepiStart.verificationUri}
                    target="_blank"
                    rel="noreferrer"
                    className="button button-save"
                    onClick={() => void copyDeviceCode(freepiStart.userCode)}
                  >
                    Abrir GitHub <ExternalLink size={11} />
                  </a>
                </div>
              ) : savedKey ? (
                <div className="ai-connected-row">
                  <span className="ai-ok-pill">
                    <Check size={11} /> free-pi conectado
                    {freepiMe?.handle ? ` (@${freepiMe.handle})` : ""}
                    {freepiMe?.remainingCredits != null && freepiMe?.allowanceCredits != null
                      ? ` · ${freepiMe.remainingCredits}/${freepiMe.allowanceCredits} cr`
                      : ""}
                  </span>
                  <button
                    type="button"
                    className="button button-subtle"
                    onClick={() => clearKey("freepi")}
                  >
                    Desconectar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="button button-save"
                  disabled={authBusy}
                  onClick={() => void connectFreePi()}
                >
                  <Zap size={12} /> {authBusy ? "Esperando…" : "Conectar free-pi gratis (1 paso)"}
                </button>
              )}
            </div>
          )}

          {provider === "github" && (
            <div className="ai-cred-box">
              {ghStart ? (
                <div className="ai-device-code">
                  <span>Código:</span>
                  <button
                    type="button"
                    className={`ai-code-copy ${copiedCode ? "is-copied" : ""}`}
                    title="Clic para copiar el código"
                    onClick={() => void copyDeviceCode(ghStart.userCode)}
                  >
                    <strong>{ghStart.userCode}</strong>
                    <span className="ai-code-copy-tag">
                      {copiedCode ? <Check size={11} /> : <Copy size={11} />}
                      {copiedCode ? "Copiado" : "Copiar"}
                    </span>
                  </button>
                  <a
                    href={ghStart.verificationUri}
                    target="_blank"
                    rel="noreferrer"
                    className="button button-save"
                    onClick={() => void copyDeviceCode(ghStart.userCode)}
                  >
                    Abrir GitHub <ExternalLink size={11} />
                  </a>
                </div>
              ) : (
                <div className="ai-btn-row">
                  <button
                    type="button"
                    className="button button-save"
                    disabled={authBusy}
                    onClick={() => void connectGithubCopilot()}
                  >
                    {savedKey ? "Reconectar GitHub Copilot" : "Conectar GitHub por dispositivo"}
                  </button>
                  {savedKey && (
                    <button type="button" className="button button-subtle" onClick={() => clearKey("github")}>
                      Quitar
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {provider !== "freepi" && provider !== "github" && (
            <div className="ai-cred-box">
              <div className="ai-key-row">
                <KeyRound size={13} />
                <input
                  type="password"
                  placeholder={
                    savedKey
                      ? "Clave guardada en navegador"
                      : serverConfigured
                        ? "Configurada en servidor (.env)"
                        : "Pega aquí tu API key…"
                  }
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                />
                <button
                  type="button"
                  className="button button-subtle"
                  onClick={() => {
                    if (!keyDraft.trim()) return;
                    setKey(provider, keyDraft);
                    setKeyDraft("");
                    setStatus({ text: "Clave guardada en este navegador." });
                  }}
                >
                  {savedKey ? "Cambiar" : "Guardar"}
                </button>
                {savedKey && (
                  <button type="button" className="icon-button" title="Borrar clave" onClick={() => clearKey(provider)}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              {isCustom(provider) && (
                <button
                  type="button"
                  className="button button-subtle"
                  style={{ marginTop: 6 }}
                  onClick={() => removeCustomProvider(provider)}
                >
                  <Trash2 size={11} /> Eliminar proveedor propio
                </button>
              )}
            </div>
          )}

          {/* Selector de modelo */}
          <div className="ai-model-box">
            <div className="ai-model-head">
              <strong>Modelo</strong>
              <div className="ai-btn-row">
                <button
                  type="button"
                  className="icon-button"
                  title="Actualizar catálogo de modelos"
                  disabled={loadingModels}
                  onClick={() => void refreshCatalog()}
                >
                  <RefreshCw size={12} />
                </button>
                <button
                  type="button"
                  className="button button-subtle"
                  disabled={probing || (!authed && !isCustom(provider))}
                  onClick={() => void testConnection()}
                >
                  {probing ? "Probando…" : "Probar conexión"}
                </button>
              </div>
            </div>
            {models.length > 8 && (
              <input
                type="search"
                className="ai-model-filter"
                placeholder="Filtrar modelos…"
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
              />
            )}
            <select
              className="mode-select"
              value={selectedModel}
              onChange={(e) => setModel(provider, e.target.value)}
            >
              {filteredModels.length === 0 && (
                <option value={selectedModel || ""}>
                  {selectedModel || (loadingModels ? "Cargando modelos…" : "Modelo por defecto")}
                </option>
              )}
              {filteredModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.free ? " · Gratis" : ""}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {status.text && (
        <p className={`ai-status-msg ${status.bad ? "is-bad" : ""}`}>{status.text}</p>
      )}
    </div>
  );
}
