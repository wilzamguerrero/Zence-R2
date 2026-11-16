import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { Node } from "../../../packages/engine/project.ts";
import { frameDocument } from "./hydraFrame.ts";
import type { Playback } from "./playback.ts";
import { sharedMocap } from "./mocap/mocapRuntime.ts";

export function useLiveStudio(
  code: string,
  nodes: Node[],
  playing: boolean,
  bpm: number,
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
  const [blackout, setBlackout] = useState(false);
  const [projecting, setProjecting] = useState(false);
  const [qr, setQr] = useState("");
  const [address, setAddress] = useState("");
  const session = useRef<{ token: string; addresses: string[] } | undefined>(
    undefined,
  );
  const remote = useRef<WebSocket | undefined>(undefined);
  const latest = useRef({ code, nodes, playing, bpm, blackout, onNumber });
  latest.current = { code, nodes, playing, bpm, blackout, onNumber };
  const projection = useRef<Window | null>(null);
  const [microphone, setMicrophone] = useState(false);
  const [liveSource, setLiveSource] = useState<"none" | "camera" | "screen">("none");
  const [recording, setRecording] = useState(false);
  const [texture, setTexture] = useState(false);
  const mediaStream = useRef<MediaStream | null>(null);
  const videoStream = useRef<MediaStream | null>(null);
  const videoElement = useRef<HTMLVideoElement | null>(null);
  const videoLoop = useRef(0);
  const audioContext = useRef<AudioContext | null>(null);
  const audioFrame = useRef(0);
  const audioLevels = useRef({ audio: 0, bass: 0, mid: 0, high: 0 });
  const beatOrigin = useRef(performance.now());
  const recorder = useRef<MediaRecorder | null>(null);
  const recordTrack = useRef<CanvasCaptureMediaStreamTrack | null>(null);
  const recordCanvas = useRef<HTMLCanvasElement | null>(null);
  const bitmap = useRef<ImageBitmap | null>(null);
  const send = useCallback(
    (data: unknown) => frame.current?.contentWindow?.postMessage(data, "*"),
    [],
  );
  const run = useCallback((overrideCode?: string) => {
    if (ready) {
      send({ type: "code", code: typeof overrideCode === "string" ? overrideCode : latest.current.code });
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
      if (event.data.type === "snapshotBitmap" && event.data.bitmap) {
        const snapBitmap = event.data.bitmap as ImageBitmap;
        const canvas = document.createElement("canvas");
        canvas.width = snapBitmap.width;
        canvas.height = snapBitmap.height;
        canvas.getContext("2d")?.drawImage(snapBitmap, 0, 0);
        snapBitmap.close();
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "zence-captura.png";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
        }, "image/png");
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
      value: texture || recording || projecting,
    });
  }, [texture, recording, projecting, ready, send]);
  useEffect(() => {
    send({ type: "playing", value: playing });
  }, [playing, ready, send]);
  useEffect(() => {
    send({ type: "blackout", value: blackout });
  }, [blackout, ready, send]);
  useEffect(() => {
    const values = playback.runtime.getNumbers();
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
      cancelAnimationFrame(videoLoop.current);
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      videoStream.current?.getTracks().forEach((track) => track.stop());
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
    let lastSync = 0;
    function draw(now: number) {
      if (ready && now - lastSync > 32) {
        lastSync = now;
        const beatSeconds = 60 / Math.max(40, latest.current.bpm);
        const beatPhase = (((now - beatOrigin.current) / 1000) / beatSeconds) % 1;
        send({
          type: "controls",
          values: {
            ...playback.runtime.getNumbers(),
            __audio: audioLevels.current.audio,
            __bass: audioLevels.current.bass,
            __mid: audioLevels.current.mid,
            __high: audioLevels.current.high,
            __bpm: latest.current.bpm,
            __beat: beatPhase,
            __bodyActivity: sharedMocap.state.activity,
            __handsDist: sharedMocap.state.handsDist,
            __headY: sharedMocap.state.headY,
            __leftOpen: sharedMocap.state.leftHand.open,
            __rightOpen: sharedMocap.state.rightHand.open,
            __leftPinch: sharedMocap.state.leftHand.pinch,
            __rightPinch: sharedMocap.state.rightHand.pinch,
            __leftSpread: sharedMocap.state.leftHand.spread,
            __rightSpread: sharedMocap.state.rightHand.spread,
          },
        });
      }
      const capture = recordCanvas.current;
      if (capture) {
        const ctx = capture.getContext("2d");
        if (latest.current.blackout) {
          ctx?.fillRect(0, 0, capture.width, capture.height);
          recordTrack.current?.requestFrame();
        } else {
          const source =
            mode === "hydra"
              ? bitmap.current
              : document.querySelector<HTMLCanvasElement>(
                  ".render-surface canvas",
                );
          if (source && ctx) {
            ctx.drawImage(source, 0, 0, capture.width, capture.height);
            recordTrack.current?.requestFrame();
          }
        }
      }
      const win = projection.current;
      if (win && win.closed) {
        projection.current = null;
        setProjecting(false);
      } else if (win && !win.closed) {
        const canvas = win.document.querySelector("canvas");
        const source =
          mode === "hydra"
            ? bitmap.current
            : document.querySelector<HTMLCanvasElement>(
                ".render-surface canvas",
              );
        if (canvas) {
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
          if (source && !latest.current.blackout) {
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
      }
      id = requestAnimationFrame(draw);
    }
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [mode, playback, ready, send]);

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
    win.onbeforeunload = () => setProjecting(false);
    projection.current = win;
    setProjecting(true);
    send({ type: "export", value: true });
  }
  async function toggleMicrophone() {
    if (microphone) {
      cancelAnimationFrame(audioFrame.current);
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      await audioContext.current?.close();
      audioLevels.current = { audio: 0, bass: 0, mid: 0, high: 0 };
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
      function avgRange(start: number, end: number) {
        let sum = 0;
        for (let i = start; i < end; i += 1) sum += data[i] ?? 0;
        return sum / Math.max(1, end - start) / 255;
      }
      function analyse() {
        analyser.getByteFrequencyData(data);
        audioLevels.current = {
          audio: avgRange(0, data.length),
          bass: avgRange(0, 12),
          mid: avgRange(12, 64),
          high: avgRange(64, 160),
        };
        audioFrame.current = requestAnimationFrame(analyse);
      }
      analyse();
      setMicrophone(true);
      setStatus("Micrófono activo: audio(), bass(), mid(), high().");
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

  function stopVideoSource() {
    cancelAnimationFrame(videoLoop.current);
    videoStream.current?.getTracks().forEach((track) => track.stop());
    videoStream.current = null;
    videoElement.current = null;
    setLiveSource("none");
    send({ type: "resetSource" });
  }

  async function startVideoSource(kind: "camera" | "screen") {
    if (liveSource === kind) {
      stopVideoSource();
      return;
    }
    stopVideoSource();
    try {
      const stream =
        kind === "camera"
          ? await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } })
          : await navigator.mediaDevices.getDisplayMedia({ video: true });
      videoStream.current = stream;
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      videoElement.current = video;
      setLiveSource(kind);
      setStatus(
        kind === "camera"
          ? "Cámara activa en s0. Usa src(s0).out(o0) o ejemplo Medio."
          : "Pantalla compartida en s0. Usa src(s0).out(o0) o ejemplo Medio.",
      );
      setError(false);

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopVideoSource();
      });

      let lastPush = 0;
      let busy = false;
      function pushFrame(now: number) {
        if (!videoStream.current) return;
        if (!busy && now - lastPush > 32 && video.readyState >= 2) {
          busy = true;
          lastPush = now;
          createImageBitmap(video)
            .then((bmp) => {
              frame.current?.contentWindow?.postMessage(
                { type: "sourceFrame", bitmap: bmp },
                "*",
                [bmp],
              );
            })
            .catch(() => {})
            .finally(() => {
              busy = false;
            });
        }
        videoLoop.current = requestAnimationFrame(pushFrame);
      }
      videoLoop.current = requestAnimationFrame(pushFrame);
    } catch (e) {
      setError(true);
      setStatus(`No se pudo abrir ${kind === "camera" ? "la cámara" : "la pantalla"}. ` + String(e));
    }
  }

  function capturePng() {
    if (mode === "hydra") {
      send({ type: "snapshot" });
      return;
    }
    const canvas = document.querySelector<HTMLCanvasElement>(".render-surface canvas");
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "zence-captura.png";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }, "image/png");
  }

  return {
    bitmap,
    texture,
    setTexture,
    blackout,
    setBlackout,
    projecting,
    audioLevels,
    syncBeatOrigin: () => {
      beatOrigin.current = performance.now();
    },
    liveSource,
    toggleCamera: () => void startVideoSource("camera"),
    toggleScreen: () => void startVideoSource("screen"),
    capturePng,
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
