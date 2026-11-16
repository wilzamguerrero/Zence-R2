import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { Node } from "../../../packages/engine/project.ts";
import { frameDocument } from "./hydraFrame.ts";
import type { Playback } from "./playback.ts";

export function useLiveStudio(
  code: string,
  nodes: Node[],
  playing: boolean,
  playback: Playback,
  onNumber: (id: string, value: number) => void,
) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [html] = useState(frameDocument);
  const [ready, setReady] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<"3d" | "hydra">("hydra");
  const [qr, setQr] = useState("");
  const [address, setAddress] = useState("");
  const session = useRef<{ token: string; addresses: string[] } | undefined>(
    undefined,
  );
  const remote = useRef<WebSocket | undefined>(undefined);
  const latest = useRef({ code, nodes, playing, onNumber });
  latest.current = { code, nodes, playing, onNumber };
  const projection = useRef<Window | null>(null);
  const [microphone, setMicrophone] = useState(false);
  const [recording, setRecording] = useState(false);
  const [texture, setTexture] = useState(false);
  const mediaStream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioFrame = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordTrack = useRef<CanvasCaptureMediaStreamTrack | null>(null);
  const recordCanvas = useRef<HTMLCanvasElement | null>(null);
  const bitmap = useRef<ImageBitmap | null>(null);
  const send = useCallback(
    (data: unknown) => frame.current?.contentWindow?.postMessage(data, "*"),
    [],
  );
  const run = useCallback(() => {
    if (ready) {
      send({ type: "code", code: latest.current.code });
      setStatus("Compilando…");
    }
  }, [ready, send]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data.type === "ready") setReady(true);
      if (event.data.type === "compiled") {
        setStatus("Código aplicado");
        setError(false);
      }
      if (event.data.type === "error") {
        setStatus(event.data.message);
        setError(true);
      }
      if (event.data.type === "mediaReady") {
        setStatus("Medio disponible en s0. Elige el ejemplo Medio.");
        setError(false);
      }
      if (event.data.type === "frame") {
        bitmap.current?.close();
        bitmap.current = event.data.bitmap;
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);
  useEffect(() => {
    if (ready) run();
  }, [ready, run]);
  useEffect(() => {
    if (!automatic || !ready) return;
    const timer = setTimeout(run, 650);
    return () => clearTimeout(timer);
  }, [code, automatic, ready, run]);
  useEffect(() => {
    send({
      type: "export",
      value: texture || recording || !!projection.current,
    });
  }, [texture, recording, ready, send]);
  useEffect(() => {
    send({ type: "playing", value: playing });
  }, [playing, ready, send]);
  useEffect(() => {
    const values = Object.fromEntries(
      nodes
        .filter((n) => n.kind === "control.number")
        .map((n) => [n.id, n.initial]),
    );
    send({ type: "controls", values });
    if (remote.current?.readyState === 1)
      remote.current.send(
        JSON.stringify({
          type: "state",
          controls: nodes
            .filter((n) => n.kind === "control.number")
            .map((n) => ({
              id: n.id,
              min: n.min,
              max: n.max,
              value: n.initial,
            })),
        }),
      );
  }, [nodes, ready, send]);

  useEffect(() => {
    let stop = false;
    let timer: number;
    async function connect() {
      try {
        if (!session.current) {
          const response = await fetch("/api/session");
          if (!response.ok) return;
          session.current = await response.json();
        }
        if (stop || !session.current) return;
        const ws = new WebSocket(
          `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/control?role=studio&token=${session.current.token}`,
        );
        remote.current = ws;
        ws.onopen = () =>
          ws.send(
            JSON.stringify({
              type: "state",
              controls: latest.current.nodes
                .filter((n) => n.kind === "control.number")
                .map((n) => ({
                  id: n.id,
                  min: n.min,
                  max: n.max,
                  value: n.initial,
                })),
            }),
          );
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === "set") latest.current.onNumber(data.id, data.value);
        };
        ws.onclose = () => {
          if (!stop) timer = window.setTimeout(connect, 1500);
        };
      } catch {
        if (!stop) timer = window.setTimeout(connect, 2000);
      }
    }
    void connect();
    return () => {
      stop = true;
      clearTimeout(timer);
      remote.current?.close();
      projection.current?.close();
      bitmap.current?.close();
      cancelAnimationFrame(audioFrame.current);
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      void audioContext.current?.close();
      if (recorder.current?.state === "recording") recorder.current.stop();
    };
  }, []);

  async function showRemote() {
    const url = session.current?.addresses[0];
    if (!url) {
      setStatus("Inicia npm run dev y conecta el computador a una red local.");
      setError(true);
      return;
    }
    setAddress(url);
    setQr(
      await QRCode.toDataURL(url, {
        color: { dark: "#202020", light: "#ffffff" },
      }),
    );
  }

  useEffect(() => {
    let id: number;
    function draw() {
      const capture = recordCanvas.current;
      if (capture) {
        const source =
          mode === "hydra"
            ? bitmap.current
            : document.querySelector<HTMLCanvasElement>(
                ".render-surface canvas",
              );
        if (source) {
          capture
            .getContext("2d")
            ?.drawImage(source, 0, 0, capture.width, capture.height);
          recordTrack.current?.requestFrame();
        }
      }
      const win = projection.current;
      if (win && !win.closed) {
        const canvas = win.document.querySelector("canvas");
        const source =
          mode === "hydra"
            ? bitmap.current
            : document.querySelector<HTMLCanvasElement>(
                ".render-surface canvas",
              );
        if (canvas && source) {
          if (
            canvas.width !== win.innerWidth ||
            canvas.height !== win.innerHeight
          ) {
            canvas.width = win.innerWidth;
            canvas.height = win.innerHeight;
          }
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const width = source.width,
            height = source.height;
          const scale = Math.min(canvas.width / width, canvas.height / height);
          ctx.drawImage(
            source,
            (canvas.width - width * scale) / 2,
            (canvas.height - height * scale) / 2,
            width * scale,
            height * scale,
          );
        }
      }
      id = requestAnimationFrame(draw);
    }
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [mode, playback]);

  function openProjection() {
    const win = window.open("", "zence-program", "popup,width=1280,height=720");
    if (!win) {
      setStatus("Permite la ventana emergente de proyección.");
      setError(true);
      return;
    }
    win.document.body.innerHTML =
      '<canvas style="display:block;width:100vw;height:100vh"></canvas>';
    win.document.body.style.cssText =
      "margin:0;background:black;overflow:hidden";
    win.document.title = "Zence R2 · Programa";
    win.document.body.ondblclick = () =>
      void win.document.documentElement.requestFullscreen();
    projection.current = win;
    send({ type: "export", value: true });
  }
  async function toggleMicrophone() {
    if (microphone) {
      cancelAnimationFrame(audioFrame.current);
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      await audioContext.current?.close();
      setMicrophone(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream.current = stream;
      const context = new AudioContext();
      audioContext.current = context;
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      function analyse() {
        analyser.getByteFrequencyData(data);
        const level = data.reduce((sum, n) => sum + n, 0) / data.length / 255;
        const values = Object.fromEntries(
          latest.current.nodes
            .filter((n) => n.kind === "control.number")
            .map((n) => [n.id, n.initial]),
        );
        send({ type: "controls", values: { ...values, __audio: level } });
        audioFrame.current = requestAnimationFrame(analyse);
      }
      analyse();
      setMicrophone(true);
      setStatus("Micrófono activo. Usa audio() en el código.");
    } catch (e) {
      setError(true);
      setStatus("No se pudo abrir el micrófono. " + String(e));
    }
  }
  function toggleRecording() {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      setRecording(false);
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      recordCanvas.current = canvas;
      const stream = canvas.captureStream(0);
      recordTrack.current =
        stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      const instance = new MediaRecorder(stream);
      recorder.current = instance;
      const chunks: Blob[] = [];
      instance.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      instance.onstop = () => {
        const url = URL.createObjectURL(
          new Blob(chunks, { type: instance.mimeType }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download =
          "zence-toma." + (instance.mimeType.includes("mp4") ? "mp4" : "webm");
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        stream.getTracks().forEach((track) => track.stop());
        recordCanvas.current = null;
        recordTrack.current = null;
      };
      instance.start(1000);
      setRecording(true);
    } catch (e) {
      setError(true);
      setStatus("No se pudo grabar. " + String(e));
    }
  }
  return {
    bitmap,
    texture,
    setTexture,
    microphone,
    toggleMicrophone,
    recording,
    toggleRecording,
    frame,
    html,
    mode,
    setMode,
    automatic,
    setAutomatic,
    status,
    error,
    run,
    send,
    showRemote,
    qr,
    address,
    closeRemote: () => setQr(""),
    openProjection,
  };
}
