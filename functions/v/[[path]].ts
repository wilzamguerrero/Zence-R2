/**
 * Proxy inverso para versiones congeladas bajo `/v/<version>/`.
 *
 * Lee `/versions.json` desde los estáticos de `main` (`env.ASSETS`) para resolver
 * la versión solicitada hacia su despliegue Preview por rama en Cloudflare Pages.
 * Si mañana agregas una rama `release/0.0.2` y la registras en `versions.json`,
 * será accesible bajo `/v/0.0.2/` sin recompilar ramas anteriores.
 */

interface VersionEntry {
  version: string;
  branch: string;
  path: string;
  previewHost?: string;
  current?: boolean;
}

interface PagesContext {
  request: Request;
  env: {
    ASSETS: { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> };
  };
}

const slugifyBranch = (branch: string): string =>
  branch
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const loadVersions = async (context: PagesContext, origin: string): Promise<VersionEntry[]> => {
  try {
    const response = await context.env.ASSETS.fetch(new URL("/versions.json", origin).toString());
    if (!response.ok) return [];
    const data: unknown = await response.json();
    return Array.isArray(data) ? (data as VersionEntry[]) : [];
  } catch {
    return [];
  }
};

const resolvePreviewHost = (entry: VersionEntry, currentHostname: string): string => {
  if (typeof entry.previewHost === "string" && entry.previewHost.trim() !== "") {
    return entry.previewHost.trim();
  }
  const projectHost = currentHostname.endsWith(".pages.dev")
    ? currentHostname.split(".").slice(-3).join(".")
    : "zencer2.pages.dev";
  return `${slugifyBranch(entry.branch)}.${projectHost}`;
};

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const { request } = context;
  const url = new URL(request.url);

  const match = /^\/v\/([^/]+)(\/.*)?$/.exec(url.pathname);
  if (match === null) {
    return new Response("Versión no encontrada", {
      status: 404,
      headers: { "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  const requestedVersion = decodeURIComponent(match[1]!);
  const restPath = match[2];

  if (restPath === undefined) {
    const target = new URL(url.toString());
    target.pathname = `/v/${encodeURIComponent(requestedVersion)}/`;
    return Response.redirect(target.toString(), 302);
  }

  const versions = await loadVersions(context, url.origin);
  const entry = versions.find(
    (item) => item.version === requestedVersion && item.branch !== "main",
  );

  if (entry === undefined) {
    return new Response(`La versión ${requestedVersion} no está disponible.`, {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  const upstreamHost = resolvePreviewHost(entry, url.hostname);
  const upstreamUrl = new URL(`${restPath}${url.search}`, `https://${upstreamHost}`);

  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.set("Host", upstreamHost);
  upstreamHeaders.delete("Accept-Encoding");

  const upstreamResponse = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers: upstreamHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });

  const headers = new Headers(upstreamResponse.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");

  const location = headers.get("Location");
  if (location !== null) {
    try {
      const resolved = new URL(location, `https://${upstreamHost}`);
      if (resolved.hostname === upstreamHost) {
        const prefix = `/v/${encodeURIComponent(requestedVersion)}`;
        headers.set("Location", `${prefix}${resolved.pathname}${resolved.search}${resolved.hash}`);
      }
    } catch {
      // Keep original Location header if invalid URL.
    }
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
};
