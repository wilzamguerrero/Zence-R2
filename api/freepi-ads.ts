/**
 * Los anuncios de free-pi, servidos al estudio.
 *
 * `GET /api/freepi-ads`
 *   Devuelve el anuncio vigente y marca que el estudio sigue abierto (sin eso no
 *   se reporta ninguna impresión).
 *   `{ok:true, ad:{adId, headline, …, reported}}`
 *   `{ok:false, reason:"no_key"}` cuando no hay credencial de free-pi,
 *   `{ok:false, reason:"no_ad"}` cuando el backend no tiene anuncio ahora (204).
 *
 * `POST /api/freepi-ads` con `{"step":"impression","ad_id":"…"}`
 *   Reporta que ese anuncio se ha visto. Es lo que mantiene la cuenta
 *   desbloqueada: free-pi corta con `403 ads_required` si no consta.
 *
 * `POST /api/freepi-ads` con `{"step":"next"}`
 *   Pide uno nuevo (el estudio no lo necesita: rota solo cada 5 min, pero sirve
 *   para diagnosticar).
 *
 * Todo pasa por el servidor por dos motivos: el backend de free-pi no manda
 * cabeceras CORS y el `click_token` no debe llegar al navegador. La lógica está
 * en `_ads.ts`; del lado del estudio lo mueve `startAdsKeepAlive()`, en segundo
 * plano y sin interfaz.
 */

import type { ApiHandler } from "./_types.ts";
import { describe, noStore, readTarget, resolveKey } from "./_ai.ts";
import { adForUi, ensureAd, panelPing, reportRendered } from "./_ads.ts";

const handler: ApiHandler = async (req, res) => {
  noStore(res);

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "method_not_allowed", message: "Usa GET o POST." });
    return;
  }

  const found = readTarget(req, "freepi");
  if (!found.ok) {
    res.status(400).json({ error: found.code, message: found.message });
    return;
  }

  const token = resolveKey(req, found.target);
  if (!token) {
    // Sin credencial no hay a quién mostrarle anuncios. No es un error: el
    // estudio simplemente no hace nada.
    res.status(200).json({
      ok: false,
      reason: "no_key",
      message: "Conecta free-pi en los ajustes del asistente para que la cuenta esté activa.",
    });
    return;
  }

  try {
    if (req.method === "GET") {
      panelPing(token);
      const ad = await ensureAd(token);
      const info = adForUi(token, ad);
      if (!info.shown) {
        res.status(200).json({
          ok: false,
          reason: "no_ad",
          message: "free-pi no tiene anuncio para mostrar ahora mismo.",
        });
        return;
      }
      res.status(200).json({ ok: true, ad: info });
      return;
    }

    const body = (req.body ?? {}) as { step?: unknown; ad_id?: unknown };

    if (body.step === "next") {
      panelPing(token);
      const ad = await ensureAd(token, true);
      const info = adForUi(token, ad);
      res.status(200).json(info.shown
        ? { ok: true, ad: info }
        : { ok: false, reason: "no_ad", message: "free-pi no tiene anuncio ahora (204)." });
      return;
    }

    // El camino normal: el estudio acaba de ver `ad_id` y avisa.
    panelPing(token);
    const adId = typeof body.ad_id === "string" ? body.ad_id.trim() : "";
    if ((body.step !== undefined && body.step !== "impression") || !adId) {
      res.status(400).json({
        error: "bad_step",
        message: "El paso debe ser «impression» (con ad_id) o «next».",
      });
      return;
    }

    const reported = await reportRendered(token, adId);
    res.status(200).json({
      ok: reported,
      reported,
      ad: adForUi(token),
      message: reported
        ? "Anuncio contabilizado: free-pi seguirá respondiendo."
        : "No se pudo contabilizar ese anuncio (puede haber cambiado).",
    });
  } catch (error) {
    console.error("[freepi-ads]", describe(error));
    res.status(502).json({
      error: "freepi_unreachable",
      message: "No se pudo hablar con free-pi para el anuncio.",
    });
  }
};

export default handler;
