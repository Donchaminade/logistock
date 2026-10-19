"use client";
import { useState } from "react";
import Link from "next/link";
import { BadgePercent, Calculator, CheckCircle2, HandCoins } from "lucide-react";
import { confirm } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { nameOf } from "@/components/domain";
import { Badge, Button, DataTable, Empty, Field, Input, Modal, PageHeader, Select, Stat, Tabs } from "@/components/ui";
import { commissionDue } from "@/lib/calc";
import { dateTime, fcfa, ruleText, tonnes } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Commission, PaymentMode } from "@/lib/types";
import { calculateCommission, payCommission, validateCommission } from "@/services/actions";

const STATUS = { calculee: "Calculée", validee: "Validée", payee: "Payée" } as const;

export default function Commissions() {
  const { db, me, run } = useApp();
  const perms = db.settings[0]!.perms;
  const [tab, setTab] = useState<"a_calculer" | "suivi">(me.role === "fournisseur" ? "suivi" : "a_calculer");
  const [pay, setPay] = useState<Commission | null>(null);
  const mine = (supplierId: string) => me.role !== "fournisseur" || supplierId === me.id;
  const decider = me.role === "patron" || me.role === "admin";
  const rules = db.settings[0]!.commissionRules;
  const contracts = db.contracts.filter((c) => !c.deleted && c.commissionRuleId && mine(c.supplierId));
  const due = contracts.map((c) => ({ c, d: commissionDue(db, c)! })).filter((x) => x.d);
  const list = db.commissions.filter((x) => !x.deleted && mine(x.beneficiaryId)).sort((a, b) => b.calculatedAt.localeCompare(a.calculatedAt));
  const sum = (s: Commission["status"]) => list.filter((x) => x.status === s).reduce((t, x) => t + x.amount, 0);

  return (
    <>
      <PageHeader eyebrow="Finances" title="Commissions" sub="Cycle complet (§1.8) : calcul sur les livraisons réceptionnées → validation → paiement (versée à part ou déduite du solde)." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="À calculer" value={fcfa(due.reduce((s, x) => s + Math.max(0, x.d.amount), 0))} hint={`${due.filter((x) => x.d.amount > 0).length} contrat(s)`} />
        <Stat label="Calculées" value={fcfa(sum("calculee"))} hint="En attente de validation" />
        <Stat label="Validées" value={fcfa(sum("validee"))} hint="À payer" />
        <Stat label="Payées" value={fcfa(sum("payee"))} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "a_calculer", label: "Par contrat", count: due.length }, { value: "suivi", label: "Suivi des commissions", count: list.length }]} />
      {tab === "a_calculer" && (
        <DataTable rows={due} rowKey={(x) => x.c.id} empty={<Empty icon={<BadgePercent className="size-5" />} title="Aucun contrat commissionné" text="Attachez une règle de commission dans la fiche du contrat." />} columns={[
          { key: "r", header: "Contrat", mobile: "title", render: ({ c }) => <Link href={`/contrats/fiche/?id=${c.id}`} className="font-semibold text-brand-700 hover:underline">{c.ref}</Link> },
          { key: "b", header: "Bénéficiaire", mobile: "sub", render: ({ c }) => nameOf(db, c.supplierId) },
          { key: "rule", header: "Règle", mobile: "meta", render: ({ d }) => `${d.rule.label} (${ruleText(d.rule)})` },
          { key: "base", header: "Nouvelle base", mobile: "meta", render: ({ d }) => `${tonnes(d.baseKg)} · ${fcfa(d.baseValue)}` },
          { key: "m", header: "Montant dû", align: "right", mobile: "value", render: ({ d }) => <span className="font-semibold">{fcfa(Math.max(0, d.amount))}</span> },
          { key: "x", header: "", mobile: "meta", render: ({ c, d }) => (can(perms, me, "commissions", "c") && d.amount > 0 ? <Button size="sm" icon={<Calculator className="size-3.5" />} data-testid={`calc-${c.ref}`} onClick={() => run(() => calculateCommission(me, c.id), "Commission calculée", `${fcfa(d.amount)} · à valider`)}>Calculer</Button> : <span className="text-[12.5px] text-subtle">À jour</span>) },
        ]} />
      )}
      {tab === "suivi" && (
        <DataTable rows={list} rowKey={(x) => x.id} empty={<Empty icon={<BadgePercent className="size-5" />} title="Aucune commission" />} columns={[
          { key: "c", header: "Contrat", mobile: "title", render: (x) => db.contracts.find((c) => c.id === x.contractId)?.ref },
          { key: "b", header: "Bénéficiaire", mobile: "sub", render: (x) => `${nameOf(db, x.beneficiaryId)} · ${rules.find((r) => r.id === x.ruleId)?.label ?? "—"}` },
          { key: "base", header: "Base", mobile: "meta", render: (x) => `${tonnes(x.baseKg)} · ${fcfa(x.baseValue)}` },
          { key: "d", header: "Calculée le", mobile: "meta", render: (x) => dateTime(x.calculatedAt) },
          { key: "s", header: "Statut", mobile: "meta", render: (x) => <Badge tone={x.status === "payee" ? "ok" : x.status === "validee" ? "blue" : "outline"}>{STATUS[x.status]}{x.status === "payee" && x.mode === "deduction" ? " · déduite" : ""}</Badge> },
          { key: "a", header: "Montant", align: "right", mobile: "value", render: (x) => <span className="font-semibold">{fcfa(x.amount)}</span> },
          { key: "x", header: "", mobile: "meta", render: (x) => !decider ? null : x.status === "calculee" ? (
            <Button size="sm" variant="secondary" icon={<CheckCircle2 className="size-3.5" />} data-testid={`validate-${x.id}`} onClick={async () => { if (await confirm({ title: "Valider la commission ?", html: `<b>${fcfa(x.amount)}</b> pour ${nameOf(db, x.beneficiaryId)}.`, confirmText: "Valider" })) await run(() => validateCommission(me, x.id), "Commission validée"); }}>Valider</Button>
          ) : x.status === "validee" ? (
            <Button size="sm" icon={<HandCoins className="size-3.5" />} data-testid={`pay-${x.id}`} onClick={() => setPay(x)}>Payer</Button>
          ) : null },
        ]} />
      )}
      {pay && <PayModal cm={pay} onClose={() => setPay(null)} />}
    </>
  );
}

