import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { loadEnv, type Plugin } from "vite";
import type { ApiHandler, ApiRequest, ApiResponse } from "../../api/_types.ts";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const AI_ROUTES = new Set(["ai-chat", "ai-models", "ai-registry", "freepi-device", "github-device", "health"]);

function sendJson(res: ServerResponse, code: number, payload: unknown): void {
  if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = code;
  res.end(JSON.stringify(payload));
}

function adaptResponse(res: ServerResponse): ApiResponse {
  const api = res as ApiResponse;
  api.status = (code) => {
    res.statusCode = code;
    return api;
  };
  api.json = (payload) => sendJson(res, res.statusCode || 200, payload);
  api.send = (payload) => {
    if (payload === undefined || payload === null) return res.end();
    if (typeof payload === "string" || Buffer.isBuffer(payload)) return res.end(payload);
    sendJson(res, res.statusCode || 200, payload);
  };
  return api;
}

function parseQuery(url: URL): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    query[key] = values.length > 1 ? values : values[0]!;
  }
  return query;
}

async function parseBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error("Cuerpo demasiado grande.");
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function zenceAiApiPlugin(apiDir: string): Plugin {
  return {
    name: "zence-r2:ai-api",
    apply: "serve",
    configResolved(config) {
      for (const [key, value] of Object.entries(loadEnv(config.mode, process.cwd(), ""))) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
      process.env.ZENCE_DEV = "1";
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/")) return next();
        const name = url.pathname.slice("/api/".length);
        if (!AI_ROUTES.has(name)) return next();

        const file = resolve(apiDir, `${name}.ts`);
        if (!existsSync(file)) return next();

        try {
          const apiReq = req as ApiRequest;
          apiReq.query = parseQuery(url);
          apiReq.body = await parseBody(req);
          const mod = await server.ssrLoadModule(file);
          const handler = (mod.default ?? mod.handler) as ApiHandler | undefined;
          if (typeof handler !== "function") {
            return sendJson(res, 500, { error: `Handler inválido en api/${name}.ts` });
          }
          await handler(apiReq, adaptResponse(res));
          if (!res.writableEnded) res.end();
        } catch (err) {
          if (err instanceof Error) server.ssrFixStacktrace(err);
          console.error(`[ai-api] ${name}:`, err);
          if (!res.headersSent) {
            sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
          } else if (!res.writableEnded) {
            res.end();
          }
        }
      });
    },
  };
}
