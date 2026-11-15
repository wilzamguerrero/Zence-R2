# Zence R2

Estudio audiovisual modular para crear visuales y simulaciones, construir escenas 3D y operarlas en vivo desde el computador o el celular.

La primera base del motor conecta un parámetro de control con una simulación de partículas que entrega a la escena posiciones listas para dibujar. El control puede cambiar durante la ejecución y la sesión se puede reproducir a partir de una semilla y una secuencia de cambios.

## Ejecutar la base del motor

Requiere Node.js 24 o posterior. Los ejemplos y pruebas usan TypeScript ejecutable por Node, sin dependencias externas.

```sh
node examples/particles.ts
node --test packages/engine/project.test.ts
```

El ejemplo usa el mismo proyecto declarado en [particles.zence.json](examples/particles.zence.json). La salida de terminal muestra el estado de la escena antes y después de cambiar la intensidad. El editor visual, el render y la conexión LAN son las siguientes entregas.

## Diseño e implementación

- [Arquitectura de Zence R2](docs/arquitectura.md) incluye espacios de trabajo, runtime, 3D, simulación, medios, proyección, control móvil, scripting, IA y extensiones.
- [Ruta de implementación](docs/implementacion.md) incluye el orden de desarrollo, criterios de aceptación y prioridades de rendimiento.
- [Contrato y runtime inicial](packages/engine/project.ts) y [reloj de simulación](packages/engine/clock.ts).
