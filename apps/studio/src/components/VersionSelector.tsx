import { ChevronDown, GitBranch } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  APP_VERSION,
  fallbackVersionEntries,
  fetchVersionRegistry,
  resolveVersionUrl,
  versionStage,
} from "../version.ts";
import type { VersionEntry } from "../version.ts";

export function VersionSelector() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<VersionEntry[]>(() =>
    fallbackVersionEntries(),
  );
  const [loading, setLoading] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(
    null,
  );

  const holder = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const stage = versionStage(APP_VERSION);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchVersionRegistry().then((list) => {
      if (!cancelled) {
        setEntries(list);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchVersionRegistry().then((list) => {
      if (!cancelled) setEntries(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updateAnchor = () => {
      const rect = holder.current?.getBoundingClientRect();
      if (!rect) return;
      const clampedLeft = Math.max(
        10,
        Math.min(window.innerWidth - 290, rect.left),
      );
      setAnchor({ left: clampedLeft, top: rect.bottom + 6 });
    };
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    return () => window.removeEventListener("resize", updateAnchor);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !holder.current?.contains(target) &&
        !popRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function selectEntry(entry: VersionEntry) {
    setOpen(false);
    if (entry.version === APP_VERSION) return;
    window.location.assign(resolveVersionUrl(entry));
  }

  return (
    <div className="version-menu" ref={holder}>
      <button
        type="button"
        className={`version-pill ${open ? "is-open" : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Cambiar entre versiones / ramas publicadas"
        onClick={() => setOpen((v) => !v)}
      >
        <GitBranch size={12} aria-hidden />
        <span>v{APP_VERSION}</span>
        {stage && <span className="version-stage">{stage}</span>}
        <ChevronDown size={11} className="version-caret" aria-hidden />
      </button>

      {open &&
        anchor &&
        createPortal(
          <div
            ref={popRef}
            className="version-pop"
            style={{ left: `${anchor.left}px`, top: `${anchor.top}px` }}
            role="menu"
            aria-label="Versiones de Zence R2"
          >
            <div className="version-pop-head">
              <h4>Versiones y ramas</h4>
              <span>/versions.json</span>
            </div>

            {entries.map((entry) => {
              const entryStage = versionStage(entry.version);
              const active = entry.version === APP_VERSION;
              return (
                <button
                  key={`${entry.branch}:${entry.version}`}
                  type="button"
                  className={active ? "is-active" : undefined}
                  role="menuitemradio"
                  aria-checked={active}
                  title={entry.note ?? `Abrir versión ${entry.version}`}
                  onClick={() => selectEntry(entry)}
                >
                  <span className="version-item-top">
                    <span className="version-item-main">
                      <span className="version-item-num">v{entry.version}</span>
                      {entryStage && (
                        <span className="version-stage">{entryStage}</span>
                      )}
                      {entry.current && (
                        <span className="version-badge-current">Actual</span>
                      )}
                    </span>
                    <span className="version-item-branch">{entry.branch}</span>
                  </span>
                  {entry.note && (
                    <span className="version-item-note">{entry.note}</span>
                  )}
                </button>
              );
            })}

            {loading && (
              <p className="version-pop-loading">Consultando versiones…</p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
