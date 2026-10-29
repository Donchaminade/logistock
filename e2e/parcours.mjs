// Parcours complet MarockStock sur les 3 rôles (Playwright, Chromium headless).
import { chromium } from "playwright";
import fs from "node:fs";
import { acceptConsent, GEO } from "./consent.mjs";

const BASE = process.env.BASE ?? "http://localhost:4173";
const SHOTS = process.env.SHOTS ?? new URL("./captures", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const external = new Set();
const errors = [];
const N = (t) => t.replace(/[\u00a0\u202f]/g, " ");
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond, extra }); console.log(`${cond ? "✔" : "✘"} ${name}${extra ? " — " + extra : ""}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, locale: "fr-FR", timezoneId: "Africa/Lome", ...GEO });
ctx.on("request", (r) => { const u = new URL(r.url()); if (!["localhost", "127.0.0.1"].includes(u.hostname) && !u.protocol.startsWith("data") && !u.protocol.startsWith("blob")) external.add(r.url()); });

async function open(name, viewport) {
  const p = await ctx.newPage();
  await p.setViewportSize(viewport);
  p.on("pageerror", (e) => errors.push(`[${name}] ${e.message}`));
  p.on("console", (m) => m.type() === "error" && errors.push(`[${name}] console: ${m.text()}`));
  return p;
}
const confirmSwal = async (p) => { await p.locator(".swal2-confirm").click(); await p.waitForTimeout(250); };
const closeSwal = async (p) => { if (await p.locator(".swal2-popup:not(.swal2-toast)").isVisible().catch(() => false)) await confirmSwal(p); };
async function login(p, role) {
  await p.goto(BASE + "/");
  await p.getByTestId(`quick-${role}`).click();
  await p.waitForURL("**/accueil/");
  await acceptConsent(p);
  await p.waitForTimeout(400);
}
async function hasToast(p, text, timeout = 6000) {
  try { await p.locator(".swal2-toast", { hasText: text }).waitFor({ timeout }); return true; } catch { return false; }
}
const HIDE_TOASTS = "body.swal2-toast-shown .swal2-container{display:none!important}";
async function shot(p, name, full = false, keepToasts = false) {
  await p.waitForTimeout(700);
  const vp = p.viewportSize();
  if (full) { const h = await p.evaluate(() => document.documentElement.scrollHeight); await p.setViewportSize({ width: vp.width, height: Math.max(vp.height, h) }); await p.waitForTimeout(250); }
  await p.screenshot({ path: `${SHOTS}/${name}.png`, style: keepToasts ? undefined : HIDE_TOASTS });
  if (full) await p.setViewportSize(vp);
}

const DESK = { width: 1440, height: 900 };
const MOB = { width: 390, height: 844 };

// ——— Rôle 1 : patron (onglet A) ———
const A = await open("patron", DESK);
await A.goto(BASE + "/");
await A.waitForTimeout(500);
await shot(A, "01-connexion-desktop");
await login(A, "patron");
ok("Connexion directe du patron", A.url().endsWith("/accueil/"));
ok("Tableau de bord : total avancé 36 300 000 FCFA", (await A.getByTestId("kpis").innerText().then(N)).includes("36 300 000"));
await shot(A, "02-patron-tableau-de-bord-desktop", true);

// ——— Rôle 2 : gestionnaire (onglet B) et rôle 3 : fournisseur (onglet C, mobile) ———
const B = await open("gestionnaire", DESK);
await login(B, "gestionnaire");
ok("Connexion du gestionnaire délégué", B.url().endsWith("/accueil/"));
const C = await open("fournisseur", MOB);
await login(C, "fournisseur");
ok("Connexion du fournisseur (mobile)", C.url().endsWith("/accueil/"));
await shot(C, "03-fournisseur-accueil-mobile");
ok("Bottom nav fournisseur : Accueil, Mes contrats, Déclarer, Notifications, Profil", (await C.locator("nav[aria-label='Navigation principale']").innerText().then(N)).replace(/\d/g, "").includes("Mes contrats"));

// Étape 0 : le patron valide la proposition d'Afi (500 t à 350 FCFA/kg)
await A.goto(BASE + "/besoins/");
await A.getByTestId("accept-of-4").click();
await A.getByTestId("contract-submit").click();
await A.locator(".swal2-popup", { hasText: "Proposition validée" }).waitFor();
await confirmSwal(A);
await A.waitForURL("**/contrats/fiche/**");
ok("Étape 0 : proposition validée → contrat créé", (await A.locator("h1").innerText().then(N)).startsWith("CT-2026-"));
// Remise d'argent avec photo de démo + reçu PDF
await A.getByRole("dialog", { name: "Remise d'argent" }).waitFor();
const amountVal = await A.getByRole("dialog").locator("input[inputmode=numeric]").nth(1).inputValue();
ok("Remise préremplie : 175 000 000 FCFA (500 t × 350)", amountVal === "175000000", amountVal);
await A.getByRole("button", { name: "Remise d'espèces" }).click();
const dl = A.waitForEvent("download");
await A.getByTestId("advance-submit").click();
await A.locator(".swal2-popup", { hasText: "Remise enregistrée" }).waitFor();
await confirmSwal(A);
const download = await dl;
await download.saveAs(`${SHOTS}/recu-remise.pdf`);
ok("Reçu PDF généré et téléchargé", fs.statSync(`${SHOTS}/recu-remise.pdf`).size > 20000, download.suggestedFilename());
const newContractUrl = A.url();
const afiNotif = await A.evaluate(() => JSON.parse(localStorage.getItem("logistock:db:v2")).notifications.some((n) => n.to === "u-afi" || (n.to ?? []).includes?.("u-afi")));
ok("Le fournisseur Afi est notifié (notification enregistrée)", afiNotif);

// Page de reçu imprimable
const advHref = await A.evaluate(() => { const db = JSON.parse(localStorage.getItem("logistock:db:v2")); return db.advances[db.advances.length - 1].id; });
const R = A;
await R.setViewportSize({ width: 1000, height: 1300 });
await R.goto(`${BASE}/recu/?id=${advHref}`);
await R.getByTestId("receipt").waitFor();
await R.waitForTimeout(600);
await R.getByTestId("receipt").screenshot({ path: `${SHOTS}/06-recu-imprimable.png` });
ok("Reçu imprimable : quantité et prix unitaire affichés", (await R.getByTestId("receipt").innerText().then(N)).includes("350 FCFA/kg"));
await R.setViewportSize(DESK);

// Gestionnaire : pointage à Lomé du transport TR-2026-041 (cacao, 80 t) puis pesée
await B.goto(BASE + "/transports/fiche/?id=tr-041");
await B.getByTestId("timeline").waitFor();
await B.getByTestId("btn-checkin").click();
await B.locator("input[name=cost]").fill("450000");
await B.getByTestId("checkin-submit").click();
await B.locator(".swal2-popup", { hasText: "Véhicule pointé" }).waitFor();
await confirmSwal(B);
ok("Synchro entre onglets : le patron reçoit un toast « Véhicule pointé à Lomé »", await hasToast(A, "Véhicule pointé"));
await A.waitForTimeout(900);
await shot(A, "15-synchro-toast-patron-desktop", false, true);
await B.getByTestId("btn-weigh").click();
await B.getByTestId("weigh-submit").click();
const weighMsg = await B.locator(".swal2-popup", { hasText: "Livraison réceptionnée" }).innerText().then(N);
ok("Réception : 80 t valorisées à 200 FCFA/kg, reste 100 t → 20 t", weighMsg.includes("16 000 000") && weighMsg.includes("20 t"), weighMsg.replace(/\s+/g, " ").slice(0, 160));
await confirmSwal(B);
await B.waitForTimeout(400);
await shot(B, "05-timeline-lot-desktop", true);

// Fournisseur (mobile) : livraison partielle 80 t sur 100 t avec preuve
await C.goto(BASE + "/accueil/");
await C.getByTestId("partial-CT-2026-017").click();
await C.locator("input[name=found]").fill("80");
await C.locator("textarea[name=partialReason]").fill("Récolte plus faible que prévu chez deux coopératives de Badou");
await C.getByRole("button", { name: "Ticket de pesée" }).click();
await C.getByTestId("partial-submit").click();
await C.locator(".swal2-popup", { hasText: "Livraison partielle déclarée" }).waitFor();
await confirmSwal(C);
ok("Le patron est notifié : « Livraison partielle : 80 t sur 100 t — reliquat 20 t »", await hasToast(A, "Livraison partielle"));

// Patron : fiche contrat CT-2026-017, ajustement du prix du reliquat 200 → 250
await A.goto(BASE + "/contrats/fiche/?id=ct-017");
await A.getByTestId("calc-card").waitFor();
ok("Bandeau livraison partielle sur le contrat", (await A.getByTestId("partial-banner").innerText().then(N)).includes("reliquat 20 t"));
ok("Reste à livrer avant ajustement : 20 t", (await A.getByTestId("remaining").innerText().then(N)).replace(/\s/g, " ") === "20 t");
await A.getByTestId("btn-revision").click();
await A.locator("input[name=newPrice]").fill("250");
await A.locator("input[name=reason]").fill("Hausse du cours du cacao");
await A.waitForTimeout(200);
const simB = await A.getByRole("dialog").innerText().then(N);
ok("Simulation option B : 20 t et complément 1 000 000 FCFA", simB.includes("1 000 000"));
await A.getByRole("dialog").screenshot({ path: `${SHOTS}/07-ajustement-reliquat.png` });
await A.getByTestId("revision-submit").click();
await A.locator(".swal2-popup", { hasText: "Prix du reliquat ajusté" }).waitFor();
await confirmSwal(A);
await A.waitForTimeout(300);
const rem = (await A.getByTestId("remaining").innerText().then(N)).replace(/\s/g, " ");
ok("Recalcul du reliquat (option A) : (20 000 000 − 16 000 000) / 250 = 16 000 kg", rem === "16 t", rem);
ok("Prix en vigueur affiché : 250 FCFA/kg", (await A.getByTestId("current-price").innerText().then(N)).includes("250"));
ok("Le fournisseur reçoit la révision de prix en direct", await hasToast(C, "Révision de prix"));
await shot(A, "04-patron-fiche-contrat-desktop", true);

// Exemple du cahier des charges : 10 000 000 FCFA, 215 → 300 FCFA/kg : 11 511 kg → 8 250 kg
await A.goto(BASE + "/contrats/fiche/?id=ct-014");
await A.getByTestId("calc-card").waitFor();
ok("CT-2026-014 avant révision : 11 511 kg", (await A.getByTestId("calc-card").innerText().then(N)).includes("11 511 kg"));
await A.getByTestId("btn-revision").click();
await A.locator("input[name=newPrice]").fill("300");
await A.locator("input[name=reason]").fill("Révision de marché");
await A.getByTestId("revision-submit").click();
await A.locator(".swal2-popup", { hasText: "Prix du reliquat ajusté" }).waitFor();
await confirmSwal(A);
await A.waitForTimeout(300);
ok("US-04 : reste à livrer 11 511 kg → 8 250 kg", (await A.getByTestId("calc-card").innerText().then(N)).includes("8 250 kg"));

// Gestionnaire : une révision de prix passe par « Actions à confirmer »
await B.goto(BASE + "/contrats/fiche/?id=ct-009");
await B.getByTestId("btn-revision").click();
await B.locator("input[name=newPrice]").fill("220");
await B.locator("input[name=reason]").fill("Proposition terrain");
await B.getByTestId("revision-submit").click();
await B.locator(".swal2-popup", { hasText: "Demande envoyée" }).waitFor();
await confirmSwal(B);
ok("Gestionnaire : changement de prix envoyé en validation (pas appliqué)", (await B.getByTestId("current-price").innerText().then(N)).includes("210"));

// Gestionnaire : demande de suppression d'un transport → file « actions à confirmer »
await B.goto(BASE + "/transports/fiche/?id=tr-028");
await B.getByTestId("btn-delete-transport").click();
await B.locator(".swal2-textarea").fill("Lot saisi sur le mauvais contrat");
await confirmSwal(B);
await B.locator(".swal2-popup", { hasText: "Demande envoyée" }).waitFor();
await confirmSwal(B);
ok("Le gestionnaire ne supprime pas : le transport reste visible", (await B.locator("h1").innerText().then(N)).includes("TR-2026-028"));
ok("Le patron reçoit la demande à confirmer en direct", await hasToast(A, "demande à confirmer"));

// Patron : valide les demandes
await A.goto(BASE + "/actions/");
await A.getByTestId("pending-list").waitFor();
const before = await A.locator("[data-testid^=approve-]").count();
ok("File « Actions à confirmer » : 3 demandes en attente", before === 3, String(before));
await shot(A, "08-actions-a-confirmer-desktop", true);
await A.getByTestId("approve-pa-1").click();
await confirmSwal(A);
await A.waitForTimeout(400);
const firstReq = A.locator("[data-testid^=approve-]").first();
await firstReq.click();
await confirmSwal(A);
await A.waitForTimeout(400);
await A.locator("[data-testid^=refuse-]").first().click();
await A.locator(".swal2-textarea").fill("Prix maintenu à 210 FCFA/kg");
await confirmSwal(A);
await A.waitForTimeout(400);
ok("Toutes les demandes traitées", (await A.locator("[data-testid^=approve-]").count()) === 0);
ok("Le gestionnaire est notifié de la décision", await hasToast(B, "patron"));
await A.goto(BASE + "/transports/?");
await A.getByRole("button", { name: "Tous" }).click();
const listTxt = await A.locator("main").innerText().then(N);
ok("Suppression logique : TR-2026-040 masqué", !listTxt.includes("TR-2026-040"));

// Droits CRUD en direct : le patron interdit la suppression des transports au gestionnaire
await B.goto(BASE + "/transports/fiche/?id=tr-031");
ok("Bouton « Demander la suppression » visible avant", await B.getByTestId("btn-delete-transport").isVisible());
await A.goto(BASE + "/droits/");
await A.getByTestId("perm-d-transports").selectOption("interdite");
await A.waitForTimeout(600);
ok("Droits mis à jour en direct dans l'autre onglet (bouton retiré sans recharger)", !(await B.getByTestId("btn-delete-transport").isVisible().catch(() => false)));
await shot(A, "09-roles-et-droits-desktop", true);

// Patron : création d'un compte fournisseur
await A.goto(BASE + "/fournisseurs/");
await A.getByTestId("new-supplier").click();
await A.locator("input[name=supplierName]").fill("Abla Mensah");
await A.locator("input[name=supplierPhone]").fill("96112233");
await A.locator("input[name=supplierZone]").fill("Kpalimé");
await A.getByTestId("supplier-submit").click();
const created = await A.locator(".swal2-popup", { hasText: "Compte créé" }).innerText().then(N);
const temp = created.match(/LS-\d{4}/)?.[0];
await confirmSwal(A);
ok("Compte fournisseur créé par le patron, mot de passe provisoire", !!temp, temp);
// Première connexion de ce fournisseur → changement de mot de passe imposé
const D = await open("nouveau-fournisseur", MOB);
await D.goto(BASE + "/");
await D.locator("input[name=phone]").fill("96 11 22 33");
await D.locator("input[name=password]").fill(temp);
await D.getByRole("button", { name: "Se connecter" }).click();
await acceptConsent(D);
await D.locator(".swal2-input").waitFor();
await D.locator(".swal2-input").fill("nouveau2026");
await confirmSwal(D);
await D.waitForURL("**/accueil/");
ok("Première connexion : mot de passe changé, accès à l'espace fournisseur", D.url().endsWith("/accueil/"));
await D.close();

// Fournisseur : déclaration d'achat (stock)
await C.goto(BASE + "/declarer/");
await C.locator("input[name=place]").fill("Kougnohou");
await C.locator("input[name=tons]").fill("12");
await C.locator("input[name=price]").fill("1950");
await C.getByTestId("purchase-submit").click();
await C.locator(".swal2-popup", { hasText: "Achat déclaré" }).waitFor();
await confirmSwal(C);
ok("Patron notifié du stock déclaré", await hasToast(A, "Stock déclaré"));
await C.goto(BASE + "/contrats/fiche/?id=ct-017");
await C.getByTestId("calc-card").waitFor();
await shot(C, "10-fournisseur-contrat-mobile");
ok("Fournisseur : voit le reliquat recalculé de 16 t", (await C.getByTestId("remaining").innerText().then(N)).replace(/\s/g, " ") === "16 t");
await C.goto(BASE + "/transports/fiche/?id=tr-041");
await C.getByTestId("timeline").waitFor();
await shot(C, "11-fournisseur-timeline-mobile");

// Patron mobile (bottom nav) + dettes
const M = await open("patron-mobile", MOB);
await M.goto(BASE + "/accueil/");
await M.waitForURL("**/");
await M.getByTestId("quick-patron").click();
await M.waitForURL("**/accueil/");
await M.waitForTimeout(400);
await shot(M, "12-patron-accueil-mobile");
ok("Bottom nav patron : badge « À confirmer » présent", (await M.locator("nav[aria-label='Navigation principale']").innerText().then(N)).includes("À confirmer"));
await M.goto(BASE + "/contrats/fiche/?id=ct-009");
await M.getByTestId("btn-settle").click();
await M.getByRole("button", { name: "Clore : dette" }).click();
await M.getByRole("button", { name: "Clore et passer en dette" }).click();
await confirmSwal(M);
await M.waitForTimeout(400);
await M.goto(BASE + "/finances/");
await M.getByRole("button", { name: /^Dettes\s*\d*$/ }).click();
ok("Solde de 180 000 FCFA passé en dette", (await M.locator("main").innerText().then(N)).includes("180 000"));
await shot(M, "13-patron-dettes-mobile");

// Réinitialisation de la démo
await A.goto(BASE + "/profil/");
await A.getByTestId("reset-demo").click();
await confirmSwal(A);
await A.waitForTimeout(600);
const after = await A.evaluate(() => JSON.parse(localStorage.getItem("logistock:db:v2")).contracts.length);
ok("Réinitialiser la démo : retour aux 3 contrats fictifs", after === 3, String(after));

ok("Aucune requête externe (polices, icônes, CSS, scripts locaux)", external.size === 0, [...external].join(", "));
ok("Aucune erreur JavaScript", errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();
fs.writeFileSync(`${SHOTS}/resultats-tests.json`, JSON.stringify({ date: new Date().toISOString(), results, external: [...external], errors }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
process.exit(failed.length ? 1 : 0);
