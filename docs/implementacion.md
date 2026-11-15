# Ruta de implementación

## Entregas y comprobaciones

| Entrega | Implementar | Comprobar |
| --- | --- | --- |
| 0 · Núcleo inicial disponible | Carga de JSON versionado, puertos tipados, plan de ejecución, simulación simple de partículas y control numérico. | Ejecutar el ejemplo. Confirmar reproducibilidad con la misma semilla y los mismos cambios de control a 30, 60 y 144 FPS en condiciones regulares. |
| 1 · Estudio visual | Vite/React, adaptador Rete, inspector, editor de escena Three.js, cámara de autoría y canvas del visor. Guardar y volver a abrir el patch. | Conectar el nodo de intensidad con el emisor. Ver el cambio en el visor al editar el valor y reabrir el archivo. Una conexión inválida mantiene el patch válido. |
| 2 · Proyección y control móvil | Cámara de programa, ventana a pantalla completa, vista previa, bridge LAN, QR, slider, pad XY, botones y cambio de cues. | Con el computador conectado a un segundo monitor y un Android o iPhone en una red local sin internet, controlar el patch desde el teléfono. Desconectarlo y reconectarlo, verificar revisión, valores y deduplicación de cues. |
| 3 · Código, Hydra y medios | Nodo de script con entradas y salidas, Hydra por canvas, textura en material Three.js, escena a entrada de Hydra, GLB, video y análisis FFT. | Cargar un GLB, ponerle una textura generativa, ajustarla con audio, cambiar el código durante el ensayo y comprobar que un error mantiene activo el último programa válido. Medir cada sentido del puente con tamaños comparables. |
| 4 · Simulación y salida avanzada | Fuerzas, colisiones, replay por ticks, mapa de proyección de cuatro esquinas, máscaras y cues encadenados. | Guardar y repetir una toma. Usar patrón de calibración y sobrevivir a reconexión de la pantalla. Verificar que un fundido o negro de emergencia no dependa del teléfono. |
| 5 · IA y SDK | Lectura del proyecto autorizado, proveedores intercambiables, diffs y previsualización de propuestas. Manifiesto de extensiones y adaptadores. | Pedir un patch que añada partículas gobernadas por audio y publicar la intensidad en el control. Revisar, validar, reproducir y deshacer la propuesta. Instalar una extensión de prueba y abrir el proyecto que la usa. |
| 6 · Escritorio y escala | Validar Tauri en Windows, macOS y Linux, codecs adicionales, MIDI/OSC nativo y rutas medidas para WebGPU, WASM o puentes de video. | Abrir el mismo formato de proyecto entre navegador y escritorio. Publicar una matriz con soporte y diferencias de codecs, sensores, monitores y GPU. |

### Siguiente implementación

1. Crear `apps/studio` con Vite y React. Mantener la autenticidad del primer flujo cargando `examples/particles.zence.json` como archivo del proyecto desde el visor.
2. Conectar el ejemplo al visor de Three.js con un buffer de posiciones preasignado. Alimentar el reloj fijo desde `requestAnimationFrame` y permitir pausa y reset. Medir el coste de copias antes de fijar la API de actualización de buffers.
3. Mostrar los tres nodos del ejemplo en Rete. Aplicar ediciones a una copia validada del documento y conservar el plan y la escena activos ante errores. Registrar por separado los cambios de parámetro y de topología.
4. Crear la primera ventana de programa y probarla con un segundo monitor. Agregar un parámetro publicable, cuyo mismo ID pueda usar el futuro cliente táctil. Inspeccionar el frame de salida, la frecuencia y el uso de GPU para fijar el presupuesto de cada ventana.
5. Conectar el bridge LAN con ese mismo parámetro. Probar el circuito completo con un móvil antes de añadir automatizaciones o sensores.

### Objetivos de rendimiento y operación

Son objetivos de validación en hardware de referencia. Registrar equipo, GPU, navegador, resolución y complejidad de cada patch al medirlos.

| Medición | Primer objetivo |
| --- | --- |
| Composición básica | 1080p a 60 FPS en un equipo base definido, con salida a 30 FPS y reducción de resolución disponibles cuando el presupuesto se exceda. Medir tiempos de frame p50/p95 y frames perdidos. |
| Control móvil | Menos de 100 ms p95 desde gesto hasta cambio visible en LAN dedicada de referencia. Medir extremo a extremo mediante video de alta velocidad o trazas con relojes calibrados. |
| Maratón de proyección | Ensayo de 60 minutos con cues, reconexiones y cambio de presets. Vigilar crecimiento de memoria, audio interrumpido, pérdida de contexto y congelamientos. |
| Modificación durante proyección | Vista previa y programa continúan al modificar grafo o script. Una compilación fallida preserva la última salida válida y muestra el diagnóstico. |
| Portabilidad | Reabrir proyecto y resolver medios locales, con mensajes accionables para assets faltantes, permisos o formatos que el dispositivo no reproduzca. |

Antes de añadir 4K, profundidad con cámaras externas o varias salidas, medir por separado simulación, render, transferencia Hydra–Three.js y decodificación. Priorizar el cuello que consuma más presupuesto en el patch de referencia. Probar patrones de montaje con la red desconectada de internet, el móvil bloqueado, el proyector reconectado y el editor recompilando código.
