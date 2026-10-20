// Services métier : règles du cahier des charges, droits, journal d'audit et notifications.
// Ils n'utilisent que les repositories de la couche de données (jamais le stockage directement).
import { commissionDue, currentPrice, debtPaid, metrics, simulateRevision, supplierOpenDebt } from "@/lib/calc";
import { uid } from "@/lib/hash";
import { fcfa, prixKg, tonnes, date as fdate } from "@/lib/format";
import { GENESIS, sealReceipt, sealRevision, signWriteOff, traceHash } from "@/lib/integrity";
import { canonicalPhone, isEmail, normEmail, phoneDigitCount, samePhone } from "@/lib/identity";
import { can, deleteMode, isLocked } from "@/lib/permissions";
import type {
  Advance, Collection, CommissionRule, Contract, Expense, ExpenseCategory, Id, ManagedRole, PaymentMode,
  PendingAction, Perm, PermEntity, Pickup, Product, Role, Settings, TraceEvent, TraceType, Transport, User,
} from "@/lib/types";
import {
  ActionError, assert, audit, db, ds, ensureLocation, nextRef, notify, now, offlineCapable, perms, posInt, requireOnline,
  requireOwn, requirePerm, roleTitle, settings,
} from "./core";
import { journalGeo } from "./location";
import { isOnline } from "./network";

export { ActionError };
export { syncOutbox } from "./core";
export * from "./auth";

const ficheC = (id: Id) => `/contrats/fiche/?id=${id}`;
const ficheT = (id: Id) => `/transports/fiche/?id=${id}`;
const ficheP = (id: Id) => `/enlevements/fiche/?id=${id}`;

// ——— Comptes (US-13 et administration) ———
export async function createSupplier(me: User, input: { name: string; phone: string; email?: string; zone: string; product: Product }) {
  assert(me.role === "patron", "Seul le patron peut créer un compte fournisseur (pas d'auto-inscription).");
  requireOnline("La gestion des comptes");
  return insertUser(me, { role: "fournisseur", name: input.name, phone: input.phone, email: input.email, zone: input.zone, title: `Fournisseur · ${input.product} · ${input.zone}` });
}

async function insertUser(me: User, i: { role: Role; name: string; phone: string; email?: string; zone?: string; title: string }) {
  assert(i.name.trim().length > 2, "Le nom est obligatoire.");
  const count = phoneDigitCount(i.phone);
  assert(count >= 8 && count <= 15, "Le numéro doit comporter de 8 à 15 chiffres, avec ou sans indicatif (ex. 90 12 34 56, +229 97 00 00 00, +33 6 12 34 56 78).");
  const email = i.email?.trim() ? normEmail(i.email) : undefined;
  if (email) assert(isEmail(email), "L'adresse e-mail n'est pas valide.");
  const users = await ds().repos.users.list();
  assert(!users.some((u) => samePhone(u.phone, i.phone)), "Ce numéro est déjà utilisé par un autre compte.");
  if (email) assert(!users.some((u) => u.email && normEmail(u.email) === email), "Cet e-mail est déjà utilisé par un autre compte.");
  const temp = `LS-${Math.floor(1000 + Math.random() * 9000)}`;
  const phone = canonicalPhone(i.phone);
  const u: User = { id: uid("u"), role: i.role, name: i.name.trim(), phone, email, password: temp, title: i.title, zone: i.zone, active: true, mustChangePassword: true, failedAttempts: 0, createdAt: now(), createdBy: me.id };
  const geo = await journalGeo(me);
  await ds().repos.users.create(u);
  await audit(me, `Création de compte ${roleTitle(u).toLowerCase()}`, "users", u.id, `${u.name} (${phone})`, { after: { role: u.role, name: u.name, phone }, geo });
  return { user: u, tempPassword: temp };
}

/** Comptes internes (admin, délégué, magasinier, chauffeur, comptable) : patron ou admin. */
export async function createUser(me: User, i: { role: Exclude<ManagedRole, "fournisseur">; name: string; phone: string; zone?: string; title?: string }) {
  await requirePerm(me, "utilisateurs", "c");
  requireOnline("La gestion des comptes");
  if (i.role === "admin") assert(me.role === "patron", "Seul le patron crée un compte administrateur.");
  const titles = { admin: "Administrateur", gestionnaire: "Gestionnaire délégué", magasinier: "Magasinier", chauffeur: "Chauffeur", comptable: "Comptable" };
  const r = await insertUser(me, { ...i, title: i.title?.trim() || `${titles[i.role]}${i.zone ? ` · ${i.zone}` : ""}` });
  if (i.role === "chauffeur") await ds().repos.drivers.create({ id: uid("dr"), name: r.user.name, phone: r.user.phone, userId: r.user.id, active: true });
  return r;
}

export async function setUserActive(me: User, id: Id, active: boolean) {
  const u = (await ds().repos.users.get(id))!;
  if (u.role === "fournisseur" || u.role === "admin") assert(me.role === "patron", "Seul le patron active ou désactive ce compte.");
  else await requirePerm(me, "utilisateurs", "u");
  assert(u.role !== "patron", "Le compte patron ne peut pas être désactivé.");
  requireOnline("La gestion des comptes");
  const geo = await journalGeo(me);
  await ds().repos.users.update(id, { active });
  await audit(me, active ? "Réactivation de compte" : "Désactivation de compte", "users", id, u.name, { before: { active: u.active }, after: { active }, geo });
}

export async function resetUserPassword(me: User, id: Id) {
  await requirePerm(me, "utilisateurs", "u");
  requireOnline("La gestion des comptes");
  const u = (await ds().repos.users.get(id))!;
  if (u.role === "fournisseur" || u.role === "patron") assert(me.role === "patron", "Seul le patron réinitialise ce compte.");
  const temp = `LS-${Math.floor(1000 + Math.random() * 9000)}`;
  const geo = await journalGeo(me);
  await ds().repos.users.update(id, { password: temp, mustChangePassword: true, failedAttempts: 0, lockedUntil: undefined });
  await audit(me, "Réinitialisation du mot de passe", "users", id, u.name, { geo });
  return temp;
}

// ——— Paramètres (§2.7, §1.8, US-01) ———
type SettingsPatch = Partial<Pick<Settings, "weightGapThresholdPct" | "maxFailedLogins" | "lockMinutes" | "stockAlertKg" | "dueSoonDays" | "inactivityDays" | "syncAlertHours" | "debtBlockThreshold" | "resalePrice">>;
export async function updateSettings(me: User, patch: SettingsPatch) {
  await requirePerm(me, "parametres", "u");
  requireOnline("La modification des paramètres");
  const s = await settings();
  for (const [k, v] of Object.entries(patch)) {
    if (k === "resalePrice") for (const n of Object.values(v as Record<string, number>)) assert(Number.isInteger(n) && n >= 0, "Prix de revente invalide.");
    else assert(typeof v === "number" && Number.isFinite(v) && v >= 0, `Valeur invalide pour ${k}.`);
  }
  assert((patch.maxFailedLogins ?? s.maxFailedLogins) >= 3, "Au moins 3 essais avant blocage.");
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, (s as unknown as Record<string, unknown>)[k]]));
  await ds().repos.settings.update("settings", patch);
  await audit(me, "Paramètres modifiés", "settings", "settings", Object.keys(patch).join(", "), { before, after: patch });
}

export async function saveCommissionRule(me: User, r: Omit<CommissionRule, "id"> & { id?: Id }) {
  await requirePerm(me, "parametres", "u");
  requireOnline("La modification des paramètres");
  assert(r.label.trim().length > 2, "Le libellé est obligatoire.");
  assert(Number.isInteger(r.value) && r.value > 0, "La valeur doit être un entier positif (pourcentage en points de base : 200 = 2 %).");
  const s = await settings();
  const rules = [...s.commissionRules];
  const i = r.id ? rules.findIndex((x) => x.id === r.id) : -1;
  const rule: CommissionRule = { ...r, id: r.id ?? uid("cr") };
  if (i >= 0) rules[i] = rule;
  else rules.push(rule);
  await ds().repos.settings.update("settings", { commissionRules: rules });
  await audit(me, i >= 0 ? "Règle de commission modifiée" : "Règle de commission créée", "settings", rule.id, rule.label, { before: i >= 0 ? s.commissionRules[i] : undefined, after: rule });
}

export async function setContractCommissionRule(me: User, contractId: Id, ruleId: Id | undefined) {
  await requirePerm(me, "commissions", "u");
  const c = (await ds().repos.contracts.get(contractId))!;
  await ds().repos.contracts.update(contractId, { commissionRuleId: ruleId });
  await audit(me, "Règle de commission du contrat", "contracts", contractId, c.ref, { before: { commissionRuleId: c.commissionRuleId }, after: { commissionRuleId: ruleId } });
}

// ——— Référentiels : véhicules et chauffeurs ———
const PLATE = /^[A-Z]{2}-?\d{3,4}-?[A-Z]{1,2}$/i;
export async function addVehicle(me: User, i: { plate: string; type: string; capacityKg: number; owner: string }) {
  await requirePerm(me, "vehicules", "c");
  const plate = i.plate.trim().toUpperCase();
  assert(PLATE.test(plate), "Matricule invalide (format attendu : TG-1234-AB).");
  posInt(i.capacityKg, "La capacité");
  const list = await ds().repos.vehicles.list();
  assert(!list.some((v) => v.plate.replace(/-/g, "") === plate.replace(/-/g, "") && !v.deleted), "Ce matricule existe déjà.");
  const v = { id: uid("vh"), plate, type: i.type.trim() || "Camion", capacityKg: i.capacityKg, owner: i.owner.trim() || "—", active: true };
  await ds().repos.vehicles.create(v);
  await audit(me, "Ajout de véhicule", "vehicles", v.id, `${plate} · ${v.type}`, { after: v });
  return v;
}
export async function addDriver(me: User, i: { name: string; phone: string; licence?: string }) {
  await requirePerm(me, "vehicules", "c");
  assert(i.name.trim().length > 2, "Le nom du chauffeur est obligatoire.");
  const d = { id: uid("dr"), name: i.name.trim(), phone: i.phone.trim(), licence: i.licence?.trim() || undefined, active: true };
  await ds().repos.drivers.create(d);
  await audit(me, "Ajout de chauffeur", "drivers", d.id, d.name, { after: d });
  return d;
}

