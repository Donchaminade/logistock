"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Download, FileSignature, HandCoins, Scale, Wallet } from "lucide-react";
import { askReason, confirm, fail, success } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { nameOf } from "@/components/domain";
import { Badge, Button, Card, CardTitle, DataTable, Empty, Field, Input, Modal, PageHeader, Photo, Select, Stat, Tabs } from "@/components/ui";
import { AGE_LABEL, debtAge, debtPaid, debtRemaining, metrics } from "@/lib/calc";
import { debtsTable, download, toXlsx } from "@/lib/exports";
import { date, fcfa, modeLabel, tonnes } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Debt, DebtStatus, PaymentMode } from "@/lib/types";
import { recordRepayment, setDebtStatus, writeOffDebt } from "@/services/actions";

const DEBT_STATUS: Record<DebtStatus, string> = { ouverte: "Ouverte", en_remboursement: "En remboursement", en_litige: "En litige", soldee: "Soldée", passee_en_perte: "Passée en perte" };
const DEBT_TONE: Record<DebtStatus, "blue" | "ok" | "err" | "dark" | "outline"> = { ouverte: "blue", en_remboursement: "outline", en_litige: "err", soldee: "ok", passee_en_perte: "dark" };

export default function Finances() {
  const { db, me } = useApp();
  const perms = db.settings[0]!.perms;
  const [tab, setTab] = useState<"soldes" | "paiements" | "dettes">("soldes");
  const [repay, setRepay] = useState<Debt | null>(null);
  const contracts = db.contracts.filter((c) => !c.deleted);
  const suppliers = db.users.filter((u) => u.role === "fournisseur" && !u.deleted).map((u) => {
    const ms = contracts.filter((c) => c.supplierId === u.id).map((c) => metrics(db, c));
    return { u, A: ms.reduce((s, m) => s + m.A, 0), V: ms.reduce((s, m) => s + m.V, 0), R: ms.reduce((s, m) => s + m.R, 0), J: ms.reduce((s, m) => s + m.J, 0), S: ms.reduce((s, m) => s + m.S, 0), Q: ms.reduce((s, m) => s + m.Q, 0) };
  });
  const payments = [
    ...db.advances.filter((a) => !a.deleted).map((a) => ({ id: a.id, date: a.date, label: a.kind === "complement" ? `Complément ${a.receiptNo}` : `Remise ${a.receiptNo}`, dir: "Patron → fournisseur", who: db.contracts.find((c) => c.id === a.contractId)?.supplierId, amount: a.amount, mode: a.mode, photo: a.photo, status: a.status as string })),
    ...db.payments.filter((p) => !p.deleted).map((p) => ({ id: p.id, date: p.date, label: p.kind === "marchandise" ? `Remboursement en marchandise (${tonnes(p.qtyKg ?? 0)})` : p.kind === "trop_livre" ? "Règlement d'un trop-livré" : "Remboursement", dir: p.direction === "patron_vers_fournisseur" ? "Patron → fournisseur" : "Fournisseur → patron", who: db.contracts.find((c) => c.id === p.contractId)?.supplierId, amount: p.amount, mode: p.mode, photo: p.photo, status: "validee" })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const debts = db.debts.filter((d) => !d.deleted);
  const open = debts.filter((d) => !["soldee", "passee_en_perte"].includes(d.status));
  const buckets = (Object.keys(AGE_LABEL) as (keyof typeof AGE_LABEL)[]).map((k) => ({ k, total: open.filter((d) => debtAge(d).bucket === k).reduce((s, d) => s + debtRemaining(db, d.id), 0), n: open.filter((d) => debtAge(d).bucket === k).length }));
  const editDebt = can(perms, me, "dettes", "u");

  return (
    <>
      <PageHeader eyebrow="Finances" title="Paiements, soldes et dettes" sub="Soldes recalculés à partir des écritures (S = A − V − R − J + Tf), remboursements avec preuves, dettes par ancienneté."
        actions={can(perms, me, "exports", "r") && <Button variant="secondary" icon={<Download className="size-4" />} data-testid="btn-export-debts" onClick={async () => { try { download(await toXlsx([debtsTable(db)]), "LogiStock-dettes.xlsx"); } catch (e) { await fail(e); } }}>Dettes (.xlsx)</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Soldes à couvrir" value={fcfa(suppliers.reduce((s, x) => s + Math.max(0, x.S), 0))} />
        <Stat label="Dettes restantes" value={fcfa(open.reduce((s, d) => s + debtRemaining(db, d.id), 0))} hint={`${open.length} ouverte(s)`} />
        <Stat label="Remboursé" value={fcfa(db.payments.filter((p) => !p.deleted && p.direction === "fournisseur_vers_patron").reduce((s, p) => s + p.amount, 0))} />
        <Stat label="Passé en perte" value={fcfa(debts.filter((d) => d.status === "passee_en_perte").reduce((s, d) => s + d.initial - debtPaid(db, d.id), 0))} hint="Signé par le patron" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "soldes", label: "Soldes par fournisseur" }, { value: "paiements", label: "Paiements", count: payments.length }, { value: "dettes", label: "Dettes", count: debts.length }]} />
      {tab === "soldes" && (
        <DataTable rows={suppliers} rowKey={(r) => r.u.id} columns={[
          { key: "n", header: "Fournisseur", mobile: "title", render: (r) => <span className="font-semibold">{r.u.name}</span> },
          { key: "a", header: "Avancé A", align: "right", mobile: "meta", render: (r) => fcfa(r.A) },
          { key: "v", header: "Livré V", align: "right", mobile: "meta", render: (r) => fcfa(r.V) },
          { key: "r", header: "Remb. R", align: "right", mobile: "meta", render: (r) => fcfa(r.R) },
          { key: "j", header: "Ajust. J", align: "right", mobile: "meta", render: (r) => fcfa(r.J) },
          { key: "q", header: "Reste à livrer", align: "right", mobile: "sub", render: (r) => tonnes(r.Q) },
          { key: "s", header: "Solde S", align: "right", mobile: "value", render: (r) => <span className="font-semibold">{fcfa(r.S)}</span> },
        ]} />
      )}
      {tab === "paiements" && (
        <DataTable rows={payments} rowKey={(p) => p.id} columns={[
          { key: "ph", header: "Preuve", mobile: "hide", render: (p) => (p.photo ? <Photo src={p.photo} alt={p.label} className="size-10" /> : <Badge tone="err">Photo manquante</Badge>) },
          { key: "l", header: "Opération", mobile: "title", render: (p) => <span className="font-semibold">{p.label}</span> },
          { key: "w", header: "Fournisseur", mobile: "sub", render: (p) => `${nameOf(db, p.who)} · ${p.dir}` },
          { key: "d", header: "Date", mobile: "meta", render: (p) => date(p.date) },
          { key: "m", header: "Mode", mobile: "meta", render: (p) => modeLabel[p.mode] },
          { key: "s", header: "Statut", mobile: "meta", render: (p) => (p.status === "annulee" ? <Badge>Annulé</Badge> : p.status === "a_completer" ? <Badge tone="err">À compléter</Badge> : <Badge tone="ok">Validé</Badge>) },
          { key: "a", header: "Montant", align: "right", mobile: "value", render: (p) => <span className="font-semibold">{fcfa(p.amount)}</span> },
        ]} />
      )}
      {tab === "dettes" && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="debt-buckets">
            {buckets.map((b) => <Card key={b.k} className="!p-4"><div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-subtle">{AGE_LABEL[b.k]}</div><div className="num mt-1 text-[18px] font-bold">{fcfa(b.total)}</div><div className="text-[12px] text-muted">{b.n} dette(s)</div></Card>)}
          </div>
          <DataTable rows={debts} rowKey={(d) => d.id}
            empty={<Empty icon={<Wallet className="size-5" />} title="Aucune dette" text="Un solde non couvert peut être passé en dette depuis la fiche du contrat (bouton « Solder »)." />}
            columns={[
              { key: "f", header: "Fournisseur", mobile: "title", render: (d) => <span className="font-semibold">{nameOf(db, d.supplierId)}</span> },
              { key: "c", header: "Contrat", mobile: "sub", render: (d) => { const c = db.contracts.find((x) => x.id === d.contractId); return c ? <Link className="text-brand-700 hover:underline" href={`/contrats/fiche/?id=${c.id}`}>{c.ref}</Link> : "—"; } },
              { key: "i", header: "Initial", align: "right", mobile: "meta", render: (d) => fcfa(d.initial) },
              { key: "age", header: "Ancienneté", mobile: "meta", render: (d) => { const a = debtAge(d); return `${AGE_LABEL[a.bucket]}${a.days > 0 ? ` (${a.days} j)` : ""}`; } },
              { key: "e", header: "Échéance", mobile: "meta", render: (d) => date(d.dueDate) },
              { key: "st", header: "Statut", mobile: "meta", render: (d) => <Badge tone={DEBT_TONE[d.status]}>{DEBT_STATUS[d.status]}</Badge> },
              { key: "r", header: "Restant", align: "right", mobile: "value", render: (d) => <span className="font-semibold">{fcfa(debtRemaining(db, d.id))}</span> },
              { key: "x", header: "", mobile: "meta", render: (d) => (["soldee", "passee_en_perte"].includes(d.status) ? (d.writeOffSignature ? <span className="inline-flex items-center gap-1 text-[12px] text-muted"><FileSignature className="size-3.5" /> Signée</span> : null) : <DebtActions d={d} canEdit={editDebt} onRepay={() => setRepay(d)} />) },
            ]} />
        </>
      )}
      {repay && <RepayModal debt={repay} onClose={() => setRepay(null)} />}
    </>
  );
}

function DebtActions({ d, canEdit, onRepay }: { d: Debt; canEdit: boolean; onRepay: () => void }) {
  const { db, me, run } = useApp();
  const perms = db.settings[0]!.perms;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {can(perms, me, "dettes", "c") && <Button size="sm" variant="quiet" icon={<HandCoins className="size-3.5" />} data-testid={`repay-${d.id}`} onClick={onRepay}>Encaisser</Button>}
      {canEdit && <Button size="sm" variant="quiet" icon={<Scale className="size-3.5" />} onClick={async () => {
        const to = d.status === "en_litige" ? "ouverte" : "en_litige";
        const r = await askReason({ title: to === "en_litige" ? "Signaler un litige ?" : "Lever le litige ?", placeholder: "Commentaire (obligatoire)", confirmText: "Enregistrer" });
        if (r) await run(() => setDebtStatus(me, d.id, to, r), "Statut mis à jour");
      }}>{d.status === "en_litige" ? "Lever le litige" : "Litige"}</Button>}
      {me.role === "patron" && <Button size="sm" variant="quiet" icon={<AlertTriangle className="size-3.5" />} data-testid={`writeoff-${d.id}`} onClick={async () => {
        const r = await askReason({ title: "Passer la dette en perte ?", html: `Restant : <b>${fcfa(debtRemaining(db, d.id))}</b>.<br/>Décision signée (Ed25519) et tracée ; la dette sort des encours.`, confirmText: "Passer en perte", dark: true });
        if (!r) return;
        const ok = await run(() => writeOffDebt(me, d.id, r).then(() => true));
        if (ok) await success("Dette passée en perte", "La décision est signée et inscrite au journal d'audit.");
      }}>Perte</Button>}
    </span>
  );
}

