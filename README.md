# Zence R2

Estudio audiovisual en vivo que integra grafo nodal determinista (estilo Cables.gl / TouchDesigner), visor 3D, *live coding* con Hydra y control de directo (cues, BPM y salida de escenario estilo Resolume). La interfaz usa negro y violeta planos, tipografía Syne y paneles acoplables y ocultables.

## Ejecutar en local

Node.js 24 o posterior, Chrome o Edge con WebGL 2.

```sh
npm ci
npm run dev
```

Abrir http://localhost:5173. Mantener la terminal abierta. El servidor también sirve el panel remoto en la red local.

## Funciones del estudio

- **Espacio de trabajo modular y redimensionable**: la barra superior permite mostrar u ocultar de forma independiente **Grafo** (`Alt+1`), **Visor** (`Alt+2`), **Código** (`Alt+3`), **Overlay** (`Alt+C` / `Ctrl+Shift+H`) e **Inspector** (`Alt+4`), o cambiar entre vistas rápidas (**Estudio**, **Hydra Live**, **VJ**, **Escenario**, restaurar todo con `Alt+0`). Los divisores entre paneles son arrastrables (doble clic restablece) y la **Paleta de comandos** (`Ctrl+K`) permite ejecutar cualquier acción al instante.
- **Grafo de operadores**:
  - Incluye **Control numérico** (`control.number`), **Oscilador LFO** determinista (`signal.lfo`: senoidal, triangular, sierra, cuadrada), **Matemática / Map** (`signal.math`: `mul`, `add`, `clamp`, `abs`, `sin`), **Emisor de partículas** (`simulation.particles`) y **Escena 3D** (`scene.points`).
  - Pulsa `Tab`, haz doble clic en el lienzo o usa `+` para abrir el buscador rápido de operadores. Arrastra el fondo para desplazarte, usa el botón de cuadrícula para auto-ordenar nodos y visualiza valores numéricos en vivo sobre cada salida.
  - Al conectar un puerto se muestra una vista previa del cable y se resaltan los puertos compatibles. El motor valida tipos y conserva la última escena válida si una conexión queda incompleta.
- **Código Hydra dual (acoplado + overlay transparente sobre el visor)**: usa hydra-synth 1.4 con editor acoplado y modo **Overlay** flotante directo sobre el lienzo visual (estilo Hydra), sincronizados en tiempo real. Incluye **autocompletado** de Hydra/Zence, **destello visual al evaluar** (`Ctrl/⌘ + Enter` / `Alt + Enter`), **Mutar parámetros** (randomizer), **Formatear** (`Ctrl/⌘ + Shift + F`) y ejemplos editables (`Órbitas`, `Materia`, `Pulso`, `Caleido`, `Plasma`, `Medio`). Lee nodos con `control("id")`, tempo con `beat()`/`bpm()`, micrófono con `audio()`, `bass()`, `mid()`, `high()`, y medios en `s0`.
- **Visor**: selector directo entre **3D**, **Hydra** y **Hydra 3D** (pantalla generativa dentro de la escena 3D). Incluye auto-órbita, restablecer cámara, cuadrícula, contador FPS, espectro de audio en vivo, captura **PNG** e importación **GLB / OBJ**.
- **Banco de Cues, BPM y Blackout**:
  - Dispara cues instantáneos con código Hydra, color, tamaño y controles guardados, o captura el estado actual en cualquier cue.
  - Ajusta el tempo en la barra inferior con **BPM** o **TAP** para sincronizar `beat()`.
  - **Blackout** (`Alt+B`) corta a negro la salida del visor, proyección y grabación de forma inmediata.
- **Salida, fuentes en vivo y control remoto**:
  - **Proyectar** abre una ventana de programa independiente para segundo monitor (doble clic para pantalla completa).
  - **Grabar** captura el visor actual a 1280 × 720.
  - **Cámara** y **Pantalla** transmiten la webcam o una ventana/pantalla en vivo hacia `s0`.
  - **Micrófono** analiza el espectro en tiempo real (`audio()`, `bass()`, `mid()`, `high()`).
  - **Medio** carga imagen o video en `s0` (video silenciado y en bucle).
  - **Celular** genera un enlace local con QR por WebSocket para controlar nodos numéricos desde un teléfono en la misma LAN.
- **Guardar / Abrir**: conserva el grafo, operadores, posiciones, cues, BPM, ajustes de vista y código Hydra en `.zence.json`.

## Asistente IA

Copiar `.env.example` como `.env.local` en la raíz, completar el proveedor y reiniciar `npm run dev`. La URL debe apuntar al endpoint completo compatible con Chat Completions. Las credenciales permanecen en el servidor local.

Abrir **Asistente IA**, describir el visual y generar una propuesta. La petición incluye el código, los nodos y los ajustes del proyecto. Revisar la propuesta y pulsar **Llevar al editor**. Esta acción desactiva Auto, y el usuario ejecuta el código cuando termine de revisarlo.

## Modificar la interfaz

| Archivo | Contenido |
| --- | --- |
| `apps/studio/src/styles/tokens.css` | Colores, fuentes y variables de distribución. |
| `apps/studio/src/styles/studio.css` | Barra de paneles, grafo, visor, cues, inspector y transporte. |
| `apps/studio/src/components/` | Grafo, visor, inspector, código, IA y panel móvil. |
| `apps/studio/src/hydraFrame.ts` | Ejemplos de código y API Hydra (`control`, `audio`, `bass`, `beat`). |
| `apps/studio/src/studio.ts` | Formato de proyecto, cues, auto-layout y operadores. |
| `packages/engine/project.ts` | Motor determinista de paso fijo y validación del grafo. |

## Comprobaciones y alcance

```sh
npm test
npm run build
```

Siguen en evolución el mapeo geométrico de proyectores (warping/edge blending), salida multiproyector nativa, OSC/MIDI por puente, materiales 3D avanzados, empaquetado binario de recursos y empaquetado de escritorio.

## Dependencias

Se integra el motor de [Hydra](https://github.com/hydra-synth/hydra-synth), distribuido bajo AGPL. `npm ci` copia su distribución y licencia desde la dependencia a `public/vendor` para servirla localmente. Three.js, CodeMirror y las demás dependencias conservan sus licencias respectivas.

[Arquitectura](docs/arquitectura.md) · [Ruta de implementación](docs/implementacion.md)
