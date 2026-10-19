"use client";
import { useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { useApp } from "@/components/DataProvider";
import { nameOf } from "@/components/domain";
import { Badge, Button, DataTable, Empty, Field, Input, Modal, PageHeader, Select, Stat, Tabs, Photo } from "@/components/ui";
import { debtRemaining, metrics } from "@/lib/calc";
import { date, fcfa, modeLabel, tonnes } from "@/lib/format";
import type { PaymentMode } from "@/lib/types";
import { addExpense, recordRepayment } from "@/services/actions";

export default function Finances() {
  const { db, me, run } = useApp();
  const [tab, setTab] = useState<"soldes" | "paiements" | "dettes" | "charges">("soldes");
  const [exp, setExp] = useState(false);
  const [repayDebt, setRepayDebt] = useState<string | null>(null);
  const contracts = db.contracts.filter((c) => !c.deleted);
  const suppliers = db.users.filter((u) => u.role === "fournisseur" && !u.deleted).map((u) => {
    const ms = contracts.filter((c) => c.supplierId === u.id).map((c) => metrics(db, c));
    return { u, A: ms.reduce((s, m) => s + m.A, 0), V: ms.reduce((s, m) => s + m.V, 0), S: ms.reduce((s, m) => s + m.S, 0), Q: ms.reduce((s, m) => s + m.Q, 0) };
  });
  const payments = [
    ...db.advances.filter((a) => !a.deleted).map((a) => ({ id: a.id, date: a.date, label: a.kind === "complement" ? `Complément ${a.receiptNo}` : `Remise ${a.receiptNo}`, dir: "Patron → fournisseur", who: db.contracts.find((c) => c.id === a.contractId)?.supplierId, amount: a.amount, mode: a.mode, photo: a.photo, status: a.status })),
    ...db.payments.filter((p) => !p.deleted).map((p) => ({ id: p.id, date: p.date, label: "Remboursement", dir: "Fournisseur → patron", who: db.contracts.find((c) => c.id === p.contractId)?.supplierId, amount: p.amount, mode: p.mode, photo: p.photo, status: "validee" as const })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const debts = db.debts.filter((d) => !d.deleted);
  const charges = db.expenses.filter((e) => !e.deleted).sort((a, b) => b.date.localeCompare(a.date));
  const ageBucket = (iso: string) => { const d = (Date.now() - new Date(iso).getTime()) / 864e5; return d < 30 ? "< 30 jours" : d <= 90 ? "30 à 90 jours" : "> 90 jours"; };

  if (me.role === "fournisseur") return <Empty icon={<Wallet className="size-5" />} title="Réservé au patron" />;
  return (
    <>
      <PageHeader title="Paiements et dettes" sub="Soldes recalculés à partir des écritures, remises et remboursements avec preuves, dettes et charges."
        actions={<Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setExp(true)}>Nouvelle charge</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Soldes à couvrir" value={fcfa(suppliers.reduce((s, x) => s + Math.max(0, x.S), 0))} />
        <Stat label="Dettes restantes" value={fcfa(debts.reduce((s, d) => s + debtRemaining(db, d.id), 0))} hint={`${debts.filter((d) => d.status !== "soldee").length} ouverte(s)`} />
        <Stat label="Charges du patron" value={fcfa(charges.filter((c) => c.debitedOn === "charges_patron").reduce((s, c) => s + c.amount, 0))} />
        <Stat label="Imputé aux fournisseurs" value={fcfa(charges.filter((c) => c.debitedOn === "solde_fournisseur").reduce((s, c) => s + c.amount, 0))} hint="Transport non payé" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "soldes", label: "Soldes" }, { value: "paiements", label: "Paiements", count: payments.length }, { value: "dettes", label: "Dettes", count: debts.length }, { value: "charges", label: "Charges", count: charges.length }]} />
      {tab === "soldes" && (
        <DataTable rows={suppliers} rowKey={(r) => r.u.id} columns={[
          { key: "n", header: "Fournisseur", mobile: "title", render: (r) => <span className="font-semibold">{r.u.name}</span> },
          { key: "a", header: "Avancé", align: "right", mobile: "meta", render: (r) => fcfa(r.A) },
          { key: "v", header: "Livré valorisé", align: "right", mobile: "meta", render: (r) => fcfa(r.V) },
          { key: "q", header: "Reste à livrer", align: "right", mobile: "sub", render: (r) => tonnes(r.Q) },
          { key: "s", header: "Solde", align: "right", mobile: "value", render: (r) => <span className="font-semibold">{fcfa(r.S)}</span> },
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
        <DataTable rows={debts} rowKey={(d) => d.id}
          empty={<Empty icon={<Wallet className="size-5" />} title="Aucune dette" text="Un solde non couvert peut être passé en dette depuis la fiche du contrat (bouton « Solder »)." />}
          columns={[
            { key: "f", header: "Fournisseur", mobile: "title", render: (d) => <span className="font-semibold">{nameOf(db, d.supplierId)}</span> },
            { key: "c", header: "Contrat", mobile: "sub", render: (d) => db.contracts.find((c) => c.id === d.contractId)?.ref },
            { key: "i", header: "Initial", align: "right", mobile: "meta", render: (d) => fcfa(d.initial) },
            { key: "age", header: "Ancienneté", mobile: "meta", render: (d) => ageBucket(d.createdAt) },
            { key: "e", header: "Échéance", mobile: "meta", render: (d) => date(d.dueDate) },
            { key: "st", header: "Statut", mobile: "meta", render: (d) => <Badge tone={d.status === "soldee" ? "ok" : "blue"}>{d.status === "soldee" ? "Soldée" : d.status === "en_remboursement" ? "En remboursement" : "Ouverte"}</Badge> },
            { key: "r", header: "Restant", align: "right", mobile: "value", render: (d) => <span className="font-semibold">{fcfa(debtRemaining(db, d.id))}</span> },
            { key: "x", header: "", mobile: "meta", render: (d) => (d.status !== "soldee" && me.role === "patron" ? <Button size="sm" variant="quiet" onClick={(e) => { e.stopPropagation(); setRepayDebt(d.id); }}>Encaisser</Button> : null) },
          ]} />
      )}
      {tab === "charges" && (
        <DataTable rows={charges} rowKey={(c) => c.id} columns={[
          { key: "l", header: "Charge", mobile: "title", render: (c) => <span className="font-semibold">{c.label}</span> },
          { key: "b", header: "Bénéficiaire", mobile: "sub", render: (c) => c.beneficiary },
          { key: "cat", header: "Catégorie", mobile: "meta", render: (c) => <Badge tone="outline">{c.category}</Badge> },
          { key: "d", header: "Date", mobile: "meta", render: (c) => date(c.date) },
          { key: "on", header: "Débité sur", mobile: "meta", render: (c) => (c.debitedOn === "charges_patron" ? "Charges du patron" : "Solde du fournisseur") },
          { key: "a", header: "Montant", align: "right", mobile: "value", render: (c) => <span className="font-semibold">{fcfa(c.amount)}</span> },
        ]} />
      )}
      {exp && <ExpenseModal onClose={() => setExp(false)} />}
      {repayDebt && (() => {
        const d = db.debts.find((x) => x.id === repayDebt)!;
        return <RepayModal debtId={d.id} contractId={d.contractId} max={debtRemaining(db, d.id)} onClose={() => setRepayDebt(null)} run={run} />;
      })()}
    </>
  );
}

function RepayModal({ debtId, contractId, max, onClose, run }: { debtId: string; contractId: string; max: number; onClose: () => void; run: ReturnType<typeof useApp>["run"] }) {
  const { me } = useApp();
  const [amount, setAmount] = useState(String(max));
  const [mode, setMode] = useState<PaymentMode>("tmoney");
  const [ref, setRef] = useState("");
  return (
    <Modal open onClose={onClose} title="Encaisser un remboursement" sub={`Dette restante : ${fcfa(max)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={async () => {
        const r = await run(() => recordRepayment(me, contractId, { amount: Number(amount), mode, reference: ref || undefined, debtId }), "Remboursement encaissé", "La dette est mise à jour.");
        if (r) onClose();
      }}>Encaisser</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Montant (FCFA)"><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Mode"><Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}><option value="especes">Espèces</option><option value="flooz">Flooz</option><option value="tmoney">T-Money</option><option value="virement">Virement</option></Select></Field>
        <Field label="Référence" className="sm:col-span-2"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Référence Mobile Money saisie à la main" /></Field>
      </div>
    </Modal>
  );
}

function ExpenseModal({ onClose }: { onClose: () => void }) {
  const { db, me, run } = useApp();
  const [f, setF] = useState({ category: "maintenance" as "maintenance" | "commission" | "autre", label: "", amount: "", beneficiary: "", contractId: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Nouvelle charge" sub="Maintenance, commission ou autre sortie d'argent"
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={async () => {
        const r = await run(() => addExpense(me, { category: f.category, label: f.label, amount: Number(f.amount), beneficiary: f.beneficiary, contractId: f.contractId || undefined }), "Charge enregistrée");
        if (r) onClose();
      }}>Enregistrer</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Catégorie"><Select value={f.category} onChange={set("category")}><option value="maintenance">Maintenance</option><option value="commission">Commission</option><option value="autre">Autre</option></Select></Field>
        <Field label="Montant (FCFA)"><Input inputMode="numeric" value={f.amount} onChange={set("amount")} /></Field>
        <Field label="Libellé" className="sm:col-span-2"><Input value={f.label} onChange={set("label")} placeholder="ex. Révision du camion TG-5520-CA" /></Field>
        <Field label="Bénéficiaire"><Input value={f.beneficiary} onChange={set("beneficiary")} /></Field>
        <Field label="Contrat lié (facultatif)"><Select value={f.contractId} onChange={set("contractId")}><option value="">Aucun</option>{db.contracts.filter((c) => !c.deleted).map((c) => <option key={c.id} value={c.id}>{c.ref}</option>)}</Select></Field>
      </div>
    </Modal>
  );
}
