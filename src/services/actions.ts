// Services métier : règles du cahier des charges, droits, journal d'audit et notifications.
// Ils n'utilisent que les repositories de la couche de données (jamais le stockage directement).
import { dataSource } from "@/data";
import { currentPrice, metrics, simulateRevision } from "@/lib/calc";
import { fingerprint, uid } from "@/lib/hash";
import { bestPhoneMatch, canonicalPhone, isEmail, normEmail, phoneDigitCount, samePhone } from "@/lib/identity";
import { fcfa, prixKg, tonnes } from "@/lib/format";
import { can, deleteMode } from "@/lib/permissions";
import type {
  Advance, Collection, Contract, Database, Id, PaymentMode, PendingAction, Perm, PermEntity, Product, Role,
  TraceEvent, TraceType, User,
} from "@/lib/types";

const ds = () => dataSource();
const now = () => new Date().toISOString();
const plain = (s: string) => s.replace(/\u00A0/g, " ");

export class ActionError extends Error {}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new ActionError(msg);
}

async function db(): Promise<Database> {
  return ds().snapshot();
}
async function perms() {
  return (await ds().repos.settings.get("settings"))!.perms;
}
async function requirePerm(me: User, entity: PermEntity, action: "c" | "r" | "u" | "d") {
  assert(can(await perms(), me, entity, action), "Vous n'avez pas le droit d'effectuer cette action. Le patron peut ajuster vos droits.");
}

async function audit(me: User | "system", action: string, entity: string, entityId: Id | undefined, detail: string) {
  const list = await ds().repos.audit.list();
  const prevHash = list[list.length - 1]?.hash ?? "GENESIS";
  const at = now();
  const by = me === "system" ? "system" : me.id;
  await ds().repos.audit.create({ id: uid("au"), at, by, action, entity, entityId, detail: plain(detail), prevHash, hash: fingerprint(prevHash + at + by + action + detail) });
}

async function notify(me: User, to: Role | Id, title: string, body: string, link?: string) {
  await ds().repos.notifications.create({ id: uid("nt"), to, title, body: plain(body), link, at: now(), by: me.id, readBy: [] });
}