// ——— Étape 0 : besoins et propositions (US-01b) ———
export async function createNeed(me: User, input: { product: Product; qtyKg: number; indicativePrice: number; deadline: string; zone?: string; comment?: string }) {
  await requirePerm(me, "besoins", "c");
  posInt(input.qtyKg, "La quantité visée");
  posInt(input.indicativePrice, "Le prix indicatif");
  const ref = await nextRef("BS", (await ds().repos.needs.list()).map((n) => n.ref));
  const need = { id: uid("bs"), ref, ...input, status: "ouvert" as const, createdBy: me.id, createdAt: now() };
  await ds().repos.needs.create(need);
  await audit(me, "Création de besoin", "needs", need.id, `${ref} · ${tonnes(input.qtyKg)} de ${input.product} à ${prixKg(input.indicativePrice)}`, { after: need });
  await notify(me, "fournisseur", "Nouveau besoin du patron", `${ref} : ${tonnes(input.qtyKg)} de ${input.product}, prix indicatif ${prixKg(input.indicativePrice)}.`, "/besoins/");
  return need;
}

export async function submitOffer(me: User, input: { needId: Id; supplierId?: Id; qtyKg: number; price: number; advanceRequested: number; delayDays: number; origin?: string }) {
  if (me.role !== "patron") await requirePerm(me, "propositions", "c");
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
  await audit(me, "Proposition soumise", "offers", offer.id, `${sup?.name} · ${need.ref} · ${tonnes(input.qtyKg)} à ${prixKg(input.price)}`, { after: offer });
  if (me.role !== "patron") await notify(me, "patron", "Nouvelle proposition", `${sup?.name} propose ${tonnes(input.qtyKg)} à ${prixKg(input.price)} pour ${need.ref}.`, "/besoins/");
  return offer;
}

export async function withdrawOffer(me: User, offerId: Id) {
  const o = await ds().repos.offers.get(offerId);
  assert(o && (o.supplierId === me.id || o.createdBy === me.id) && o.status === "soumise", "Seule une proposition soumise peut être retirée par son auteur.");
  await ds().repos.offers.update(offerId, { status: "retiree" });
  await audit(me, "Proposition retirée", "offers", offerId, "", { before: { status: "soumise" }, after: { status: "retiree" } });
  await notify(me, "patron", "Proposition retirée", `${me.name} a retiré sa proposition.`, "/besoins/");
}

export async function rejectOffer(me: User, offerId: Id, reason: string) {
  assert(me.role === "patron", "Seul le patron valide ou refuse une proposition.");
  assert(reason.trim().length > 2, "Le motif du refus est obligatoire.");
  const o = await ds().repos.offers.get(offerId);
  assert(o && o.status === "soumise", "Proposition introuvable ou déjà traitée.");
  await ds().repos.offers.update(offerId, { status: "refusee", reason, decidedBy: me.id, decidedAt: now() });
  await audit(me, "Proposition refusée", "offers", offerId, reason, { before: { status: "soumise" }, after: { status: "refusee", reason } });
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
  commissionRuleId?: Id;
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
  const c: Contract = { id: uid("ct"), ref, ...i, commissionRuleId: i.commissionRuleId || undefined, status: "actif", createdBy: me.id, createdAt: now(), ...extra };
  await ds().repos.contracts.create(c);
  await ensureLocation(me, i.deliveryPlace, "etape");
  await audit(me, "Création de contrat", "contracts", c.id, `${ref} · ${tonnes(i.qtyKg)} à ${prixKg(i.initialPrice)} · ${fcfa(i.amount)}`, { after: c });
  await notify(me, i.supplierId, "Nouveau contrat", `${ref} : ${tonnes(i.qtyKg)} de ${i.product} à ${prixKg(i.initialPrice)}, livraison à ${i.deliveryPlace} le ${fdate(i.deliveryDate)}.`, ficheC(c.id));
  if (me.role !== "patron") await notify(me, "patron", "Nouveau contrat", `${me.name} a créé ${ref} (${tonnes(i.qtyKg)}).`, ficheC(c.id));
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
  await audit(me, adjusted ? "Proposition ajustée puis acceptée" : "Proposition acceptée", "offers", offerId, `${need.ref} → ${c.ref}`, { before: { qtyKg: o.qtyKg, price: o.price, advance: o.advanceRequested }, after: { qtyKg: i.qtyKg, price: i.initialPrice, advance: i.amount } });
  return c;
}

export async function createContract(me: User, i: ContractInput) {
  await requirePerm(me, "contrats", "c");
  return insertContract(me, i);
}

export async function setContractSuspended(me: User, contractId: Id, suspended: boolean, reason: string) {
  assert(me.role === "patron", "Seul le patron suspend ou réactive un contrat.");
  assert(reason.trim().length > 2, "Le motif est obligatoire.");
  const c = (await ds().repos.contracts.get(contractId))!;
  assert(c.status === (suspended ? "actif" : "suspendu"), "Statut du contrat incompatible.");
  await ds().repos.contracts.update(contractId, { status: suspended ? "suspendu" : "actif" });
  await audit(me, suspended ? "Contrat suspendu" : "Contrat réactivé", "contracts", contractId, `${c.ref} · ${reason}`, { before: { status: c.status }, after: { status: suspended ? "suspendu" : "actif" } });
  await notify(me, c.supplierId, suspended ? "Contrat suspendu" : "Contrat réactivé", `${c.ref} · ${reason}`, ficheC(c.id));
}

// ——— Remise d'argent, reçu PDF signé, photo (US-03, US-14) ———
export async function recordAdvance(me: User, contractId: Id, i: { amount: number; qtyKg: number; unitPrice: number; date: string; mode: PaymentMode; reference?: string; photo?: string; force?: boolean }) {
  await requirePerm(me, "remises", "c");
  requireOnline("Le versement d'une avance");
  posInt(i.amount, "Le montant");
  posInt(i.qtyKg, "La quantité");
  posInt(i.unitPrice, "Le prix unitaire");
  const c = await ds().repos.contracts.get(contractId);
  assert(c && c.status === "actif", "Le contrat doit être actif.");
  const snap = await db();
  const s = snap.settings[0]!;
  const open = supplierOpenDebt(snap, c.supplierId);
  if (s.debtBlockThreshold > 0 && open > s.debtBlockThreshold)
    assert(i.force && me.role === "patron", `Avance bloquée : la dette ouverte de ce fournisseur (${fcfa(open)}) dépasse le seuil de ${fcfa(s.debtBlockThreshold)}. Seul le patron peut passer outre.`);
  const receiptNo = await nextRef("RC", snap.advances.map((a) => a.receiptNo));
  const { force, ...data } = i;
  const draft: Advance = { id: uid("av"), contractId, kind: "remise", ...data, status: i.photo ? "validee" : "a_completer", receiptNo, receiptHash: "", receiptSignature: "", by: me.id, at: now() };
  const adv = { ...draft, ...(await sealReceipt(snap, draft)) };
  const geo = await journalGeo(me);
  await ds().repos.advances.create(adv);
  await audit(me, force ? "Remise d'argent (seuil de dette dépassé, décision du patron)" : "Remise d'argent", "advances", adv.id, `${receiptNo} · ${fcfa(i.amount)} · ${c.ref}${i.photo ? "" : " · photo manquante"} · empreinte ${adv.receiptHash.slice(0, 16)}`, { after: { amount: adv.amount, qtyKg: adv.qtyKg, unitPrice: adv.unitPrice, mode: adv.mode }, geo });
  await notify(me, c.supplierId, "Remise d'argent enregistrée", `${fcfa(i.amount)} pour ${c.ref} (${tonnes(i.qtyKg)} à ${prixKg(i.unitPrice)}). Reçu ${receiptNo}.`, ficheC(c.id));
  if (me.role !== "patron") await notify(me, "patron", "Remise saisie par un gestionnaire", `${me.name} a saisi ${fcfa(i.amount)} pour ${c.ref}.`, ficheC(c.id));
  if (!i.photo) await notify(me, "patron", "Photo de remise manquante", `Le versement ${receiptNo} reste « à compléter » tant que la photo n'est pas jointe.`, ficheC(c.id));
  return adv;
}

export async function attachAdvancePhoto(me: User, advanceId: Id, photo: string) {
  await requirePerm(me, "remises", "u");
  await ds().repos.advances.update(advanceId, { photo, status: "validee" });
  await audit(me, "Photo de remise jointe", "advances", advanceId, "Versement validé", { before: { status: "a_completer" }, after: { status: "validee" } });
}

