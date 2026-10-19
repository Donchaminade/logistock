// Moteur de calcul (cahier des charges §1.5) : tout est dérivé des écritures, jamais saisi à la main.
//   V = Σ (qᵢ × pᵢ)            montant livré valorisé (prix figé à la réception)
//   S = A − V − R + Tf         solde (Tf = coûts de transport imputés au fournisseur, ajustement J négatif)
//   Q = S / P                  reste à livrer au prix en vigueur, arrondi au kg inférieur
import type { Contract, Database, Id, TraceEvent } from "./types";

export interface ContractMetrics {
  A: number; // avance totale versée
  V: number; // livré valorisé
  R: number; // remboursements reçus
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

export function metrics(db: Database, c: Contract): ContractMetrics {
  const adv = db.advances.filter((a) => a.contractId === c.id && !a.deleted && a.status !== "annulee");
  const A = adv.reduce((s, a) => s + a.amount, 0);
  const dels = db.deliveries.filter((d) => d.contractId === c.id && !d.deleted);
  const V = dels.reduce((s, d) => s + d.value, 0);
  const deliveredKg = dels.reduce((s, d) => s + d.netKg, 0);
  const R = db.payments.filter((p) => p.contractId === c.id && !p.deleted).reduce((s, p) => s + p.amount, 0);
  const Tf = db.expenses
    .filter((e) => e.contractId === c.id && !e.deleted && e.debitedOn === "solde_fournisseur")
    .reduce((s, e) => s + e.amount, 0);
  const S = A - V - R + Tf;
  const P = currentPrice(db, c);
  const Q = S > 0 ? Math.floor(S / P) : 0;
  const partial = db.partials.filter((p) => p.contractId === c.id && !p.deleted).sort((a, b) => b.at.localeCompare(a.at))[0];
  const debt = db.debts.find((d) => d.contractId === c.id && !d.deleted);
  return {
    A, V, R, Tf, S, P, Q, deliveredKg,
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

export function debtRemaining(db: Database, debtId: Id): number {
  const d = db.debts.find((x) => x.id === debtId);
  if (!d) return 0;
  const paid = db.payments.filter((p) => p.debtId === debtId && !p.deleted).reduce((s, p) => s + p.amount, 0);
  return Math.max(0, d.initial - paid);
}

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
  for (const d of db.deliveries.filter((x) => x.contractId === c.id && !x.deleted))
    rows.push({ date: d.receivedAt, label: `Livraison ${d.ticketNo} · ${group(d.netKg)} kg × ${d.price}`, debit: 0, credit: d.value });
  for (const p of db.payments.filter((x) => x.contractId === c.id && !x.deleted))
    rows.push({ date: p.date, label: "Remboursement reçu", debit: 0, credit: p.amount });
  for (const e of db.expenses.filter((x) => x.contractId === c.id && !x.deleted && x.debitedOn === "solde_fournisseur"))
    rows.push({ date: e.date, label: `Transport imputé · ${e.label}`, debit: e.amount, credit: 0 });
  rows.sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0;
  return rows.map((r) => {
    bal += r.debit - r.credit;
    return { ...r, balance: bal };
  });
}

function group(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
