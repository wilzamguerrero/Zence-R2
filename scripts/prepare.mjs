import { copyFile, mkdir } from "node:fs/promises";
await mkdir("apps/studio/public/vendor", { recursive: true });
await copyFile(
  "node_modules/hydra-synth/dist/hydra-synth.js",
  "apps/studio/public/vendor/hydra-synth.js",
);
await copyFile(
  "node_modules/hydra-synth/LICENSE",
  "apps/studio/public/vendor/HYDRA-LICENSE",
);