// ——— Révision de prix (US-04, US-19) : en ligne seulement, horodatée, chaînée et signée ———
export interface RevisionInput {
  newPrice: number;
  option: "A" | "B";
  reason: string;
  effectiveAt?: string;
}
export async function reviseRemainderPrice(me: User, contractId: Id, i: RevisionInput) {
  requireOnline("Une révision de prix");
  posInt(i.newPrice, "Le nouveau prix");
  assert(i.reason.trim().length > 2, "Le motif est obligatoire.");
  const c = await ds().repos.contracts.get(contractId);
  assert(c && c.status === "actif", "Le contrat doit être actif.");
  const snap = await db();
  const old = currentPrice(snap, c);
  assert(i.newPrice !== old, "Le nouveau prix est identique au prix en vigueur.");
  if (me.role !== "patron") {
    await requirePerm(me, "revisions", "c");
    await queuePending(me, {
      entity: "revisions", entityId: contractId, kind: "modification_sensible",
      label: `Révision de prix ${c.ref} : ${prixKg(old)} → ${prixKg(i.newPrice)} (option ${i.option})`,
      payload: { type: "revision", ...i }, reason: i.reason,
    });
    return { queued: true as const };
  }
  return { queued: false as const, ...(await applyRevision(me, c, i)) };
}

async function applyRevision(me: User, c: Contract, i: RevisionInput) {
  const snap = await db();
  const m = metrics(snap, c);
  const sim = simulateRevision(m.S, m.P, i.newPrice);
  const at = now();
  const prev = snap.revisions.filter((r) => r.contractId === c.id && !r.deleted).sort((a, b) => a.at.localeCompare(b.at)).slice(-1)[0];
  const base = {
    id: uid("rv"), contractId: c.id, oldPrice: m.P, newPrice: i.newPrice, scope: "reliquat" as const, option: i.option,
    complement: i.option === "B" ? sim.complement : 0, remainderBeforeKg: sim.before,
    remainderAfterKg: i.option === "A" ? sim.optionA : sim.optionB, reason: i.reason, effectiveAt: i.effectiveAt || at, by: me.id, at,
    prevHash: prev?.hash ?? GENESIS,
  };
  const rev = { ...base, ...(await sealRevision(base)) };
  await ds().repos.revisions.create(rev);
  if (i.option === "B" && sim.complement > 0) {
    const receiptNo = await nextRef("RC", snap.advances.map((a) => a.receiptNo));
    const draft: Advance = { id: uid("av"), contractId: c.id, kind: "complement", amount: sim.complement, qtyKg: sim.before, unitPrice: i.newPrice - m.P, date: at, mode: "especes", status: "a_completer", receiptNo, receiptHash: "", receiptSignature: "", by: me.id, at };
    await ds().repos.advances.create({ ...draft, ...(await sealReceipt(snap, draft)) });
  }
  const msg = `Prix du reliquat révisé de ${prixKg(m.P)} à ${prixKg(i.newPrice)} (effet le ${fdate(rev.effectiveAt)}). Reste à livrer : ${tonnes(rev.remainderAfterKg)} au lieu de ${tonnes(sim.before)}${i.option === "B" ? ` · complément de ${fcfa(sim.complement)} à verser` : ` · solde inchangé : ${fcfa(m.S)}`}.`;
  await audit(me, "Révision de prix (reliquat)", "price_revisions", rev.id, `${c.ref} · ${msg} · signature Ed25519 ${rev.signature.slice(0, 16)}…`, { before: { price: m.P, remainderKg: sim.before }, after: { price: i.newPrice, remainderKg: rev.remainderAfterKg } });
  await notify(me, c.supplierId, `Révision de prix · ${c.ref}`, `${msg} Merci d'en accuser lecture.`, ficheC(c.id));
  await notify(me, "gestionnaire", `Révision de prix · ${c.ref}`, msg, ficheC(c.id));
  return { revision: rev, sim };
}

/** Accusé de lecture d'une révision par le fournisseur (§3.1). */
export async function ackRevision(me: User, revisionId: Id) {
  const r = await ds().repos.revisions.get(revisionId);
  assert(r && !r.ackAt, "Révision introuvable ou déjà lue.");
  const c = (await ds().repos.contracts.get(r.contractId))!;
  assert(me.role === "fournisseur" && c.supplierId === me.id, "Seul le fournisseur du contrat accuse lecture.");
  await ds().repos.revisions.update(revisionId, { ackAt: now() });
  await audit(me, "Accusé de lecture de révision", "price_revisions", revisionId, `${c.ref} · ${prixKg(r.newPrice)}`);
  await notify(me, "patron", "Révision lue par le fournisseur", `${me.name} a pris connaissance du prix ${prixKg(r.newPrice)} sur ${c.ref}.`, ficheC(c.id));
}

// ——— Livraison partielle (US-18) ———
export async function declarePartial(me: User, contractId: Id, i: { foundKg: number; reason: string; proof?: string }) {
  await requirePerm(me, "partielles", "c");
  const c = await ds().repos.contracts.get(contractId);
  assert(c, "Contrat introuvable.");
  await requireOwn(me, "partielles", c.supplierId === me.id);
  posInt(i.foundKg, "La quantité trouvée");
  assert(i.foundKg < c.qtyKg, "La quantité trouvée doit être inférieure à la quantité contractée.");
  assert(i.reason.trim().length > 2, "Le motif est obligatoire.");
  assert(i.proof, "Joignez une preuve (photo, ticket ou document).");
  const remainderKg = c.qtyKg - i.foundKg;
  const p = { id: uid("lp"), contractId, contractedKg: c.qtyKg, foundKg: i.foundKg, remainderKg, reason: i.reason, proof: i.proof, by: me.id, at: now(), seenByPatron: false };
  const geo = await journalGeo(me);
  await ds().repos.partials.create(p);
  await audit(me, "Livraison partielle déclarée", "partial_deliveries", p.id, `${c.ref} · ${tonnes(i.foundKg)} sur ${tonnes(c.qtyKg)} · reliquat ${tonnes(remainderKg)}`, { after: p, geo });
  await notify(me, "patron", "Livraison partielle", `${c.ref} : ${tonnes(i.foundKg, " ")} sur ${tonnes(c.qtyKg, " ")} — reliquat ${tonnes(remainderKg, " ")}. Motif : ${i.reason}`, ficheC(c.id));
  return p;
}
export async function markPartialSeen(me: User, id: Id) {
  if (me.role !== "patron") return;
  await ds().repos.partials.update(id, { seenByPatron: true });
}

// ——— Traces chaînées (SHA-256) ———
async function addTraceEventRaw(me: User, transportId: Id, e: Omit<TraceEvent, "id" | "transportId" | "order" | "hash" | "prevHash" | "by">) {
  const all = (await ds().repos.traces.list()).filter((x) => x.transportId === transportId).sort((a, b) => a.order - b.order);
  const prevHash = all[all.length - 1]?.hash ?? GENESIS;
  const base = { id: uid("ev"), transportId, order: all.length + 1, ...e, by: me.id };
  const ev: TraceEvent = { ...base, prevHash, hash: await traceHash(prevHash, base) };
  await ds().repos.traces.create(ev);
  return ev;
}

export const TRACE_LABEL: Record<TraceType, string> = {
  achat: "Achat", chargement: "Chargement", etape: "Passage d'étape", livraison_lieu_prevu: "Livraison au lieu prévu",
  arrivee_declaree: "Arrivée déclarée par le chauffeur", pointage_lome: "Pointage à Lomé", pesee: "Pesée", reception: "Réception",
};

async function myDriverIds(me: User) {
  return (await ds().repos.drivers.list()).filter((d) => d.userId === me.id).map((d) => d.id);
}
/** Portée « ses propres données » pour un transport. */
async function isMyTransport(me: User, t: Transport) {
  if (me.role === "fournisseur") return (await ds().repos.contracts.get(t.contractId))?.supplierId === me.id;
  if (me.role === "chauffeur") return (await myDriverIds(me)).includes(t.driverId ?? "");
  return true;
}

// ——— Transports (US-16) ———
export async function createTransport(me: User, i: { contractId: Id; origin: string; saveOrigin: boolean; tonsKg: number; vehicle: string; driver: string; driverId?: Id; driverPhone?: string; carrier: string; loadingDate: string; departureDate: string; pickupId?: Id }) {
  await requirePerm(me, "transports", "c");
  const c = await ds().repos.contracts.get(i.contractId);
  assert(c && c.status === "actif", "Choisissez un contrat actif.");
  assert(i.origin.trim(), "L'origine est obligatoire (saisie libre ou table des lieux).");
  posInt(i.tonsKg, "Le tonnage chargé");
  const plate = i.vehicle.trim().toUpperCase();
  assert(PLATE.test(plate), "Matricule invalide (format attendu : TG-1234-AB).");
  assert(i.driver.trim(), "Le chauffeur est obligatoire.");
  const geo = await journalGeo(me);
  return offlineCapable(me, `Transport ${plate} · ${tonnes(i.tonsKg, " ")}`, async () => {
    if (i.saveOrigin) await ensureLocation(me, i.origin, "origine");
    const vehicles = await ds().repos.vehicles.list();
    if (!vehicles.some((v) => v.plate.replace(/-/g, "") === plate.replace(/-/g, "")))
      await ds().repos.vehicles.create({ id: uid("vh"), plate, type: "Camion", capacityKg: i.tonsKg, owner: i.carrier.trim() || "—", active: true });
    const drivers = await ds().repos.drivers.list();
    let driverId = i.driverId ?? drivers.find((d) => d.name.toLowerCase() === i.driver.trim().toLowerCase())?.id;
    if (!driverId) {
      driverId = uid("dr");
      await ds().repos.drivers.create({ id: driverId, name: i.driver.trim(), phone: i.driverPhone?.trim() ?? "", active: true });
    }
    const ref = await nextRef("TR", (await ds().repos.transports.list()).map((t) => t.ref));
    const t: Transport = { id: uid("tr"), ref, contractId: c.id, pickupId: i.pickupId, driverId, product: c.product, origin: i.origin.trim(), tonsKg: i.tonsKg, vehicle: plate, driver: i.driver.trim(), driverPhone: i.driverPhone, carrier: i.carrier.trim() || "—", loadingDate: i.loadingDate, departureDate: i.departureDate, status: "en_route", createdBy: me.id, createdAt: now() };
    await ds().repos.transports.create(t);
    await addTraceEventRaw(me, t.id, { type: "chargement", place: t.origin, at: i.loadingDate, qtyKg: i.tonsKg, receiver: t.driver, receiverRole: "Chauffeur", vehicle: t.vehicle, driver: t.driver, carrier: t.carrier });
    await audit(me, "Création de transport", "transports", t.id, `${ref} · ${tonnes(i.tonsKg)} · ${t.vehicle} · ${t.driver} · depuis ${t.origin}`, { after: { ref, tonsKg: t.tonsKg, vehicle: t.vehicle, driver: t.driver }, geo });
    await notify(me, c.supplierId, "Transport créé", `${ref} : ${tonnes(i.tonsKg)} chargées à ${t.origin} (${t.vehicle}).`, ficheT(t.id));
    if (me.role !== "patron") await notify(me, "patron", "Nouveau transport", `${me.name} a créé ${ref} : ${tonnes(i.tonsKg)} depuis ${t.origin}.`, ficheT(t.id));
    const du = drivers.find((d) => d.id === driverId)?.userId;
    if (du && du !== me.id) await notify(me, du, "Nouveau trajet", `${ref} · ${t.vehicle} · ${tonnes(i.tonsKg)} depuis ${t.origin}.`, "/trajets/");
    return t;
  });
}

