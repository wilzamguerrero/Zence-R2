/**
 * Los anuncios de free-pi, desde el navegador y **sin pintar nada**.
 *
 * free-pi es gratis porque paga la inferencia con publicidad: si su backend no
 * ve que el cliente pida un anuncio y reporte su impresión, corta las respuestas
 * con `403 ads_required`. El portal lo resuelve con una tarjeta en su panel; aquí
 * no hay tarjeta: `startAdsKeepAlive()` mantiene el ciclo en segundo plano
 * mientras el estudio está abierto, igual que el portal con la pestaña abierta.
 *
 * - `refreshAd()` pide el anuncio vigente al servidor (él guarda el
 *   `click_token`, que aquí no llega nunca).
 * - `confirmAd(adId)` avisa de que se ha visto; el servidor lo reporta al
 *   backend una sola vez por anuncio.
 * - `ensureAdShown()` hace las dos cosas: es lo que se llama antes de reintentar
 *   una petición que free-pi cortó por falta de anuncios.
 *
 * Sin interfaz a propósito: no hay nada que configurar ni nada que mirar.
 */

import { aiConfig, activeProvider } from "./config.ts";
import { providerHeaders } from "./wire.ts";

export interface AdView {
  adId: string;
  headline: string;
  body: string;
  cta: string;
  accent: string;
  clickUrl: string;
  source: string;
  /** Cierto cuando el backend ya contabilizó este anuncio. */
  reported: boolean;
  /** Segundos (epoch) en que se pidió el anuncio. */
  at: number;
}

const ENDPOINT = "/api/freepi-ads";

/**
 * Cada cuánto se vuelve a preguntar por el anuncio vigente. El servidor sólo
 * pide uno nuevo a free-pi cada 5 minutos: las demás consultas son una lectura
 * de memoria y sirven para que conste que el estudio sigue abierto.
 */
const REFRESH_MS = 60_000;

async function readAd(signal?: AbortSignal): Promise<AdView | null> {
  try {
    const response = await fetch(ENDPOINT, {
      headers: { Accept: "application/json", ...providerHeaders("freepi") },
      signal,
    });
    if (!response.ok) return null;
    const data = await response.json() as { ok?: boolean; ad?: Partial<AdView> };
    if (!data.ok || !data.ad?.adId) return null;
    return {
      adId: data.ad.adId,
      headline: data.ad.headline ?? "",
      body: data.ad.body ?? "",
      cta: data.ad.cta ?? "",
      accent: data.ad.accent ?? "",
      clickUrl: data.ad.clickUrl ?? "",
      source: data.ad.source ?? "",
      reported: data.ad.reported === true,
      at: typeof data.ad.at === "number" ? data.ad.at : 0,
    };
  } catch {
    return null;
  }
}

/** Pide el anuncio vigente (el servidor lo renueva cada 5 min). */
export async function refreshAd(signal?: AbortSignal): Promise<AdView | null> {
  return await readAd(signal);
}

/** Avisa de que ese anuncio ya se ha visto. El servidor lo reporta una vez. */
export async function confirmAd(adId: string, signal?: AbortSignal): Promise<boolean> {
  if (!adId) return false;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...providerHeaders("freepi"),
      },
      body: JSON.stringify({ step: "impression", ad_id: adId }),
      signal,
    });
    if (!response.ok) return false;
    const data = await response.json() as { reported?: boolean };
    return data.reported === true;
  } catch {
    return false;
  }
}

/**
 * Deja un anuncio contabilizado: pedirlo, confirmarlo y decir si el backend lo
 * aceptó. Es el paso previo a reintentar una petición cortada con
 * `403 ads_required`.
 */
export async function ensureAdShown(signal?: AbortSignal): Promise<boolean> {
  const ad = await readAd(signal);
  if (!ad) return false;
  if (ad.reported) return true;
  return await confirmAd(ad.adId, signal);
}

/** Un ciclo completo, sin solaparse con el anterior. */
function createTicker() {
  let running = false;
  return async function tick(signal?: AbortSignal): Promise<void> {
    if (running) return;
    if (activeProvider() !== "freepi") return;

    running = true;
    try {
      const ad = await readAd(signal);
      if (ad && !ad.reported) await confirmAd(ad.adId, signal);
    } finally {
      running = false;
    }
  };
}

/**
 * Arranca el ciclo en segundo plano y devuelve cómo pararlo.
 *
 * Se consulta al arrancar, cada minuto y cada vez que cambian los ajustes de IA
 * (conectar free-pi, cambiar de proveedor, cambiar de token): así el anuncio se
 * pide en cuanto hay credencial, sin esperar al siguiente minuto.
 */
export function startAdsKeepAlive(): () => void {
  const controller = new AbortController();
  const tick = createTicker();

  void tick(controller.signal);
  const timer = setInterval(() => void tick(controller.signal), REFRESH_MS);
  const unsubscribe = aiConfig.subscribe(() => void tick(controller.signal));

  return () => {
    clearInterval(timer);
    unsubscribe();
    controller.abort();
  };
}
