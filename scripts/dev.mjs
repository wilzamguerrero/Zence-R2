import { createServer, loadEnv } from "vite";
import { WebSocketServer } from "ws";
import { networkInterfaces } from "node:os";
import { randomBytes } from "node:crypto";

const token = randomBytes(20).toString("hex");
const vite = await createServer({
  root: "apps/studio",
  server: {
    host: process.env.ZENCE_HOST || "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
});
const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
let studio = null;
let controls = [];
const peers = new Set();
let interfaces = {};
try {
  interfaces = networkInterfaces();
} catch {
  console.warn(
    "Escribe la IP local manualmente si el sistema no permite detectar interfaces.",
  );
}
const lan = Object.values(interfaces)
  .flat()
  .filter((item) => item && item.family === "IPv4" && !item.internal)
  .map((item) => item.address);
const addresses = lan.map((host) => `http://${host}:5173/?remote=1#${token}`);

vite.middlewares.use("/api/session", (req, res) => {
  const address = req.socket.remoteAddress;
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ token, addresses }));
});

const env = { ...loadEnv("development", process.cwd(), ""), ...process.env };
vite.middlewares.use("/api/assistant", async (req, res) => {
  if (
    req.method !== "POST" ||
    req.headers.authorization !== `Bearer ${token}`
  ) {
    res.statusCode = 403;
    res.end();
    return;
  }
  res.setHeader("Content-Type", "application/json");
  if (!env.ZENCE_AI_URL || !env.ZENCE_AI_MODEL) {
    res.statusCode = 503;
    res.end(
      JSON.stringify({
        error:
          "Configura ZENCE_AI_URL, ZENCE_AI_MODEL y, si corresponde, ZENCE_AI_KEY en .env.local de la raíz.",
      }),
    );
    return;
  }
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 200000) throw new Error("Solicitud demasiado grande");
    }
    const data = JSON.parse(body);
    if (typeof data.prompt !== "string" || data.prompt.length > 8000)
      throw new Error("Petición inválida");
    const response = await fetch(env.ZENCE_AI_URL, {
      method: "POST",
      signal: AbortSignal.timeout(60000),
      headers: {
        "Content-Type": "application/json",
        ...(env.ZENCE_AI_KEY
          ? { Authorization: `Bearer ${env.ZENCE_AI_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        model: env.ZENCE_AI_MODEL,
        messages: [
          {
            role: "system",
            content:
              'Eres el asistente de Zence R2. Devuelve solo código JavaScript para hydra-synth 1.4, sin markdown. control("id") lee los nodos numéricos. Usa funciones dinámicas para tiempo y controles. s0 es el medio cargado. audio() devuelve la envolvente del micrófono (0..1) si está activo. Colores predeterminados violeta #ae68ad sobre negro. Evita DOM, red, bucles y temporizadores. El usuario revisará y ejecutará la propuesta.',
          },
          {
            role: "user",
            content: JSON.stringify({
              request: data.prompt,
              project: data.project,
            }),
          },
        ],
      }),
    });
    if (!response.ok)
      throw new Error(`El proveedor devolvió HTTP ${response.status}`);
    const result = await response.json();
    const code = result.choices?.[0]?.message?.content;
    if (typeof code !== "string")
      throw new Error("El proveedor no devolvió código");
    res.end(
      JSON.stringify({
        code: code.replace(/^```(?:javascript|js)?\s*|```$/g, "").trim(),
      }),
    );
  } catch (error) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: error.message }));
  }
});

// API routes must run before Vite's HTML fallback.
for (const route of ["/api/session", "/api/assistant"]) {
  const index = vite.middlewares.stack.findIndex(
    (layer) => layer.route === route,
  );
  if (index >= 0)
    vite.middlewares.stack.unshift(vite.middlewares.stack.splice(index, 1)[0]);
}
vite.httpServer.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname !== "/control") return;
  if (url.searchParams.get("token") !== token) {
    socket.destroy();
    return;
  }
  const role = url.searchParams.get("role");
  if (
    role === "studio" &&
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      request.socket.remoteAddress,
    )
  ) {
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(request, socket, head, (ws) => {
    if (role === "studio") {
      if (studio?.readyState === 1) {
        ws.close(1008, "Studio already connected");
        return;
      }
      studio = ws;
    } else peers.add(ws);
    ws.send(
      JSON.stringify({
        type: "state",
        controls,
        connected: studio?.readyState === 1,
      }),
    );
    let pending = null;
    let flush = null;
    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (
          ws === studio &&
          data.type === "state" &&
          Array.isArray(data.controls)
        ) {
          controls = data.controls
            .filter(
              (c) =>
                typeof c.id === "string" &&
                [c.min, c.max, c.value].every(Number.isFinite),
            )
            .slice(0, 100);
          for (const peer of peers)
            if (peer.readyState === 1)
              peer.send(
                JSON.stringify({ type: "state", controls, connected: true }),
              );
        } else if (data.type === "set" && ws !== studio) {
          const control = controls.find((c) => c.id === data.id);
          if (control && Number.isFinite(data.value)) {
            pending = {
              type: "set",
              id: control.id,
              value: Math.max(control.min, Math.min(control.max, data.value)),
            };
            if (!flush)
              flush = setTimeout(() => {
                if (studio?.readyState === 1 && pending)
                  studio.send(JSON.stringify(pending));
                pending = null;
                flush = null;
              }, 16);
          }
        }
      } catch {
        ws.close(1008, "Invalid message");
      }
    });
    ws.on("close", () => {
      clearTimeout(flush);
      peers.delete(ws);
      if (ws === studio) {
        studio = null;
        for (const peer of peers)
          if (peer.readyState === 1)
            peer.send(
              JSON.stringify({ type: "state", controls, connected: false }),
            );
      }
    });
  });
});
await vite.listen();
vite.printUrls();
console.log("Control móvil disponible desde el botón Celular.");
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    for (const client of sockets.clients) client.close();
    sockets.close();
    await vite.close();
    process.exit(0);
  });