export async function addTraceEvent(me: User, transportId: Id, e: { type: TraceType; place: string; at: string; qtyKg: number; receiver: string; receiverRole: string; comment?: string; photo?: string; saveLocation?: boolean }) {
  await requirePerm(me, "traces", "c");
  const t = await ds().repos.transports.get(transportId);
  assert(t && t.status === "en_route", "Ce transport n'est plus en route.");
  await requireOwn(me, "traces", await isMyTransport(me, t));
  assert(e.place.trim(), "Le lieu est obligatoire.");
  posInt(e.qtyKg, "La quantité");
  assert(e.receiver.trim(), "Le réceptionnaire est obligatoire.");
  const geo = await journalGeo(me);
  return offlineCapable(me, `${TRACE_LABEL[e.type]} · ${t.ref} · ${e.place}`, async () => {
    if (e.saveLocation) await ensureLocation(me, e.place, "etape");
    const { saveLocation, ...data } = e;
    void saveLocation;
    const ev = await addTraceEventRaw(me, transportId, { ...data, vehicle: t.vehicle, driver: t.driver });
    const c = (await ds().repos.contracts.get(t.contractId))!;
    const s = await settings();
    const gap = t.tonsKg > 0 && Math.abs(e.qtyKg - t.tonsKg) / t.tonsKg > s.weightGapThresholdPct / 100;
    await audit(me, `Trace : ${TRACE_LABEL[e.type]}`, "lot_trace_events", ev.id, `${t.ref} · ${e.place} · ${tonnes(e.qtyKg)} · réceptionnaire ${e.receiver}`, { after: { place: e.place, qtyKg: e.qtyKg, receiver: e.receiver }, geo });
    const body = `${t.ref} · ${e.place} : ${tonnes(e.qtyKg)} — réceptionnaire ${e.receiver}.${gap ? ` Écart de ${tonnes(e.qtyKg - t.tonsKg)} par rapport au chargement.` : ""}`;
    await notify(me, me.role === "patron" ? c.supplierId : "patron", `${TRACE_LABEL[e.type]} enregistré`, body, ficheT(t.id));
    if (me.role === "patron") await notify(me, "gestionnaire", `${TRACE_LABEL[e.type]} enregistré`, body, ficheT(t.id));
    return { ev, gap };
  });
}

// ——— Ordres d'enlèvement (§2.4, US-06) ———
export async function createPickup(me: User, i: { vehicle: string; driverId: Id; carrier: string; plannedDate: string; stops: { contractId: Id; plannedKg: number }[]; route: string[] }) {
  await requirePerm(me, "transports", "c");
  const plate = i.vehicle.trim().toUpperCase();
  assert(PLATE.test(plate), "Choisissez un véhicule (matricule TG-1234-AB).");
  const driver = await ds().repos.drivers.get(i.driverId);
  assert(driver, "Choisissez un chauffeur.");
  assert(i.stops.length > 0, "Ajoutez au moins un acheteur à visiter.");
  assert(i.plannedDate, "La date prévue est obligatoire.");
  const contracts = await ds().repos.contracts.list();
  const stops = i.stops.map((s) => {
    const c = contracts.find((x) => x.id === s.contractId);
    assert(c && c.status === "actif", "Chaque arrêt doit viser un contrat actif.");
    posInt(s.plannedKg, "La quantité prévue");
    return { id: uid("st"), supplierId: c.supplierId, contractId: c.id, plannedKg: s.plannedKg };
  });
  const route = i.route.map((p) => p.trim()).filter(Boolean).map((place, k) => ({ id: uid("rs"), order: k + 1, place }));
  for (const r of route) await ensureLocation(me, r.place, "etape");
  const ref = await nextRef("PK", (await ds().repos.pickups.list()).map((p) => p.ref));
  const p: Pickup = { id: uid("pk"), ref, vehicle: plate, driverId: driver.id, carrier: i.carrier.trim() || "—", plannedDate: i.plannedDate, stops, route, createdBy: me.id, createdAt: now() };
  await ds().repos.pickups.create(p);
  const total = stops.reduce((s, x) => s + x.plannedKg, 0);
  await audit(me, "Ordre d'enlèvement", "pickup_orders", p.id, `${ref} · ${plate} · ${driver.name} · ${stops.length} arrêt(s) · ${tonnes(total)}`, { after: { vehicle: plate, driver: driver.name, stops: stops.length, plannedKg: total } });
  if (driver.userId) await notify(me, driver.userId, "Nouvel ordre d'enlèvement", `${ref} · ${plate} le ${fdate(i.plannedDate)} : ${stops.length} arrêt(s), ${tonnes(total)} prévues.`, ficheP(p.id));
  for (const s of stops) await notify(me, s.supplierId, "Enlèvement programmé", `${ref} : le camion ${plate} (${driver.name}) passera le ${fdate(i.plannedDate)} charger ${tonnes(s.plannedKg)}.`, ficheP(p.id));
  if (me.role !== "patron") await notify(me, "patron", "Ordre d'enlèvement créé", `${me.name} : ${ref} · ${tonnes(total)}.`, ficheP(p.id));
  return p;
}

async function myPickup(me: User, pickupId: Id) {
  const p = await ds().repos.pickups.get(pickupId);
  assert(p && !p.deleted, "Ordre d'enlèvement introuvable.");
  if (me.role === "chauffeur") assert((await myDriverIds(me)).includes(p.driverId), "Cet ordre d'enlèvement ne vous est pas attribué.");
  else assert(["patron", "admin", "gestionnaire"].includes(me.role), "Action réservée au chauffeur de l'ordre et aux gestionnaires.");
  return p;
}

/** Le chauffeur confirme le chargement chez un acheteur : quantité, sacs, photo. Crée le lot suivi jusqu'à Lomé. */
export async function confirmLoading(me: User, pickupId: Id, stopId: Id, i: { loadedKg: number; bags: number; photo?: string; at?: string }) {
  const p = await myPickup(me, pickupId);
  const stop = p.stops.find((s) => s.id === stopId);
  assert(stop && !stop.confirmedAt, "Chargement déjà confirmé.");
  posInt(i.loadedKg, "La quantité chargée");
  posInt(i.bags, "Le nombre de sacs");
  const driver = (await ds().repos.drivers.get(p.driverId))!;
  const sup = (await ds().repos.users.get(stop.supplierId))!;
  const c = (await ds().repos.contracts.get(stop.contractId))!;
  const at = i.at ?? now();
  const geo = await journalGeo(me);
  return offlineCapable(me, `Chargement ${p.ref} chez ${sup.name} · ${tonnes(i.loadedKg, " ")}`, async () => {
    const ref = await nextRef("TR", (await ds().repos.transports.list()).map((t) => t.ref));
    const t: Transport = { id: uid("tr"), ref, contractId: c.id, pickupId: p.id, driverId: driver.id, product: c.product, origin: sup.zone ?? c.deliveryPlace, tonsKg: i.loadedKg, vehicle: p.vehicle, driver: driver.name, driverPhone: driver.phone, carrier: p.carrier, loadingDate: at, departureDate: at, status: "en_route", createdBy: me.id, createdAt: now() };
    await ds().repos.transports.create(t);
    await addTraceEventRaw(me, t.id, { type: "chargement", place: t.origin, at, qtyKg: i.loadedKg, receiver: driver.name, receiverRole: "Chauffeur", vehicle: p.vehicle, driver: driver.name, carrier: p.carrier, photo: i.photo, comment: `${i.bags} sacs · ${p.ref}` });
    const stops = p.stops.map((s) => (s.id === stopId ? { ...s, loadedKg: i.loadedKg, bags: i.bags, photo: i.photo, confirmedAt: at, confirmedBy: me.id, transportId: t.id } : s));
    await ds().repos.pickups.update(p.id, { stops });
    const gap = i.loadedKg - stop.plannedKg;
    await audit(me, "Chargement confirmé", "pickup_orders", p.id, `${p.ref} · ${sup.name} · ${tonnes(i.loadedKg)} · ${i.bags} sacs → lot ${ref}`, { before: { plannedKg: stop.plannedKg }, after: { loadedKg: i.loadedKg, bags: i.bags }, geo });
    const body = `${p.ref} · ${p.vehicle} : ${tonnes(i.loadedKg)} (${i.bags} sacs) chargées chez ${sup.name}${gap ? `, prévu ${tonnes(stop.plannedKg)}` : ""}. Lot ${ref}.`;
    await notify(me, "patron", "Chargement confirmé", body, ficheP(p.id));
    await notify(me, sup.id, "Chargement confirmé", body, ficheT(t.id));
    await notify(me, "magasinier", "Camion chargé", `${p.vehicle} · ${tonnes(i.loadedKg)} de ${c.product} attendues à Lomé.`, "/reception/");
    return t;
  });
}

