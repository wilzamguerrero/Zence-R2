/**
 * Los `/api/*` del estudio en Cloudflare Pages.
 *
 * Los handlers de `api/` están escritos una sola vez con la firma de
 * `VercelRequest`/`VercelResponse` porque es la que entiende el plugin de
 * desarrollo (`apps/studio/viteAiPlugin.ts`) y también Vercel. **Cloudflare
 * Pages no ejecuta `api/`**: sólo ejecuta `functions/`. Sin este archivo, un
 * `POST /api/freepi-ads` acababa en el servidor de estáticos y contestaba
 * `405 Method Not Allowed` —que es el «El servidor respondió 405» del
 * asistente—, y los `GET` devolvían el `index.html` en vez de JSON.
 *
 * Esto es el puente: una sola función que
 *  1. rellena `process.env` con los secretos y variables del proyecto
 *     (`env` de Pages), porque los handlers leen de ahí;
 *  2. envuelve el `Request` web en el `req` que esperan (`headers`, `query`,
 *     `body` ya parseado) y una respuesta `res.status().json()`/`send()`
 *     apoyada en un `ReadableStream`, así el flujo SSE de `ai-chat` sigue
 *     llegando trozo a trozo en vez de esperar a tenerlo todo;
 *  3. carga el handler que toca y devuelve `Response`.
 *
 * Se elige la ruta por nombre exacto: nada de la URL construye una ruta de
 * archivo, así que no hay forma de pedir un módulo que no esté en la tabla.
 */

import type { ApiHandler, ApiRequest, ApiResponse } from "../../api/_types.ts";

interface PagesContext {
  request: Request;
  env: Record<string, string | undefined>;
  params: { path?: string[] };
}

/** Lo que se sirve en `/api/<nombre>`, y nada más. */
const ROUTES: Record<string, () => Promise<{ default?: ApiHandler; handler?: ApiHandler }>> = {
  "ai-chat": () => import("../../api/ai-chat.ts"),
  "ai-models": () => import("../../api/ai-models.ts"),
  "ai-registry": () => import("../../api/ai-registry.ts"),
  "freepi-ads": () => import("../../api/freepi-ads.ts"),
  "freepi-device": () => import("../../api/freepi-device.ts"),
  "github-device": () => import("../../api/github-device.ts"),
  "health": () => import("../../api/health.ts"),
};

/** Un JSON de error, con la misma forma que los endpoints de `api/`. */
function jsonError(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** El cuerpo ya parseado como lo dejaría el plugin de desarrollo. */
async function parseBody(request: Request): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const raw = (await request.text()).trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Los secretos y variables de Pages, donde los handlers esperan encontrarlos.
 *
 * Se copia sólo lo que es texto: un binding (KV, D1, un objeto) no es una
 * variable de entorno y no debe acabar ahí. No se borra nada de lo que ya
 * hubiera: en desarrollo local el CLI puede haberlas puesto antes.
 */
function installEnv(env: Record<string, string | undefined>): void {
  const holder = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  holder.process ??= {};
  holder.process.env ??= {};

  for (const [key, value] of Object.entries(env ?? {})) {
    if (typeof value === "string") holder.process.env[key] = value;
  }
  // Marca que estamos en Pages: `_ai.ts` la usa para decidir si un proveedor
  // propio apuntando a la red local se permite o no.
  holder.process.env.CF_PAGES ??= "1";
}

/**
 * Un `res` de Express sobre un `ReadableStream`, con la respuesta diferida.
 *
 * Se exporta para poder probarlo sin levantar Cloudflare (`pages-adapter.test.ts`).
 */
export function adaptResponse(): { res: ApiResponse; response: Promise<Response> } {
  const headers = new Headers();
  let status = 200;
  let responded = false;
  let resolveResponse: (response: Response) => void = () => undefined;

  const response = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });

  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(next) {
      controller = next;
    },
  });

  /** Contesta una sola vez; lo que llegue después se ignora. */
  function respond(body: BodyInit | null): void {
    if (responded) return;
    responded = true;
    resolveResponse(new Response(body, { status, headers }));
  }

  function closeStream(): void {
    try {
      controller?.close();
    } catch {
      // Ya estaba cerrado: no hay nada que hacer.
    }
  }

  const res = {
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
      return res;
    },
    getHeader(name: string) {
      return headers.get(name) ?? undefined;
    },
    status(code: number) {
      status = code;
      return res;
    },
    write(chunk: string) {
      // El primer trozo arranca la respuesta: así el navegador recibe el SSE
      // conforme se produce y no al final.
      controller?.enqueue(encoder.encode(chunk));
      respond(stream);
      return true;
    },
    end(chunk?: string) {
      if (typeof chunk === "string" && chunk) controller?.enqueue(encoder.encode(chunk));
      closeStream();
      respond(stream);
      return res;
    },
    json(payload: unknown) {
      if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
      respond(JSON.stringify(payload));
      return res;
    },
    send(payload?: unknown) {
      if (payload === undefined || payload === null) {
        closeStream();
        respond(null);
        return res;
      }
      if (typeof payload === "string" || payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
        closeStream();
        respond(payload as BodyInit);
        return res;
      }
      return res.json(payload);
    },
  } as unknown as ApiResponse;

  return { res, response };
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const { request } = context;
  installEnv(context.env);

  const name = (context.params.path ?? [])[0] ?? "";
  const load = ROUTES[name];
  if (!load) {
    return jsonError(404, "unknown_endpoint", `No hay ningún endpoint «/api/${name}».`);
  }

  let handler: ApiHandler | undefined;
  try {
    const module = await load();
    handler = module.default ?? module.handler;
  } catch (error) {
    console.error(`[pages-api] no se pudo cargar api/${name}:`, error);
    return jsonError(500, "module_error", "No se pudo cargar el endpoint.");
  }
  if (typeof handler !== "function") {
    return jsonError(500, "handler_error", `El endpoint «${name}» no exporta un handler.`);
  }

  const url = new URL(request.url);
  const headerBag: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headerBag[key] = value;
  });

  const query: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    query[key] = values.length > 1 ? values : values[0]!;
  }

  const { res, response } = adaptResponse();
  const apiRequest = {
    method: request.method,
    headers: headerBag,
    query,
    body: await parseBody(request),
  } as unknown as ApiRequest;

  try {
    await handler(apiRequest, res);
  } catch (error) {
    console.error(`[pages-api] ${name}:`, error);
    res.status(500).json({
      error: "internal_error",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Si el handler terminó sin contestar nada, se cierra el flujo para no dejar
  // al navegador esperando una respuesta que nunca llega.
  res.end();

  return await response;
};