function PayModal({ cm, onClose }: { cm: Commission; onClose: () => void }) {
  const { db, me, run } = useApp();
  const rule = db.settings[0]!.commissionRules.find((r) => r.id === cm.ruleId);
  const deduite = rule?.settlement === "deduite";
  const [mode, setMode] = useState<PaymentMode>("tmoney");
  const [ref, setRef] = useState("");
  return (
    <Modal open onClose={onClose} title="Payer la commission" sub={`${fcfa(cm.amount)} · ${nameOf(db, cm.beneficiaryId)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button data-testid="pay-submit" onClick={async () => { const r = await run(() => payCommission(me, cm.id, { mode, reference: ref || undefined }).then(() => true), "Commission payée", deduite ? "Déduite du solde de l'acheteur (ajustement J)." : "Inscrite dans les charges du patron."); if (r) onClose(); }}>{deduite ? "Déduire du solde" : "Enregistrer le paiement"}</Button></>}>
      {deduite ? (
        <p className="text-[14px] text-muted">Règle « {rule?.label} » : la commission est <b className="text-ink">déduite du solde</b> du fournisseur (ajustement J positif). Aucune sortie d&apos;argent.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mode"><Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}><option value="especes">Espèces</option><option value="tmoney">T-Money</option><option value="flooz">Flooz</option><option value="virement">Virement</option></Select></Field>
          <Field label="Référence (facultatif)"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        </div>
      )}
    </Modal>
  );
}