/** Passage d'une étape du trajet (hors ligne possible) : trace ajoutée à chaque lot du véhicule. */
export async function passStage(me: User, pickupId: Id, stageId: Id, i: { at?: string; comment?: string; photo?: string }) {
  const p = await myPickup(me, pickupId);
  const st = p.route.find((r) => r.id === stageId);
  assert(st && !st.passedAt, "Étape déjà confirmée.");
  const lots = (await ds().repos.transports.list()).filter((t) => t.pickupId === p.id && t.status === "en_route" && !t.deleted);
  assert(lots.length, "Confirmez d'abord au moins un chargement.");
  const at = i.at ?? now();
  const geo = await journalGeo(me);
  return offlineCapable(me, `Étape ${st.place} · ${p.ref}`, async () => {
    for (const t of lots)
      await addTraceEventRaw(me, t.id, { type: "etape", place: st.place, at, qtyKg: t.tonsKg, receiver: t.driver, receiverRole: "Chauffeur", vehicle: p.vehicle, driver: t.driver, comment: i.comment, photo: i.photo });
    await ds().repos.pickups.update(p.id, { route: p.route.map((r) => (r.id === stageId ? { ...r, passedAt: at, comment: i.comment, photo: i.photo, by: me.id } : r)) });
    await audit(me, "Passage d'étape", "pickup_orders", p.id, `${p.ref} · ${st.place}`, { after: { place: st.place, at }, geo });
    await notify(me, "patron", `Étape ${st.place}`, `${p.ref} · ${p.vehicle} a passé ${st.place}.`, ficheP(p.id));
    for (const cid of new Set(lots.map((t) => t.contractId))) {
      const c = (await ds().repos.contracts.get(cid))!;
      await notify(me, c.supplierId, `Étape ${st.place}`, `Votre lot (${p.vehicle}) a passé ${st.place}.`, ficheP(p.id));
    }
  });
}

/** Déclaration d'arrivée à Lomé par le chauffeur, avec photo : le magasinier fait ensuite le pointage officiel. */
export async function declareArrival(me: User, pickupId: Id, i: { photo?: string; comment?: string }) {
  const p = await myPickup(me, pickupId);
  assert(!p.arrivalDeclaredAt, "Arrivée déjà déclarée.");
  const lots = (await ds().repos.transports.list()).filter((t) => t.pickupId === p.id && t.status === "en_route" && !t.deleted);
  assert(lots.length, "Aucun lot en route sur cet ordre.");
  assert(i.photo, "Prenez une photo du camion à l'arrivée (preuve du pointage chauffeur).");
  const at = now();
  const geo = await journalGeo(me);
  return offlineCapable(me, `Arrivée à Lomé · ${p.ref}`, async () => {
    for (const t of lots)
      await addTraceEventRaw(me, t.id, { type: "arrivee_declaree", place: "Lomé · magasin central", at, qtyKg: t.tonsKg, receiver: t.driver, receiverRole: "Chauffeur", vehicle: p.vehicle, driver: t.driver, photo: i.photo, comment: i.comment });
    await ds().repos.pickups.update(p.id, { arrivalDeclaredAt: at, arrivalPhoto: i.photo });
    await audit(me, "Arrivée déclarée", "pickup_orders", p.id, `${p.ref} · ${p.vehicle} · ${lots.length} lot(s)`, { after: { arrivalDeclaredAt: at }, geo });
    const body = `${p.vehicle} (${p.ref}) est arrivé au magasin : ${tonnes(lots.reduce((s, t) => s + t.tonsKg, 0))} à pointer et peser.`;
    await notify(me, "magasinier", "Camion arrivé à Lomé", body, "/reception/");
    await notify(me, "patron", "Camion arrivé à Lomé", body, ficheP(p.id));
  });
}

// ——— Pointage à Lomé et coûts (US-17) ———
export async function checkinLome(me: User, transportId: Id, i: { plateSeen: string; driver: string; at: string; tonsAnnouncedKg: number; cost: number; beneficiary: string; photo?: string }) {
  await requirePerm(me, "pointages", "c");
  const t = await ds().repos.transports.get(transportId);
  assert(t && t.status === "en_route", "Ce transport a déjà été pointé.");
  posInt(i.tonsAnnouncedKg, "Le tonnage annoncé");
  assert(Number.isInteger(i.cost) && i.cost >= 0, "Le coût de transport doit être un entier positif ou nul.");
  const c = (await ds().repos.contracts.get(t.contractId))!;
  const plateSeen = i.plateSeen.trim().toUpperCase();
  const mismatch = plateSeen.replace(/-/g, "") !== t.vehicle.replace(/-/g, "");
  const debitedOn = c.transportPaidByPatron ? ("charges_patron" as const) : ("solde_fournisseur" as const);
  return offlineCapable(me, `Pointage ${t.ref} · ${plateSeen}`, async () => {
    const ck = { id: uid("pt"), transportId, plateSeen, plateMismatch: mismatch, driver: i.driver, at: i.at, by: me.id, tonsAnnouncedKg: i.tonsAnnouncedKg, cost: i.cost, costBeneficiary: i.beneficiary, debitedOn, photo: i.photo };
    await ds().repos.checkins.create(ck);
    if (i.cost > 0)
      await ds().repos.expenses.create({ id: uid("ch"), category: "transport", label: `Transport ${t.ref}`, amount: i.cost, date: i.at, beneficiary: i.beneficiary, transportId, contractId: c.id, vehicle: t.vehicle, debitedOn, by: me.id });
    await addTraceEventRaw(me, transportId, { type: "pointage_lome", place: "Lomé · magasin central", at: i.at, qtyKg: i.tonsAnnouncedKg, receiver: me.name, receiverRole: roleTitle(me), vehicle: plateSeen, driver: i.driver, photo: i.photo, comment: mismatch ? `Matricule constaté ${plateSeen} ≠ ${t.vehicle}` : undefined });
    await ds().repos.transports.update(transportId, { status: "arrive", arrivalDate: i.at });
    const where = debitedOn === "charges_patron" ? "dans les charges du patron" : "sur le solde du fournisseur";
    await audit(me, "Pointage à Lomé", "arrival_checkins", ck.id, `${t.ref} · ${plateSeen} · ${i.driver} · coût ${fcfa(i.cost)} débité ${where}`, { before: { status: "en_route" }, after: { status: "arrive", cost: i.cost, debitedOn } });
    await notify(me, "patron", "Véhicule pointé à Lomé", `${t.ref} · ${plateSeen} · ${i.driver} — ${tonnes(i.tonsAnnouncedKg)} annoncées. Coût de transport ${fcfa(i.cost)} débité ${where}.`, ficheT(t.id));
    if (mismatch) await notify(me, "patron", "Écart de matricule", `${t.ref} : matricule constaté ${plateSeen}, attendu ${t.vehicle}.`, ficheT(t.id));
    if (debitedOn === "solde_fournisseur" && i.cost > 0) await notify(me, c.supplierId, "Coût de transport imputé", `${fcfa(i.cost)} imputés sur votre solde (${c.ref}).`, ficheC(c.id));
    return { ck, mismatch, debitedOn };
  });
}

