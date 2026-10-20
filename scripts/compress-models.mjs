// Télécharge les sources CC0 et écrit des GLB compressés (meshopt) dans public/models.
// Relançable : node scripts/compress-models.mjs
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "public", "models");
const tmp = path.join(root, ".model-src");

const KEEP = new Set(["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop"]);

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

await MeshoptEncoder.ready;
await mkdir(tmp, { recursive: true });
await mkdir(outDir, { recursive: true });

const animGltf = path.join(tmp, "AnimationLibrary_Godot_Standard.gltf");
const animBin = path.join(tmp, "AnimationLibrary_Godot_Standard.bin");
await download("https://raw.githubusercontent.com/J-Ponzo/gltf-universal-animation-library/main/glTF/AnimationLibrary_Godot_Standard.gltf", animGltf);
await download("https://raw.githubusercontent.com/J-Ponzo/gltf-universal-animation-library/main/glTF/AnimationLibrary_Godot_Standard.bin", animBin);
await mkdir(path.join(tmp, "Textures"), { recursive: true });
await download("https://raw.githubusercontent.com/KenneyNL/Starter-Kit-Racing/main/models/vehicle-motorcycle.glb", path.join(tmp, "moto.glb"));
await download("https://raw.githubusercontent.com/KenneyNL/Starter-Kit-Racing/main/models/Textures/colormap.png", path.join(tmp, "Textures", "colormap.png"));
const zip = path.join(tmp, "car.zip");
await download("https://opengameart.org/sites/default/files/kenney_car-kit_3.1.zip", zip);
const sedan = path.join(tmp, "sedan.glb");
await new Promise((resolve, reject) => {
  const child = spawn("unzip", ["-p", zip, "Models/GLB format/sedan.glb"]);
  const chunks = [];
  child.stdout.on("data", (c) => chunks.push(c));
  child.on("error", reject);
  child.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error("unzip " + code))));
}).then((buf) => writeFile(sedan, buf));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });

async function pack(src, dest, filterAnims) {
  const doc = await io.read(src);
  if (filterAnims) {
    for (const anim of [...doc.getRoot().listAnimations()]) {
      if (KEEP.has(anim.getName())) continue;
      for (const channel of anim.listChannels()) channel.dispose();
      for (const sampler of anim.listSamplers()) sampler.dispose();
      anim.dispose();
    }
  }
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  await io.write(dest, doc);
  const size = (await readFile(dest)).length;
  const names = doc.getRoot().listAnimations().map((a) => a.getName());
  console.log(`${path.basename(dest)} ${(size / 1024).toFixed(0)} Ko · animations: ${names.join(", ") || "—"}`);
}

await pack(animGltf, path.join(outDir, "personne.glb"), true);
await pack(path.join(tmp, "moto.glb"), path.join(outDir, "moto.glb"), false);
await pack(path.join(tmp, "sedan.glb"), path.join(outDir, "voiture.glb"), false);
