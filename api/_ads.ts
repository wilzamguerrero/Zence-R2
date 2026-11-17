/**
 * Los anuncios de free-pi: lo que paga la inferencia gratis.
 *
 * free-pi no es gratis por caridad: el backend verifica que el cliente pida un
 * anuncio y reporte su impresión, y si no, corta las respuestas con
 * `403 ads_required` («ads aren't displaying for this account»). Es el mismo
 * sistema del portal (`justdowork/v3`, `portal_app/ads.py`), replicado aquí
 * contra el mismo backend:
 *
 *     GET  /ads/next?slot=banner  -> {ad_id, click_token, creative,
 *                                     click_url, source, imp_url?}
 *     POST /ads/impression        -> {"ok": true}  (reanuda al instante)
 *
 * Lo que hace falta, en orden: pedir el anuncio, avisar de que se ha visto y,
 * si es de «gravity», disparar antes su píxel (`imp_url`) para poder mandar
 * `imp_fired: true`. En el estudio no hay tarjeta de publicidad: el ciclo lo
 * lleva `startAdsKeepAlive()` en `apps/studio/src/ai/ads.ts`.
 *
 * Reglas que se conservan del portal:
 *  · se pide un anuncio nuevo cada `AD_TTL_MS` (no en cada petición);
 *  · la impresión se reporta **una vez** por `click_token`;
 *  · sólo se reporta cuando el estudio sigue abierto y consultando anuncios
 *    (`panelPing`/`panelAlive`): reportar un anuncio en nombre de alguien que ya
 *    cerró la aplicación sería mentir al anunciante, que es justo lo que el
 *    backend intenta evitar;
 *  · un `403 ads_required` no se queda en error: se pide anuncio, se reporta y
 *    se reintenta **una** vez, que es lo que desbloquea.
 *
 * El `click_token` no sale nunca del servidor: el navegador identifica el
 * anuncio que pintó por su `ad_id` y aquí se comprueba que sea el vigente.
 */

import { FREEPI_ROOT, ensureClientVersion, freepiHeaders } from "./_freepi.ts";

/** Lo que vale un anuncio ya mostrado, en milisegundos (5 min, como el portal). */
const AD_TTL_MS = 300_000;
/** Margen desde la última visita del asistente para considerar que hay alguien. */
const PANEL_ALIVE_MS = 120_000;
/** Tope de espera contra `/ads/*`: es un anuncio, no una respuesta de IA. */
const ADS_TIMEOUT_MS = 12_000;
/** Hosts a los que se permite disparar el píxel del anunciante. */
const GRAVITY_HOSTS = ["trygravity.ai", "trygravity.com"];
/** Cuántas credenciales se recuerdan a la vez (memoria del proceso, no disco). */
const MAX_ENTRIES = 50;

export interface AdCreative {
  headline: string;
  body: string;
  cta: string;
  accent: string;
}

export interface FreePiAd {
  adId: string;
  clickToken: string;
  clickUrl: string;
  source: string;
  impUrl: string;
  creative: AdCreative;
}

/** Lo que ve el navegador: sin `click_token` ni `imp_url`. */
export interface AdForUi {
  adId: string;
  headline: string;
  body: string;
  cta: string;
  accent: string;
  clickUrl: string;
  source: string;
  shown: boolean;
  reported: boolean;
  at: number;
}

interface Entry {
  ad: FreePiAd | null;
  /** Cuándo se pidió `ad` (ms). */
  at: number;
  /** `click_token` cuya impresión ya se reportó. */
  postedToken: string;
  /** Última vez que el asistente pidió un anuncio (ms). */
  panelAt: number;
}

const STATE = new Map<string, Entry>();

/** La ficha de esa credencial, creándola si hace falta. */
function entry(token: string): Entry {
  let state = STATE.get(token);
  if (state) return state;

  state = { ad: null, at: 0, postedToken: "", panelAt: 0 };
  // Memoria simple y acotada: si se llena, se tira la credencial más antigua.
  if (STATE.size >= MAX_ENTRIES) {
    const oldest = STATE.keys().next();
    if (!oldest.done) STATE.delete(oldest.value);
  }
  STATE.set(token, state);
  return state;
}

/** Marca que el estudio sigue abierto (la llama `/api/freepi-ads`). */
export function panelPing(token: string): void {
  entry(token).panelAt = Date.now();
}

/** ¿Hay alguien mirando? Sin esto no se reporta ninguna impresión. */
export function panelAlive(token: string): boolean {
  return Date.now() - entry(token).panelAt <= PANEL_ALIVE_MS;
}

/** Cierto cuando el backend corta porque no consta que se muestren anuncios. */
export function adsRequired(status: number, body: string): boolean {
  if (status !== 403) return false;
  const text = (body || "").toLowerCase();
  return text.includes("ads_required") || text.includes("ads aren't displaying") ||
    text.includes("ads aren't shown") || text.includes("ads_required_error");
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Una URL que se pueda abrir o disparar: sólo `https`. */
function httpsUrl(value: unknown): string {
  const raw = str(value);
  if (!raw) return "";
  try {
    return new URL(raw).protocol === "https:" ? raw : "";
  } catch {
    return "";
  }
}

/** El píxel sólo va a los hosts del anunciante, nunca a donde diga el JSON. */
function isGravityPixel(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" &&
      GRAVITY_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
  } catch {
    return false;
  }
}

