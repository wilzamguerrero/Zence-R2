/**
 * Pruebas del sistema de anuncios de free-pi (`api/_ads.ts` y `api/freepi-ads.ts`).
 *
 * Se sustituye `fetch` por uno de mentira con las respuestas medidas contra el
 * backend: `/ads/next` devuelve el anuncio, `/ads/impression` devuelve
 * `{ok:true}` y el píxel de «gravity» es un GET suelto. Lo que se comprueba es lo
 * que no se puede ver a ojo: que el anuncio no se pida en cada petición, que la
 * impresión se reporte una sola vez, que el píxel no se dispare a un host que no
 * sea del anunciante y que `403 ads_required` se reconozca.
 */

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  adForUi, adsRequired, clearAds, ensureAd, panelAlive, panelPing, reportImpression,
  reportRendered,
} from "./_ads.ts";

const TOKEN = "token-de-prueba";

const AD = {
  ad_id: "ad-1",
  click_token: "ct-1",
  click_url: "https://sponsor.example/landing",
  source: "own",
  creative: { headline: "Un titular", body: "Una descripción", cta: "Probar", accent: "#ae68ad" },
};

const GRAVITY_AD = {
  ...AD,
  ad_id: "ad-g",
  click_token: "ct-g",
  source: "gravity",
  imp_url: "https://trk.trygravity.ai/pixel.gif",
};

interface Recorded { url: string; method: string; body?: unknown }

let calls: Recorded[] = [];
let nextAdBody: unknown = AD;
let nextAdStatus = 200;

function stubFetch(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    let body: unknown;
    if (typeof init?.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    calls.push({ url, method, body });

    if (url.includes("/ads/next")) {
      if (nextAdStatus === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(nextAdBody), {
        status: nextAdStatus,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/ads/impression")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("", { status: 200 });
  }) as typeof fetch;
}

const impressions = (): Recorded[] => calls.filter((c) => c.url.includes("/ads/impression"));
const nexts = (): Recorded[] => calls.filter((c) => c.url.includes("/ads/next"));

beforeEach(() => {
  calls = [];
  nextAdBody = AD;
  nextAdStatus = 200;
  clearAds();
  stubFetch();
});

test("un anuncio se pide una vez y se reutiliza mientras es reciente", async () => {
  const first = await ensureAd(TOKEN);
  const second = await ensureAd(TOKEN);

  assert.equal(first?.adId, "ad-1");
  assert.equal(second?.adId, "ad-1");
  assert.equal(nexts().length, 1, "el segundo no debe pedir otro anuncio");
  assert.equal(adForUi(TOKEN).headline, "Un titular");
});

test("force pide un anuncio nuevo aunque el anterior valga", async () => {
  await ensureAd(TOKEN);
  await ensureAd(TOKEN, true);
  assert.equal(nexts().length, 2);
});

test("la impresión se reporta una sola vez por anuncio", async () => {
  const ad = await ensureAd(TOKEN);
  assert.equal(await reportImpression(TOKEN, ad), true);
  assert.equal(await reportImpression(TOKEN, ad), true, "repetir no es un error");
  assert.equal(impressions().length, 1);

  const posted = impressions()[0]?.body as Record<string, unknown>;
  assert.equal(posted.ad_id, "ad-1");
  assert.equal(posted.click_token, "ct-1", "el servidor sí manda el token al backend");
  assert.equal(posted.imp_fired, undefined, "un anuncio propio no lleva píxel");
});

test("el píxel de gravity se dispara antes y se anota con imp_fired", async () => {
  nextAdBody = GRAVITY_AD;
  const ad = await ensureAd(TOKEN);
  await reportImpression(TOKEN, ad);

  const pixel = calls.find((c) => c.url.includes("trk.trygravity.ai"));
  assert.ok(pixel, "debía dispararse el píxel del anunciante");
  assert.equal((impressions()[0]?.body as Record<string, unknown>).imp_fired, true);
});

test("un píxel que apunta a otro host no se dispara", async () => {
  nextAdBody = { ...GRAVITY_AD, imp_url: "https://rastreador.example/pixel.gif" };
  const ad = await ensureAd(TOKEN);
  await reportImpression(TOKEN, ad);

  assert.equal(calls.some((c) => c.url.includes("rastreador.example")), false);
  assert.equal((impressions()[0]?.body as Record<string, unknown>).imp_fired, undefined);
});

test("sin anuncio en el backend (204) no hay nada que reportar", async () => {
  nextAdStatus = 204;
  assert.equal(await ensureAd(TOKEN), null);
  assert.equal(adForUi(TOKEN).shown, false);
  assert.equal(impressions().length, 0);
});

test("panelAlive sólo tras un ping del asistente", () => {
  assert.equal(panelAlive(TOKEN), false);
  panelPing(TOKEN);
  assert.equal(panelAlive(TOKEN), true);
});

test("reportRendered ignora un anuncio que no es el vigente", async () => {
  await ensureAd(TOKEN);
  assert.equal(await reportRendered(TOKEN, "ad-de-otro"), false);
  assert.equal(impressions().length, 0);
  assert.equal(await reportRendered(TOKEN, "ad-1"), true);
});

test("403 ads_required se reconoce y otros 403 no", () => {
  assert.equal(adsRequired(403, '{"error":"ads_required"}'), true);
  assert.equal(
    adsRequired(403, '{"error":{"message":"ads aren\'t displaying for this account"}}'),
    true,
  );
  assert.equal(adsRequired(403, '{"error":"forbidden"}'), false);
  assert.equal(adsRequired(401, '{"error":"ads_required"}'), false);
});
