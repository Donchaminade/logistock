// Génère out/sw.js après `next build` : précache de tous les fichiers de l'export statique (pages, JS, CSS,
// polices, icônes, images de démo) pour que l'application s'ouvre et fonctionne hors ligne.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = new URL("../out/", import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(OUT);

const skip = (r) => r === "sw.js" || r.endsWith(".map") || r.startsWith("_next/static/development");
const hash = createHash("sha256");
const urls = [];
for (const p of files.sort()) {
  const r = relative(OUT, p).split(sep).join("/");
  if (skip(r)) continue;
  hash.update(r).update(readFileSync(p));
  if (r === "index.html") urls.push("/");
  else if (r.endsWith("/index.html")) urls.push(`/${r.slice(0, -"index.html".length)}`);
  else if (r.endsWith(".html")) continue; // 404.html, etc.
  else urls.push(`/${r}`);
}
const version = hash.digest("hex").slice(0, 12);

const sw = `// Service worker LogiStock (généré par scripts/gen-sw.mjs) — version ${version}
const CACHE = "logistock-${version}";
const PRECACHE = ${JSON.stringify(urls)};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("logistock-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return; // fonds de carte externes : jamais interceptés
  if (e.request.mode === "navigate") {
    // Réseau d'abord (contenu à jour), cache ensuite : les pages s'ouvrent hors ligne.
    const key = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); return r; }).catch(() => caches.match(key).then((r) => r || caches.match("/"))));
    return;
  }
  // Fichiers statiques versionnés : cache d'abord.
  e.respondWith(caches.match(url.pathname).then((r) => r || fetch(e.request).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)); } return res; })));
});
`;
writeFileSync(join(OUT, "sw.js"), sw);
console.log(`✔ out/sw.js · ${urls.length} fichiers précachés · version ${version}`);
