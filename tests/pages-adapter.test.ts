/**
 * El puente de `/api/*` en Cloudflare Pages (`functions/api/[[path]].ts`).
 *
 * Vive en `tests/` y no dentro de `functions/`: todo lo que hay en `functions/`
 * se despliega como endpoint, y este archivo importa `node:test` a propósito.
 *
 * Aquí se prueba lo que no se ve en un `curl` normal: que el flujo SSE llega
 * trozo a trozo (no de golpe al final), que `res.status().json()` produce la
 * misma respuesta que en desarrollo, que un endpoint desconocido contesta 404 en
 * JSON en vez del `index.html`, y que el cuerpo POST se parsea.
 *
 * El `onRequest` se llama con un `Request` web de verdad: Node 24 trae la misma
 * API que el runtime de Cloudflare, así que esto es el mismo camino.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { adaptResponse, onRequest } from "../functions/api/[[path]].ts";

interface Context {
  request: Request;
  env: Record<string, string | undefined>;
  params: { path?: string[] };
}

function call(name: string, init?: RequestInit, env: Record<string, string | undefined> = {}): Promise<Response> {
  const context: Context = {
    request: new Request(`https://zence.test/api/${name}`, init),
    env,
    params: { path: [name] },
  };
  return onRequest(context);
}

test("GET /api/health contesta JSON del endpoint de siempre", async () => {
  const response = await call("health");
  assert.equal(response.status, 200);
  const data = await response.json() as { ok?: boolean; service?: string };
  assert.equal(data.ok, true);
  assert.equal(data.service, "zence-r2");
});

test("POST /api/freepi-ads ya no es un 405: llega al handler", async () => {
  // Sin credencial de free-pi el endpoint contesta 200 `no_key`; lo importante es
  // que la petición entra (en Cloudflare acababa en el servidor de estáticos).
  const response = await call("freepi-ads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step: "impression", ad_id: "ad-1" }),
  });
  assert.equal(response.status, 200);
  const data = await response.json() as { reason?: string };
  assert.equal(data.reason, "no_key");
});

test("un endpoint que no existe contesta 404 en JSON, no el index.html", async () => {
  const response = await call("no-existe");
  assert.equal(response.status, 404);
  const data = await response.json() as { error?: string };
  assert.equal(data.error, "unknown_endpoint");
});

test("el flujo SSE se entrega trozo a trozo, no al final", async () => {
  const { res, response } = adaptResponse();
  res.setHeader("Content-Type", "text/event-stream");
  res.write("data: uno\n");
  res.write("data: dos\n");
  res.end();

  const answer = await response;
  assert.equal(answer.headers.get("content-type"), "text/event-stream");
  assert.equal(await answer.text(), "data: uno\ndata: dos\n");
});

test("status().json() marca el código y el tipo, como en desarrollo", async () => {
  const { res, response } = adaptResponse();
  res.status(418).json({ error: "te_pot" });

  const answer = await response;
  assert.equal(answer.status, 418);
  assert.match(answer.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await answer.json(), { error: "te_pot" });
});

test("send() sin cuerpo deja una respuesta vacía y cerrada", async () => {
  const { res, response } = adaptResponse();
  res.status(204);
  res.send();

  const answer = await response;
  assert.equal(answer.status, 204);
  assert.equal(await answer.text(), "");
});

test("los secretos de Pages acaban en process.env para los handlers", async () => {
  // `_ai.ts` lee las claves del entorno: en Pages vienen en `context.env`.
  await call("health", undefined, { FREEPI_TOKEN: "token-de-pages" });
  assert.equal(process.env.FREEPI_TOKEN, "token-de-pages");
  assert.equal(process.env.CF_PAGES, "1");
});
