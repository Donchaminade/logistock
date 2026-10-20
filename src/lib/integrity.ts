// Intégrité : empreintes SHA-256 chaînées (journal d'audit, traces des lots, révisions de prix)
// et signatures Ed25519 (reçus, révisions, passages en perte). Cahier des charges §6.5.
import { canonical, sha256Hex, signEd25519, verifyEd25519 } from "./crypto";
import type { Advance, AuditEntry, Database, Debt, PriceRevision, TraceEvent } from "./types";

export const GENESIS = "GENESIS";

// ——— Reçus ———
export function receiptContent(db: Database, a: Advance) {
  const c = db.contracts.find((x) => x.id === a.contractId);
  return {
    document: "recu-remise", no: a.receiptNo, kind: a.kind, contract: c?.ref, supplierId: c?.supplierId, product: c?.product,
    date: a.date, amount: a.amount, qtyKg: a.qtyKg, unitPrice: a.unitPrice, mode: a.mode, reference: a.reference ?? "",
  };
}
export async function sealReceipt(db: Database, a: Advance) {
  const receiptHash = await sha256Hex(canonical(receiptContent(db, a)));
  return { receiptHash, receiptSignature: await signEd25519(receiptHash) };
}
export interface ReceiptCheck {
  recomputed: string;
  hashOk: boolean;
  signatureOk: boolean;
  printedOk?: boolean;
}
/** Recalcule l'empreinte d'un reçu à partir des écritures et vérifie la signature. */
export async function verifyReceipt(db: Database, a: Advance, printedHash?: string, tamper?: Partial<Advance>): Promise<ReceiptCheck> {
  const recomputed = await sha256Hex(canonical(receiptContent(db, { ...a, ...tamper })));
  const hashOk = recomputed === a.receiptHash;
  const signatureOk = hashOk && (await verifyEd25519(recomputed, a.receiptSignature));
  const p = printedHash?.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
  return { recomputed, hashOk, signatureOk, printedOk: p ? a.receiptHash.startsWith(p) && p.length >= 12 : undefined };
}

// ——— Journal d'audit (ajout seul, chaîné) ———
export function auditContent(e: Omit<AuditEntry, "hash" | "prevHash" | "id">) {
  return { at: e.at, by: e.by, action: e.action, entity: e.entity, entityId: e.entityId, detail: e.detail, before: e.before, after: e.after, device: e.device, lat: e.lat, lng: e.lng, accuracy: e.accuracy, positionNote: e.positionNote };
}
export function auditHash(prevHash: string, e: Omit<AuditEntry, "hash" | "prevHash" | "id">) {
  return sha256Hex(`${prevHash}|${canonical(auditContent(e))}`);
}
export interface ChainCheck {
  ok: boolean;
  count: number;
  brokenAt?: number;
  reason?: string;
}
export async function verifyAuditChain(entries: AuditEntry[]): Promise<ChainCheck> {
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.prevHash !== prev) return { ok: false, count: entries.length, brokenAt: i, reason: "Lien avec la ligne précédente rompu (ligne supprimée ou insérée)." };
    if ((await auditHash(prev, e)) !== e.hash) return { ok: false, count: entries.length, brokenAt: i, reason: "Contenu modifié après écriture." };
    prev = e.hash;
  }
  return { ok: true, count: entries.length };
}

// ——— Traces des lots ———
export function traceContent(e: Omit<TraceEvent, "hash" | "prevHash" | "id">) {
  return { transportId: e.transportId, order: e.order, type: e.type, place: e.place, at: e.at, qtyKg: e.qtyKg, receiver: e.receiver, receiverRole: e.receiverRole, vehicle: e.vehicle, driver: e.driver, carrier: e.carrier, comment: e.comment, photo: e.photo, by: e.by };
}
export function traceHash(prevHash: string, e: Omit<TraceEvent, "hash" | "prevHash" | "id">) {
  return sha256Hex(`${prevHash}|${canonical(traceContent(e))}`);
}
export async function verifyTraceChain(events: TraceEvent[]): Promise<ChainCheck> {
  const sorted = [...events].sort((a, b) => a.order - b.order);
  let prev = GENESIS;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]!;
    if (e.prevHash !== prev || (await traceHash(prev, e)) !== e.hash) return { ok: false, count: sorted.length, brokenAt: i, reason: "Événement altéré ou chaîne rompue." };
    prev = e.hash;
  }
  return { ok: true, count: sorted.length };
}

// ——— Révisions de prix (horodatées, chaînées, signées) ———
export function revisionContent(r: Omit<PriceRevision, "hash" | "signature" | "id" | "ackAt">) {
  return { contractId: r.contractId, oldPrice: r.oldPrice, newPrice: r.newPrice, option: r.option, complement: r.complement, effectiveAt: r.effectiveAt, by: r.by, at: r.at, reason: r.reason, prevHash: r.prevHash };
}
export async function sealRevision(r: Omit<PriceRevision, "hash" | "signature" | "id" | "ackAt">) {
  const hash = await sha256Hex(canonical(revisionContent(r)));
  return { hash, signature: await signEd25519(hash) };
}
export async function verifyRevision(r: PriceRevision) {
  const hash = await sha256Hex(canonical(revisionContent(r)));
  return hash === r.hash && (await verifyEd25519(hash, r.signature));
}

// ——— Passage d'une dette en perte (signé) ———
export async function signWriteOff(d: Debt, reason: string, by: string, at: string) {
  return signEd25519(await sha256Hex(canonical({ debt: d.id, contract: d.contractId, initial: d.initial, reason, by, at })));
}

/** Calcule toutes les empreintes et signatures d'un jeu de données (graine de démonstration). */
export async function sealDatabase(db: Database): Promise<Database> {
  const byTransport = new Map<string, TraceEvent[]>();
  for (const e of db.traces) byTransport.set(e.transportId, [...(byTransport.get(e.transportId) ?? []), e]);
  for (const list of byTransport.values()) {
    let prev = GENESIS;
    for (const e of list.sort((a, b) => a.order - b.order)) {
      e.prevHash = prev;
      e.hash = await traceHash(prev, e);
      prev = e.hash;
    }
  }
  let prev = GENESIS;
  for (const e of db.audit) {
    e.prevHash = prev;
    e.hash = await auditHash(prev, e);
    prev = e.hash;
  }
  for (const a of db.advances) Object.assign(a, await sealReceipt(db, a));
  const revPrev = new Map<string, string>();
  for (const r of db.revisions.sort((a, b) => a.at.localeCompare(b.at))) {
    r.prevHash = revPrev.get(r.contractId) ?? GENESIS;
    Object.assign(r, await sealRevision(r));
    revPrev.set(r.contractId, r.hash);
  }
  return db;
}