async function nextRef(prefix: string, values: string[]) {
  const year = new Date().getFullYear();
  const nums = values.map((v) => Number(v.split("-").pop())).filter((n) => !Number.isNaN(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${year}-${String(n).padStart(prefix === "RC" ? 4 : 3, "0")}`;
}

async function ensureLocation(me: User, name: string, type: "origine" | "etape" | "destination" | "autre") {
  const n = name.trim();
  if (!n) return;
  const list = await ds().repos.locations.list();
  if (list.some((l) => l.name.toLowerCase() === n.toLowerCase() && !l.deleted)) return;
  await ds().repos.locations.create({ id: uid("lo"), name: n, type, country: /bénin/i.test(n) ? "Bénin" : "Togo", createdBy: me.id });
}

const posInt = (n: number, label: string) => assert(Number.isInteger(n) && n > 0, `${label} doit être un entier strictement positif.`);

// ——— Session ———
export async function login(identifier: string, password: string): Promise<User> {
  const users = (await ds().repos.users.list()).filter((x) => !x.deleted);
  const raw = identifier.trim();
  const byEmail = raw.includes("@");
  const u = byEmail
    ? users.find((x) => x.email && normEmail(x.email) === normEmail(raw))
    : bestPhoneMatch(users, raw, (x) => x.phone);
  assert(u && u.password === password, "E-mail, numéro ou mot de passe incorrect.");
  assert(u.active, "Ce compte est désactivé. Contactez le patron.");
  ds().session.set(u.id);
  await audit(u, "Connexion", "users", u.id, `${u.name} s'est connecté(e)`);
  return u;
}
export function logout() {
  ds().session.set(null);
}
export async function changePassword(me: User, pwd: string) {
  assert(pwd.length >= 6, "Le mot de passe doit contenir au moins 6 caractères.");
  await ds().repos.users.update(me.id, { password: pwd, mustChangePassword: false });
  await audit(me, "Changement de mot de passe", "users", me.id, `${me.name} a changé son mot de passe`);
}

// ——— Comptes fournisseurs (US-13) ———
export async function createSupplier(me: User, input: { name: string; phone: string; email?: string; zone: string; product: Product }) {
  assert(me.role === "patron", "Seul le patron peut créer un compte fournisseur.");
  assert(input.name.trim().length > 2, "Le nom est obligatoire.");
  const count = phoneDigitCount(input.phone);
  assert(count >= 8 && count <= 15, "Le numéro doit comporter de 8 à 15 chiffres, avec ou sans indicatif (ex. 90 12 34 56, +229 97 00 00 00, +33 6 12 34 56 78).");
  const email = input.email?.trim() ? normEmail(input.email) : undefined;
  if (email) assert(isEmail(email), "L'adresse e-mail n'est pas valide.");
  const users = await ds().repos.users.list();
  assert(!users.some((u) => samePhone(u.phone, input.phone)), "Ce numéro est déjà utilisé par un autre compte.");
  if (email) assert(!users.some((u) => u.email && normEmail(u.email) === email), "Cet e-mail est déjà utilisé par un autre compte.");
  const temp = `LS-${Math.floor(1000 + Math.random() * 9000)}`;
  const phone = canonicalPhone(input.phone);
  const u: User = {
    id: uid("u"), role: "fournisseur", name: input.name.trim(), phone, email, password: temp,
    title: `Fournisseur · ${input.product} · ${input.zone}`, zone: input.zone, active: true, mustChangePassword: true,
    createdAt: now(), createdBy: me.id,
  };
  await ds().repos.users.create(u);
  await audit(me, "Création de compte fournisseur", "users", u.id, `${u.name} (${phone})`);
  return { user: u, tempPassword: temp };
}
export async function setUserActive(me: User, id: Id, active: boolean) {
  assert(me.role === "patron", "Seul le patron peut activer ou désactiver un compte.");
  await ds().repos.users.update(id, { active });
  await audit(me, active ? "Réactivation de compte" : "Désactivation de compte", "users", id, "");
}

// ——— Étape 0 : besoins et propositions (US-01b) ———
export async function createNeed(me: User, input: { product: Product; qtyKg: number; indicativePrice: number; deadline: string; zone?: string; comment?: string }) {
  assert(me.role === "patron", "Seul le patron exprime un besoin.");
  posInt(input.qtyKg, "La quantité visée");
  posInt(input.indicativePrice, "Le prix indicatif");
  const ref = await nextRef("BS", (await ds().repos.needs.list()).map((n) => n.ref));
  const need = { id: uid("bs"), ref, ...input, status: "ouvert" as const, createdBy: me.id, createdAt: now() };
  await ds().repos.needs.create(need);
  await audit(me, "Création de besoin", "needs", need.id, `${ref} · ${tonnes(input.qtyKg)} de ${input.product} à ${prixKg(input.indicativePrice)}`);
  await notify(me, "fournisseur", "Nouveau besoin du patron", `${ref} : ${tonnes(input.qtyKg)} de ${input.product}, prix indicatif ${prixKg(input.indicativePrice)}.`, "/besoins/");
  return need;
}

export async function submitOffer(me: User, input: { needId: Id; supplierId?: Id; qtyKg: number; price: number; advanceRequested: number; delayDays: number; origin?: string }) {
  assert(me.role === "fournisseur" || me.role === "patron", "Seuls les fournisseurs (ou le patron pour eux) soumettent une proposition.");
  posInt(input.qtyKg, "La quantité");
  posInt(input.price, "Le prix");
  posInt(input.advanceRequested, "L'avance demandée");
  const need = await ds().repos.needs.get(input.needId);
  assert(need && !["clos", "annule", "couvert"].includes(need.status), "Ce besoin n'accepte plus de propositions.");
  const supplierId = me.role === "fournisseur" ? me.id : input.supplierId;
  assert(supplierId, "Choisissez le fournisseur.");
  const offer = { id: uid("of"), needId: input.needId, supplierId, qtyKg: input.qtyKg, price: input.price, advanceRequested: input.advanceRequested, delayDays: input.delayDays, origin: input.origin, status: "soumise" as const, createdBy: me.id, createdAt: now() };
  await ds().repos.offers.create(offer);
  const sup = await ds().repos.users.get(supplierId);
  await audit(me, "Proposition soumise", "offers", offer.id, `${sup?.name} · ${need.ref} · ${tonnes(input.qtyKg)} à ${prixKg(input.price)}`);
  if (me.role === "fournisseur")
    await notify(me, "patron", "Nouvelle proposition", `${me.name} propose ${tonnes(input.qtyKg)} à ${prixKg(input.price)} pour ${need.ref}.`, "/besoins/");
  return offer;
}

export async function withdrawOffer(me: User, offerId: Id) {
  const o = await ds().repos.offers.get(offerId);
  assert(o && o.supplierId === me.id && o.status === "soumise", "Seule une proposition soumise peut être retirée par son auteur.");
  await ds().repos.offers.update(offerId, { status: "retiree" });
  await audit(me, "Proposition retirée", "offers", offerId, "");
  await notify(me, "patron", "Proposition retirée", `${me.name} a retiré sa proposition.`, "/besoins/");
}

export async function rejectOffer(me: User, offerId: Id, reason: string) {
  assert(me.role === "patron", "Seul le patron valide ou refuse une proposition.");
  assert(reason.trim().length > 2, "Le motif du refus est obligatoire.");
  const o = await ds().repos.offers.get(offerId);
  assert(o && o.status === "soumise", "Proposition introuvable ou déjà traitée.");
  await ds().repos.offers.update(offerId, { status: "refusee", reason, decidedBy: me.id, decidedAt: now() });
  await audit(me, "Proposition refusée", "offers", offerId, reason);
  await notify(me, o.supplierId, "Proposition refusée", `Motif : ${reason}`, "/besoins/");
}

export interface ContractInput {
  supplierId: Id;
  product: Product;
  qtyKg: number;
  initialPrice: number;
  amount: number;
  moneyReceivedDate: string;
  deliveryDate: string;
  deliveryPlace: string;
  transportPaidByPatron: boolean;
}

function checkContract(i: ContractInput) {
  posInt(i.qtyKg, "Le tonnage");
  posInt(i.initialPrice, "Le prix au kg");
  posInt(i.amount, "Le montant");
  assert(i.moneyReceivedDate, "La date de réception de l'argent est obligatoire.");
  assert(i.deliveryDate, "La date de livraison est obligatoire.");
  assert(i.deliveryPlace.trim(), "Le lieu de livraison est obligatoire.");
}

async function insertContract(me: User, i: ContractInput, extra: Partial<Contract> = {}) {
  checkContract(i);
  const ref = await nextRef("CT", (await ds().repos.contracts.list()).map((c) => c.ref));
  const c: Contract = { id: uid("ct"), ref, ...i, status: "actif", createdBy: me.id, createdAt: now(), ...extra };
  await ds().repos.contracts.create(c);
  await ensureLocation(me, i.deliveryPlace, "etape");
  await audit(me, "Création de contrat", "contracts", c.id, `${ref} · ${tonnes(i.qtyKg)} à ${prixKg(i.initialPrice)} · ${fcfa(i.amount)}`);
  await notify(me, i.supplierId, "Nouveau contrat", `${ref} : ${tonnes(i.qtyKg)} de ${i.product} à ${prixKg(i.initialPrice)}, livraison à ${i.deliveryPlace} le ${new Date(i.deliveryDate).toLocaleDateString("fr-FR")}.`, `/contrats/fiche/?id=${c.id}`);
  return c;
}

export async function acceptOffer(me: User, offerId: Id, i: ContractInput) {
  assert(me.role === "patron", "Seul le patron valide une proposition.");
  const o = await ds().repos.offers.get(offerId);
  assert(o && o.status === "soumise", "Proposition introuvable ou déjà traitée.");
  const need = (await ds().repos.needs.get(o.needId))!;
  const adjusted = i.qtyKg !== o.qtyKg || i.initialPrice !== o.price || i.amount !== o.advanceRequested;
  const c = await insertContract(me, i, { needId: need.id, offerId });
  await ds().repos.offers.update(offerId, { status: "acceptee", decidedBy: me.id, decidedAt: now(), contractId: c.id });
  const accepted = (await ds().repos.offers.list()).filter((x) => x.needId === need.id && x.status === "acceptee");
  const contracts = await ds().repos.contracts.list();
  const covered = accepted.reduce((s, x) => s + (contracts.find((k) => k.id === x.contractId)?.qtyKg ?? x.qtyKg), 0);
  await ds().repos.needs.update(need.id, { status: covered >= need.qtyKg ? "couvert" : "partiellement_couvert" });
  await audit(me, adjusted ? "Proposition ajustée puis acceptée" : "Proposition acceptée", "offers", offerId, `${need.ref} → ${c.ref}`);
  return c;
}

export async function createContract(me: User, i: ContractInput) {
  await requirePerm(me, "contrats", "c");
  return insertContract(me, i);
}

// ——— Remise d'argent, reçu PDF, photo (US-14) ———
export async function recordAdvance(me: User, contractId: Id, i: { amount: number; qtyKg: number; unitPrice: number; date: string; mode: PaymentMode; reference?: string; photo?: string }) {
  await requirePerm(me, "remises", "c");
  posInt(i.amount, "Le montant");
  posInt(i.qtyKg, "La quantité");
  posInt(i.unitPrice, "Le prix unitaire");
  const c = await ds().repos.contracts.get(contractId);
  assert(c && c.status === "actif", "Le contrat doit être actif.");
  const receiptNo = await nextRef("RC", (await ds().repos.advances.list()).map((a) => a.receiptNo));
  const adv: Advance = {
    id: uid("av"), contractId, kind: "remise", ...i, status: i.photo ? "validee" : "a_completer", receiptNo,
    receiptHash: fingerprint(`${receiptNo}|${i.amount}|${contractId}|${i.date}`), by: me.id, at: now(),
  };
  await ds().repos.advances.create(adv);
  await audit(me, "Remise d'argent", "advances", adv.id, `${receiptNo} · ${fcfa(i.amount)} · ${c.ref}${i.photo ? "" : " · photo manquante"}`);
  await notify(me, c.supplierId, "Remise d'argent enregistrée", `${fcfa(i.amount)} pour ${c.ref} (${tonnes(i.qtyKg)} à ${prixKg(i.unitPrice)}). Reçu ${receiptNo}.`, `/contrats/fiche/?id=${c.id}`);
  if (me.role !== "patron") await notify(me, "patron", "Remise saisie par un gestionnaire", `${me.name} a saisi ${fcfa(i.amount)} pour ${c.ref}.`, `/contrats/fiche/?id=${c.id}`);
  if (!i.photo) await notify(me, "patron", "Photo de remise manquante", `Le versement ${receiptNo} reste « à compléter » tant que la photo n'est pas jointe.`, `/contrats/fiche/?id=${c.id}`);
  return adv;
}

export async function attachAdvancePhoto(me: User, advanceId: Id, photo: string) {
  await requirePerm(me, "remises", "u");
  await ds().repos.advances.update(advanceId, { photo, status: "validee" });
  await audit(me, "Photo de remise jointe", "advances", advanceId, "Versement validé");
}

// ——— Ajustement du prix sur le reliquat (US-04, US-19) ———
export async function reviseRemainderPrice(me: User, contractId: Id, i: { newPrice: number; option: "A" | "B"; reason: string }) {
  posInt(i.newPrice, "Le nouveau prix");
  assert(i.reason.trim().length > 2, "Le motif est obligatoire.");
  const c = await ds().repos.contracts.get(contractId);
  assert(c && c.status === "actif", "Le contrat doit être actif.");
  const snap = await db();
  const old = currentPrice(snap, c);
  assert(i.newPrice !== old, "Le nouveau prix est identique au prix en vigueur.");
  if (me.role !== "patron") {
    assert(me.role === "gestionnaire", "Seul le patron révise un prix.");
    await queuePending(me, {
      entity: "contrats", entityId: contractId, kind: "modification_sensible",
      label: `Révision de prix ${c.ref} : ${prixKg(old)} → ${prixKg(i.newPrice)} (option ${i.option})`,
      payload: { type: "revision", ...i }, reason: i.reason,
    });
    return { queued: true as const };
  }
  return { queued: false as const, ...(await applyRevision(me, c, i)) };
}

async function applyRevision(me: User, c: Contract, i: { newPrice: number; option: "A" | "B"; reason: string }) {
  const snap = await db();
  const m = metrics(snap, c);
  const sim = simulateRevision(m.S, m.P, i.newPrice);
  const at = now();
  const prev = snap.revisions.filter((r) => r.contractId === c.id).slice(-1)[0];
  const rev = {
    id: uid("rv"), contractId: c.id, oldPrice: m.P, newPrice: i.newPrice, scope: "reliquat" as const, option: i.option,
    complement: i.option === "B" ? sim.complement : 0, remainderBeforeKg: sim.before,
    remainderAfterKg: i.option === "A" ? sim.optionA : sim.optionB, reason: i.reason, effectiveAt: at, by: me.id, at,
    signature: fingerprint(`${c.id}|${m.P}|${i.newPrice}|${at}|${me.id}|${prev?.signature ?? "GENESIS"}`),
  };
  await ds().repos.revisions.create(rev);
  if (i.option === "B" && sim.complement > 0) {
    const receiptNo = await nextRef("RC", snap.advances.map((a) => a.receiptNo));
    await ds().repos.advances.create({
      id: uid("av"), contractId: c.id, kind: "complement", amount: sim.complement, qtyKg: sim.before, unitPrice: i.newPrice - m.P,
      date: at, mode: "especes", status: "a_completer", receiptNo, receiptHash: fingerprint(`${receiptNo}|${sim.complement}|${c.id}`), by: me.id, at,
    });
  }
  const msg = `Prix du reliquat révisé de ${prixKg(m.P)} à ${prixKg(i.newPrice)}. Reste à livrer : ${tonnes(rev.remainderAfterKg)} au lieu de ${tonnes(sim.before)}${i.option === "B" ? ` · complément de ${fcfa(sim.complement)} à verser` : ` · solde inchangé : ${fcfa(m.S)}`}.`;
  await audit(me, "Révision de prix (reliquat)", "price_revisions", rev.id, `${c.ref} · ${msg} · signature ${rev.signature}`);
  await notify(me, c.supplierId, `Révision de prix · ${c.ref}`, msg, `/contrats/fiche/?id=${c.id}`);
  await notify(me, "gestionnaire", `Révision de prix · ${c.ref}`, msg, `/contrats/fiche/?id=${c.id}`);
  return { revision: rev, sim };
}

// ——— Livraison partielle (US-18) ———
export async function declarePartial(me: User, contractId: Id, i: { foundKg: number; reason: string; proof?: string }) {
  await requirePerm(me, "partielles", "c");
  const c = await ds().repos.contracts.get(contractId);
  assert(c, "Contrat introuvable.");
  if (me.role === "fournisseur") assert(c.supplierId === me.id, "Ce contrat n'est pas le vôtre.");
  posInt(i.foundKg, "La quantité trouvée");
  assert(i.foundKg < c.qtyKg, "La quantité trouvée doit être inférieure à la quantité contractée.");
  assert(i.reason.trim().length > 2, "Le motif est obligatoire.");
  assert(i.proof, "Joignez une preuve (photo, ticket ou document).");
  const remainderKg = c.qtyKg - i.foundKg;
  const p = { id: uid("lp"), contractId, contractedKg: c.qtyKg, foundKg: i.foundKg, remainderKg, reason: i.reason, proof: i.proof, by: me.id, at: now(), seenByPatron: false };
  await ds().repos.partials.create(p);
  await audit(me, "Livraison partielle déclarée", "partial_deliveries", p.id, `${c.ref} · ${tonnes(i.foundKg)} sur ${tonnes(c.qtyKg)} · reliquat ${tonnes(remainderKg)}`);
  await notify(me, "patron", "Livraison partielle", `${c.ref} : ${tonnes(i.foundKg, " ")} sur ${tonnes(c.qtyKg, " ")} — reliquat ${tonnes(remainderKg, " ")}. Motif : ${i.reason}`, `/contrats/fiche/?id=${c.id}`);
  return p;
}
export async function markPartialSeen(me: User, id: Id) {
  if (me.role !== "patron") return;
  await ds().repos.partials.update(id, { seenByPatron: true });
}

// ——— Transports et traces (US-16, US-21) ———
export async function createTransport(me: User, i: { contractId: Id; origin: string; saveOrigin: boolean; tonsKg: number; vehicle: string; driver: string; driverPhone?: string; carrier: string; loadingDate: string; departureDate: string }) {
  await requirePerm(me, "transports", "c");
  const c = await ds().repos.contracts.get(i.contractId);
  assert(c && c.status === "actif", "Choisissez un contrat actif.");
  assert(i.origin.trim(), "L'origine est obligatoire (saisie libre ou table des lieux).");
  posInt(i.tonsKg, "Le tonnage chargé");
  assert(/^[A-Z]{2}-?\d{3,4}-?[A-Z]{1,2}$/i.test(i.vehicle.trim()), "Matricule invalide (format attendu : TG-1234-AB).");
  assert(i.driver.trim(), "Le chauffeur est obligatoire.");
  if (i.saveOrigin) await ensureLocation(me, i.origin, "origine");
  const ref = await nextRef("TR", (await ds().repos.transports.list()).map((t) => t.ref));
  const t = { id: uid("tr"), ref, contractId: c.id, product: c.product, origin: i.origin.trim(), tonsKg: i.tonsKg, vehicle: i.vehicle.trim().toUpperCase(), driver: i.driver.trim(), driverPhone: i.driverPhone, carrier: i.carrier.trim() || "—", loadingDate: i.loadingDate, departureDate: i.departureDate, status: "en_route" as const, createdBy: me.id, createdAt: now() };
  await ds().repos.transports.create(t);
  await addTraceEventRaw(me, t.id, { type: "chargement", place: t.origin, at: i.loadingDate, qtyKg: i.tonsKg, receiver: t.driver, receiverRole: "Chauffeur", vehicle: t.vehicle, driver: t.driver, carrier: t.carrier });
  await audit(me, "Création de transport", "transports", t.id, `${ref} · ${tonnes(i.tonsKg)} · ${t.vehicle} · ${t.driver} · depuis ${t.origin}`);
  await notify(me, c.supplierId, "Transport créé", `${ref} : ${tonnes(i.tonsKg)} chargées à ${t.origin} (${t.vehicle}).`, `/transports/fiche/?id=${t.id}`);
  if (me.role !== "patron") await notify(me, "patron", "Nouveau transport", `${me.name} a créé ${ref} : ${tonnes(i.tonsKg)} depuis ${t.origin}.`, `/transports/fiche/?id=${t.id}`);
  return t;
}

async function addTraceEventRaw(me: User, transportId: Id, e: Omit<TraceEvent, "id" | "transportId" | "order" | "hash" | "prevHash" | "by">) {
  const all = (await ds().repos.traces.list()).filter((x) => x.transportId === transportId).sort((a, b) => a.order - b.order);
  const prevHash = all[all.length - 1]?.hash ?? "GENESIS";
  const base = { id: uid("ev"), transportId, order: all.length + 1, ...e, by: me.id };
  const ev: TraceEvent = { ...base, prevHash, hash: fingerprint(prevHash + JSON.stringify(base)) };
  await ds().repos.traces.create(ev);
  return ev;
}

const TRACE_LABEL: Record<TraceType, string> = {
  achat: "Achat", chargement: "Chargement", etape: "Passage d'étape", livraison_lieu_prevu: "Livraison au lieu prévu",
  pointage_lome: "Pointage à Lomé", pesee: "Pesée", reception: "Réception",
};
export { TRACE_LABEL };

export async function addTraceEvent(me: User, transportId: Id, e: { type: TraceType; place: string; at: string; qtyKg: number; receiver: string; receiverRole: string; comment?: string; photo?: string; saveLocation?: boolean }) {
  await requirePerm(me, "traces", "c");
  const t = await ds().repos.transports.get(transportId);
  assert(t && t.status === "en_route", "Ce transport n'est plus en route.");
  assert(e.place.trim(), "Le lieu est obligatoire.");
  posInt(e.qtyKg, "La quantité");
  assert(e.receiver.trim(), "Le réceptionnaire est obligatoire.");
  if (e.saveLocation) await ensureLocation(me, e.place, "etape");
  const ev = await addTraceEventRaw(me, transportId, { ...e, vehicle: t.vehicle, driver: t.driver });
  const c = (await ds().repos.contracts.get(t.contractId))!;
  const s = await ds().repos.settings.get("settings");
  const gap = t.tonsKg > 0 && Math.abs(e.qtyKg - t.tonsKg) / t.tonsKg > (s?.weightGapThresholdPct ?? 1) / 100;
  await audit(me, `Trace : ${TRACE_LABEL[e.type]}`, "lot_trace_events", ev.id, `${t.ref} · ${e.place} · ${tonnes(e.qtyKg)} · réceptionnaire ${e.receiver}`);
  const body = `${t.ref} · ${e.place} : ${tonnes(e.qtyKg)} — réceptionnaire ${e.receiver}.${gap ? ` Écart de ${tonnes(e.qtyKg - t.tonsKg)} par rapport au chargement.` : ""}`;
  await notify(me, me.role === "patron" ? c.supplierId : "patron", `${TRACE_LABEL[e.type]} enregistré`, body, `/transports/fiche/?id=${t.id}`);
  if (me.role === "patron") await notify(me, "gestionnaire", `${TRACE_LABEL[e.type]} enregistré`, body, `/transports/fiche/?id=${t.id}`);
  return { ev, gap };
}

// ——— Pointage à Lomé et coûts (US-17) ———
export async function checkinLome(me: User, transportId: Id, i: { plateSeen: string; driver: string; at: string; tonsAnnouncedKg: number; cost: number; beneficiary: string }) {
  await requirePerm(me, "pointages", "c");
  const t = await ds().repos.transports.get(transportId);
  assert(t && t.status === "en_route", "Ce transport a déjà été pointé.");
  posInt(i.tonsAnnouncedKg, "Le tonnage annoncé");
  assert(Number.isInteger(i.cost) && i.cost >= 0, "Le coût de transport doit être un entier positif ou nul.");
  const c = (await ds().repos.contracts.get(t.contractId))!;
  const plateSeen = i.plateSeen.trim().toUpperCase();
  const mismatch = plateSeen.replace(/-/g, "") !== t.vehicle.replace(/-/g, "");
  const debitedOn = c.transportPaidByPatron ? ("charges_patron" as const) : ("solde_fournisseur" as const);
  const ck = { id: uid("pt"), transportId, plateSeen, plateMismatch: mismatch, driver: i.driver, at: i.at, by: me.id, tonsAnnouncedKg: i.tonsAnnouncedKg, cost: i.cost, costBeneficiary: i.beneficiary, debitedOn };
  await ds().repos.checkins.create(ck);
  if (i.cost > 0)
    await ds().repos.expenses.create({ id: uid("ch"), category: "transport", label: `Transport ${t.ref}`, amount: i.cost, date: i.at, beneficiary: i.beneficiary, transportId, contractId: c.id, debitedOn, by: me.id });
  await addTraceEventRaw(me, transportId, { type: "pointage_lome", place: "Lomé · magasin central", at: i.at, qtyKg: i.tonsAnnouncedKg, receiver: me.name, receiverRole: me.role === "patron" ? "Patron" : "Gestionnaire délégué", vehicle: plateSeen, driver: i.driver, comment: mismatch ? `Matricule constaté ${plateSeen} ≠ ${t.vehicle}` : undefined });
  await ds().repos.transports.update(transportId, { status: "arrive", arrivalDate: i.at });
  const where = debitedOn === "charges_patron" ? "dans les charges du patron" : "sur le solde du fournisseur";
  await audit(me, "Pointage à Lomé", "arrival_checkins", ck.id, `${t.ref} · ${plateSeen} · ${i.driver} · coût ${fcfa(i.cost)} débité ${where}`);
  await notify(me, "patron", "Véhicule pointé à Lomé", `${t.ref} · ${plateSeen} · ${i.driver} — ${tonnes(i.tonsAnnouncedKg)} annoncées. Coût de transport ${fcfa(i.cost)} débité ${where}.`, `/transports/fiche/?id=${t.id}`);
  if (mismatch) await notify(me, "patron", "Écart de matricule", `${t.ref} : matricule constaté ${plateSeen}, attendu ${t.vehicle}.`, `/transports/fiche/?id=${t.id}`);
  if (debitedOn === "solde_fournisseur" && i.cost > 0) await notify(me, c.supplierId, "Coût de transport imputé", `${fcfa(i.cost)} imputés sur votre solde (${c.ref}).`, `/contrats/fiche/?id=${c.id}`);
  return { ck, mismatch, debitedOn };
}

// ——— Pesée et réception (US-07) ———
export async function weighAndReceive(me: User, transportId: Id, i: { grossKg: number; tareKg: number; bags: number; ticketNo: string }) {
  await requirePerm(me, "traces", "c");
  const t = await ds().repos.transports.get(transportId);
  assert(t && t.status === "arrive", "Le véhicule doit d'abord être pointé à Lomé.");
  const netKg = i.grossKg - i.tareKg;
  assert(Number.isInteger(netKg) && netKg > 0, "Le poids net (brut − tare) doit être positif.");
  assert(i.ticketNo.trim(), "Le numéro du ticket de pesée est obligatoire.");
  const c = (await ds().repos.contracts.get(t.contractId))!;
  const snap = await db();
  const price = currentPrice(snap, c);
  const before = metrics(snap, c);
  const d = { id: uid("lv"), contractId: c.id, transportId, grossKg: i.grossKg, tareKg: i.tareKg, netKg, bags: i.bags, ticketNo: i.ticketNo.trim(), price, value: netKg * price, receivedAt: now(), receivedBy: me.id };
  await ds().repos.deliveries.create(d);
  await addTraceEventRaw(me, transportId, { type: "pesee", place: "Lomé · magasin central", at: now(), qtyKg: netKg, receiver: me.name, receiverRole: me.role === "patron" ? "Patron" : "Gestionnaire délégué", comment: `Ticket ${d.ticketNo} · ${i.bags} sacs · brut ${i.grossKg} kg, tare ${i.tareKg} kg` });
  await addTraceEventRaw(me, transportId, { type: "reception", place: "Lomé · magasin central", at: now(), qtyKg: netKg, receiver: me.name, receiverRole: me.role === "patron" ? "Patron" : "Gestionnaire délégué", comment: `Prix figé : ${prixKg(price, " ")}` });
  await ds().repos.transports.update(transportId, { status: "receptionne" });
  const after = metrics(await db(), c);
  const gapKg = netKg - t.tonsKg;
  await audit(me, "Réception de livraison", "deliveries", d.id, `${t.ref} · ${netKg} kg × ${price} = ${fcfa(d.value)} · reste à livrer ${before.Q} → ${after.Q} kg`);
  const msg = `${t.ref} réceptionné : ${tonnes(netKg)} valorisées ${fcfa(d.value)} (${prixKg(price)}). Reste à livrer : ${tonnes(after.Q)}.`;
  await notify(me, c.supplierId, "Livraison réceptionnée", msg, `/contrats/fiche/?id=${c.id}`);
  if (me.role !== "patron") await notify(me, "patron", "Livraison réceptionnée", msg, `/contrats/fiche/?id=${c.id}`);
  if (Math.abs(gapKg) / t.tonsKg > (snap.settings[0]?.weightGapThresholdPct ?? 1) / 100)
    await notify(me, "patron", "Écart de pesée", `${t.ref} : ${tonnes(netKg)} pesées pour ${tonnes(t.tonsKg)} chargées (écart ${tonnes(gapKg)}).`, `/transports/fiche/?id=${t.id}`);
  return { delivery: d, before, after };
}

// ——— Déclarations de stock (US-05) ———
export async function declarePurchase(me: User, i: { contractId: Id; date: string; place: string; producer?: string; qtyKg: number; pricePaid: number; mode: PaymentMode; photo?: string }) {
  assert(me.role === "fournisseur", "Seuls les fournisseurs déclarent leurs achats.");
  const c = await ds().repos.contracts.get(i.contractId);
  assert(c && c.supplierId === me.id, "Choisissez un de vos contrats.");
  posInt(i.qtyKg, "La quantité");
  posInt(i.pricePaid, "Le prix payé");
  assert(i.place.trim(), "Le lieu ou village est obligatoire.");
  const dc = { id: uid("dc"), supplierId: me.id, ...i, createdAt: now() };
  await ds().repos.declarations.create(dc);
  await audit(me, "Déclaration d'achat", "purchase_declarations", dc.id, `${tonnes(i.qtyKg)} à ${i.place} · ${prixKg(i.pricePaid)}`);
  await notify(me, "patron", "Stock déclaré", `${me.name} déclare ${tonnes(i.qtyKg)} achetées à ${i.place} (${c.ref}). Stock prêt à enlever.`, "/stocks/");
  return dc;
}

// ——— Paiements, dettes, charges ———
export async function recordRepayment(me: User, contractId: Id, i: { amount: number; mode: PaymentMode; reference?: string; photo?: string; debtId?: Id }) {
  assert(me.role === "patron", "Seul le patron enregistre un remboursement.");
  posInt(i.amount, "Le montant");
  const c = (await ds().repos.contracts.get(contractId))!;
  const pm = { id: uid("pm"), direction: "fournisseur_vers_patron" as const, kind: "remboursement" as const, contractId, ...i, date: now(), by: me.id };
  await ds().repos.payments.create(pm);
  if (i.debtId) {
    const snap = await db();
    const d = snap.debts.find((x) => x.id === i.debtId)!;
    const paid = snap.payments.filter((p) => p.debtId === d.id).reduce((s, p) => s + p.amount, 0);
    await ds().repos.debts.update(d.id, { status: paid >= d.initial ? "soldee" : "en_remboursement" });
  }
  await audit(me, "Remboursement reçu", "repayments", pm.id, `${c.ref} · ${fcfa(i.amount)}`);
  await notify(me, c.supplierId, "Remboursement enregistré", `${fcfa(i.amount)} reçus sur ${c.ref}. Merci.`, `/contrats/fiche/?id=${c.id}`);
  return pm;
}

export async function closeContract(me: User, contractId: Id, dueDate?: string) {
  assert(me.role === "patron", "Seul le patron clôture un contrat.");
  const c = (await ds().repos.contracts.get(contractId))!;
  const m = metrics(await db(), c);
  if (m.S <= 0) {
    await ds().repos.contracts.update(contractId, { status: "clos", closedAs: "solde" });
    await audit(me, "Clôture de contrat", "contracts", contractId, `${c.ref} · clos — soldé`);
    await notify(me, c.supplierId, "Contrat soldé", `${c.ref} est clos — soldé.`, `/contrats/fiche/?id=${c.id}`);
    return "solde" as const;
  }
  assert(dueDate, "Fixez une échéance de remboursement.");
  const debt = { id: uid("dt"), contractId, supplierId: c.supplierId, initial: m.S, createdAt: now(), dueDate, status: "ouverte" as const };
  await ds().repos.debts.create(debt);
  await ds().repos.contracts.update(contractId, { status: "clos", closedAs: "dette" });
  await audit(me, "Passage en dette", "debts", debt.id, `${c.ref} · ${fcfa(m.S)} · échéance ${new Date(dueDate).toLocaleDateString("fr-FR")}`);
  await notify(me, c.supplierId, "Solde passé en dette", `${c.ref} : ${fcfa(m.S)} à rembourser avant le ${new Date(dueDate).toLocaleDateString("fr-FR")}.`, "/finances/");
  return "dette" as const;
}

export async function addExpense(me: User, i: { category: "maintenance" | "commission" | "autre"; label: string; amount: number; beneficiary: string; contractId?: Id }) {
  assert(me.role !== "fournisseur", "Action réservée au patron et aux gestionnaires.");
  posInt(i.amount, "Le montant");
  assert(i.label.trim(), "Le libellé est obligatoire.");
  const e = { id: uid("ch"), ...i, date: now(), debitedOn: "charges_patron" as const, by: me.id };
  await ds().repos.expenses.create(e);
  await audit(me, "Charge enregistrée", "expenses", e.id, `${i.label} · ${fcfa(i.amount)}`);
  if (me.role !== "patron") await notify(me, "patron", "Nouvelle charge", `${me.name} : ${i.label} · ${fcfa(i.amount)}.`, "/finances/");
  return e;
}

export async function addLocation(me: User, name: string, type: "origine" | "etape" | "destination" | "autre") {
  await requirePerm(me, "lieux", "c");
  assert(name.trim().length > 1, "Le nom du lieu est obligatoire.");
  await ensureLocation(me, name, type);
  await audit(me, "Ajout de lieu", "locations", undefined, name);
}

// ——— Suppressions et « actions à confirmer » (§3.3, US-20) ———
const COLLECTION_OF: Record<PermEntity, Collection> = {
  fournisseurs: "users", besoins: "needs", contrats: "contracts", remises: "advances", transports: "transports",
  pointages: "checkins", traces: "traces", partielles: "partials", lieux: "locations",
};

async function queuePending(me: User, p: Omit<PendingAction, "id" | "by" | "at" | "status">) {
  const existing = (await ds().repos.pending.list()).find((x) => x.entityId === p.entityId && x.status === "en_attente" && x.kind === p.kind);
  assert(!existing, "Une demande est déjà en attente pour cet élément.");
  const pa: PendingAction = { id: uid("pa"), ...p, by: me.id, at: now(), status: "en_attente" };
  await ds().repos.pending.create(pa);
  await audit(me, p.kind === "suppression" ? "Demande de suppression" : "Demande de modification sensible", p.entity, p.entityId, `${p.label} · motif : ${p.reason}`);
  await notify(me, "patron", "Nouvelle demande à confirmer", `${me.name} : ${p.label}. Motif : ${p.reason}`, "/actions/");
  return pa;
}

async function applyDelete(me: User, entity: PermEntity, id: Id, label: string) {
  const col = COLLECTION_OF[entity];
  if (entity === "remises") await ds().repos.advances.update(id, { status: "annulee" }); // contre-écriture, jamais d'effacement
  else await (ds().repos[col] as unknown as { update(id: Id, p: { deleted: boolean }): Promise<unknown> }).update(id, { deleted: true });
  await audit(me, entity === "remises" ? "Annulation (contre-écriture)" : "Suppression logique", entity, id, `${label} · élément masqué mais conservé`);
}

/** Supprimer : directe pour le patron, via la file « actions à confirmer » pour un gestionnaire délégué. */
export async function requestDelete(me: User, entity: PermEntity, id: Id, label: string, reason: string) {
  const mode = deleteMode(await perms(), me, entity);
  assert(mode !== "interdite", "Vous n'avez pas le droit de supprimer cet élément.");
  assert(reason.trim().length > 2, "Le motif est obligatoire.");
  if (mode === "confirmation") {
    await queuePending(me, { entity, entityId: id, kind: "suppression", label, reason });
    return "queued" as const;
  }
  await applyDelete(me, entity, id, `${label} · motif : ${reason}`);
  return "deleted" as const;
}

export async function decidePending(me: User, id: Id, approve: boolean, decisionReason: string) {
  assert(me.role === "patron", "Seul le patron valide les actions à confirmer.");
  const pa = await ds().repos.pending.get(id);
  assert(pa && pa.status === "en_attente", "Demande introuvable ou déjà traitée.");
  if (!approve) assert(decisionReason.trim().length > 2, "Le motif du refus est obligatoire.");
  if (approve) {
    if (pa.kind === "suppression") await applyDelete(me, pa.entity, pa.entityId, pa.label);
    else if (pa.payload?.type === "revision") {
      const c = (await ds().repos.contracts.get(pa.entityId))!;
      await applyRevision(me, c, pa.payload as unknown as { newPrice: number; option: "A" | "B"; reason: string });
    }
  }
  await ds().repos.pending.update(id, { status: approve ? "validee" : "refusee", decidedBy: me.id, decidedAt: now(), decisionReason });
  await audit(me, approve ? "Demande validée" : "Demande refusée", pa.entity, pa.entityId, `${pa.label}${decisionReason ? ` · ${decisionReason}` : ""}`);
  await notify(me, pa.by, approve ? "Demande validée par le patron" : "Demande refusée par le patron", `${pa.label}${decisionReason ? ` — ${decisionReason}` : ""}`, "/actions/");
}

// ——— Droits CRUD (§3.3) ———
export async function setPerm(me: User, role: "gestionnaire" | "fournisseur", entity: PermEntity, key: keyof Perm, value: boolean | Perm["d"]) {
  assert(me.role === "patron", "Seul le patron modifie les droits.");
  const s = (await ds().repos.settings.get("settings"))!;
  const next = structuredClone(s.perms);
  (next[role][entity] as unknown as Record<string, unknown>)[key] = value;
  await ds().repos.settings.update("settings", { perms: next });
  await audit(me, "Modification des droits", "role_permissions", `${role}.${entity}`, `${role} · ${entity} · ${key} = ${String(value)}`);
  await notify(me, role, "Vos droits ont changé", `Le patron a modifié vos droits sur « ${entity} ».`);
}
export async function resetPerms(me: User) {
  assert(me.role === "patron", "Seul le patron modifie les droits.");
  const { defaultPerms } = await import("@/lib/permissions");
  await ds().repos.settings.update("settings", { perms: defaultPerms() });
  await audit(me, "Droits par défaut restaurés", "role_permissions", undefined, "");
}

// ——— Notifications ———
export async function markAllRead(me: User, ids: Id[]) {
  for (const id of ids) {
    const n = await ds().repos.notifications.get(id);
    if (n && !n.readBy.includes(me.id)) await ds().repos.notifications.update(id, { readBy: [...n.readBy, me.id] });
  }
}

export async function resetDemo() {
  await ds().reset();
}

export async function savePhoto(dataUrl: string) {
  return ds().photos.put(dataUrl);
}
export async function resolvePhoto(ref: string) {
  return ds().photos.resolve(ref);
}
