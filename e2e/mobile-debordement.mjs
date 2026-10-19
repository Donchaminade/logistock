// Balayage mobile (360 px) : aucune page ne doit déborder horizontalement.
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:4173";
const PAGES = {
  patron: ["/accueil/", "/besoins/", "/contrats/", "/contrats/fiche/?id=ct-017", "/contrats/fiche/?id=ct-014", "/transports/", "/transports/fiche/?id=tr-041", "/transports/fiche/?id=tr-036", "/stocks/", "/finances/", "/actions/", "/fournisseurs/", "/droits/", "/journal/", "/notifications/", "/profil/", "/plus/", "/recu/?id=av-017"],
  gestionnaire: ["/accueil/", "/besoins/", "/contrats/", "/contrats/fiche/?id=ct-017", "/transports/", "/transports/fiche/?id=tr-041", "/stocks/", "/actions/", "/fournisseurs/", "/notifications/", "/profil/", "/plus/"],
  fournisseur: ["/accueil/", "/contrats/", "/contrats/fiche/?id=ct-017", "/transports/fiche/?id=tr-041", "/declarer/", "/declarer/?tab=partielle", "/besoins/", "/commissions/", "/enlevements/", "/releve/", "/notifications/", "/profil/"],
  admin: ["/accueil/", "/utilisateurs/", "/parametres/", "/droits/", "/journal/", "/exports/", "/commissions/", "/profil/", "/plus/"],
  magasinier: ["/accueil/", "/reception/", "/transports/", "/transports/fiche/?id=tr-041", "/stocks/", "/carte/", "/profil/", "/plus/"],
  chauffeur: ["/accueil/", "/trajets/", "/enlevements/", "/frais/", "/notifications/", "/profil/"],
  comptable: ["/accueil/", "/finances/", "/commissions/", "/charges/", "/exports/", "/journal/", "/releve/", "/profil/", "/plus/"],
};
const b = await chromium.launch();
let bad = 0, errs = [];
for (const [role, list] of Object.entries(PAGES)) {
  const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(`${role}: ${e.message}`));
  await p.goto(BASE + "/"); await p.getByTestId(`quick-${role}`).click(); await p.waitForURL("**/accueil/");
  for (const path of list) {
    await p.goto(BASE + path); await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const W = document.documentElement.clientWidth; const out = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest(".swal2-container,[data-scroll-x]")) continue;
        const st = getComputedStyle(el); if (st.position === "fixed") continue;
        let a = el.parentElement, clipped = false;
        while (a && a !== document.body) { const s = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { clipped = true; break; } a = a.parentElement; }
        if (clipped) continue;
        const rc = el.getBoundingClientRect(); if (rc.width && rc.right > W + 1) out.push(`${el.tagName}.${String(el.className).slice(0, 50)} → ${Math.round(rc.right)}`);
      }
      return { sw: document.documentElement.scrollWidth, W, out: out.slice(0, 3) };
    });
    const k = r.sw > r.W + 1 || r.out.length;
    if (k) { bad++; console.log(`✘ ${role} ${path} scroll=${r.sw}/${r.W}`, r.out); }
  }
  await ctx.close();
}
console.log(bad ? `${bad} page(s) en débordement` : "✔ Aucune page en débordement horizontal à 360 px", errs);
await b.close();
process.exit(bad || errs.length ? 1 : 0);
