// Rôles étendus LogiStock : administrateur, magasinier, chauffeur, comptable ; verrouillage, PIN,
// hors ligne (file d'attente + PWA), vérification de signature, commissions, exports (Playwright, Chromium).
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:4173";
const SHOTS = process.env.SHOTS ?? new URL("./captures", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const external = new Set();
const errors = [];
const N = (t) => t.replace(/[\u00a0\u202f]/g, " ");
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond, extra }); console.log(`${cond ? "✔" : "✘"} ${name}${extra ? " — " + extra : ""}`); };
const DESK = { width: 1440, height: 900 };
const MOB = { width: 390, height: 844 };
const KEY = "logistock:db:v2";

const browser = await chromium.launch();
const newCtx = async () => {
  const c = await browser.newContext({ acceptDownloads: true, locale: "fr-FR", timezoneId: "Africa/Lome" });
  c.on("request", (r) => { const u = new URL(r.url()); if (!["localhost", "127.0.0.1"].includes(u.hostname) && !u.protocol.startsWith("data") && !u.protocol.startsWith("blob")) external.add(r.url()); });
  return c;
};
const ctx = await newCtx();
async function open(name, viewport, c = ctx) {
  const p = await c.newPage();
  await p.setViewportSize(viewport);
  p.on("pageerror", (e) => errors.push(`[${name}] ${e.message}`));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text()) && errors.push(`[${name}] console: ${m.text()}`));
  return p;
}
const confirmSwal = async (p) => { await p.locator(".swal2-confirm").click(); await p.waitForTimeout(250); };
const popup = (p, text) => p.locator(".swal2-popup:not(.swal2-toast)", { hasText: text });
async function hasToast(p, text, timeout = 6000) {
  try { await p.locator(".swal2-toast", { hasText: text }).waitFor({ timeout }); return true; } catch { return false; }
}
async function login(p, role) {
  await p.goto(BASE + "/");
  await p.getByTestId(`quick-${role}`).click();
  await p.waitForURL("**/accueil/");
  await p.waitForTimeout(400);
}
async function loginForm(p, phone, password) {
  await p.locator("input[name=phone]").fill(phone);
  await p.locator("input[name=password]").fill(password);
  await p.getByRole("button", { name: "Se connecter" }).click();
}
const HIDE_TOASTS = "body.swal2-toast-shown .swal2-container{display:none!important}";
async function shot(p, name, full = false) {
  await p.waitForTimeout(600);
  const vp = p.viewportSize();
  if (full) { const h = await p.evaluate(() => document.documentElement.scrollHeight); await p.setViewportSize({ width: vp.width, height: Math.min(Math.max(vp.height, h), 4000) }); await p.waitForTimeout(250); }
  await p.screenshot({ path: `${SHOTS}/${name}.png`, style: HIDE_TOASTS });
  if (full) await p.setViewportSize(vp);
}
const dbOf = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
async function saveDownload(p, trigger, name) {
  const dl = p.waitForEvent("download");
  await trigger();
  const d = await dl;
  const path = `${SHOTS}/${name}`;
  await d.saveAs(path);
  return { size: fs.statSync(path).size, file: d.suggestedFilename(), head: fs.readFileSync(path).subarray(0, 4).toString("latin1") };
}

