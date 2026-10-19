"use client";
import { useState } from "react";
import { Check, Plus, Wrench, X } from "lucide-react";
import { askReason, confirm } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { nameOf } from "@/components/domain";
import { Badge, Button, Card, CardTitle, DataTable, Empty, Field, Input, Modal, PageHeader, Photo, PhotoInput, Select, Stat, Tabs } from "@/components/ui";
import { date, fcfa } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Expense } from "@/lib/types";
import { addExpense, decideExpense } from "@/services/actions";

const CATEGORY: Record<Expense["category"], string> = { transport: "Transport", maintenance: "Maintenance", commission: "Commission", frais_vehicule: "Frais de route", autre: "Autre" };

export default function Charges() {
  const { db, me, run } = useApp();
  const perms = db.settings[0]!.perms;
  const [tab, setTab] = useState<"toutes" | Expense["category"]>("toutes");
  const [open, setOpen] = useState(false);
  const all = db.expenses.filter((e) => !e.deleted).sort((a, b) => b.date.localeCompare(a.date));
  const toValidate = all.filter((e) => e.status === "a_valider");
  const counted = all.filter((e) => e.status !== "refusee" && e.status !== "a_valider");
  const rows = all.filter((e) => tab === "toutes" || e.category === tab);
  const decider = me.role === "patron" || me.role === "admin";
  const byVehicle = Object.entries(counted.filter((e) => e.vehicle).reduce<Record<string, number>>((m, e) => ({ ...m, [e.vehicle!]: (m[e.vehicle!] ?? 0) + e.amount }), {}));

  return (
    <>
      <PageHeader eyebrow="Finances" title="Maintenance et charges" sub="Transport débité au pointage, maintenance, commissions versées et frais de route déclarés par les chauffeurs (à valider)."
        actions={can(perms, me, "charges", "c") && <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)} data-testid="btn-new-expense">Nouvelle charge</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Charges du patron" value={fcfa(counted.filter((c) => c.debitedOn === "charges_patron").reduce((s, c) => s + c.amount, 0))} />
        <Stat label="Imputé aux fournisseurs" value={fcfa(counted.filter((c) => c.debitedOn === "solde_fournisseur").reduce((s, c) => s + c.amount, 0))} hint="Transport non payé" />
        <Stat label="Maintenance" value={fcfa(counted.filter((c) => c.category === "maintenance" || c.category === "frais_vehicule").reduce((s, c) => s + c.amount, 0))} />
        <Stat label="Frais à valider" value={String(toValidate.length)} hint={fcfa(toValidate.reduce((s, c) => s + c.amount, 0))} />
      </div>
      {toValidate.length > 0 && (
        <Card className="mb-6">
          <CardTitle title="Frais de route à valider" sub="Déclarés par les chauffeurs, avec justificatif" />
          <ul className="divide-y divide-line">
            {toValidate.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-3" data-testid={`expense-${e.id}`}>
                {e.photo ? <Photo src={e.photo} alt={e.label} className="size-11" /> : <span className="grid size-11 place-items-center rounded-xl bg-canvas"><Wrench className="size-4 text-muted" /></span>}
                <div className="min-w-0 flex-1"><div className="font-semibold">{e.label}</div><div className="text-[12.5px] text-muted">{nameOf(db, e.by)} · {e.vehicle ?? "—"} · {date(e.date)}</div></div>
                <span className="num font-semibold">{fcfa(e.amount)}</span>
                {decider && <span className="flex gap-1.5">
                  <Button size="sm" icon={<Check className="size-3.5" />} data-testid="expense-approve" onClick={async () => { if (await confirm({ title: "Valider ces frais ?", html: `${e.label} · <b>${fcfa(e.amount)}</b> en charge du patron.`, confirmText: "Valider" })) await run(() => decideExpense(me, e.id, true), "Frais validés"); }}>Valider</Button>
                  <Button size="sm" variant="secondary" icon={<X className="size-3.5" />} onClick={async () => { const r = await askReason({ title: "Refuser ces frais ?", confirmText: "Refuser", dark: true }); if (r) await run(() => decideExpense(me, e.id, false, r), "Frais refusés"); }}>Refuser</Button>
                </span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "toutes", label: "Toutes", count: all.length }, ...(["transport", "maintenance", "frais_vehicule", "commission", "autre"] as const).map((k) => ({ value: k, label: CATEGORY[k], count: all.filter((e) => e.category === k).length }))]} />
      <DataTable rows={rows} rowKey={(c) => c.id} empty={<Empty icon={<Wrench className="size-5" />} title="Aucune charge" />} columns={[
        { key: "l", header: "Charge", mobile: "title", render: (c) => <span className="font-semibold">{c.label}</span> },
        { key: "b", header: "Bénéficiaire", mobile: "sub", render: (c) => `${c.beneficiary}${c.vehicle ? ` · ${c.vehicle}` : ""}` },
        { key: "cat", header: "Catégorie", mobile: "meta", render: (c) => <Badge tone="outline">{CATEGORY[c.category]}</Badge> },
        { key: "d", header: "Date", mobile: "meta", render: (c) => date(c.date) },
        { key: "on", header: "Débité sur", mobile: "meta", render: (c) => (c.debitedOn === "charges_patron" ? "Charges du patron" : "Solde du fournisseur") },
        { key: "s", header: "Statut", mobile: "meta", render: (c) => (c.status === "a_valider" ? <Badge tone="blue">À valider</Badge> : c.status === "refusee" ? <Badge tone="err">Refusée</Badge> : <Badge tone="ok">Comptée</Badge>) },
        { key: "a", header: "Montant", align: "right", mobile: "value", render: (c) => <span className="font-semibold">{fcfa(c.amount)}</span> },
      ]} />
      {byVehicle.length > 0 && (
        <Card className="mt-6">
          <CardTitle title="Coût par véhicule" sub="Maintenance et frais de route comptés" />
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{byVehicle.map(([v, a]) => <li key={v} className="rounded-xl bg-canvas px-4 py-3"><div className="font-mono text-[13px]">{v}</div><div className="num font-semibold">{fcfa(a)}</div></li>)}</ul>
        </Card>
      )}
      {open && <ExpenseModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ExpenseModal({ onClose }: { onClose: () => void }) {
  const { db, me, run } = useApp();
  const [f, setF] = useState({ category: "maintenance" as "maintenance" | "commission" | "autre", label: "", amount: "", beneficiary: "", contractId: "", vehicle: "", photo: undefined as string | undefined });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Nouvelle charge" sub="Maintenance, commission ou autre sortie d'argent"
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button data-testid="expense-submit" onClick={async () => {
        const r = await run(() => addExpense(me, { category: f.category, label: f.label, amount: Number(f.amount), beneficiary: f.beneficiary, contractId: f.contractId || undefined, vehicle: f.vehicle || undefined, photo: f.photo }), "Charge enregistrée");
        if (r) onClose();
      }}>Enregistrer</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Catégorie"><Select value={f.category} onChange={set("category")}><option value="maintenance">Maintenance</option><option value="commission">Commission</option><option value="autre">Autre</option></Select></Field>
        <Field label="Montant (FCFA)"><Input inputMode="numeric" value={f.amount} onChange={set("amount")} name="amount" /></Field>
        <Field label="Libellé" className="sm:col-span-2"><Input value={f.label} onChange={set("label")} placeholder="ex. Révision du camion TG-5520-CA" name="label" /></Field>
        <Field label="Bénéficiaire"><Input value={f.beneficiary} onChange={set("beneficiary")} /></Field>
        <Field label="Véhicule (facultatif)"><Select value={f.vehicle} onChange={set("vehicle")}><option value="">Aucun</option>{db.vehicles.filter((v) => !v.deleted).map((v) => <option key={v.id} value={v.plate}>{v.plate}</option>)}</Select></Field>
        <Field label="Contrat lié (facultatif)"><Select value={f.contractId} onChange={set("contractId")}><option value="">Aucun</option>{db.contracts.filter((c) => !c.deleted).map((c) => <option key={c.id} value={c.id}>{c.ref}</option>)}</Select></Field>
        <div><PhotoInput label="Justificatif (facultatif)" value={f.photo} onChange={(photo) => setF({ ...f, photo })} /></div>
      </div>
    </Modal>
  );
}