// ——— Pesée puis réception (US-07) ———
export interface WeighInput {
  grossKg: number;
  tareKg: number;
  bags: number;
  ticketNo: string;
  humidity?: number;
  ticketPhoto?: string;
}
/** Pesée au magasin : statut « pesée », possible hors ligne. Le prix n'est figé qu'à la réception. */
export async function weigh(me: User, transportId: Id, i: WeighInput) {
  await requirePerm(me, "pesees", "c");
  const t = await ds().repos.transports.get(transportId);
  assert(t && t.status === "arrive", "Le véhicule doit d'abord être pointé à Lomé.");
  assert(Number.isInteger(i.grossKg) && Number.isInteger(i.tareKg) && i.tareKg >= 0, "Poids brut et tare : entiers en kg.");
  const netKg = i.grossKg - i.tareKg;
  assert(netKg > 0, "Le poids net (brut − tare) doit être positif.");
  posInt(i.bags, "Le nombre de sacs");
  assert(i.ticketNo.trim(), "Le numéro du ticket de pesée est obligatoire.");
  if (i.humidity !== undefined) assert(i.humidity >= 0 && i.humidity <= 100, "Humidité entre 0 et 100 %.");
  const existing = (await ds().repos.deliveries.list()).find((d) => d.transportId === transportId && !d.deleted);
  assert(!existing, "Ce lot a déjà été pesé.");
  const c = (await ds().repos.contracts.get(t.contractId))!;
  const s = await settings();
  return offlineCapable(me, `Pesée ${t.ref} · ${tonnes(netKg, " ")}`, async () => {
    const d = { id: uid("lv"), contractId: c.id, transportId, grossKg: i.grossKg, tareKg: i.tareKg, netKg, bags: i.bags, ticketNo: i.ticketNo.trim(), ticketPhoto: i.ticketPhoto, humidity: i.humidity, status: "pesee" as const, weighedAt: now(), weighedBy: me.id, price: 0, value: 0 };
    await ds().repos.deliveries.create(d);
    await addTraceEventRaw(me, transportId, { type: "pesee", place: "Lomé · magasin central", at: d.weighedAt, qtyKg: netKg, receiver: me.name, receiverRole: roleTitle(me), photo: i.ticketPhoto, comment: `Ticket ${d.ticketNo} · ${i.bags} sacs · brut ${i.grossKg} kg, tare ${i.tareKg} kg${i.humidity !== undefined ? ` · humidité ${i.humidity} %` : ""}` });
    await audit(me, "Pesée", "deliveries", d.id, `${t.ref} · net ${netKg} kg (brut ${i.grossKg} − tare ${i.tareKg}) · ${i.bags} sacs`, { after: { grossKg: i.grossKg, tareKg: i.tareKg, netKg, bags: i.bags } });
    const gapKg = netKg - t.tonsKg;
    const gap = Math.abs(gapKg) / t.tonsKg > s.weightGapThresholdPct / 100;
    if (gap) for (const to of ["patron", "magasinier"] as const) await notify(me, to, "Écart de pesée", `${t.ref} : ${tonnes(netKg)} pesées pour ${tonnes(t.tonsKg)} chargées (écart ${tonnes(gapKg)}).`, ficheT(t.id));
    if (!["patron", "gestionnaire", "admin"].includes(me.role)) await notify(me, "patron", "Lot pesé", `${t.ref} : ${tonnes(netKg)} nettes (ticket ${d.ticketNo}).`, ficheT(t.id));
    return { delivery: d, gap, gapKg };
  });
}

/** Réception : fige le prix en vigueur, met à jour V, S et Q. En ligne seulement (validation serveur). */
export async function receiveDelivery(me: User, deliveryId: Id) {
  await requirePerm(me, "pesees", "u");
  requireOnline("La réception d'une livraison (prix figé par le serveur)");
  const d = await ds().repos.deliveries.get(deliveryId);
  assert(d && d.status === "pesee", "Livraison introuvable ou déjà réceptionnée.");
  const c = (await ds().repos.contracts.get(d.contractId))!;
  const snap = await db();
  const price = currentPrice(snap, c);
  const before = metrics(snap, c);
  const at = now();
  await ds().repos.deliveries.update(d.id, { status: "receptionnee", price, value: d.netKg * price, receivedAt: at, receivedBy: me.id });
  if (d.transportId) {
    await addTraceEventRaw(me, d.transportId, { type: "reception", place: "Lomé · magasin central", at, qtyKg: d.netKg, receiver: me.name, receiverRole: roleTitle(me), comment: `Prix figé : ${prixKg(price, " ")}` });
    await ds().repos.transports.update(d.transportId, { status: "receptionne" });
  }
  const after = metrics(await db(), c);
  const t = d.transportId ? await ds().repos.transports.get(d.transportId) : undefined;
  await audit(me, "Réception de livraison", "deliveries", d.id, `${t?.ref ?? d.ticketNo} · ${d.netKg} kg × ${price} = ${fcfa(d.netKg * price)} · reste à livrer ${before.Q} → ${after.Q} kg`, { before: { status: "pesee", S: before.S, Q: before.Q }, after: { status: "receptionnee", price, S: after.S, Q: after.Q } });
  const msg = `${t?.ref ?? d.ticketNo} réceptionné : ${tonnes(d.netKg)} valorisées ${fcfa(d.netKg * price)} (${prixKg(price)}). Reste à livrer : ${tonnes(after.Q)}.`;
  await notify(me, c.supplierId, "Livraison réceptionnée", msg, ficheC(c.id));
  if (me.role !== "patron") await notify(me, "patron", "Livraison réceptionnée", msg, ficheC(c.id));
  if (d.weighedBy !== me.id) await notify(me, d.weighedBy, "Livraison réceptionnée", msg, t ? ficheT(t.id) : undefined);
  return { before, after, price };
}

/** Pesée puis réception immédiate quand c'est possible (en ligne, droit de modifier les pesées). */
export async function weighAndReceive(me: User, transportId: Id, i: WeighInput) {
  const w = await weigh(me, transportId, i);
  if (!isOnline() || !can(await perms(), me, "pesees", "u")) return { ...w, received: false as const };
  const r = await receiveDelivery(me, w.delivery.id);
  return { ...w, ...r, received: true as const };
}

/** Le fournisseur conteste une pesée (litige) : le patron est alerté ; la livraison reste comptée. */
export async function disputeDelivery(me: User, deliveryId: Id, reason: string) {
  const d = await ds().repos.deliveries.get(deliveryId);
  assert(d && d.status === "receptionnee", "Seule une livraison réceptionnée peut être contestée.");
  const c = (await ds().repos.contracts.get(d.contractId))!;
  assert(me.role === "patron" || c.supplierId === me.id, "Seul le fournisseur du contrat peut contester.");
  assert(reason.trim().length > 2, "Le motif est obligatoire.");
  await ds().repos.deliveries.update(d.id, { status: "contestee", disputeReason: reason });
  await audit(me, "Pesée contestée", "deliveries", d.id, `${d.ticketNo} · ${reason}`, { before: { status: d.status }, after: { status: "contestee", reason } });
  await notify(me, "patron", "Pesée contestée", `${me.name} conteste le ticket ${d.ticketNo} : ${reason}`, ficheC(c.id));
  await notify(me, "magasinier", "Pesée contestée", `Ticket ${d.ticketNo} : ${reason}`, ficheC(c.id));
}

// ——— Déclarations de stock (US-05) — hors ligne, idempotentes ———
export async function declarePurchase(me: User, i: { contractId: Id; date: string; place: string; producer?: string; qtyKg: number; pricePaid: number; mode: PaymentMode; photo?: string; clientUuid?: string }) {
  await requirePerm(me, "declarations", "c");
  const c = await ds().repos.contracts.get(i.contractId);
  assert(c && c.supplierId === me.id, "Choisissez un de vos contrats.");
  posInt(i.qtyKg, "La quantité");
  posInt(i.pricePaid, "Le prix payé");
  assert(i.place.trim(), "Le lieu ou village est obligatoire.");
  const geo = await journalGeo(me);
  return offlineCapable(me, `Déclaration · ${tonnes(i.qtyKg, " ")} à ${i.place}`, async (generated) => {
    const clientUuid = i.clientUuid ?? generated;
    const dup = (await ds().repos.declarations.list()).find((d) => d.clientUuid === clientUuid);
    if (dup) return dup; // clé d'idempotence : jamais de doublon
    const dc = { id: uid("dc"), supplierId: me.id, ...i, clientUuid, createdAt: now() };
    await ds().repos.declarations.create(dc);
    await audit(me, "Déclaration d'achat", "purchase_declarations", dc.id, `${tonnes(i.qtyKg)} à ${i.place} · ${prixKg(i.pricePaid)}`, { after: { qtyKg: i.qtyKg, place: i.place, pricePaid: i.pricePaid }, geo });
    await notify(me, "patron", "Stock déclaré", `${me.name} déclare ${tonnes(i.qtyKg)} achetées à ${i.place} (${c.ref}). Stock prêt à enlever.`, "/stocks/");
    const s = await settings();
    if (i.qtyKg >= s.stockAlertKg) await notify(me, "admin", "Stock prêt à enlever", `${me.name} : ${tonnes(i.qtyKg)} déclarées (seuil ${tonnes(s.stockAlertKg)}).`, "/stocks/");
    return dc;
  });
}

// ——— Paiements, dettes (§1.10, §1.11, US-09) ———
export async function recordRepayment(me: User, contractId: Id, i: { amount?: number; qtyKg?: number; kind?: "remboursement" | "marchandise"; mode: PaymentMode; reference?: string; photo?: string; debtId?: Id }) {
  await requirePerm(me, "dettes", "c");
  const c = (await ds().repos.contracts.get(contractId))!;
  const snap = await db();
  let amount = i.amount ?? 0;
  if (i.kind === "marchandise") {
    posInt(i.qtyKg ?? 0, "La quantité livrée");
    amount = (i.qtyKg ?? 0) * currentPrice(snap, c); // valorisée au prix en vigueur à la date de livraison
  }
  posInt(amount, "Le montant");
  const pm = { id: uid("pm"), direction: "fournisseur_vers_patron" as const, kind: i.kind ?? ("remboursement" as const), contractId, debtId: i.debtId, amount, qtyKg: i.qtyKg, mode: i.mode, reference: i.reference, photo: i.photo, date: now(), by: me.id };
  await ds().repos.payments.create(pm);
  if (i.debtId) {
    const d = snap.debts.find((x) => x.id === i.debtId)!;
    const paid = debtPaid(snap, d.id) + amount;
    await ds().repos.debts.update(d.id, { status: paid >= d.initial ? "soldee" : d.status === "en_litige" ? "en_litige" : "en_remboursement" });
  }
  await audit(me, i.kind === "marchandise" ? "Remboursement en marchandise" : "Remboursement reçu", "repayments", pm.id, `${c.ref} · ${fcfa(amount)}`, { after: { amount, kind: pm.kind, qtyKg: i.qtyKg } });
  await notify(me, c.supplierId, "Remboursement enregistré", `${fcfa(amount)} reçus sur ${c.ref}. Merci.`, ficheC(c.id));
  if (me.role !== "patron") await notify(me, "patron", "Remboursement enregistré", `${me.name} : ${fcfa(amount)} sur ${c.ref}.`, "/finances/");
  return pm;
}