// ——— 1. Vérification publique d'un reçu (SHA-256 + Ed25519) ———
const V = await open("verifier", DESK);
await V.goto(BASE + "/verifier/");
await V.waitForTimeout(800);
const av = (await dbOf(V)).advances.find((a) => a.id === "av-017");
ok("Reçus du jeu de démo : empreinte SHA-256 (64 hex) et signature Ed25519 (128 hex)", /^[0-9a-f]{64}$/.test(av.receiptHash) && /^[0-9a-f]{128}$/.test(av.receiptSignature));
await V.goto(`${BASE}/verifier/?no=${av.receiptNo}&h=${av.receiptHash.slice(0, 16)}`);
await V.getByTestId("verify-result").waitFor();
ok("Vérification d'un reçu authentique : empreinte et signature valides", (await V.getByTestId("verify-result").getAttribute("data-ok")) === "1");
ok("Empreinte recalculée identique à celle du reçu", (await V.getByTestId("recomputed").innerText()).trim() === av.receiptHash);
ok("Moteur de signature affiché", /WebCrypto|noble/i.test(await V.getByTestId("engine").innerText()), await V.getByTestId("engine").innerText());
ok("Mention : clé de démo côté serveur en production", /serveur/i.test(await V.getByTestId("demo-key-notice").innerText()));
await shot(V, "30-verification-recu-ok-desktop", true);
await V.getByTestId("btn-tamper").click();
await V.waitForFunction(() => document.querySelector("[data-testid=verify-result]")?.getAttribute("data-ok") === "0");
ok("Falsification simulée (montant +1 000 000) : vérification en échec", (await V.getByTestId("verify-result").getAttribute("data-ok")) === "0");
await shot(V, "31-verification-recu-falsifie-desktop", true);
await V.locator("input[name=receiptHash]").fill("0123456789abcdef0123");
await V.getByTestId("verify-submit").click();
await V.waitForTimeout(600);
ok("Empreinte imprimée erronée : refusée", (await V.getByTestId("verify-result").getAttribute("data-ok")) === "0");
await V.close();

// ——— 2. Administrateur ———
const AD = await open("admin", DESK);
await login(AD, "admin");
ok("Connexion de l'administratrice", AD.url().endsWith("/accueil/"));
await shot(AD, "20-admin-accueil-desktop", true);
await AD.goto(BASE + "/utilisateurs/");
await AD.getByTestId("btn-new-user").click();
await AD.locator("select[name=role]").selectOption("magasinier");
await AD.locator("input[name=phone]").fill("94 55 66 77");
await AD.locator("input[name=name]").fill("Kafui Adzo");
await AD.getByTestId("user-submit").click();
await popup(AD, "Compte créé").waitFor();
const temp = (await AD.getByTestId("temp-pwd").innerText()).trim();
ok("Création d'un compte magasinier avec mot de passe provisoire", temp.length >= 6, temp);
await confirmSwal(AD);
await shot(AD, "21-admin-utilisateurs-desktop", true);
await AD.goto(BASE + "/droits/");
ok("Matrice de droits : un onglet par rôle (6 rôles hors patron)", (await AD.locator("[data-testid^=role-]").count()) === 6);
ok("Administratrice : matrice en lecture seule", (await AD.locator("[data-testid^=perm-d-]").count()) === 0 || (await AD.locator("[data-testid^=perm-d-]").first().isDisabled()));
await AD.getByTestId("role-chauffeur").click();
await shot(AD, "22-droits-chauffeur-desktop", true);
await AD.goto(BASE + "/parametres/");
await shot(AD, "23-admin-parametres-desktop", true);
await AD.goto(BASE + "/accueil/");

// ——— 3. Verrouillage après 5 échecs (US-01) puis déblocage par l'administratrice ———
const L = await open("verrouillage", MOB);
await L.goto(BASE + "/");
for (let i = 1; i <= 4; i++) {
  await loginForm(L, "90 33 44 55", "mauvais" + i);
  await popup(L, "Connexion refusée").waitFor();
  await confirmSwal(L);
}
await loginForm(L, "90 33 44 55", "mauvais5");
const lockTxt = await popup(L, "Compte bloqué").innerText().then(N);
ok("5e échec : compte bloqué, administrateur alerté", /Cinq échecs/.test(lockTxt), lockTxt.replace(/\s+/g, " ").slice(0, 120));
await shot(L, "24-connexion-compte-bloque-mobile", false);
await confirmSwal(L);
await loginForm(L, "90 33 44 55", "compta2026");
ok("Bon mot de passe refusé tant que le compte est bloqué", await popup(L, "bloqué").isVisible());
await confirmSwal(L);
ok("L'administratrice reçoit l'alerte « Compte bloqué » en direct", await hasToast(AD, "Compte bloqué"));
await AD.goto(BASE + "/utilisateurs/");
await AD.getByTestId("unlock-u-essi").click();
ok("Déblocage par l'administratrice", await hasToast(AD, "Compte débloqué"));
await loginForm(L, "90 33 44 55", "compta2026");
await L.waitForURL("**/accueil/");
ok("Après déblocage : connexion du comptable", L.url().endsWith("/accueil/"));
const audit = (await dbOf(L)).audit.map((a) => a.action);
ok("Journal : blocage et déblocage tracés", audit.includes("Compte bloqué") && audit.includes("Déblocage de compte"));
await L.close();

