// Génère les icônes PWA (PNG) à partir du logo SVG, avec le Chromium de Playwright. À lancer une fois : node scripts/gen-icons.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/logo.svg", import.meta.url), "utf8");
const mark = (size, pad, bg, radius) => `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg};border-radius:${radius}px"><div style="width:${size - pad * 2}px;height:${size - pad * 2}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div></div></body></html>`;
const out = [
  { file: "icon-192.png", size: 192, pad: 0, bg: "transparent", r: 0 },
  { file: "icon-512.png", size: 512, pad: 0, bg: "transparent", r: 0 },
  { file: "maskable-512.png", size: 512, pad: 72, bg: "#1f4fd8", r: 0 },
  { file: "apple-touch-icon.png", size: 180, pad: 0, bg: "#1f4fd8", r: 0 },
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const o of out) {
  await page.setViewportSize({ width: o.size, height: o.size });
  await page.setContent(mark(o.size, o.pad, o.bg, o.r));
  await page.screenshot({ path: new URL(`../public/icons/${o.file}`, import.meta.url).pathname, omitBackground: true });
  console.log("✔", o.file);
}
await browser.close();
