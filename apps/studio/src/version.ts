export interface VersionEntry {
  version: string;
  branch: string;
  path: string;
  engine?: string;
  previewHost?: string;
  current?: boolean;
  note?: string;
}

export const APP_VERSION =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.1";

const PRIMARY_HOST = "zencer2.pages.dev";
const PRIMARY_ORIGIN = `https://${PRIMARY_HOST}`;

export const isArchiveMode = (): boolean => {
  if (typeof __IS_ARCHIVE__ === "boolean" && __IS_ARCHIVE__) return true;
  if (typeof window === "undefined") return false;
  if (window.location.pathname.startsWith("/v/")) return true;
  const host = window.location.hostname;
  return host.endsWith(`.${PRIMARY_HOST}`) && host !== PRIMARY_HOST;
};

export const versionStage = (version: string): "Alpha" | "Beta" | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (match === null) return null;
  const major = Number(match[1]);
  if (major === 0) return "Alpha";
  if (major === 1) return "Beta";
  return null;
};

export const formatVersionLabel = (version: string): string => {
  const stage = versionStage(version);
  return stage === null ? version : `${stage} ${version}`;
};

const isDirectPreviewHost = (): boolean => {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host.endsWith(`.${PRIMARY_HOST}`) && host !== PRIMARY_HOST;
};

export const currentVersionUrl = (): string =>
  isDirectPreviewHost() ? `${PRIMARY_ORIGIN}/` : "/";

export const resolveVersionUrl = (entry: VersionEntry): string => {
  if (entry.current === true) return currentVersionUrl();
  if (isDirectPreviewHost()) return `${PRIMARY_ORIGIN}${entry.path}`;
  return entry.path;
};

export const fallbackVersionEntries = (): VersionEntry[] => [
  {
    version: APP_VERSION,
    branch: isArchiveMode() ? `release/${APP_VERSION}` : "main",
    path: isArchiveMode() ? `/v/${APP_VERSION}/` : "/",
    engine: APP_VERSION,
    current: !isArchiveMode(),
    note: "Rete.js v2, Nodos 3D, Hydra Overlay & Cables Ops",
  },
];

const isValidEntry = (value: unknown): value is VersionEntry => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.version === "string" &&
    typeof item.branch === "string" &&
    typeof item.path === "string"
  );
};

export const fetchVersionRegistry = async (): Promise<VersionEntry[]> => {
  const candidates = isDirectPreviewHost()
    ? [`${PRIMARY_ORIGIN}/versions.json`, "/versions.json"]
    : ["/versions.json"];

  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const data: unknown = await response.json();
      if (!Array.isArray(data)) continue;
      const entries = data.filter(isValidEntry);
      if (entries.length > 0) return entries;
    } catch {
      // Fallback to next candidate or local fallback.
    }
  }

  return fallbackVersionEntries();
};
