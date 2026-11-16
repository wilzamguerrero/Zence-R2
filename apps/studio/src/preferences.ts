export type StudioPreferences = {
  // Grafo y Nodos
  snapToGrid: boolean;
  gridStep: 8 | 12 | 16 | 24;
  magneticSockets: boolean;
  wireAutoInsert: boolean;
  animatedWires: boolean;
  backdropBlur: boolean;
  // Visor 2D / 3D
  showFpsHud: boolean;
  cameraDamping: boolean;
  autoCompileHydra: boolean;
  // Interfaz
  showPinButtonsOnNodes: boolean;
  reducedMotion: boolean;
};

export const defaultPreferences: StudioPreferences = {
  snapToGrid: false,
  gridStep: 12,
  magneticSockets: true,
  wireAutoInsert: true,
  animatedWires: true,
  backdropBlur: true,
  showFpsHud: true,
  cameraDamping: true,
  autoCompileHydra: true,
  showPinButtonsOnNodes: true,
  reducedMotion: false,
};

const STORAGE_KEY = "zence.prefs.v1";

export function loadPreferences(): StudioPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPreferences;
    const p = JSON.parse(raw) as Partial<StudioPreferences>;
    const validStep = p.gridStep === 8 || p.gridStep === 12 || p.gridStep === 16 || p.gridStep === 24 ? p.gridStep : 12;
    return {
      snapToGrid: typeof p.snapToGrid === "boolean" ? p.snapToGrid : defaultPreferences.snapToGrid,
      gridStep: validStep,
      magneticSockets: typeof p.magneticSockets === "boolean" ? p.magneticSockets : defaultPreferences.magneticSockets,
      wireAutoInsert: typeof p.wireAutoInsert === "boolean" ? p.wireAutoInsert : defaultPreferences.wireAutoInsert,
      animatedWires: typeof p.animatedWires === "boolean" ? p.animatedWires : defaultPreferences.animatedWires,
      backdropBlur: typeof p.backdropBlur === "boolean" ? p.backdropBlur : defaultPreferences.backdropBlur,
      showFpsHud: typeof p.showFpsHud === "boolean" ? p.showFpsHud : defaultPreferences.showFpsHud,
      cameraDamping: typeof p.cameraDamping === "boolean" ? p.cameraDamping : defaultPreferences.cameraDamping,
      autoCompileHydra: typeof p.autoCompileHydra === "boolean" ? p.autoCompileHydra : defaultPreferences.autoCompileHydra,
      showPinButtonsOnNodes:
        typeof p.showPinButtonsOnNodes === "boolean"
          ? p.showPinButtonsOnNodes
          : defaultPreferences.showPinButtonsOnNodes,
      reducedMotion: typeof p.reducedMotion === "boolean" ? p.reducedMotion : defaultPreferences.reducedMotion,
    };
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(prefs: StudioPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors in private mode.
  }
}
