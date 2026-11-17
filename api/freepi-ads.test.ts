/**
 * La fontanería de `/api/freepi-ads`: qué se le contesta al estudio.
 *
 * Lo importante aquí no es el anuncio sino lo que **no** viaja: el
 * `click_token` se queda en el servidor y el navegador identifica lo que pintó
 * por `ad_id`. También que sin credencial no es un error (el estudio simplemente
 * no pinta la franja) y que el ping del asistente abre la puerta a reportar.
 */

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import handler from "./freepi-ads.ts";
import { clearAds, panelAlive } from "./_ads.ts";
import type { ApiRequest, ApiResponse } from "./_types.ts";

const TOKEN = "token-de-prueba";

const AD = {
  ad_id: "ad-1",
  click_token: "ct-secreto",
  click_url: "https://sponsor.example/landing",
  source: "own",
  creative: { headline: "Un titular", body: "Una descripción", cta: "Probar", accent: "#ae68ad" },
};

let seen: string[] = [];

function stubFetch(): void {
  seen = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    seen.push(url);
    if (url.includes("/ads/next")) {
      return new Response(JSON.stringify(AD), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/ads/impression")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("", { status: 200 });
  }) as typeof fetch;
}

interface Sent { status: number; body: unknown }

async function call(
  method: string,
  body?: unknown,
  token = TOKEN,
): Promise<Sent> {
  const sent: Sent = { status: 0, body: null };
  const req = {
    method,
    body,
    headers: token ? { "x-ai-key": token } : {},
  } as unknown as ApiRequest;
  const res = {
    setHeader: () => undefined,
    status(code: number) { sent.status = code; return this; },
    json(payload: unknown) { sent.body = payload; },
    send(payload?: unknown) { sent.body = payload; },
  } as unknown as ApiResponse;

  await handler(req, res);
  return sent;
}

beforeEach(() => {
  clearAds();
  stubFetch();
});

test("GET devuelve el anuncio sin el click_token", async () => {
  const sent = await call("GET");
  const raw = JSON.stringify(sent.body);

  assert.equal(sent.status, 200);
  assert.match(raw, /ad-1/);
  assert.equal(raw.includes("ct-secreto"), false, "el click_token no sale del servidor");
  assert.equal(raw.includes("/ads/next"), false, "tampoco la URL interna");
});

test("GET marca que hay un asistente abierto", async () => {
  assert.equal(panelAlive(TOKEN), false);
  await call("GET");
  assert.equal(panelAlive(TOKEN), true);
});

test("sin credencial no es un error: sólo no hay franja", async () => {
  const sent = await call("GET", undefined, "");
  assert.equal(sent.status, 200);
  assert.deepEqual(
    (sent.body as { reason?: string }).reason,
    "no_key",
  );
  assert.equal(seen.length, 0, "no se molesta al backend sin credencial");
});

test("POST impression reporta una vez y contesta con el estado", async () => {
  await call("GET");
  const first = await call("POST", { step: "impression", ad_id: "ad-1" });
  const second = await call("POST", { step: "impression", ad_id: "ad-1" });

  assert.equal((first.body as { reported?: boolean }).reported, true);
  assert.equal((second.body as { reported?: boolean }).reported, true);
  assert.equal(seen.filter((u) => u.includes("/ads/impression")).length, 1);
});

test("POST con un ad_id que no es el vigente no reporta nada", async () => {
  await call("GET");
  const sent = await call("POST", { step: "impression", ad_id: "ad-que-no-es" });
  assert.equal((sent.body as { reported?: boolean }).reported, false);
  assert.equal(seen.filter((u) => u.includes("/ads/impression")).length, 0);
});

test("POST sin paso válido es un 400 explicado", async () => {
  const sent = await call("POST", { step: "otra-cosa" });
  assert.equal(sent.status, 400);
  assert.match(JSON.stringify(sent.body), /impression/);
});
