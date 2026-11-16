# Zence R2

Estudio audiovisual con grafo de nodos, visor 3D y código Hydra en vivo. La interfaz usa negro y violeta planos, tipografía Syne y componentes editables.

## Ejecutar en local

Node.js 24 o posterior, Chrome o Edge con WebGL 2.

```sh
npm ci
npm run dev
```

Abrir http://localhost:5173. Mantener la terminal abierta. El servidor también sirve el panel remoto en la red local.

## Funciones del estudio

- **Código Hydra** usa hydra-synth 1.4. Escribir en el editor integrado y activar Auto, pulsar Ejecutar o usar Ctrl/⌘ + Enter. Los ejemplos Órbitas, Materia y Medio son editables. El código se ejecuta en un iframe de origen aislado.
- **Nodos** permiten mover, añadir, conectar y eliminar controles numéricos, emisores y salidas de partículas. El motor valida tipos y conserva la escena anterior si una conexión queda incompleta. El código Hydra lee los controles con `control("intensity")` o el ID de otro nodo numérico.
- **Visor** alterna entre la escena 3D y Hydra. La cámara se puede orbitar, desplazar y restablecer. **Hydra en 3D** coloca el visual en una pantalla dentro de la escena. El botón del cubo importa un GLB autocontenido o un OBJ sin materiales externos.
- **Imagen / video** carga un archivo en `s0`. Elegir el ejemplo Medio o escribir `src(s0).out(o0)`. El video entra silenciado y en bucle.
- **Micrófono** solicita acceso y entrega la envolvente normalizada mediante `audio()`. Ejemplo `osc(10).modulate(noise(3), () => audio()).out(o0)`.
- **Proyectar** abre una ventana de programa con el visor actual. Arrastrarla al segundo monitor y hacer doble clic para entrar en pantalla completa. La imagen de Hydra se transfiere a hasta 20 FPS para esta primera ruta de salida.
- **Grabar video** captura el visor actual a 1280 × 720, con captura de fotogramas del visor. Detener descarga un video en el formato disponible en el navegador. La captura actual contiene imagen.
- **Celular** muestra la URL y un QR. Conectar ambos dispositivos a la misma red. Los nodos numéricos aparecen como sliders. La sesión se autentica con un enlace temporal y se sincroniza tras reconectar. El estudio debe abrirse en localhost en el computador anfitrión.
- **Guardar / Abrir** conserva el grafo, los parámetros, la distribución de nodos, colores y código Hydra en `.zence.json`. Los modelos y archivos multimedia cargados pertenecen a la sesión y se importan de nuevo al abrir.
- La pausa afecta ambos motores. El recorrido de 10 segundos y el reinicio de la barra inferior corresponden al simulador de partículas. Hydra tiene su propio reloj continuo.

## Asistente IA

Copiar `.env.example` como `.env.local` en la raíz, completar el proveedor y reiniciar `npm run dev`. La URL debe apuntar al endpoint completo compatible con Chat Completions. Las credenciales permanecen en el servidor local.

Abrir **Asistente IA**, describir el visual y generar una propuesta. La petición incluye el código, los nodos y los ajustes del proyecto. Revisar la propuesta y pulsar **Llevar al editor**. Esta acción desactiva Auto, y el usuario ejecuta el código cuando termine de revisarlo. La configuración admite proveedores locales o remotos. La respuesta real depende del modelo conectado.

## Modificar la interfaz

| Archivo | Contenido |
| --- | --- |
| `apps/studio/src/styles/tokens.css` | Colores, fuentes y variables de distribución. |
| `apps/studio/src/styles/studio.css` | Paneles, controles y adaptación por tamaño. |
| `apps/studio/src/components/` | Grafo, visor, inspector, código, IA y panel móvil. |
| `apps/studio/src/hydraFrame.ts` | Ejemplos de código y entorno Hydra. |
| `apps/studio/src/studio.ts` | Formato de proyecto y valores iniciales. |

## Comprobaciones y alcance

```sh
npm test
npm run build
```

El estudio ofrece un flujo de visuales en vivo. Siguen en desarrollo el mapeo geométrico de proyectores, salida multiproyector, OSC/MIDI, edición completa de entidades y materiales 3D, persistencia de archivos binarios, simulaciones físicas avanzadas y empaquetado de escritorio. El grafo inicial contiene tres tipos de nodo. La edición nodal visual de todas las operaciones Hydra queda para la ampliación del registro de nodos.

Las pruebas automatizadas comprueban el motor y la compilación. Las pruebas de navegador ejercitan código Hydra, controles, archivos, proyección y grabación. La red LAN física, el micrófono del dispositivo, varios proyectores y un proveedor IA real requieren comprobación en el equipo de uso.

## Dependencias

Se integra el motor de [Hydra](https://github.com/hydra-synth/hydra-synth), distribuido bajo AGPL. `npm ci` copia su distribución y licencia desde la dependencia a `public/vendor` para servirla localmente. Three.js, CodeMirror y las demás dependencias conservan sus licencias respectivas.

[Arquitectura](docs/arquitectura.md) · [Ruta de implementación](docs/implementacion.md)
