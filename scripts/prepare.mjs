import { existsSync } from "node:fs";
import { copyFile, cp, mkdir } from "node:fs/promises";
import { readdir } from "node:fs/promises";

await mkdir("apps/studio/public/vendor", { recursive: true });
await copyFile(
  "node_modules/hydra-synth/dist/hydra-synth.js",
  "apps/studio/public/vendor/hydra-synth.js",
);
await copyFile(
  "node_modules/hydra-synth/LICENSE",
  "apps/studio/public/vendor/HYDRA-LICENSE",
);

const wasmSrc = "node_modules/@mediapipe/tasks-vision/wasm";
const wasmDest = "apps/studio/public/wasm";
if (existsSync(wasmSrc)) {
  await mkdir(wasmDest, { recursive: true });
  await cp(wasmSrc, wasmDest, { recursive: true });
  const files = await readdir(wasmDest);
  console.log(`[prepare] ${files.length} archivos WASM -> ${wasmDest}`);
}
