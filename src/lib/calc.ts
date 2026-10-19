// Moteur de calcul (cahier des charges §1.5) : tout est dérivé des écritures, jamais saisi à la main.
//   V = Σ (qᵢ × pᵢ)            montant livré valorisé (prix figé à la réception)
//   S = A − V − R − J + Tf     solde (J = ajustements : pertes acceptées, corrections, commissions déduites, reports ;
//                              Tf = coûts de transport imputés au fournisseur)
//   Q = S / P                  reste à livrer au prix en vigueur, arrondi au kg inférieur
import type { Commission, CommissionRule, Contract, Database, Debt, Delivery, Id, Payment, Pickup, PickupStatus, TraceEvent } from "./types";

export interface ContractMetrics {
  A: number; // avance totale versée
  V: number; // livré valorisé
  R: number; // remboursements reçus (argent ou marchandise), moins les trop-livrés réglés au fournisseur
  J: number; // ajustements
  Tf: number; // coûts de transport imputés au fournisseur
  S: number; // solde
  P: number; // prix en vigueur
  Q: number; // reste à livrer (kg)
  deliveredKg: number;
  realisation: number; // T = V / A
  partialRemainderKg?: number; // reliquat déclaré (livraison partielle)
  hasPartial: boolean;
  advancesToComplete: number;
  debtId?: Id;
}

export function currentPrice(db: Database, c: Contract): number {
  const revs = db.revisions.filter((r) => r.contractId === c.id && !r.deleted).sort((a, b) => a.at.localeCompare(b.at));
  return revs.length ? revs[revs.length - 1]!.newPrice : c.initialPrice;
}

/** Une livraison ne compte dans V qu'une fois réceptionnée (prix figé). */
export function isReceived(d: Delivery) {
  return !d.deleted && (d.status === undefined || d.status === "receptionnee" || d.status === "contestee");
}
export function paymentSign(p: Payment) {
  return p.direction === "patron_vers_fournisseur" ? -1 : 1;
}

export function metrics(db: Database, c: Contract): ContractMetrics {
  const adv = db.advances.filter((a) => a.contractId === c.id && !a.deleted && a.status !== "annulee");
  const A = adv.reduce((s, a) => s + a.amount, 0);
  const dels = db.deliveries.filter((d) => d.contractId === c.id && isReceived(d));
  const V = dels.reduce((s, d) => s + d.value, 0);
  const deliveredKg = dels.reduce((s, d) => s + d.netKg, 0);
  const R = db.payments.filter((p) => p.contractId === c.id && !p.deleted).reduce((s, p) => s + paymentSign(p) * p.amount, 0);
  const J = (db.adjustments ?? []).filter((a) => a.contractId === c.id && !a.deleted).reduce((s, a) => s + a.amount, 0);
  const Tf = db.expenses
    .filter((e) => e.contractId === c.id && !e.deleted && e.debitedOn === "solde_fournisseur" && e.status !== "refusee")
    .reduce((s, e) => s + e.amount, 0);
  const S = A - V - R - J + Tf;
  const P = currentPrice(db, c);
  const Q = S > 0 ? Math.floor(S / P) : 0;
  const partial = db.partials.filter((p) => p.contractId === c.id && !p.deleted).sort((a, b) => b.at.localeCompare(a.at))[0];
  const debt = db.debts.find((d) => d.contractId === c.id && !d.deleted);
  return {
    A, V, R, J, Tf, S, P, Q, deliveredKg,
    realisation: A > 0 ? Math.min(100, Math.round((V / A) * 1000) / 10) : 0,
    partialRemainderKg: partial?.remainderKg,
    hasPartial: !!partial,
    advancesToComplete: adv.filter((a) => a.status === "a_completer").length,
    debtId: debt?.id,
  };
}

/** Simulation d'un ajustement de prix sur le reliquat (§2.0, US-19). */
export function simulateRevision(S: number, oldPrice: number, newPrice: number) {
  const before = S > 0 ? Math.floor(S / oldPrice) : 0;
  const optionA = S > 0 ? Math.floor(S / newPrice) : 0;
  // Option B : la quantité reste fixe, le patron verse le complément.
  const complement = Math.max(0, before * (newPrice - oldPrice));
  return { before, optionA, optionB: before, complement };
}