function RepayModal({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const { db, me, run } = useApp();
  const c = db.contracts.find((x) => x.id === debt.contractId)!;
  const max = debtRemaining(db, debt.id);
  const [kind, setKind] = useState<"remboursement" | "marchandise">("remboursement");
  const [amount, setAmount] = useState(String(max));
  const [qty, setQty] = useState("");
  const [mode, setMode] = useState<PaymentMode>("tmoney");
  const [ref, setRef] = useState("");
  return (
    <Modal open onClose={onClose} title="Encaisser un remboursement" sub={`${c.ref} · dette restante : ${fcfa(max)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button data-testid="repay-submit" onClick={async () => {
        if (kind === "marchandise" && !(await confirm({ title: "Remboursement en marchandise", html: `${qty} t valorisées au prix en vigueur du contrat.`, confirmText: "Enregistrer" }))) return;
        const r = await run(() => recordRepayment(me, c.id, kind === "marchandise" ? { kind, qtyKg: Math.round(Number(qty.replace(",", ".")) * 1000), mode: "autre", debtId: debt.id } : { kind, amount: Number(amount), mode, reference: ref || undefined, debtId: debt.id }), "Remboursement encaissé", "La dette est mise à jour.");
        if (r) onClose();
      }}>Encaisser</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nature" className="sm:col-span-2"><Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="remboursement">En argent</option><option value="marchandise">En marchandise (valorisée au prix en vigueur)</option></Select></Field>
        {kind === "remboursement" ? (
          <>
            <Field label="Montant (FCFA)"><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Mode"><Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}><option value="especes">Espèces</option><option value="flooz">Flooz</option><option value="tmoney">T-Money</option><option value="virement">Virement</option></Select></Field>
            <Field label="Référence" className="sm:col-span-2"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Référence Mobile Money saisie à la main" /></Field>
          </>
        ) : (
          <Field label="Quantité livrée (t)" className="sm:col-span-2"><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="ex. 2,5" /></Field>
        )}
      </div>
    </Modal>
  );
}