// ——— 4. Comptable : lecture seule, exports ———
const CO = await open("comptable", DESK);
await login(CO, "comptable");
await shot(CO, "25-comptable-accueil-desktop", true);
await CO.goto(BASE + "/utilisateurs/");
await CO.waitForTimeout(500);
ok("Comptable : comptes utilisateurs inaccessibles (« Accès réservé »)", (await CO.locator("main").innerText()).includes("Accès réservé"));
await CO.goto(BASE + "/finances/");
await CO.waitForTimeout(500);
ok("Comptable : finances visibles, sans bouton d'écriture", (await CO.locator("[data-testid^=writeoff-],[data-testid^=repay-]").count()) === 0);
await shot(CO, "26-comptable-finances-desktop", true);
await CO.goto(BASE + "/exports/");
await CO.getByTestId("xlsx-stocks").waitFor();
const x1 = await saveDownload(CO, () => CO.getByTestId("xlsx-stocks").click(), "export-stocks.xlsx");
ok("Export Excel des stocks (.xlsx, archive ZIP locale)", x1.head.startsWith("PK") && x1.size > 3000, `${x1.file} · ${x1.size} o`);
const p1 = await saveDownload(CO, () => CO.getByTestId("pdf-dettes").click(), "export-dettes.pdf");
ok("Export PDF des dettes", p1.head === "%PDF", `${p1.file} · ${p1.size} o`);
const x2 = await saveDownload(CO, () => CO.getByTestId("xlsx-all").click(), "export-classeur.xlsx");
ok("Classeur complet (.xlsx multi-feuilles)", x2.head.startsWith("PK") && x2.size > x1.size, `${x2.size} o`);
const m1 = await saveDownload(CO, () => CO.getByTestId("btn-monthly").click(), "rapport-mensuel.pdf");
ok("Rapport mensuel du patron (PDF)", m1.head === "%PDF" && m1.size > 8000, `${m1.file} · ${m1.size} o`);
await shot(CO, "27-exports-desktop", true);

// ——— 5. Commissions : calculée → validée → payée (administratrice) ———
await AD.goto(BASE + "/commissions/");
await AD.waitForTimeout(400);
const paidBefore = (await dbOf(AD)).commissions.filter((c) => c.status === "payee").length;
const calc = AD.locator("[data-testid^=calc-]").first();
await calc.waitFor();
await calc.click();
await AD.waitForTimeout(600);
if (await AD.locator(".swal2-popup:not(.swal2-toast)").isVisible()) await confirmSwal(AD);
await AD.getByRole("button", { name: /^Suivi/ }).click();
await AD.locator("[data-testid^=validate-]").first().click();
await confirmSwal(AD);
await AD.waitForTimeout(500);
if (await AD.locator(".swal2-popup:not(.swal2-toast)").isVisible()) await confirmSwal(AD);
await AD.locator("[data-testid^=pay-]").first().click();
await AD.getByTestId("pay-submit").click();
await AD.waitForTimeout(700);
if (await AD.locator(".swal2-popup:not(.swal2-toast)").isVisible()) await confirmSwal(AD);
const cms = (await dbOf(AD)).commissions;
ok("Commission calculée, validée puis payée (règle du contrat, dépense ou ajustement J tracé)", cms.filter((c) => c.status === "payee").length === paidBefore + 1, cms.map((c) => c.status).join(", "));
await shot(AD, "28-commissions-desktop", true);

