// Alertes calculées (§2.7) : chaque alerte vise des rôles précis, avec un lien vers l'écran à traiter.
import { debtRemaining, metrics, supplierStock } from "./calc";
import { fcfa, tonnes } from "./format";
import type { Database, Role, User } from "./types";

export type AlertKind = "actions" | "partielle" | "photo" | "echu" | "echeance" | "stock" | "pesee" | "inactif" | "sync" | "dette" | "frais" | "compte" | "commission" | "arrivee";
export interface AppAlert {
  kind: AlertKind;
  title: string;
  text: string;
  href: string;
  roles: Role[];
}

const DAY = 864e5;

export function computeAlerts(db: Database, me: User, at = Date.now()): AppAlert[] {
  const s = db.settings[0]!;
  const out: AppAlert[] = [];
  const name = (id?: string) => db.users.find((u) => u.id === id)?.name ?? "—";
  const ref = (cid: string) => db.contracts.find((c) => c.id === cid)?.ref ?? "—";
  const pending = db.pending.filter((p) => p.status === "en_attente");
  if (pending.length) out.push({ kind: "actions", title: `${pending.length} action${pending.length > 1 ? "s" : ""} à confirmer`, text: pending[0]!.label, href: "/actions/", roles: ["patron"] });
  for (const p of db.partials.filter((x) => !x.deleted && !x.seenByPatron))
    out.push({ kind: "partielle", title: `Livraison partielle · ${ref(p.contractId)}`, text: `${tonnes(p.foundKg)} sur ${tonnes(p.contractedKg)} — reliquat ${tonnes(p.remainderKg)}`, href: `/contrats/fiche/?id=${p.contractId}`, roles: ["patron", "admin"] });
  for (const a of db.advances.filter((x) => x.status === "a_completer" && !x.deleted))
    out.push({ kind: "photo", title: `Photo de remise manquante · ${a.receiptNo}`, text: `${fcfa(a.amount)} · ${ref(a.contractId)}`, href: `/contrats/fiche/?id=${a.contractId}`, roles: ["patron", "admin", "gestionnaire"] });
  for (const c of db.contracts.filter((x) => x.status === "actif" && !x.deleted)) {
    const m = metrics(db, c);
    const end = new Date(c.deliveryDate).getTime();
    if (end < at && m.S > 0) out.push({ kind: "echu", title: `Contrat échu non soldé · ${c.ref}`, text: `${name(c.supplierId)} · solde ${fcfa(m.S)}`, href: `/contrats/fiche/?id=${c.id}`, roles: ["patron", "admin", "comptable"] });
    else if (end >= at && end - at < s.dueSoonDays * DAY && m.Q > 0) out.push({ kind: "echeance", title: `Échéance proche · ${c.ref}`, text: `Livraison attendue le ${new Date(c.deliveryDate).toLocaleDateString("fr-FR")} · reste ${tonnes(m.Q)}`, href: `/contrats/fiche/?id=${c.id}`, roles: ["patron", "admin", "gestionnaire", "fournisseur"] });
    const last = Math.max(new Date(c.createdAt).getTime(), ...db.deliveries.filter((d) => d.contractId === c.id).map((d) => new Date(d.weighedAt).getTime()), ...db.declarations.filter((d) => d.contractId === c.id).map((d) => new Date(d.createdAt).getTime()), ...db.transports.filter((t) => t.contractId === c.id).map((t) => new Date(t.createdAt).getTime()));
    if (at - last > s.inactivityDays * DAY && m.Q > 0) out.push({ kind: "inactif", title: `Contrat inactif · ${c.ref}`, text: `Aucune livraison ni déclaration depuis ${Math.floor((at - last) / DAY)} jours`, href: `/contrats/fiche/?id=${c.id}`, roles: ["patron", "admin"] });
  }
  for (const u of db.users.filter((x) => x.role === "fournisseur" && !x.deleted)) {
    const st = supplierStock(db, u.id);
    if (st.available >= s.stockAlertKg) out.push({ kind: "stock", title: `Stock prêt à enlever · ${u.name}`, text: `${tonnes(st.available)} déclarées disponibles (${u.zone ?? ""})`, href: "/stocks/", roles: ["patron", "admin", "gestionnaire"] });
  }
  for (const d of db.deliveries.filter((x) => !x.deleted)) {
    const t = db.transports.find((x) => x.id === d.transportId);
    if (t && Math.abs(d.netKg - t.tonsKg) / t.tonsKg > s.weightGapThresholdPct / 100 && at - new Date(d.weighedAt).getTime() < 30 * DAY)
      out.push({ kind: "pesee", title: `Écart de pesée · ${t.ref}`, text: `Chargé ${tonnes(t.tonsKg)}, net ${tonnes(d.netKg)}`, href: `/transports/fiche/?id=${t.id}`, roles: ["patron", "magasinier"] });
  }
  for (const t of db.transports.filter((x) => !x.deleted && x.status === "arrive" && !db.deliveries.some((d) => d.transportId === x.id)))
    out.push({ kind: "arrivee", title: `${t.ref} pointé à Lomé`, text: "En attente de pesée et de réception", href: `/transports/fiche/?id=${t.id}`, roles: ["patron", "magasinier", "gestionnaire"] });
  for (const p of db.pickups.filter((x) => !x.deleted && x.arrivalDeclaredAt))
    for (const t of db.transports.filter((x) => x.pickupId === p.id && x.status === "en_route" && !x.deleted))
      out.push({ kind: "arrivee", title: `Camion arrivé · ${p.vehicle}`, text: `${t.ref} : pointage à faire au magasin`, href: `/transports/fiche/?id=${t.id}`, roles: ["magasinier", "patron"] });
  const old = db.outbox.filter((o) => o.status === "en_attente" && at - new Date(o.at).getTime() > s.syncAlertHours * 3600e3);
  for (const o of old) out.push({ kind: "sync", title: "Synchronisation en retard", text: `${name(o.by)} · ${o.label}`, href: "/accueil/", roles: ["admin", "patron"] });
  for (const d of db.debts.filter((x) => !x.deleted && !["soldee", "passee_en_perte"].includes(x.status) && new Date(x.dueDate).getTime() < at))
    out.push({ kind: "dette", title: `Dette échue · ${name(d.supplierId)}`, text: `Restant ${fcfa(debtRemaining(db, d.id))} · ${ref(d.contractId)}`, href: "/finances/", roles: ["patron", "admin", "comptable"] });
  const frais = db.expenses.filter((e) => e.status === "a_valider" && !e.deleted);
  if (frais.length) out.push({ kind: "frais", title: `${frais.length} frais de route à valider`, text: frais.map((f) => f.label).join(" · "), href: "/charges/", roles: ["patron", "admin"] });
  const cms = db.commissions.filter((c) => c.status === "calculee" && !c.deleted);
  if (cms.length) out.push({ kind: "commission", title: `${cms.length} commission(s) à valider`, text: fcfa(cms.reduce((t, c) => t + c.amount, 0)), href: "/commissions/", roles: ["patron", "admin"] });
  const locked = db.users.filter((u) => u.lockedUntil && new Date(u.lockedUntil).getTime() > at);
  for (const u of locked) out.push({ kind: "compte", title: `Compte bloqué · ${u.name}`, text: "Cinq échecs de connexion consécutifs", href: "/utilisateurs/", roles: ["admin", "patron"] });
  return out.filter((a) => a.roles.includes(me.role) && (me.role !== "fournisseur" || a.href.includes("contrats")));
}