export function debtPaid(db: Database, debtId: Id): number {
  return db.payments.filter((p) => p.debtId === debtId && !p.deleted).reduce((s, p) => s + p.amount, 0);
}
export function debtRemaining(db: Database, debtId: Id): number {
  const d = db.debts.find((x) => x.id === debtId);
  if (!d || d.status === "passee_en_perte") return 0;
  return Math.max(0, d.initial - debtPaid(db, debtId));
}
/** Ancienneté d'une dette (§1.11) : à partir de l'échéance. */
export function debtAge(d: Debt, at = Date.now()): { days: number; bucket: "a_echoir" | "0_30" | "30_90" | "plus_90" } {
  const days = Math.floor((at - new Date(d.dueDate).getTime()) / 86400000);
  return { days, bucket: days < 0 ? "a_echoir" : days < 30 ? "0_30" : days <= 90 ? "30_90" : "plus_90" };
}
export const AGE_LABEL = { a_echoir: "À échoir", "0_30": "Moins de 30 jours", "30_90": "30 à 90 jours", plus_90: "Plus de 90 jours" } as const;

/** Dette ouverte d'un fournisseur (pour le blocage d'une nouvelle avance). */
export function supplierOpenDebt(db: Database, supplierId: Id): number {
  return db.debts.filter((d) => d.supplierId === supplierId && !d.deleted && !["soldee", "passee_en_perte"].includes(d.status)).reduce((s, d) => s + debtRemaining(db, d.id), 0);
}

// ——— Commissions (§1.8) ———
export function ruleOf(db: Database, c: Contract): CommissionRule | undefined {
  return db.settings[0]?.commissionRules.find((r) => r.id === c.commissionRuleId);
}
export function commissionAmount(rule: CommissionRule, baseKg: number, baseValue: number, first: boolean) {
  if (rule.mode === "par_kg") return baseKg * rule.value;
  if (rule.mode === "pourcentage") return Math.round((baseValue * rule.value) / 10000);
  return first ? rule.value : 0;
}
/** Commission due depuis la précédente : écart entre le livré réceptionné et la base déjà commissionnée. */
export function commissionDue(db: Database, c: Contract) {
  const rule = ruleOf(db, c);
  if (!rule) return null;
  const m = metrics(db, c);
  const prev = (db.commissions ?? []).filter((x: Commission) => x.contractId === c.id && !x.deleted);
  const baseKg = m.deliveredKg - prev.reduce((s, x) => s + x.baseKg, 0);
  const baseValue = m.V - prev.reduce((s, x) => s + x.baseValue, 0);
  const amount = commissionAmount(rule, baseKg, baseValue, prev.length === 0);
  return { rule, baseKg, baseValue, amount };
}

// ——— Marge estimée (§1.7) ———
export function margin(db: Database, filter?: (c: Contract) => boolean) {
  const resale = db.settings[0]?.resalePrice ?? { soja: 0, cacao: 0 };
  const contracts = db.contracts.filter((c) => !c.deleted && (!filter || filter(c)));
  let revenue = 0, cost = 0, transport = 0, commissions = 0;
  for (const c of contracts) {
    const m = metrics(db, c);
    revenue += m.deliveredKg * resale[c.product];
    cost += m.V;
    transport += db.expenses.filter((e) => e.contractId === c.id && !e.deleted && e.category === "transport" && e.debitedOn === "charges_patron").reduce((s, e) => s + e.amount, 0);
    commissions += db.expenses.filter((e) => e.contractId === c.id && !e.deleted && e.category === "commission").reduce((s, e) => s + e.amount, 0);
  }
  return { revenue, cost, transport, commissions, margin: revenue - cost - transport - commissions };
}

// ——— Ordres d'enlèvement ———
export function pickupStatus(db: Database, p: Pickup): PickupStatus {
  const lots = db.transports.filter((t) => t.pickupId === p.id && !t.deleted);
  if (lots.length && lots.every((t) => t.status === "receptionne")) return "cloture";
  if (p.arrivalDeclaredAt || lots.some((t) => t.status !== "en_route")) return "livre";
  if (p.route.some((r) => r.passedAt)) return "en_route";
  if (p.stops.some((s) => s.confirmedAt)) return "charge";
  return "planifie";
}
export const PICKUP_STATUS_LABEL: Record<PickupStatus, string> = {
  planifie: "Planifié", charge: "Chargé", en_route: "En route", livre: "Arrivé à Lomé", cloture: "Clôturé",
};