// ——— 6. Chauffeur (mobile) : PIN, étape, arrivée avec photo ———
const MG = await open("magasinier", DESK);
await login(MG, "magasinier");
const CH = await open("chauffeur", MOB);
await login(CH, "chauffeur");
ok("Chauffeur : bandeau d'invitation au code PIN", await CH.getByTestId("pin-banner").isVisible());
await shot(CH, "40-chauffeur-accueil-mobile");
await CH.goto(BASE + "/profil/");
await CH.getByTestId("btn-set-pin").click();
await CH.locator(".swal2-input").fill("2580");
await confirmSwal(CH);
await CH.locator(".swal2-input").fill("2580");
await confirmSwal(CH);
ok("Toast « Code PIN enregistré »", await hasToast(CH, "Code PIN enregistré"));
ok("Code PIN défini (empreinte salée, jamais en clair)", (await dbOf(CH)).devices.some((d) => d.userId === "u-yao" && /^[0-9a-f]{64}$/.test(d.pinHash) && !JSON.stringify(d).includes("2580")));
await CH.goto(BASE + "/trajets/");
await CH.getByTestId("trip-PK-2026-006").click();
await CH.waitForURL("**/enlevements/fiche/**");
await shot(CH, "41-chauffeur-ordre-enlevement-mobile", true);
await CH.getByTestId("btn-pass-stage").click();
await CH.getByTestId("pass-submit").click();
await CH.waitForTimeout(600);
if (await CH.locator(".swal2-popup:not(.swal2-toast)").isVisible()) await confirmSwal(CH);
const pk = (await dbOf(CH)).pickups.find((p) => p.id === "pk-006");
ok("Passage à Tsévié confirmé par le chauffeur", !!pk.route.find((r) => r.place === "Tsévié")?.passedAt);
await CH.getByTestId("btn-arrival").click();
await CH.getByRole("dialog").getByRole("button", { name: "Chargement" }).click();
await CH.getByTestId("arrival-submit").click();
await CH.waitForTimeout(600);
if (await CH.locator(".swal2-popup:not(.swal2-toast)").isVisible()) await confirmSwal(CH);
ok("Arrivée déclarée avec photo", !!(await dbOf(CH)).pickups.find((p) => p.id === "pk-006").arrivalDeclaredAt);
ok("Le magasinier est notifié de l'arrivée en direct", await hasToast(MG, "Camion arrivé"));

// ——— 7. Magasinier : pointage, pesée, réception ———
await MG.goto(BASE + "/reception/");
await MG.waitForTimeout(500);
ok("Réception : TR-2026-041 annoncé à l'arrivée", (await MG.locator("main").innerText()).includes("TR-2026-041"));
await shot(MG, "42-magasinier-reception-desktop", true);
await MG.goto(BASE + "/transports/fiche/?id=tr-041");
await MG.getByTestId("btn-checkin").click();
await MG.locator("input[name=cost]").fill("450000");
await MG.getByTestId("checkin-submit").click();
await popup(MG, "Véhicule pointé").waitFor();
await confirmSwal(MG);
await MG.getByTestId("btn-weigh").click();
await MG.getByTestId("weigh-submit").click();
const wmsg = await popup(MG, /Livraison réceptionnée|Pesée enregistrée/).innerText().then(N);
ok("Pesée par le magasinier : 80 t nets enregistrés", wmsg.includes("80"), wmsg.replace(/\s+/g, " ").slice(0, 140));
await confirmSwal(MG);
if (await MG.getByTestId("btn-receive").isVisible().catch(() => false)) { await MG.getByTestId("btn-receive").click(); await MG.waitForTimeout(600); if (await MG.locator(".swal2-popup:not(.swal2-toast)").isVisible()) await confirmSwal(MG); }
const del = (await dbOf(MG)).deliveries.find((d) => d.transportId === "tr-041");
ok("Livraison réceptionnée et valorisée au prix figé (200 FCFA/kg)", del?.status === "receptionnee" && del.price === 200, `${del?.status} · ${del?.price} FCFA/kg`);
await shot(MG, "43-magasinier-pesee-desktop", true);
await MG.goto(BASE + "/carte/");
await MG.waitForTimeout(900);
ok("Carte des lots (Leaflet, fond schématique local, sans tuiles externes)", (await MG.locator(".leaflet-container").count()) > 0);
await shot(MG, "47-carte-des-lots-desktop", true);
await AD.goto(BASE + "/journal/");
await AD.getByTestId("btn-verify-chain").click();
const chain = await AD.locator(".swal2-popup:not(.swal2-toast)").innerText().then(N);
ok("Journal d'audit : chaîne SHA-256 vérifiée intègre (après toutes les opérations du test)", chain.includes("Chaîne intègre"), chain.replace(/\s+/g, " ").slice(0, 100));
await confirmSwal(AD);
await shot(AD, "29-journal-audit-desktop", true);

