import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const here = import.meta.dirname;

function readAppVersion(): string {
  try {
    const raw = readFileSync(resolve(here, "../../package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.trim() !== ""
      ? parsed.version.trim()
      : "0.0.1";
  } catch {
    return "0.0.1";
  }
}

function formatSplashVersion(version: string): string {
  const match = /^(\d+)\./.exec(version);
  if (match === null) return version;
  const major = Number(match[1]);
  if (major === 0) return `Alpha ${version}`;
  if (major === 1) return `Beta ${version}`;
  return version;
}

const versionHtmlPlugin = (version: string, isArchive: boolean): Plugin => ({
  name: "zence-version-html",
  transformIndexHtml(html) {
    let next = html.replace(
      /<p class="splash-version">[^<]*<\/p>/,
      `<p class="splash-version">${formatSplashVersion(version)}</p>`,
    );
    if (isArchive && !next.includes('name="robots"')) {
      next = next.replace(
        /<\/head>/i,
        '  <meta name="robots" content="noindex, nofollow">\n</head>',
      );
    }
    return next;
  },
});

export default defineConfig(() => {
  const appVersion = readAppVersion();
  const cfBranch = process.env.CF_PAGES_BRANCH ?? "";
  const isArchive =
    (cfBranch !== "" && cfBranch !== "main") || process.env.ZENCE_ARCHIVE === "1";

  return {
    base: isArchive ? "./" : "/",
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __IS_ARCHIVE__: JSON.stringify(isArchive),
    },
    plugins: [versionHtmlPlugin(appVersion, isArchive)],
  };
});