export function supplierStock(db: Database, supplierId: Id) {
  const decl = db.declarations.filter((d) => d.supplierId === supplierId && !d.deleted);
  const declared = decl.reduce((s, d) => s + d.qtyKg, 0);
  const contracts = db.contracts.filter((c) => c.supplierId === supplierId && !c.deleted).map((c) => c.id);
  const loaded = db.transports
    .filter((t) => contracts.includes(t.contractId) && !t.deleted)
    .reduce((s, t) => s + t.tonsKg, 0);
  const last = decl.sort((a, b) => b.date.localeCompare(a.date))[0];
  return { declared, loaded, available: Math.max(0, declared - loaded), lastDate: last?.date };
}

/** Écarts de quantité entre deux événements successifs d'un lot (§2.9). */
export function traceGaps(events: TraceEvent[], thresholdPct: number): Record<Id, number> {
  const sorted = [...events].sort((a, b) => a.order - b.order);
  const gaps: Record<Id, number> = {};
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const diff = cur.qtyKg - prev.qtyKg;
    if (prev.qtyKg > 0 && Math.abs(diff) / prev.qtyKg > thresholdPct / 100) gaps[cur.id] = diff;
  }
  return gaps;
}

export interface LedgerLine {
  date: string;
  label: string;
  debit: number; // ce que le fournisseur doit (argent reçu, coûts imputés)
  credit: number; // ce qui est couvert (livraisons, remboursements)
  balance: number;
}

/** Relevé chronologique d'un contrat (§2.6). */
export function ledger(db: Database, c: Contract): LedgerLine[] {
  const rows: Omit<LedgerLine, "balance">[] = [];
  for (const a of db.advances.filter((x) => x.contractId === c.id && !x.deleted && x.status !== "annulee"))
    rows.push({ date: a.date, label: a.kind === "complement" ? `Complément de prix ${a.receiptNo}` : `Remise d'argent ${a.receiptNo}`, debit: a.amount, credit: 0 });
  for (const d of db.deliveries.filter((x) => x.contractId === c.id && isReceived(x)))
    rows.push({ date: d.receivedAt ?? d.weighedAt, label: `Livraison ${d.ticketNo} · ${group(d.netKg)} kg × ${d.price}${d.status === "contestee" ? " (contestée)" : ""}`, debit: 0, credit: d.value });
  for (const p of db.payments.filter((x) => x.contractId === c.id && !x.deleted)) {
    const label = p.kind === "marchandise" ? `Remboursement en marchandise (${group(p.qtyKg ?? 0)} kg)` : p.kind === "trop_livre" ? "Règlement du trop-livré au fournisseur" : "Remboursement reçu";
    if (paymentSign(p) > 0) rows.push({ date: p.date, label, debit: 0, credit: p.amount });
    else rows.push({ date: p.date, label, debit: p.amount, credit: 0 });
  }
  for (const a of (db.adjustments ?? []).filter((x) => x.contractId === c.id && !x.deleted))
    rows.push({ date: a.at, label: `Ajustement · ${ADJ_LABEL[a.kind]} · ${a.reason}`, debit: a.amount < 0 ? -a.amount : 0, credit: a.amount > 0 ? a.amount : 0 });
  for (const e of db.expenses.filter((x) => x.contractId === c.id && !x.deleted && x.debitedOn === "solde_fournisseur" && x.status !== "refusee"))
    rows.push({ date: e.date, label: `Transport imputé · ${e.label}`, debit: e.amount, credit: 0 });
  rows.sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0;
  return rows.map((r) => {
    bal += r.debit - r.credit;
    return { ...r, balance: bal };
  });
}

export const ADJ_LABEL = {
  perte_acceptee: "Perte acceptée", correction: "Correction", commission: "Commission déduite",
  report_sortant: "Solde reporté vers un autre contrat", report_entrant: "Solde reçu d'un autre contrat",
} as const;

function group(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