// ——— 8. Hors ligne simulé (onglet chauffeur) : file d'attente puis synchronisation ———
await CH.goto(BASE + "/frais/");
await CH.getByTestId("net-indicator").click();
await CH.getByRole("button", { name: "Simuler hors ligne" }).click();
await CH.waitForTimeout(400);
ok("Indicateur : hors ligne", (await CH.getByTestId("net-indicator").getAttribute("data-online")) === "0");
await CH.locator("input[name=amount]").fill("35000");
await CH.getByRole("button", { name: "Ticket de pesée" }).click();
await CH.getByTestId("frais-submit").click();
const offMsg = await popup(CH, "Frais déclarés").innerText().then(N);
ok("Frais saisis hors ligne : « en attente de synchronisation »", offMsg.includes("en attente de synchronisation"));
await confirmSwal(CH);
ok("Compteur de la file d'attente : 1", (await CH.getByTestId("outbox-count").innerText()).trim() === "1");
await shot(CH, "44-chauffeur-hors-ligne-mobile");
await CH.getByTestId("net-indicator").click();
await CH.getByRole("button", { name: "Rétablir le réseau" }).click();
await CH.waitForFunction(() => !document.querySelector("[data-testid=outbox-count]"), null, { timeout: 8000 }).catch(() => undefined);
ok("Retour du réseau : file synchronisée automatiquement", (await CH.getByTestId("outbox-count").count()) === 0);
ok("Indicateur : synchronisé", (await CH.getByTestId("net-indicator").innerText()).includes("Synchronisé") || (await CH.getByTestId("net-indicator").getAttribute("data-online")) === "1");
const exp = (await dbOf(CH)).expenses.filter((e) => e.by === "u-yao" && e.amount === 35000);
ok("Frais du chauffeur reçus, à valider", exp.length === 1 && exp[0].status === "a_valider");
await CH.close();

// ——— 9. Déverrouillage par PIN depuis l'écran de connexion (nouvel onglet = nouvelle session) ———
const PI = await open("pin", MOB);
await PI.goto(BASE + "/");
await PI.getByTestId("pin-users").waitFor();
await PI.getByTestId("pin-u-yao").click();
await PI.locator(".swal2-input").fill("1111");
await confirmSwal(PI);
const badPin = await popup(PI, "incorrect").isVisible();
ok("PIN erroné refusé (essais restants affichés)", badPin);
await confirmSwal(PI);
await shot(PI, "45-connexion-pin-mobile");
await PI.getByTestId("pin-u-yao").click();
await PI.locator(".swal2-input").fill("2580");
await confirmSwal(PI);
await PI.waitForURL("**/accueil/");
ok("Déverrouillage par PIN : accès à l'espace chauffeur", PI.url().endsWith("/accueil/"));
await PI.close();

