/**
 * La versión de cliente de free-pi se arregla sola.
 *
 * El backend ata `x-client-version` a un mínimo y corta con
 * `426 upgrade_required` («your free-pi CLI is below required minimum 0.6.21»).
 * Eso dejaba el asistente sin responder hasta que alguien editara el código. Aquí
 * se comprueba lo que hace el servidor en su lugar: leer `/client-version` antes
 * de hablar y, si aun así se queja, reintentar con `latest` y —en último caso—
 * dejar de anunciar la cabecera, que es opcional.
 */

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import chatHandler from "./ai-chat.ts";
import { dropClientVersion, ensureClientVersion, freepiHeaders, setClientVersion } from "./_freepi.ts";
import type { ApiRequest, ApiResponse } from "./_types.ts";

const TOKEN = "token-de-prueba";

let chatCalls: Record<string, unknown>[] = [];
let chatStatus = 200;
let versionBody: unknown = { min: "0.6.21", latest: "0.6.25" };
let versionStatus = 200;
let versionCalls = 0;

function stubFetch(): void {
  chatCalls = [];
  versionCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("/client-version")) {
      versionCalls += 1;
      return new Response(JSON.stringify(versionBody), {
        status: versionStatus,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/chat/completions")) {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      chatCalls.push({
        body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
        version: headers["x-client-version"] ?? "",
      });
      if (chatStatus !== 200) {
        return new Response(
          JSON.stringify({ error: { message: "your free-pi CLI is below required minimum 0.6.21 update" } }),
          { status: chatStatus, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "listo" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response("", { status: 200 });
  }) as typeof fetch;
}

interface Sent { status: number; body: unknown }

async function ask(): Promise<Sent> {
  const sent: Sent = { status: 0, body: null };
  const req = {
    method: "POST",
    headers: { "x-ai-key": TOKEN },
    body: {
      provider: "freepi",
      model: "deepseek-v4.1-flash",
      messages: [{ role: "user", content: "hola" }],
      stream: false,
    },
  } as unknown as ApiRequest;
  const res = {
    setHeader: () => undefined,
    status(code: number) { sent.status = code; return this; },
    json(payload: unknown) { sent.body = payload; },
    send(payload?: unknown) { sent.body = payload; },
  } as unknown as ApiResponse;

  await chatHandler(req, res);
  return sent;
}

beforeEach(() => {
  stubFetch();
  chatStatus = 200;
  versionBody = { min: "0.6.21", latest: "0.6.25" };
  versionStatus = 200;
  // Cada prueba parte de una versión vieja conocida, como la de un despliegue
  // que se quedó atrás.
  setClientVersion("0.6.10");
});

test("antes de hablar se anuncia la versión `latest` del backend", async () => {
  const sent = await ask();

  assert.equal(sent.status, 200);
  assert.equal(versionCalls, 1, "se pregunta la versión una vez");
  assert.equal(chatCalls[0]?.version, "0.6.25");

  // Y no se vuelve a preguntar en el mensaje siguiente (TTL de 30 min).
  await ask();
  assert.equal(versionCalls, 1, "la versión leída se recuerda");
});

test("un 426 se arregla solo: relee la versión y reintenta", async () => {
  // La versión anunciada es vieja porque el primer intento falla.
  setClientVersion("0.6.10");
  chatStatus = 426;
  const sent = await ask();

  assert.equal(sent.status, 426, "si el backend sigue en 426 se explica");
  assert.equal(versionCalls, 2, "la versión se lee antes de hablar y otra vez al ver el 426");
  // El reintento llevó la versión nueva (0.6.25) y, al seguir en 426, se dejó de
  // anunciar la cabecera: el último intento va sin versión.
  assert.equal(chatCalls.length, 3, "hablar, reintentar con nueva versión y sin versión");
  assert.equal(chatCalls[1]?.version, "0.6.25");
  assert.equal(chatCalls[2]?.version, "");
  assert.equal(chatCalls[0]?.version, "0.6.25", "ya iba con la última leída");
  assert.match(JSON.stringify(sent.body), /freepi_version/);
});

test("si el reintento con la versión nueva pasa, la respuesta llega", async () => {
  setClientVersion("0.6.10");
  // Primer chat 426, después 200.
  let first = true;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/chat/completions") && first) {
      first = false;
      chatStatus = 426;
      const failed = await realFetch(input, init);
      chatStatus = 200;
      return failed;
    }
    return realFetch(input, init);
  }) as typeof fetch;

  const sent = await ask();
  assert.equal(sent.status, 200);
  assert.match(JSON.stringify(sent.body), /listo/);
  assert.equal(chatCalls.at(-1)?.version, "0.6.25");
});

test("si /client-version no contesta se sigue anunciando lo que había", async () => {
  versionStatus = 500;
  const version = await ensureClientVersion(TOKEN, true);
  assert.equal(version, "0.6.10", "sin datos nuevos no se toca lo que ya había");
  const headers = await freepiHeaders(TOKEN);
  assert.equal(headers["x-client-version"], "0.6.10");
});

test("dropClientVersion deja de anunciar la cabecera", async () => {
  dropClientVersion();
  const headers = await freepiHeaders(TOKEN);
  assert.equal(headers["x-client-version"], undefined);
  // Y una sesión válida sigue viajando.
  assert.match(headers["x-session-id"] ?? "", /^[0-9a-f-]{36}$/);
});