/** Del JSON del backend a algo con forma conocida (o `null`). */
function normalizeAd(raw: unknown): FreePiAd | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const creative = (typeof data.creative === "object" && data.creative !== null
    ? data.creative
    : {}) as Record<string, unknown>;

  const adId = str(data.ad_id);
  const clickToken = str(data.click_token);
  if (!adId || !clickToken) return null;

  return {
    adId,
    clickToken,
    clickUrl: httpsUrl(data.click_url),
    source: str(data.source) || "own",
    impUrl: httpsUrl(data.imp_url),
    creative: {
      headline: str(creative.headline),
      body: str(creative.body),
      cta: str(creative.cta),
      accent: str(creative.accent),
    },
  };
}

/** Las cabeceras con las que free-pi reconoce al cliente (sesión y versión). */
async function adHeaders(token: string): Promise<Record<string, string>> {
  // La versión se lee antes de hablar: `/ads/next` también rechaza con 426 una
  // `x-client-version` por debajo del mínimo, y sin anuncio no se puede reportar
  // impresión (y sin impresión, free-pi corta las respuestas).
  await ensureClientVersion(token);
  return {
    ...await freepiHeaders(token),
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

/** `GET /ads/next?slot=…`. Devuelve `null` si no hay anuncio (204) o falla. */
async function nextAd(token: string, slot = "banner"): Promise<FreePiAd | null> {
  const url = `${FREEPI_ROOT}/ads/next?slot=${encodeURIComponent(slot)}`;
  try {
    const response = await fetch(url, {
      headers: await adHeaders(token),
      signal: AbortSignal.timeout(ADS_TIMEOUT_MS),
    });
    if (response.status === 204) return null;
    if (!response.ok) {
      console.warn(`[ads] /ads/next HTTP ${response.status}`);
      return null;
    }
    return normalizeAd(await response.json());
  } catch (error) {
    console.warn(`[ads] sin anuncio: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/** El píxel del anunciante (sólo «gravity»). `true` si se disparó. */
async function fireImpressionPixel(ad: FreePiAd): Promise<boolean> {
  if (ad.source !== "gravity" || !isGravityPixel(ad.impUrl)) return false;
  try {
    // Sin credencial y sin esperar la respuesta: es un píxel de 1×1.
    await fetch(ad.impUrl, { signal: AbortSignal.timeout(3_000) });
    return true;
  } catch {
    // Un píxel que no contesta no impide reportar la impresión.
    return true;
  }
}

/** `POST /ads/impression`, una vez por `click_token`. */
export async function reportImpression(token: string, ad: FreePiAd | null): Promise<boolean> {
  if (!token || !ad) return false;
  const state = entry(token);
  if (state.postedToken === ad.clickToken) return true;

  const fired = await fireImpressionPixel(ad);
  const body: Record<string, unknown> = { ad_id: ad.adId, click_token: ad.clickToken };
  if (fired) body.imp_fired = true;

  try {
    const response = await fetch(`${FREEPI_ROOT}/ads/impression`, {
      method: "POST",
      headers: { ...await adHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ADS_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[ads] /ads/impression HTTP ${response.status}`);
      return false;
    }
    state.postedToken = ad.clickToken;
    return true;
  } catch (error) {
    console.warn(`[ads] impresión falló: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Asegura que hay un anuncio reciente y lo devuelve.
 *
 * `force` lo usa el camino de recuperación (`403 ads_required`): pide uno nuevo
 * aunque el anterior no haya caducado.
 */
export async function ensureAd(token: string, force = false): Promise<FreePiAd | null> {
  if (!token) return null;
  const state = entry(token);
  const now = Date.now();

  if (!force && state.ad && now - state.at < AD_TTL_MS) return state.ad;

  const ad = await nextAd(token);
  if (!ad) return state.ad;
  state.ad = ad;
  state.at = now;
  return ad;
}

/** Lo que se puede devolver al navegador de ese anuncio. */
export function adForUi(token: string, ad: FreePiAd | null = null): AdForUi {
  const state = entry(token);
  const current = ad ?? state.ad;
  return {
    adId: current?.adId ?? "",
    headline: current?.creative.headline ?? "",
    body: current?.creative.body ?? "",
    cta: current?.creative.cta ?? "",
    accent: current?.creative.accent ?? "",
    clickUrl: current?.clickUrl ?? "",
    source: current?.source ?? "",
    shown: Boolean(current),
    reported: current !== null && state.postedToken === current.clickToken,
    at: Math.round(state.at / 1000),
  };
}

/**
 * Reporta la impresión del anuncio que el navegador acaba de pintar.
 *
 * Se identifica por `ad_id` y no por `click_token`: el token no viaja al
 * navegador, y aquí se comprueba que el anuncio reportado sea el vigente.
 */
export async function reportRendered(token: string, adId: string): Promise<boolean> {
  if (!token || !adId) return false;
  const state = entry(token);
  if (state.ad?.adId !== adId) return false;
  return reportImpression(token, state.ad);
}

/** El anuncio vigente, sin pedir uno nuevo. Para pruebas y diagnóstico. */
export function currentAd(token: string): FreePiAd | null {
  return STATE.get(token)?.ad ?? null;
}

/** Se olvida todo de esa credencial (o de todas). */
export function clearAds(token = ""): void {
  if (token) STATE.delete(token);
  else STATE.clear();
}