// ——— Déconnexion : confirmer doit revenir à l'écran de connexion, sans rebond vers l'accueil ———
const OUT = await open("logout", DESK);
await login(OUT, "patron");
await OUT.getByTestId("logout-header").click();
await OUT.getByRole("button", { name: "Annuler" }).click();
await OUT.waitForTimeout(400);
ok("Annuler la déconnexion laisse la session ouverte", OUT.url().includes("/accueil/") && (await OUT.evaluate(() => sessionStorage.getItem("logistock:session"))) !== null);
await OUT.getByTestId("logout-header").click();
await confirmSwal(OUT);
await OUT.getByRole("heading", { name: "Connexion" }).waitFor();
await OUT.waitForTimeout(800);
ok("Déconnexion (en-tête) : session effacée, écran de connexion", (await OUT.evaluate(() => sessionStorage.getItem("logistock:session"))) === null && !OUT.url().includes("accueil"));
await login(OUT, "patron");
await OUT.goto(BASE + "/profil/");
await OUT.getByTestId("logout-profile").click();
await confirmSwal(OUT);
await OUT.getByRole("heading", { name: "Connexion" }).waitFor();
await OUT.waitForTimeout(800);
ok("Déconnexion (profil) : retour à la connexion", (await OUT.evaluate(() => sessionStorage.getItem("logistock:session"))) === null && !OUT.url().includes("accueil"));
await OUT.setViewportSize(MOB);
await login(OUT, "fournisseur");
await OUT.goto(BASE + "/profil/");
await OUT.getByTestId("logout-profile").click();
await confirmSwal(OUT);
await OUT.getByRole("heading", { name: "Connexion" }).waitFor();
await OUT.waitForTimeout(800);
ok("Déconnexion mobile (profil) : retour à la connexion", (await OUT.evaluate(() => sessionStorage.getItem("logistock:session"))) === null && !OUT.url().includes("accueil"));
await OUT.close();

// ——— 10. PWA : service worker, rechargement réellement hors ligne ———
const ctx2 = await newCtx();
const W = await open("pwa", MOB, ctx2);
await W.goto(BASE + "/");
const manifest = await W.evaluate(() => fetch("/manifest.webmanifest").then((r) => r.json()));
ok("Manifeste PWA : nom, icônes 192/512 et maskable, affichage standalone", manifest.display === "standalone" && manifest.icons.length >= 3 && manifest.icons.some((i) => i.purpose === "maskable"));
await W.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
await W.waitForFunction(() => caches.keys().then((k) => k.some((x) => x.startsWith("logistock-"))));
await W.waitForTimeout(1500);
ok("Service worker actif, cache de précache créé", await W.evaluate(() => !!navigator.serviceWorker.controller || caches.keys().then((k) => k.length > 0)));
await W.reload();
await W.getByTestId("quick-gestionnaire").click();
await W.waitForURL("**/accueil/");
await ctx2.setOffline(true);
await W.reload();
await W.waitForTimeout(800);
ok("Réseau coupé : l'application se recharge depuis le cache", (await W.locator("main").innerText().catch(() => "")).length > 50);
ok("Indicateur hors ligne (réseau réel coupé)", (await W.getByTestId("net-indicator").getAttribute("data-online")) === "0");
await W.goto(BASE + "/transports/fiche/?id=tr-041");
await W.waitForTimeout(800);
ok("Navigation hors ligne vers une fiche transport", (await W.locator("h1").innerText().catch(() => "")).includes("TR-2026-041"));
await W.goto(BASE + "/contrats/fiche/?id=ct-009");
await W.getByTestId("btn-advance").click().catch(() => undefined);
await W.waitForTimeout(400);
await W.getByTestId("advance-submit").click().catch(() => undefined);
await W.waitForTimeout(600);
ok("Hors ligne : remise d'argent refusée (opération financière, réseau exigé)", await popup(W, /réseau|ligne/i).isVisible().catch(() => false));
const W2 = await open("pwa-login", MOB, ctx2);
await W2.goto(BASE + "/");
await W2.waitForTimeout(800);
ok("Écran de connexion hors ligne : invite au PIN", await W2.getByTestId("login-offline").isVisible());
await shot(W2, "46-connexion-hors-ligne-mobile");
await ctx2.setOffline(false);
await ctx2.close();

ok("Aucune requête externe", external.size === 0, [...external].join(", "));
ok("Aucune erreur JavaScript", errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();
fs.writeFileSync(`${SHOTS}/resultats-roles.json`, JSON.stringify({ date: new Date().toISOString(), results, external: [...external], errors }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies (rôles étendus)`);
process.exit(failed.length ? 1 : 0);
