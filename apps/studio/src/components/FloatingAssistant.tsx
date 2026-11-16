import { Mic, MicOff, Plus, Send, SlidersHorizontal, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { streamChat } from "../ai/chat.ts";
import { activeProvider, aiConfig, chosenModel, hasCredential, probeServerKeys, providerLabel } from "../ai/config.ts";
import type { ChatMessage } from "../ai/types.ts";
import {
  buildOfflineQuickActions,
  buildZenceSystemPrompt,
  executeStudioActions,
  extractStudioActions,
  STUDIO_AI_SEEDS,
} from "../ai/studioAgent.ts";
import type { StudioAgentContext } from "../ai/studioAgent.ts";
import { OrganicOrbCanvas } from "./OrganicOrbCanvas.tsx";

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: string[];
};

type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  turns: Turn[];
};

type Point = { x: number; y: number };
type WindowSize = { width: number; height: number };

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResult>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

const POS_PREFIX = "zence.pos.";
const SIZE_KEY = "zence.size.ai-window";
const CONV_KEY = "zence.ai.conversations";
const ACTIVE_CONV_KEY = "zence.ai.activeConv";
const DRAG_THRESHOLD = 4;
const MARGIN = 10;
const HANDLE_W = 74;
const HANDLE_H = 66;
const DEFAULT_WIN_W = 396;
const DEFAULT_WIN_H = 500;
const MIN_WIN_W = 320;
const MIN_WIN_H = 280;
const MAX_CONVERSATIONS = 16;

function readPos(key: string): Point | null {
  try {
    const raw = localStorage.getItem(POS_PREFIX + key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Point>;
    if (typeof p.x === "number" && typeof p.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      return { x: p.x, y: p.y };
    }
    return null;
  } catch {
    return null;
  }
}

function savePos(key: string, pt: Point): void {
  try {
    localStorage.setItem(POS_PREFIX + key, JSON.stringify(pt));
  } catch {
    // Ignore storage errors.
  }
}

function clampPos(pt: Point, w: number, h: number): Point {
  const maxX = Math.max(MARGIN, window.innerWidth - w - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - h - MARGIN);
  return {
    x: Math.min(Math.max(pt.x, MARGIN), maxX),
    y: Math.min(Math.max(pt.y, MARGIN), maxY),
  };
}

function clampSize(sz: WindowSize, pos: Point): WindowSize {
  const maxW = Math.max(MIN_WIN_W, Math.min(820, window.innerWidth - pos.x - MARGIN));
  const maxH = Math.max(MIN_WIN_H, Math.min(860, window.innerHeight - pos.y - MARGIN));
  return {
    width: Math.round(Math.min(Math.max(sz.width, MIN_WIN_W), maxW)),
    height: Math.round(Math.min(Math.max(sz.height, MIN_WIN_H), maxH)),
  };
}

function readWinSize(): WindowSize {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    if (!raw) return { width: DEFAULT_WIN_W, height: DEFAULT_WIN_H };
    const s = JSON.parse(raw) as Partial<WindowSize>;
    if (typeof s.width === "number" && typeof s.height === "number" && Number.isFinite(s.width) && Number.isFinite(s.height)) {
      return {
        width: Math.max(MIN_WIN_W, Math.min(820, s.width)),
        height: Math.max(MIN_WIN_H, Math.min(860, s.height)),
      };
    }
  } catch {
    // Ignore storage errors.
  }
  return { width: DEFAULT_WIN_W, height: DEFAULT_WIN_H };
}

function saveWinSize(sz: WindowSize): void {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify(sz));
  } catch {
    // Ignore storage errors.
  }
}

function createConversation(index = 1): Conversation {
  return {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: `Chat ${index}`,
    updatedAt: Date.now(),
    turns: [],
  };
}

function summarizeTitle(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (!clean) return "Chat";
  return clean.length > 22 ? `${clean.slice(0, 21)}…` : clean;
}

function loadInitialConversations(): { list: Conversation[]; activeId: string } {
  try {
    const raw = localStorage.getItem(CONV_KEY);
    const parsed = raw ? (JSON.parse(raw) as Conversation[]) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = parsed.filter((c) => c && typeof c.id === "string" && Array.isArray(c.turns));
      if (valid.length > 0) {
        const savedActive = localStorage.getItem(ACTIVE_CONV_KEY);
        const activeId = valid.some((c) => c.id === savedActive) ? (savedActive as string) : valid[0].id;
        return { list: valid.slice(0, MAX_CONVERSATIONS), activeId };
      }
    }
  } catch {
    // Fallback below.
  }
  const first = createConversation(1);
  return { list: [first], activeId: first.id };
}

