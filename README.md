# Zence R2

Estudio audiovisual modular para crear visuales y simulaciones, construir escenas 3D y operarlas en vivo.

## Abrir el estudio en local

Requiere Node.js 24 o posterior y un navegador con WebGL 2.

1. Descargar o clonar la rama que contiene el estudio y abrir la carpeta en una terminal.
2. Instalar las dependencias bloqueadas y arrancar el servidor local.

```sh
npm ci
npm run dev
```

3. Abrir [http://localhost:5173](http://localhost:5173).

## Probar el patch de partículas

- Seleccionar **Intensidad** en el grafo y mover el slider del **Inspector** durante la reproducción.
- Arrastrar el encabezado de un nodo para organizar el grafo. Conectar un puerto haciendo clic en la salida y luego en la entrada. En el inspector del nodo receptor se puede quitar la conexión. El visor sigue usando la última escena válida mientras se arregla una entrada pendiente.
- Seleccionar **Emisor de partículas** para editar la cantidad y la semilla. Confirmar con Enter o al salir del campo.
- Arrastrar sobre el visor para orbitar, mover con el botón derecho y hacer zoom con la rueda. El visor tiene cuadrícula, ajuste de cámara y pantalla completa.
- Usar los controles inferiores para pausar, reiniciar y recorrer el bucle de 10 segundos. Al buscar un instante, el motor vuelve a calcular la escena con los parámetros actuales. El registro de gestos para replay queda para otra entrega.
- Usar **Guardar** para descargar el proyecto `.zence.json` con sus nodos, conexiones, posicionamiento y aspecto. Usar **Abrir** para cargarlo de nuevo.

## Cambiar la interfaz

| Archivo | Responsabilidad |
| --- | --- |
| [tokens.css](apps/studio/src/styles/tokens.css) | Paleta, tipografía, colores del visor, anchos de paneles, radio y espaciado general. |
| [studio.css](apps/studio/src/styles/studio.css) | Distribución, estilos de paneles, nodos y comportamiento según ancho de ventana. |
| [App.tsx](apps/studio/src/App.tsx) | Composición del escritorio, barra de proyecto y transporte. |
| [components](apps/studio/src/components) | Grafo, visor e inspector. Cada panel se puede modificar por separado. |
| [studio.ts](apps/studio/src/studio.ts) | Etiquetas de nodos, patch inicial y ajustes de presentación guardados con cada proyecto. |

Cambiar los archivos con el servidor de desarrollo activo y comprobar la actualización en el navegador. El núcleo de simulación está en [packages/engine](packages/engine).

## Verificación y diseño técnico

```sh
npm test
npm run build
node examples/particles.ts
```

- [Arquitectura de Zence R2](docs/arquitectura.md) incluye simulación, medios, proyección, control móvil, scripting, IA y extensiones.
- [Ruta de implementación](docs/implementacion.md) registra el alcance del estudio y el siguiente paso para proyección y control desde el teléfono.
