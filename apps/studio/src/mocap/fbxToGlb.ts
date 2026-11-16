/**
 * Conversor FBX -> GLB en navegador (portado de Posu)
 * ---------------------------------------------------------------------------
 * Carga un archivo `.fbx` de Mixamo o Blender, autoescala si viene en
 * centimetros, optimiza texturas opacas a JPEG y exporta un `.glb` binario
 * conservando esqueleto y animaciones.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const COLOR_MAP_KEYS = ["map", "emissiveMap"] as const;
const MAX_TEXTURE_SIDE = 1024;
const JPEG_QUALITY = 0.85;
const HUMAN_HEIGHT_MAX = 10;

export interface FbxConversionStats {
  blob: Blob;
  name: string;
  bytes: number;
  sourceBytes: number;
  scale: number;
  textures: number;
  meshes: number;
  bones: number;
  animations: number;
}

export function glbName(fbxFileName: string): string {
  return `${fbxFileName.replace(/\.fbx$/i, "") || "modelo"}.glb`;
}

export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let i = -1;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

function textureHasAlpha(img: unknown): boolean {
  if (!img || typeof img !== "object") return false;
  const anyImg = img as { width?: number; height?: number; data?: Uint8Array | Uint8ClampedArray };
  const w = anyImg.width ?? 0;
  const h = anyImg.height ?? 0;
  if (!w || !h) return false;
  if (anyImg.data && anyImg.data.length === w * h * 4) {
    for (let i = 3; i < anyImg.data.length; i += 16) {
      if (anyImg.data[i] < 250) return true;
    }
    return false;
  }
  try {
    const step = Math.max(1, Math.floor(Math.max(w, h) / 64));
    const sw = Math.max(1, Math.floor(w / step));
    const sh = Math.max(1, Math.floor(h / step));
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    ctx.drawImage(img as CanvasImageSource, 0, 0, sw, sh);
    const px = ctx.getImageData(0, 0, sw, sh).data;
    for (let i = 3; i < px.length; i += 4) {
      if (px[i] < 250) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function optimizeColorTexture(tex: THREE.Texture | null | undefined): THREE.Texture | null | undefined {
  const img = tex?.image as { width?: number; height?: number } | undefined;
  if (!tex || !img) return tex;
  const w = img.width ?? 0;
  const h = img.height ?? 0;
  if (!w || !h || textureHasAlpha(img)) return tex;

  const scale = Math.min(1, MAX_TEXTURE_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return tex;
  ctx.drawImage(img as CanvasImageSource, 0, 0, canvas.width, canvas.height);

  canvas.toBlob = ((original: HTMLCanvasElement["toBlob"]) => {
    return function (this: HTMLCanvasElement, cb: BlobCallback, _mime?: string, q?: number) {
      return original.call(this, cb, "image/jpeg", q ?? JPEG_QUALITY);
    };
  })(canvas.toBlob);

  const out = new THREE.CanvasTexture(canvas);
  out.colorSpace = THREE.SRGBColorSpace;
  out.flipY = tex.flipY;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.name = tex.name;
  tex.dispose();
  return out;
}

function cleanMaterial(mat: THREE.Material): number {
  const rec = mat as unknown as Record<string, THREE.Texture | null | undefined>;
  let optimized = 0;
  for (const key of COLOR_MAP_KEYS) {
    const tex = rec[key];
    if (!tex) continue;
    const next = optimizeColorTexture(tex);
    if (next && next !== tex) {
      rec[key] = next;
      optimized++;
    }
  }
  return optimized;
}

function parseFbx(buffer: ArrayBuffer, resourcePath: string): THREE.Group {
  const loader = new FBXLoader();
  return loader.parse(buffer, resourcePath);
}

function exportGlb(root: THREE.Object3D, animations: THREE.AnimationClip[]): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      root,
      (out) => {
        if (out instanceof ArrayBuffer) resolve(out);
        else reject(new Error("El exportador no genero un GLB binario."));
      },
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true, animations },
    );
  });
}

function countStats(root: THREE.Object3D): { meshes: number; bones: number } {
  let meshes = 0;
  let bones = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes++;
    if ((o as THREE.Bone).isBone) bones++;
  });
  return { meshes, bones };
}

function disposeTempScene(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const mat of mats) {
      if (!mat) continue;
      for (const val of Object.values(mat)) {
        if ((val as THREE.Texture | null)?.isTexture) {
          (val as THREE.Texture).dispose();
        }
      }
      mat.dispose();
    }
  });
}

export async function convertFbxToGlb(
  file: File,
  onProgress?: (message: string) => void,
): Promise<FbxConversionStats> {
  onProgress?.("Leyendo FBX…");
  const buffer = await file.arrayBuffer();

  onProgress?.("Analizando malla y esqueleto…");
  const root = parseFbx(buffer, "");

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y;
  const scale = height > HUMAN_HEIGHT_MAX ? 0.01 : 1;
  if (scale !== 1) root.scale.multiplyScalar(scale);

  onProgress?.("Optimizando texturas y materiales…");
  const seenMats = new Set<THREE.Material>();
  let textures = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const mat of mats) {
      if (mat && !seenMats.has(mat)) {
        seenMats.add(mat);
        textures += cleanMaterial(mat);
      }
    }
  });

  onProgress?.("Empaquetando GLB binario…");
  const animations = (root as unknown as { animations?: THREE.AnimationClip[] }).animations ?? [];
  const binary = await exportGlb(root, animations);
  const stats = countStats(root);
  disposeTempScene(root);

  const name = glbName(file.name);
  const blob = new Blob([binary], { type: "model/gltf-binary" });
  return {
    blob,
    name,
    bytes: binary.byteLength,
    sourceBytes: file.size,
    scale,
    textures,
    meshes: stats.meshes,
    bones: stats.bones,
    animations: animations.length,
  };
}