export type CloseChoice =
  | { mode: "solde" }
  | { mode: "dette"; dueDate: string }
  | { mode: "rembourse"; payMode: PaymentMode; reference?: string }
  | { mode: "reporte"; targetContractId: Id }
  | { mode: "trop_livre_regle"; payMode: PaymentMode; reference?: string };

/** Clôture (US-09) : soldé, ou S > 0 → remboursement / report / dette, ou S < 0 → règlement / report du trop-livré. */
export async function closeContract(me: User, contractId: Id, choice: CloseChoice) {
  assert(me.role === "patron", "Seul le patron clôture un contrat.");
  requireOnline("La clôture d'un contrat");
  const c = (await ds().repos.contracts.get(contractId))!;
  assert(c.status === "actif" || c.status === "suspendu", "Ce contrat est déjà clos.");
  const m = metrics(await db(), c);
  const sup = (await ds().repos.users.get(c.supplierId))!;
  const done = async (closedAs: Contract["closedAs"], detail: string, extra: Partial<Contract> = {}) => {
    await ds().repos.contracts.update(contractId, { status: "clos", closedAs, ...extra });
    await audit(me, "Clôture de contrat", "contracts", contractId, `${c.ref} · ${detail}`, { before: { status: c.status, S: m.S }, after: { status: "clos", closedAs } });
    await notify(me, c.supplierId, "Contrat clos", `${c.ref} : ${detail}.`, ficheC(c.id));
    return closedAs;
  };
  if (m.S === 0) return done("solde", "clos — soldé");
  if (choice.mode === "reporte") {
    const target = await ds().repos.contracts.get(choice.targetContractId);
    assert(target && target.id !== c.id && target.supplierId === c.supplierId && target.status === "actif", "Choisissez un autre contrat actif du même fournisseur.");
    const at = now();
    await ds().repos.adjustments.create({ id: uid("aj"), contractId: c.id, amount: m.S, kind: "report_sortant", reason: `Solde reporté sur ${target.ref}`, by: me.id, at, linkedContractId: target.id });
    await ds().repos.adjustments.create({ id: uid("aj"), contractId: target.id, amount: -Math.abs(m.S), kind: "report_entrant", reason: `${m.S > 0 ? "Solde dû" : "Trop-livré (avance)"} reporté depuis ${c.ref}`, by: me.id, at, linkedContractId: c.id });
    await audit(me, "Transfert entre contrats", "adjustments", target.id, `${fcfa(Math.abs(m.S))} · ${c.ref} → ${target.ref}`, { before: { [c.ref]: m.S }, after: { [c.ref]: 0, [target.ref]: `+${Math.abs(m.S)}` } });
    return done("reporte", `solde de ${fcfa(m.S)} reporté sur ${target.ref}`, { carriedTo: target.id });
  }
  if (m.S > 0) {
    if (choice.mode === "rembourse") {
      await ds().repos.payments.create({ id: uid("pm"), direction: "fournisseur_vers_patron", kind: "remboursement", contractId, amount: m.S, mode: choice.payMode, reference: choice.reference, date: now(), by: me.id });
      return done("rembourse", `remboursé (${fcfa(m.S)})`);
    }
    assert(choice.mode === "dette" && choice.dueDate, "Choisissez : remboursement, report sur un autre contrat ou dette avec échéance.");
    const debt = { id: uid("dt"), contractId, supplierId: c.supplierId, initial: m.S, createdAt: now(), dueDate: choice.dueDate, status: "ouverte" as const };
    await ds().repos.debts.create(debt);
    await audit(me, "Passage en dette", "debts", debt.id, `${c.ref} · ${sup.name} · ${fcfa(m.S)} · échéance ${fdate(choice.dueDate)}`, { after: debt });
    await notify(me, c.supplierId, "Solde passé en dette", `${c.ref} : ${fcfa(m.S)} à rembourser avant le ${fdate(choice.dueDate)}.`, "/finances/");
    return done("dette", `solde de ${fcfa(m.S)} passé en dette`);
  }
  assert(choice.mode === "trop_livre_regle", "Trop-livré : réglez la différence au fournisseur ou reportez-la sur un autre contrat.");
  await ds().repos.payments.create({ id: uid("pm"), direction: "patron_vers_fournisseur", kind: "trop_livre", contractId, amount: -m.S, mode: choice.payMode, reference: choice.reference, date: now(), by: me.id });
  return done("solde", `trop-livré de ${fcfa(-m.S)} réglé au fournisseur`);
}

export async function setDebtStatus(me: User, debtId: Id, status: "en_litige" | "en_remboursement" | "ouverte", comment: string) {
  await requirePerm(me, "dettes", "u");
  assert(comment.trim().length > 2, "Un commentaire est obligatoire.");
  const d = (await ds().repos.debts.get(debtId))!;
  assert(!["soldee", "passee_en_perte"].includes(d.status), "Cette dette est close.");
  await ds().repos.debts.update(debtId, { status, comment });
  await audit(me, "Statut de dette", "debts", debtId, comment, { before: { status: d.status }, after: { status } });
}

/** Passage en perte : patron seul, motif, en ligne, signé (Ed25519) et journalisé. */
export async function writeOffDebt(me: User, debtId: Id, reason: string) {
  assert(me.role === "patron", "Seul le patron peut passer une dette en perte.");
  requireOnline("Le passage en perte");
  assert(reason.trim().length > 5, "Le motif est obligatoire.");
  const snap = await db();
  const d = snap.debts.find((x) => x.id === debtId);
  assert(d && !["soldee", "passee_en_perte"].includes(d.status), "Dette introuvable ou close.");
  const remaining = Math.max(0, d.initial - debtPaid(snap, d.id));
  const at = now();
  const writeOffSignature = await signWriteOff(d, reason, me.id, at);
  await ds().repos.debts.update(debtId, { status: "passee_en_perte", writeOffReason: reason, writeOffSignature });
  await ds().repos.adjustments.create({ id: uid("aj"), contractId: d.contractId, amount: remaining, kind: "perte_acceptee", reason, by: me.id, at });
  await audit(me, "Passage en perte", "debts", debtId, `${fcfa(remaining)} · ${reason} · signature ${writeOffSignature.slice(0, 16)}…`, { before: { status: d.status, remaining }, after: { status: "passee_en_perte" } });
  await notify(me, "comptable", "Dette passée en perte", `${fcfa(remaining)} · ${reason}`, "/finances/");
}

export async function addAdjustment(me: User, contractId: Id, i: { amount: number; reason: string }) {
  assert(me.role === "patron", "Seul le patron enregistre un ajustement du solde.");
  requireOnline("Un ajustement du solde");
  assert(Number.isInteger(i.amount) && i.amount !== 0, "Montant entier non nul (positif : réduit ce que doit le fournisseur).");
  assert(i.reason.trim().length > 5, "Le motif est obligatoire.");
  const c = (await ds().repos.contracts.get(contractId))!;
  const before = metrics(await db(), c);
  const a = { id: uid("aj"), contractId, amount: i.amount, kind: "correction" as const, reason: i.reason, by: me.id, at: now() };
  await ds().repos.adjustments.create(a);
  const after = metrics(await db(), c);
  await audit(me, "Ajustement du solde (J)", "adjustments", a.id, `${c.ref} · ${fcfa(i.amount)} · ${i.reason}`, { before: { S: before.S }, after: { S: after.S } });
  await notify(me, c.supplierId, "Ajustement de votre solde", `${c.ref} : ${fcfa(i.amount)} · ${i.reason}`, ficheC(c.id));
}

// ——— Charges et frais (§1.9) ———
export async function addExpense(me: User, i: { category: Exclude<ExpenseCategory, "transport">; label: string; amount: number; beneficiary: string; contractId?: Id; vehicle?: string; transportId?: Id; photo?: string }) {
  await requirePerm(me, "charges", "c");
  posInt(i.amount, "Le montant");
  assert(i.label.trim(), "Le libellé est obligatoire.");
  const driverDecl = me.role === "chauffeur";
  if (driverDecl) assert(i.category === "frais_vehicule", "Un chauffeur déclare des frais de véhicule.");
  return offlineCapable(me, `Frais · ${i.label} · ${fcfa(i.amount, " ")}`, async () => {
    const e: Expense = { id: uid("ch"), ...i, date: now(), debitedOn: "charges_patron", status: driverDecl ? "a_valider" : undefined, by: me.id };
    await ds().repos.expenses.create(e);
    await audit(me, driverDecl ? "Frais déclarés par le chauffeur" : "Charge enregistrée", "expenses", e.id, `${i.label} · ${fcfa(i.amount)}`, { after: { amount: i.amount, category: i.category, vehicle: i.vehicle } });
    if (driverDecl) await notify(me, "admin", "Frais de route à valider", `${me.name} : ${i.label} · ${fcfa(i.amount)}.`, "/charges/");
    if (me.role !== "patron") await notify(me, "patron", driverDecl ? "Frais de route à valider" : "Nouvelle charge", `${me.name} : ${i.label} · ${fcfa(i.amount)}.`, "/charges/");
    return e;
  });
}