type FloatingAssistantProps = {
  context: StudioAgentContext;
  reducedMotion?: boolean;
  onOpenAiSettings: () => void;
};

export function FloatingAssistant({
  context,
  reducedMotion = false,
  onOpenAiSettings,
}: FloatingAssistantProps) {
  const initialRef = useRef<{ list: Conversation[]; activeId: string } | null>(null);
  if (!initialRef.current) initialRef.current = loadInitialConversations();

  const [open, setOpen] = useState(false);
  const [popPhase, setPopPhase] = useState<"closed" | "entering" | "open" | "closing">("closed");

  const [conversations, setConversations] = useState<Conversation[]>(() => initialRef.current!.list);
  const [activeConvId, setActiveConvId] = useState<string>(() => initialRef.current!.activeId);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [, setCfgRev] = useState(0);

  const [handlePos, setHandlePos] = useState<Point>(() =>
    readPos("ai-handle") ?? { x: Math.max(20, window.innerWidth - 360), y: Math.max(60, window.innerHeight - 135) },
  );
  const [winPos, setWinPos] = useState<Point>(() =>
    readPos("ai-window") ?? { x: Math.max(20, window.innerWidth - 430), y: 74 },
  );
  const [winSize, setWinSize] = useState<WindowSize>(readWinSize);

  const handleRef = useRef<HTMLButtonElement>(null);
  const winRef = useRef<HTMLElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const convStripRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseRef = useRef("");
  const suppressClickRef = useRef(false);
  const contextRef = useRef(context);
  contextRef.current = context;

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? conversations[0];
  const turns = activeConv?.turns ?? [];

  useEffect(() => {
    void probeServerKeys();
    return aiConfig.subscribe(() => setCfgRev((r) => r + 1));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CONV_KEY, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)));
      localStorage.setItem(ACTIVE_CONV_KEY, activeConvId);
    } catch {
      // Ignore quota errors.
    }
  }, [conversations, activeConvId]);

  useEffect(() => {
    const onResize = () => {
      setHandlePos((p) => clampPos(p, HANDLE_W, HANDLE_H));
      setWinPos((p) => {
        const nextPos = clampPos(p, winSize.width, winSize.height);
        setWinSize((sz) => clampSize(sz, nextPos));
        return nextPos;
      });
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      try {
        speechRef.current?.abort();
      } catch {
        // Ignore speech abort cleanup errors.
      }
      dragCleanupRef.current?.();
    };
  }, []);

  const mounted = popPhase !== "closed";

  useEffect(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (open) {
      setPopPhase(reducedMotion ? "open" : "entering");
      setWinPos((p) => clampPos(p, winSize.width, winSize.height));
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (popPhase !== "closed") {
      stopDictation();
      if (reducedMotion) {
        setPopPhase("closed");
      } else {
        setPopPhase("closing");
        closeTimerRef.current = window.setTimeout(() => {
          setPopPhase("closed");
          closeTimerRef.current = null;
        }, 175);
      }
    }
  }, [open, reducedMotion]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [turns, mounted, activeConvId]);

  const provider = activeProvider();
  const modelName = chosenModel(provider);
  const authed = hasCredential(provider);

  function updateConvTurns(convId: string, updater: (prevTurns: Turn[]) => Turn[], nextTitle?: string) {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const turnsNext = updater(c.turns);
        return {
          ...c,
          title: nextTitle && c.turns.length === 0 && /^Chat \d+$/.test(c.title) ? nextTitle : c.title,
          updatedAt: Date.now(),
          turns: turnsNext,
        };
      }),
    );
  }

  function handleNewConversation() {
    abortRef.current?.abort();
    setBusy(false);
    setErrorMsg("");
    // Si la conversación actual ya está vacía, enfocar el input directamente
    if (activeConv && activeConv.turns.length === 0) {
      inputRef.current?.focus();
      return;
    }
    const created = createConversation(conversations.length + 1);
    setConversations((prev) => [created, ...prev].slice(0, MAX_CONVERSATIONS));
    setActiveConvId(created.id);
    requestAnimationFrame(() => {
      convStripRef.current?.scrollTo({ left: 0, behavior: "smooth" });
      inputRef.current?.focus();
    });
  }

  function handleSelectConversation(id: string) {
    if (id === activeConvId) return;
    abortRef.current?.abort();
    setBusy(false);
    setErrorMsg("");
    setActiveConvId(id);
  }

  function handleDeleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (id === activeConvId) {
      abortRef.current?.abort();
      setBusy(false);
      setErrorMsg("");
    }
    setConversations((prev) => {
      const rest = prev.filter((c) => c.id !== id);
      if (rest.length === 0) {
        const fresh = createConversation(1);
        setActiveConvId(fresh.id);
        return [fresh];
      }
      if (id === activeConvId) {
        setActiveConvId(rest[0].id);
      }
      return rest;
    });
  }

  function startDrag(
    ev: React.PointerEvent,
    key: "ai-handle" | "ai-window",
    nodeEl: HTMLElement | null,
    origin: Point,
    setPos: (pt: Point) => void,
    isHandle: boolean,
  ) {
    if (ev.button !== 0 || !nodeEl) return;
    if (!isHandle && (ev.target as HTMLElement | null)?.closest("button, a, input, textarea, select")) return;
    ev.preventDefault();
    dragCleanupRef.current?.();

    const pointerId = ev.pointerId;
    const startX = ev.clientX;
    const startY = ev.clientY;
    let moved = false;
    let rafId = 0;
    let latestDx = 0;
    let latestDy = 0;
    const w = nodeEl.offsetWidth || HANDLE_W;
    const h = nodeEl.offsetHeight || HANDLE_H;

    try {
      nodeEl.setPointerCapture(pointerId);
    } catch {
      // Fallback safely on synthetic events.
    }

    const applyTransform = () => {
      rafId = 0;
      const clamped = clampPos({ x: origin.x + latestDx, y: origin.y + latestDy }, w, h);
      nodeEl.style.transform = `translate3d(${clamped.x - origin.x}px, ${clamped.y - origin.y}px, 0)`;
    };

    const cleanupListeners = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      try {
        if (nodeEl.hasPointerCapture(pointerId)) nodeEl.releasePointerCapture(pointerId);
      } catch {
        // Ignore capture release failures.
      }
      dragCleanupRef.current = null;
    };

    const onMove = (mEv: PointerEvent) => {
      if (mEv.pointerId !== pointerId) return;
      latestDx = mEv.clientX - startX;
      latestDy = mEv.clientY - startY;
      if (!moved) {
        if (Math.hypot(latestDx, latestDy) < DRAG_THRESHOLD) return;
        moved = true;
        nodeEl.classList.add("is-dragging");
      }
      if (!rafId) {
        rafId = requestAnimationFrame(applyTransform);
      }
    };

    const onUp = (uEv: PointerEvent) => {
      if (uEv.pointerId !== pointerId && uEv.type !== "pointercancel") return;
      cleanupListeners();
      nodeEl.classList.remove("is-dragging");
      if (moved) {
        suppressClickRef.current = isHandle;
        const final = clampPos(
          { x: origin.x + (uEv.clientX - startX), y: origin.y + (uEv.clientY - startY) },
          w,
          h,
        );
        // Sincronizar left/top en el mismo tick antes de limpiar translate3d para evitar salto de 1 frame
        nodeEl.style.left = `${final.x}px`;
        nodeEl.style.top = `${final.y}px`;
        nodeEl.style.transform = "";
        setPos(final);
        savePos(key, final);
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 120);
      } else {
        nodeEl.style.transform = "";
      }
    };

    dragCleanupRef.current = () => {
      cleanupListeners();
      nodeEl.classList.remove("is-dragging");
      nodeEl.style.transform = "";
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  async function sendPrompt(textRaw: string) {
    const q = textRaw.trim();
    if (!q || busy || !activeConv) return;
    stopDictation();
    const targetConvId = activeConv.id;
    const snapshotTurns = activeConv.turns;
    const autoTitle = summarizeTitle(q);

    setDraft("");
    setErrorMsg("");

    const userTurn: Turn = { id: `u-${Date.now()}`, role: "user", text: q };
    const assistantId = `a-${Date.now()}`;

    if (!authed && !String(provider).startsWith("custom:")) {
      const offline = buildOfflineQuickActions(q);
      if (offline) {
        const applied = executeStudioActions(offline.actions, contextRef.current);
        updateConvTurns(
          targetConvId,
          (prev) => [...prev, userTurn, { id: assistantId, role: "assistant", text: offline.reply, actions: applied }],
          autoTitle,
        );
        return;
      }
      updateConvTurns(
        targetConvId,
        (prev) => [
          ...prev,
          userTurn,
          {
            id: assistantId,
            role: "assistant",
            text: `Falta conectar un proveedor de IA (${providerLabel(provider)}). Usa el ícono de ajustes arriba para conectar free-pi gratis o añadir tu API key.`,
          },
        ],
        autoTitle,
      );
      return;
    }

    setBusy(true);
    updateConvTurns(
      targetConvId,
      (prev) => [...prev, userTurn, { id: assistantId, role: "assistant", text: "" }],
      autoTitle,
    );

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const history: ChatMessage[] = [
        { role: "system", content: buildZenceSystemPrompt(contextRef.current) },
        ...snapshotTurns.slice(-10).map((t) => ({ role: t.role, content: t.text })),
        { role: "user", content: q },
      ];

      let accumulated = "";
      const fullReply = await streamChat({
        messages: history,
        provider,
        model: modelName,
        signal: ac.signal,
        onDelta: (chunk) => {
          accumulated += chunk;
          const visible = accumulated.replace(/<zence_actions>[\s\S]*$/i, "").trim();
          updateConvTurns(targetConvId, (prev) =>
            prev.map((t) => (t.id === assistantId ? { ...t, text: visible || "…" } : t)),
          );
        },
      });

      const { cleanText, actions } = extractStudioActions(fullReply || accumulated);
      const applied = actions.length > 0 ? executeStudioActions(actions, contextRef.current) : [];
      updateConvTurns(targetConvId, (prev) =>
        prev.map((t) =>
          t.id === assistantId
            ? { ...t, text: cleanText || (applied.length > 0 ? "Listo." : "(Sin respuesta)"), actions: applied }
            : t,
        ),
      );
    } catch (e) {
      if (!ac.signal.aborted) {
        const msg = e instanceof Error ? e.message : "No se pudo conectar con el proveedor de IA.";
        setErrorMsg(msg);
        updateConvTurns(targetConvId, (prev) =>
          prev.map((t) => (t.id === assistantId ? { ...t, text: `Error: ${msg}` } : t)),
        );
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function stopDictation() {
    const rec = speechRef.current;
    speechRef.current = null;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // Ignore stop errors.
      }
    }
    setListening(false);
  }

  function toggleDictation() {
    if (listening) {
      stopDictation();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) {
      setErrorMsg("Tu navegador no soporta dictado por voz (usa Chrome o Edge).");
      return;
    }
    setErrorMsg("");
    voiceBaseRef.current = draft.trim() ? `${draft.trimEnd()} ` : "";

    const rec = new Rec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "es-ES";

    rec.onresult = (event) => {
      let spoken = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const res = event.results[i];
        if (res && res[0]?.transcript) {
          spoken += res[0].transcript;
        }
      }
      setDraft(`${voiceBaseRef.current}${spoken.trimStart()}`);
    };

    rec.onerror = (ev) => {
      speechRef.current = null;
      setListening(false);
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setErrorMsg("Permiso de micrófono denegado en el navegador.");
      }
    };

    rec.onend = () => {
      speechRef.current = null;
      setListening(false);
    };

    speechRef.current = rec;
    try {
      rec.start();
      setListening(true);
      inputRef.current?.focus();
    } catch {
      speechRef.current = null;
      setListening(false);
      setErrorMsg("No se pudo iniciar el micrófono de dictado.");
    }
  }

  function startResize(ev: React.PointerEvent, axis: "y" | "xy") {
    const winEl = winRef.current;
    if (ev.button !== 0 || !winEl) return;
    ev.preventDefault();
    ev.stopPropagation();
    dragCleanupRef.current?.();

    const targetEl = ev.currentTarget as HTMLElement;
    const pointerId = ev.pointerId;
    const startX = ev.clientX;
    const startY = ev.clientY;
    const startSize: WindowSize = {
      width: winEl.offsetWidth || winSize.width,
      height: winEl.offsetHeight || winSize.height,
    };
    let rafId = 0;
    let latestDx = 0;
    let latestDy = 0;

    winEl.classList.add("is-dragging");
    try {
      targetEl.setPointerCapture(pointerId);
    } catch {
      // Ignore synthetic event capture errors.
    }

    const applySize = () => {
      rafId = 0;
      const next = clampSize(
        {
          width: axis === "xy" ? startSize.width + latestDx : startSize.width,
          height: startSize.height + latestDy,
        },
        winPos,
      );
      winEl.style.width = `${next.width}px`;
      winEl.style.height = `${next.height}px`;
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      try {
        if (targetEl.hasPointerCapture(pointerId)) targetEl.releasePointerCapture(pointerId);
      } catch {
        // Ignore.
      }
      dragCleanupRef.current = null;
    };

    const onMove = (mEv: PointerEvent) => {
      if (mEv.pointerId !== pointerId) return;
      latestDx = mEv.clientX - startX;
      latestDy = mEv.clientY - startY;
      if (!rafId) rafId = requestAnimationFrame(applySize);
    };

    const onUp = (uEv: PointerEvent) => {
      if (uEv.pointerId !== pointerId && uEv.type !== "pointercancel") return;
      cleanup();
      winEl.classList.remove("is-dragging");
      const final = clampSize(
        {
          width: axis === "xy" ? startSize.width + (uEv.clientX - startX) : startSize.width,
          height: startSize.height + (uEv.clientY - startY),
        },
        winPos,
      );
      winEl.style.width = `${final.width}px`;
      winEl.style.height = `${final.height}px`;
      setWinSize(final);
      saveWinSize(final);
    };

    dragCleanupRef.current = () => {
      cleanup();
      winEl.classList.remove("is-dragging");
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return (
    <>
      <button
        ref={handleRef}
        type="button"
        className={`zence-ai-handle ${open ? "is-open" : ""} ${busy ? "is-thinking" : ""}`}
        style={{ left: `${handlePos.x}px`, top: `${handlePos.y}px` }}
        title="Arrastra para mover · Clic para abrir/cerrar chat IA"
        aria-label="Abrir Asistente IA"
        aria-expanded={open}
        onPointerDown={(e) => startDrag(e, "ai-handle", handleRef.current, handlePos, setHandlePos, true)}
        onClick={() => {
          if (suppressClickRef.current) return;
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 24 : 8;
          let dx = 0;
          let dy = 0;
          if (e.key === "ArrowLeft") dx = -step;
          else if (e.key === "ArrowRight") dx = step;
          else if (e.key === "ArrowUp") dy = -step;
          else if (e.key === "ArrowDown") dy = step;
          else return;
          e.preventDefault();
          const next = clampPos({ x: handlePos.x + dx, y: handlePos.y + dy }, HANDLE_W, HANDLE_H);
          setHandlePos(next);
          savePos("ai-handle", next);
        }}
      >
        <OrganicOrbCanvas size={72} paused={reducedMotion} thinking={busy} />
      </button>

      {mounted && (
        <section
          ref={winRef}
          className={`zence-ai-pop ${popPhase === "entering" ? "is-entering" : ""} ${popPhase === "closing" ? "is-closing" : ""}`}
          style={{
            left: `${winPos.x}px`,
            top: `${winPos.y}px`,
            width: `${winSize.width}px`,
            height: `${winSize.height}px`,
          }}
          onAnimationEnd={(e) => {
            if (e.target === winRef.current && popPhase === "entering") {
              setPopPhase("open");
            }
          }}
          aria-label="Asistente IA de Zence R2"
        >
          <header
            className="zence-ai-grip"
            onPointerDown={(e) => startDrag(e, "ai-window", winRef.current, winPos, setWinPos, false)}
          >
            <div className="zence-ai-orb-slot" title="Arrastra desde la barra superior">
              <OrganicOrbCanvas size={30} paused={reducedMotion} thinking={busy} />
            </div>

            <div
              ref={convStripRef}
              className="zence-ai-convs"
              role="tablist"
              aria-label="Conversaciones"
              onWheel={(e) => {
                if (convStripRef.current && Math.abs(e.deltaY) > 0) {
                  convStripRef.current.scrollLeft += e.deltaY;
                }
              }}
            >
              {conversations.map((conv) => {
                const isActive = conv.id === activeConv?.id;
                const canClose = conversations.length > 1 || conv.turns.length > 0;
                return (
                  <div
                    key={conv.id}
                    className={`zence-ai-conv-item ${isActive ? "is-active" : ""}`}
                    role="tab"
                    aria-selected={isActive}
                  >
                    <button
                      type="button"
                      className="zence-ai-conv-btn"
                      title={conv.title}
                      onClick={() => handleSelectConversation(conv.id)}
                    >
                      <span>{conv.title}</span>
                    </button>
                    {canClose && (
                      <button
                        type="button"
                        className="zence-ai-conv-del"
                        title="Eliminar conversación"
                        aria-label={`Eliminar ${conv.title}`}
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                      >
                        <X size={9} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="zence-ai-head-actions">
              <button
                type="button"
                className="zence-ai-new-btn"
                title="Nueva conversación"
                aria-label="Nueva conversación"
                onClick={handleNewConversation}
              >
                <Plus size={12} />
                <span>Nueva</span>
              </button>
              <button
                type="button"
                className="icon-button"
                title="Configurar IA / free-pi / modelos"
                aria-label="Configurar IA"
                onClick={onOpenAiSettings}
              >
                <SlidersHorizontal size={12} />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Cerrar ventana"
                aria-label="Cerrar Asistente IA"
                onClick={() => setOpen(false)}
              >
                <X size={13} />
              </button>
            </div>
          </header>

          <div className="zence-ai-log" ref={logRef}>
            {turns.length === 0 ? (
              <div className="zence-ai-empty">
                <p>
                  Pídeme crear o conectar nodos (imagen, video, captura de cámara, micrófono, geometría 3D, Hydra) o ajustar la escena.
                </p>
                <div className="zence-ai-seeds">
                  {STUDIO_AI_SEEDS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      className="zence-ai-seed"
                      onClick={() => void sendPrompt(s.prompt)}
                    >
                      <Sparkles size={11} /> {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((turn) => (
                <div key={turn.id} className={`zence-ai-turn is-${turn.role}`}>
                  <div className="zence-ai-bubble">{turn.text}</div>
                  {turn.actions && turn.actions.length > 0 && (
                    <div className="zence-ai-actions-applied">
                      {turn.actions.map((a, idx) => (
                        <span key={idx} className="zence-ai-action-chip">
                          ✓ {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {!authed && !String(provider).startsWith("custom:") && (
            <div className="zence-ai-foot-warn">
              <span>{providerLabel(provider)}: sin conectar aún.</span>
              <button type="button" onClick={onOpenAiSettings}>
                Configurar free-pi / API
              </button>
            </div>
          )}
          {errorMsg && <div className="zence-ai-foot-warn is-bad">{errorMsg}</div>}

          <form
            className="zence-ai-form"
            onSubmit={(e) => {
              e.preventDefault();
              void sendPrompt(draft);
            }}
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={draft}
              className={listening ? "is-listening" : ""}
              placeholder={listening ? "Escuchando… habla ahora" : "Ej: Crea nodos para cargar una imagen con nivel y blur hacia Hydra…"}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendPrompt(draft);
                }
              }}
            />
            <button
              type="button"
              className={`button zence-ai-mic ${listening ? "is-listening" : ""}`}
              title={listening ? "Detener dictado por voz" : "Dictar mensaje por voz"}
              aria-label={listening ? "Detener dictado por voz" : "Dictar por voz"}
              aria-pressed={listening}
              onClick={toggleDictation}
            >
              {listening ? <MicOff size={13} /> : <Mic size={13} />}
            </button>
            {busy ? (
              <button
                type="button"
                className="button zence-ai-send"
                title="Detener respuesta"
                onClick={() => abortRef.current?.abort()}
              >
                <Square size={12} />
              </button>
            ) : (
              <button
                type="submit"
                className="button button-save zence-ai-send"
                disabled={!draft.trim()}
                title="Enviar (Enter)"
              >
                <Send size={13} />
              </button>
            )}
          </form>

          <div
            className="zence-ai-resize-b"
            title="Arrastra para ajustar altura"
            onPointerDown={(e) => startResize(e, "y")}
          />
          <div
            className="zence-ai-resize-br"
            title="Arrastra para escalar ancho y alto"
            onPointerDown={(e) => startResize(e, "xy")}
          />
        </section>
      )}
    </>
  );
}
