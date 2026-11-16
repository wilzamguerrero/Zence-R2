import { RotateCcw, Sliders, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StudioPreferences } from "../preferences.ts";
import type { ViewSettings } from "../studio.ts";

type PreferencesDialogProps = {
  open: boolean;
  prefs: StudioPreferences;
  view: ViewSettings;
  onChangePrefs: (patch: Partial<StudioPreferences>) => void;
  onChangeView: (patch: Partial<ViewSettings>) => void;
  onResetPrefs: () => void;
  onAutoLayout: () => void;
  onClose: () => void;
};

type PrefTab = "graph" | "viewport" | "ui";

export function PreferencesDialog({
  open,
  prefs,
  view,
  onChangePrefs,
  onChangeView,
  onResetPrefs,
  onAutoLayout,
  onClose,
}: PreferencesDialogProps) {
  const [tab, setTab] = useState<PrefTab>("graph");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".brand-button")) return;
      if (panelRef.current && !panelRef.current.contains(target)) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  function toggleRow(
    title: string,
    hint: string,
    checked: boolean,
    onChange: (next: boolean) => void,
    testId?: string,
  ) {
    return (
      <label className="prefs-row" data-pref={testId}>
        <span className="prefs-row-text">
          <strong>{title}</strong>
          <small>{hint}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    );
  }

  return (
    <div
      ref={panelRef}
      className="prefs-dialog"
      role="dialog"
      aria-label="Configuración de Zence R2"
    >
      <div className="prefs-head">
        <div className="prefs-head-title">
          <Sliders size={13} />
          <div>
            <strong>Configuración del Estudio</strong>
            <small>Preferencias globales · Zence R2</small>
          </div>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Cerrar configuración"
          onClick={onClose}
        >
          <X size={13} />
        </button>
      </div>

      <div className="prefs-tabs" role="tablist" aria-label="Categorías de configuración">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "graph"}
          className={tab === "graph" ? "is-active" : ""}
          onClick={() => setTab("graph")}
        >
          Grafo y Nodos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "viewport"}
          className={tab === "viewport" ? "is-active" : ""}
          onClick={() => setTab("viewport")}
        >
          Visor 2D / 3D
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ui"}
          className={tab === "ui" ? "is-active" : ""}
          onClick={() => setTab("ui")}
        >
          Interfaz
        </button>
      </div>

      <div className="prefs-body">
        {tab === "graph" && (
          <>
            {toggleRow(
              "Snap a rejilla al mover nodos",
              "Desactivado = movimiento fluido libre 1:1",
              prefs.snapToGrid,
              (snapToGrid) => onChangePrefs({ snapToGrid }),
              "snapToGrid",
            )}
            {prefs.snapToGrid && (
              <label className="prefs-row">
                <span className="prefs-row-text">
                  <strong>Paso de rejilla (Snap)</strong>
                  <small>Distancia en píxeles entre pasos</small>
                </span>
                <select
                  className="mode-select"
                  value={prefs.gridStep}
                  onChange={(e) =>
                    onChangePrefs({ gridStep: Number(e.target.value) as 8 | 12 | 16 | 24 })
                  }
                >
                  <option value={8}>8 px</option>
                  <option value={12}>12 px</option>
                  <option value={16}>16 px</option>
                  <option value={24}>24 px</option>
                </select>
              </label>
            )}
            {toggleRow(
              "Imán magnético en puertos",
              "Atrapa conexiones compatibles cercanas al soltar",
              prefs.magneticSockets,
              (magneticSockets) => onChangePrefs({ magneticSockets }),
              "magneticSockets",
            )}
            {toggleRow(
              "Auto-insertar nodo sobre cable",
              "Conecta un operador al soltarlo sobre una línea existente",
              prefs.wireAutoInsert,
              (wireAutoInsert) => onChangePrefs({ wireAutoInsert }),
              "wireAutoInsert",
            )}
            {toggleRow(
              "Flujo animado en cables",
              "Muestra pulsos direccionales de señal en conexiones",
              prefs.animatedWires,
              (animatedWires) => onChangePrefs({ animatedWires }),
              "animatedWires",
            )}
            {toggleRow(
              "Desenfoque Backdrop en tarjetas",
              "Translucidez blur detrás de los nodos flotantes",
              prefs.backdropBlur,
              (backdropBlur) => onChangePrefs({ backdropBlur }),
              "backdropBlur",
            )}
          </>
        )}

        {tab === "viewport" && (
          <>
            {toggleRow(
              "Auto-compilar código Hydra",
              "Actualiza Hydra automáticamente al modificar nodos TOP",
              prefs.autoCompileHydra,
              (autoCompileHydra) => onChangePrefs({ autoCompileHydra }),
              "autoCompileHydra",
            )}
            {toggleRow(
              "Inercia suave en cámara 3D",
              "Amortiguación OrbitControls al rotar y hacer zoom",
              prefs.cameraDamping,
              (cameraDamping) => onChangePrefs({ cameraDamping }),
              "cameraDamping",
            )}
            {toggleRow(
              "Mostrar HUD de FPS y perspectiva",
              "Indicador de estado en la esquina del visor",
              prefs.showFpsHud,
              (showFpsHud) => onChangePrefs({ showFpsHud }),
              "showFpsHud",
            )}
            {toggleRow(
              "Cuadrícula de piso 3D",
              "Muestra u oculta el plano de referencia en 3D",
              view.grid,
              (grid) => onChangeView({ grid }),
              "viewGrid",
            )}
            {toggleRow(
              "Órbitas guía 3D",
              "Anillos de referencia espacial alrededor del origen",
              view.guides,
              (guides) => onChangeView({ guides }),
              "viewGuides",
            )}
          </>
        )}

        {tab === "ui" && (
          <>
            {toggleRow(
              "Botón Pin en nodos del grafo",
              "Fijado rápido estilo Nuke en la cabecera de cada tarjeta",
              prefs.showPinButtonsOnNodes,
              (showPinButtonsOnNodes) => onChangePrefs({ showPinButtonsOnNodes }),
              "showPinButtonsOnNodes",
            )}
            {toggleRow(
              "Reducir animaciones de interfaz",
              "Pausa pulsos del logo y transiciones decorativas",
              prefs.reducedMotion,
              (reducedMotion) => onChangePrefs({ reducedMotion }),
              "reducedMotion",
            )}
          </>
        )}
      </div>

      <div className="prefs-foot">
        <button type="button" className="button button-subtle" onClick={onAutoLayout}>
          Auto-ordenar grafo
        </button>
        <button type="button" className="button button-subtle" onClick={onResetPrefs}>
          <RotateCcw size={12} /> Restablecer
        </button>
      </div>
    </div>
  );
}