export async function decideExpense(me: User, id: Id, approve: boolean, reason?: string) {
  assert(me.role === "patron" || me.role === "admin", "Seuls le patron et l'administrateur valident les frais déclarés.");
  const e = (await ds().repos.expenses.get(id))!;
  assert(e.status === "a_valider", "Ces frais ont déjà été traités.");
  if (!approve) assert(reason && reason.trim().length > 2, "Le motif du refus est obligatoire.");
  await ds().repos.expenses.update(id, { status: approve ? "validee" : "refusee" });
  await audit(me, approve ? "Frais validés" : "Frais refusés", "expenses", id, `${e.label} · ${fcfa(e.amount)}${reason ? ` · ${reason}` : ""}`, { before: { status: "a_valider" }, after: { status: approve ? "validee" : "refusee" } });
  await notify(me, e.by, approve ? "Frais validés" : "Frais refusés", `${e.label} · ${fcfa(e.amount)}${reason ? ` — ${reason}` : ""}`, "/frais/");
}

// ——— Commissions (§1.8, US-10) : calculée → validée → payée ———
export async function calculateCommission(me: User, contractId: Id) {
  await requirePerm(me, "commissions", "c");
  const snap = await db();
  const c = snap.contracts.find((x) => x.id === contractId)!;
  const due = commissionDue(snap, c);
  assert(due, "Aucune règle de commission n'est attachée à ce contrat.");
  assert(due.amount > 0, "Rien à commissionner depuis la dernière commission (aucune nouvelle livraison réceptionnée).");
  const cm = { id: uid("cm"), contractId, ruleId: due.rule.id, beneficiaryId: c.supplierId, baseKg: due.baseKg, baseValue: due.baseValue, amount: due.amount, status: "calculee" as const, calculatedAt: now(), calculatedBy: me.id };
  await ds().repos.commissions.create(cm);
  await audit(me, "Commission calculée", "commissions", cm.id, `${c.ref} · ${due.rule.label} · base ${due.baseKg} kg / ${fcfa(due.baseValue)} → ${fcfa(due.amount)}`, { after: cm });
  if (me.role !== "patron") await notify(me, "patron", "Commission à valider", `${c.ref} : ${fcfa(due.amount)} (${due.rule.label}).`, "/commissions/");
  return cm;
}

export async function validateCommission(me: User, id: Id) {
  assert(me.role === "patron" || me.role === "admin", "Seuls le patron et l'administrateur valident une commission.");
  const cm = (await ds().repos.commissions.get(id))!;
  assert(cm.status === "calculee", "Commission déjà validée.");
  await ds().repos.commissions.update(id, { status: "validee", validatedAt: now(), validatedBy: me.id });
  await audit(me, "Commission validée", "commissions", id, fcfa(cm.amount), { before: { status: "calculee" }, after: { status: "validee" } });
  await notify(me, cm.beneficiaryId, "Commission validée", `${fcfa(cm.amount)} validés.`, "/commissions/");
}

export async function payCommission(me: User, id: Id, i: { mode: PaymentMode; reference?: string }) {
  assert(me.role === "patron" || me.role === "admin", "Seuls le patron et l'administrateur paient une commission.");
  requireOnline("Le paiement d'une commission");
  const snap = await db();
  const cm = snap.commissions.find((x) => x.id === id)!;
  assert(cm.status === "validee", "La commission doit d'abord être validée.");
  const c = snap.contracts.find((x) => x.id === cm.contractId)!;
  const rule = snap.settings[0]!.commissionRules.find((r) => r.id === cm.ruleId);
  const ben = snap.users.find((u) => u.id === cm.beneficiaryId);
  const at = now();
  const deducted = rule?.settlement === "deduite";
  if (deducted) {
    await ds().repos.adjustments.create({ id: uid("aj"), contractId: c.id, amount: cm.amount, kind: "commission", reason: `Commission ${rule.label}`, by: me.id, at });
    await ds().repos.commissions.update(id, { status: "payee", paidAt: at, paidBy: me.id, mode: "deduction", reference: i.reference });
  } else {
    await ds().repos.expenses.create({ id: uid("ch"), category: "commission", label: `Commission ${c.ref} · ${rule?.label ?? ""}`, amount: cm.amount, date: at, beneficiary: ben?.name ?? "—", contractId: c.id, commissionId: id, debitedOn: "charges_patron", by: me.id });
    await ds().repos.commissions.update(id, { status: "payee", paidAt: at, paidBy: me.id, mode: i.mode, reference: i.reference });
  }
  await audit(me, "Commission payée", "commissions", id, `${c.ref} · ${fcfa(cm.amount)} · ${deducted ? "déduite du solde" : `versée (${i.mode}${i.reference ? ` · ${i.reference}` : ""})`}`, { before: { status: "validee" }, after: { status: "payee" } });
  await notify(me, cm.beneficiaryId, "Commission payée", `${fcfa(cm.amount)} ${deducted ? "déduits de votre solde" : "versés"} (${c.ref}).`, "/commissions/");
}

export async function addLocation(me: User, name: string, type: "origine" | "etape" | "destination" | "autre", coords?: { lat?: number; lng?: number }) {
  await requirePerm(me, "lieux", "c");
  assert(name.trim().length > 1, "Le nom du lieu est obligatoire.");
  await ensureLocation(me, name, type);
  if (coords?.lat !== undefined && coords.lng !== undefined) {
    const l = (await ds().repos.locations.list()).find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (l) await ds().repos.locations.update(l.id, { lat: coords.lat, lng: coords.lng });
  }
  await audit(me, "Ajout de lieu", "locations", undefined, name);
}

// ——— Suppressions et « actions à confirmer » (§3.3, US-20) ———
const COLLECTION_OF: Partial<Record<PermEntity, Collection>> = {
  fournisseurs: "users", utilisateurs: "users", besoins: "needs", propositions: "offers", contrats: "contracts", remises: "advances",
  transports: "transports", pointages: "checkins", traces: "traces", partielles: "partials", lieux: "locations", vehicules: "vehicles",
  pesees: "deliveries", charges: "expenses", couts: "expenses", declarations: "declarations",
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

async function applyDelete(me: User, entity: PermEntity, id: Id, label: string, reason: string) {
  const col = COLLECTION_OF[entity];
  assert(col, "Cet élément ne se supprime pas.");
  if (entity === "remises") await ds().repos.advances.update(id, { status: "annulee", cancelReason: reason }); // contre-écriture, jamais d'effacement
  else await (ds().repos[col] as unknown as { update(id: Id, p: { deleted: boolean }): Promise<unknown> }).update(id, { deleted: true });
  await audit(me, entity === "remises" ? "Annulation (contre-écriture)" : "Suppression logique", entity, id, `${label} · élément masqué mais conservé`, { before: { deleted: false }, after: { deleted: true, reason } });
}

/** Supprimer : directe pour le patron, via la file « actions à confirmer » pour les autres rôles autorisés. */
export async function requestDelete(me: User, entity: PermEntity, id: Id, label: string, reason: string) {
  const mode = deleteMode(await perms(), me, entity);
  assert(mode !== "interdite", "Vous n'avez pas le droit de supprimer cet élément.");
  assert(reason.trim().length > 2, "Le motif est obligatoire.");
  if (mode === "confirmation") {
    await queuePending(me, { entity, entityId: id, kind: "suppression", label, reason });
    return "queued" as const;
  }
  await applyDelete(me, entity, id, `${label} · motif : ${reason}`, reason);
  return "deleted" as const;
}

export async function decidePending(me: User, id: Id, approve: boolean, decisionReason: string) {
  assert(me.role === "patron", "Seul le patron valide les actions à confirmer.");
  const pa = await ds().repos.pending.get(id);
  assert(pa && pa.status === "en_attente", "Demande introuvable ou déjà traitée.");
  if (!approve) assert(decisionReason.trim().length > 2, "Le motif du refus est obligatoire.");
  if (approve) {
    if (pa.kind === "suppression") await applyDelete(me, pa.entity, pa.entityId, pa.label, pa.reason);
    else if (pa.payload?.type === "revision") {
      requireOnline("Une révision de prix");
      const c = (await ds().repos.contracts.get(pa.entityId))!;
      await applyRevision(me, c, pa.payload as unknown as RevisionInput);
    }
  }
  await ds().repos.pending.update(id, { status: approve ? "validee" : "refusee", decidedBy: me.id, decidedAt: now(), decisionReason });
  await audit(me, approve ? "Demande validée" : "Demande refusée", pa.entity, pa.entityId, `${pa.label}${decisionReason ? ` · ${decisionReason}` : ""}`, { before: { status: "en_attente" }, after: { status: approve ? "validee" : "refusee" } });
  await notify(me, pa.by, approve ? "Demande validée par le patron" : "Demande refusée par le patron", `${pa.label}${decisionReason ? ` — ${decisionReason}` : ""}`, "/actions/");
}

// ——— Droits CRUD (§3.3) ———
export async function setPerm(me: User, role: ManagedRole, entity: PermEntity, key: keyof Perm, value: boolean | Perm["d"]) {
  assert(me.role === "patron", "Seul le patron modifie les droits.");
  requireOnline("La modification des droits");
  if (key === "c" || key === "u" || key === "d") assert(!isLocked(entity, key) || value === false || value === "interdite", "Cette action reste réservée au patron (règle du cahier des charges).");
  if (key === "d") assert(value !== "directe", "Hors patron, la suppression passe toujours par « actions à confirmer » (US-20).");
  const s = await settings();
  const next = structuredClone(s.perms);
  const before = next[role][entity][key];
  (next[role][entity] as unknown as Record<string, unknown>)[key] = value;
  await ds().repos.settings.update("settings", { perms: next });
  await audit(me, "Modification des droits", "role_permissions", `${role}.${entity}`, `${role} · ${entity} · ${key} = ${String(value)}`, { before: { [key]: before }, after: { [key]: value } });
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
