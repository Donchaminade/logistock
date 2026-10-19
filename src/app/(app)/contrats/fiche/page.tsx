"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Banknote, Camera, CheckCheck, Download, FileSignature, Gavel, HandCoins, PauseCircle, PlayCircle, Scale, ShieldAlert, ShieldCheck, SlidersHorizontal, Trash2, Truck, TrendingUp,
} from "lucide-react";
import { askReason, askText, confirm, fail, info, success, toast } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { AdvanceModal, ContractBadges, nameOf, PartialModal, ReceiptActions, RevisionModal, TransportModal, WithId } from "@/components/domain";
import { Badge, Button, Card, CardTitle, DataTable, Empty, Field, Input, KV, Modal, PageSkeleton, Photo, PhotoInput, Progress, Select, Tabs } from "@/components/ui";
import { ADJ_LABEL, commissionDue, isReceived, ledger, metrics, ruleOf } from "@/lib/calc";
import { contractPdf, download } from "@/lib/exports";
import { verifyRevision } from "@/lib/integrity";
import { date, dateTime, fcfa, group, modeLabel, prixKg, productLabel, tonnes } from "@/lib/format";
import { can, deleteMode } from "@/lib/permissions";
import type { Advance, Contract, PaymentMode, PriceRevision } from "@/lib/types";
import {
  ackRevision, addAdjustment, attachAdvancePhoto, calculateCommission, closeContract, disputeDelivery, markPartialSeen, recordRepayment,
  requestDelete, setContractCommissionRule, setContractSuspended, type CloseChoice,
} from "@/services/actions";

export default function Page() {
  return <WithId>{(id) => (id ? <Fiche id={id} /> : <PageSkeleton />)}</WithId>;
}

function Fiche({ id }: { id: string }) {
  const { db, me, run } = useApp();
  const router = useRouter();
  const sp = useSearchParams();
  const [modal, setModal] = useState<null | "advance" | "revision" | "partial" | "transport" | "settle">(null);
  const [photoFor, setPhotoFor] = useState<Advance | null>(null);
  const [tab, setTab] = useState<"remises" | "transports" | "livraisons" | "prix" | "commissions" | "releve">("remises");
  const c = db.contracts.find((x) => x.id === id);

  useEffect(() => {
    if (sp.get("remise") === "1" && c && me.role !== "fournisseur") setModal("advance");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const partial = c ? db.partials.filter((p) => p.contractId === c.id && !p.deleted).sort((a, b) => b.at.localeCompare(a.at))[0] : undefined;
  useEffect(() => {
    if (partial && !partial.seenByPatron && me.role === "patron") void markPartialSeen(me, partial.id);
  }, [partial, me]);

  if (!c || c.deleted || (me.role === "fournisseur" && c.supplierId !== me.id) || me.role === "chauffeur")
    return <Empty icon={<FileSignature className="size-5" />} title="Contrat introuvable" text="Il a peut-être été supprimé (annulation logique)." action={<Link href="/contrats/" className="text-[14px] font-semibold text-brand-700">Retour aux contrats</Link>} />;

  const m = metrics(db, c);
  const perms = db.settings[0]!.perms;
  const advances = db.advances.filter((a) => a.contractId === c.id && !a.deleted).sort((a, b) => b.date.localeCompare(a.date));
  const transports = db.transports.filter((t) => t.contractId === c.id && !t.deleted);
  const revisions = db.revisions.filter((r) => r.contractId === c.id).sort((a, b) => b.at.localeCompare(a.at));
  const lines = ledger(db, c);
  const active = c.status === "actif";
  const staff = me.role !== "fournisseur";
  const deliveries = db.deliveries.filter((d) => d.contractId === c.id && !d.deleted).sort((a, b) => b.weighedAt.localeCompare(a.weighedAt));
  const commissions = db.commissions.filter((x) => x.contractId === c.id && !x.deleted);
  const adjustments = db.adjustments.filter((x) => x.contractId === c.id && !x.deleted);
  const rule = ruleOf(db, c);
  const due = commissionDue(db, c);
  const unackedRev = me.role === "fournisseur" ? revisions.find((r) => !r.ackAt) : undefined;
  const dm = deleteMode(perms, me, "contrats");
  const pendingDel = db.pending.find((p) => p.entityId === c.id && p.status === "en_attente" && p.kind === "suppression");

  async function onDelete() {
    const queued = dm === "confirmation";
    const reason = await askReason({
      title: queued ? "Demander la suppression ?" : "Supprimer ce contrat ?",
      html: queued ? `La demande pour <b>${c!.ref}</b> partira dans « Actions à confirmer ». Elle n'aura d'effet qu'après validation du patron.` : `<b>${c!.ref}</b> sera masqué mais conservé (annulation logique), et tracé au journal d'audit.`,
      confirmText: queued ? "Envoyer la demande" : "Supprimer",
      dark: true,
    });
    if (!reason) return;
    const r = await run(() => requestDelete(me, "contrats", c!.id, `Contrat ${c!.ref} · ${nameOf(db, c!.supplierId)}`, reason));
    if (r === "queued") await info("Demande envoyée", "Le patron a reçu votre demande de suppression.");
    if (r === "deleted") {
      await success("Contrat supprimé", "Élément masqué, conservé dans le journal d'audit.");
      router.push("/contrats/");
    }
  }

  return (
    <>
      <div className="animate-in mb-6">
        <Link href="/contrats/" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" /> Contrats</Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-bold tracking-[-0.025em] sm:text-[28px]">{c.ref}</h1>
              <ContractBadges c={c} m={m} />
              {pendingDel && <Badge tone="outline">Suppression demandée</Badge>}
            </div>
            <p className="num mt-1 text-[14.5px] text-muted">{nameOf(db, c.supplierId)} · {productLabel[c.product]} · {tonnes(c.qtyKg)} à {prixKg(c.initialPrice)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {active && staff && can(perms, me, "remises", "c") && <Button icon={<Banknote className="size-4" />} onClick={() => setModal("advance")} data-testid="btn-advance">Remise d&apos;argent</Button>}
            {active && staff && (me.role === "patron" || can(perms, me, "revisions", "c")) && <Button variant={me.role === "patron" ? "dark" : "secondary"} icon={<TrendingUp className="size-4" />} onClick={() => setModal("revision")} data-testid="btn-revision">{me.role === "patron" ? "Ajuster le prix du reliquat" : "Proposer un nouveau prix"}</Button>}
            {active && can(perms, me, "partielles", "c") && <Button variant="secondary" icon={<Scale className="size-4" />} onClick={() => setModal("partial")} data-testid="btn-partial">Livraison partielle</Button>}
            {active && staff && can(perms, me, "transports", "c") && <Button variant="secondary" icon={<Truck className="size-4" />} onClick={() => setModal("transport")}>Nouveau transport</Button>}
            {(active || c.status === "suspendu") && me.role === "patron" && <Button variant="secondary" icon={<Gavel className="size-4" />} onClick={async () => {
              if (m.S === 0) {
                if (await confirm({ title: `Clôturer ${c.ref} ?`, html: "Le solde est nul : le contrat passera à « clos — soldé »." })) await run(() => closeContract(me, c.id, { mode: "solde" }), "Contrat clos — soldé");
              } else setModal("settle");
            }} data-testid="btn-settle">Solder</Button>}
            {me.role === "patron" && (active || c.status === "suspendu") && <Button variant="ghost" icon={active ? <PauseCircle className="size-4" /> : <PlayCircle className="size-4" />} onClick={async () => {
              const reason = await askReason({ title: active ? "Suspendre le contrat ?" : "Réactiver le contrat ?", html: active ? "Aucune nouvelle remise ni transport ne sera possible tant que le contrat est suspendu." : "Le contrat redevient actif.", confirmText: active ? "Suspendre" : "Réactiver", dark: true });
              if (reason) await run(() => setContractSuspended(me, c.id, active, reason), active ? "Contrat suspendu" : "Contrat réactivé");
            }}>{active ? "Suspendre" : "Réactiver"}</Button>}
            {me.role === "patron" && active && <Button variant="ghost" icon={<SlidersHorizontal className="size-4" />} onClick={async () => {
              const v = await askText({ title: "Ajustement du solde (J)", html: "Montant en FCFA. <b>Positif</b> : réduit ce que doit le fournisseur (perte acceptée, correction). <b>Négatif</b> : l'augmente. Le motif sera demandé ensuite ; l'opération est tracée.", placeholder: "ex. 50000", validate: (x) => (/^-?\d+$/.test(x.trim()) && Number(x) !== 0 ? undefined : "Montant entier non nul") });
              if (!v) return;
              const reason = await askReason({ title: "Motif de l'ajustement", confirmText: "Enregistrer l'ajustement", dark: true });
              if (reason) await run(() => addAdjustment(me, c.id, { amount: Number(v), reason }), "Ajustement enregistré", "Solde recalculé.");
            }} data-testid="btn-adjust">Ajustement J</Button>}
            <Button variant="ghost" icon={<Download className="size-4" />} onClick={() => { download(contractPdf(db, c), `LogiStock-${c.ref}.pdf`); toast("PDF du contrat généré", c.ref); }} data-testid="btn-contract-pdf">PDF</Button>
            {staff && dm !== "interdite" && !pendingDel && <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={onDelete} data-testid="btn-delete">{dm === "confirmation" ? "Demander la suppression" : "Supprimer"}</Button>}
          </div>
        </div>
      </div>

      {unackedRev && (
        <div className="animate-in mb-5 flex flex-col gap-3 rounded-2xl border border-brand-600 bg-brand-50/60 p-4 sm:flex-row sm:items-center sm:p-5" data-testid="ack-banner">
          <TrendingUp className="size-5 shrink-0 text-brand-700" />
          <div className="min-w-0 flex-1 text-[14px]"><b>Nouveau prix : {prixKg(unackedRev.newPrice)}</b> (au lieu de {prixKg(unackedRev.oldPrice)}), effet le {date(unackedRev.effectiveAt)}. Reste à livrer : {tonnes(unackedRev.remainderAfterKg)}.</div>
          <Button size="sm" icon={<CheckCheck className="size-4" />} onClick={() => run(() => ackRevision(me, unackedRev.id), "Lecture confirmée", "Le patron est informé.")} data-testid="btn-ack">J&apos;ai pris connaissance</Button>
        </div>
      )}

      {partial && (
        <div className="animate-in mb-5 flex flex-col gap-4 rounded-2xl border border-ink bg-white p-4 sm:flex-row sm:items-center sm:p-5" data-testid="partial-banner">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-white"><Scale className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold">Livraison partielle : {tonnes(partial.foundKg)} sur {tonnes(partial.contractedKg)} — reliquat {tonnes(partial.remainderKg)}</div>
            <div className="mt-0.5 text-[13px] text-muted">« {partial.reason} » · déclarée par {nameOf(db, partial.by)} le {dateTime(partial.at)}</div>
          </div>
          <Photo src={partial.proof} alt="Preuve de livraison partielle" className="size-16" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_1fr]">
        <section className="animate-in rounded-3xl bg-ink p-5 text-white sm:p-7" data-testid="calc-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[13px] text-white/55">Reste à livrer au prix en vigueur</div>
              <div className="num mt-1 text-[38px] font-bold leading-none tracking-[-0.035em]" data-testid="remaining">{tonnes(m.Q)}</div>
              <div className="num mt-1.5 text-[13px] text-white/55">{group(m.Q)} kg · arrondi au kg inférieur</div>
            </div>
            <div className="rounded-2xl bg-white/10 px-3.5 py-2.5 text-right">
              <div className="text-[11.5px] text-white/55">Prix en vigueur</div>
              <div className="num text-[17px] font-bold" data-testid="current-price">{prixKg(m.P)}</div>
            </div>
          </div>
          <div className="num mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/10 pt-5 sm:grid-cols-4">
            {[
              ["A · Avance versée", fcfa(m.A)],
              ["V · Livré valorisé", fcfa(m.V)],
              ["R · Remboursé", fcfa(m.R)],
              ["T · Transport imputé", fcfa(m.Tf)],
              ...(m.J ? [["J · Ajustements", fcfa(m.J)]] : []),
            ].map(([k, v]) => (
              <div key={k}><div className="text-[11.5px] text-white/50">{k}</div><div className="mt-0.5 text-[14.5px] font-semibold">{v}</div></div>
            ))}
          </div>
          <div className="num mt-5 rounded-2xl bg-white/[0.06] p-4 text-[13px] leading-relaxed text-white/80">
            <div>Solde S = A − V − R − J + T = {fcfa(m.A)} − {fcfa(m.V)}{m.R ? ` − ${fcfa(m.R)}` : ""}{m.J ? ` − ${fcfa(m.J)}` : ""}{m.Tf ? ` + ${fcfa(m.Tf)}` : ""} = <b className="text-white">{fcfa(m.S)}</b></div>
            <div className="mt-1">Reste à livrer Q = S / P = {group(Math.max(0, m.S))} / {m.P} = <b className="text-white">{group(m.Q)} kg</b></div>
          </div>
          <div className="mt-5">
            <div className="mb-1.5 flex justify-between text-[12px] text-white/55"><span>Réalisation (V / A)</span><span className="num">{m.realisation} % · {tonnes(m.deliveredKg)} livrées</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-brand-500" style={{ width: `${m.realisation}%` }} /></div>
          </div>
        </section>

        <Card className="animate-in">
          <CardTitle title="Contrat à la remise" sub="Engagements signés à la remise de l'argent" icon={<FileSignature className="size-[18px]" />} />
          <KV items={[
            { k: "Réception de l'argent", v: date(c.moneyReceivedDate) },
            { k: "Tonnes contractées", v: tonnes(c.qtyKg) },
            { k: "Montant", v: fcfa(c.amount) },
            { k: "Prix initial", v: prixKg(c.initialPrice) },
            { k: "Livraison prévue", v: date(c.deliveryDate) },
            { k: "Lieu de livraison", v: c.deliveryPlace },
            { k: "Transport", v: c.transportPaidByPatron ? "Payé par le patron" : "Non payé (fournisseur)" },
            { k: "Fournisseur", v: nameOf(db, c.supplierId) },
            { k: "Commission", v: rule ? rule.label : "Aucune" },
            { k: "Statut", v: c.status === "clos" ? `Clos (${c.closedAs})${c.carriedTo ? ` → ${db.contracts.find((x) => x.id === c.carriedTo)?.ref}` : ""}` : c.status },
          ]} />
          {adjustments.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-[12.5px]">
              {adjustments.map((a) => <li key={a.id} className="num flex justify-between gap-3 rounded-lg bg-canvas px-3 py-2"><span>{ADJ_LABEL[a.kind]} · {a.reason}</span><b>{fcfa(a.amount)}</b></li>)}
            </ul>
          )}
          {c.needId && <p className="mt-5 rounded-xl bg-canvas px-3.5 py-2.5 text-[12.5px] text-muted">Issu du besoin <b className="text-ink">{db.needs.find((n) => n.id === c.needId)?.ref}</b> et de la proposition validée le {date(db.offers.find((o) => o.id === c.offerId)?.decidedAt)}.</p>}
        </Card>
      </div>

      <div className="mt-8">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: "remises", label: "Remises d'argent", count: advances.length },
          { value: "transports", label: "Transports et lots", count: transports.length },
          { value: "livraisons", label: "Livraisons", count: deliveries.length },
          { value: "prix", label: "Historique des prix", count: revisions.length + 1 },
          { value: "commissions", label: "Commissions", count: commissions.length },
          { value: "releve", label: "Relevé", count: lines.length },
        ]} />
        {tab === "remises" && (
          advances.length === 0 ? (
            <Empty icon={<Banknote className="size-5" />} title="Aucune remise d'argent" text="Enregistrez la remise en espèces pour générer le reçu PDF." action={active && staff && can(perms, me, "remises", "c") && <Button size="sm" onClick={() => setModal("advance")}>Remise d&apos;argent</Button>} />
          ) : (
            <ul className="space-y-3" data-testid="advances">
              {advances.map((a) => (
                <li key={a.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                  {a.photo ? <Photo src={a.photo} alt={`Photo de la remise ${a.receiptNo}`} className="size-16 shrink-0" /> : <div className="grid size-16 shrink-0 place-items-center rounded-xl border border-dashed border-line-2 text-subtle"><Camera className="size-5" /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num text-[16px] font-bold">{fcfa(a.amount)}</span>
                      {a.kind === "complement" && <Badge tone="blue">Complément de prix</Badge>}
                      {a.status === "validee" && <Badge tone="ok">Validé</Badge>}
                      {a.status === "a_completer" && <Badge tone="err">À compléter</Badge>}
                      {a.status === "annulee" && <Badge tone="gray">Annulé</Badge>}
                    </div>
                    <div className="num mt-1 text-[13px] text-muted">{a.receiptNo} · {tonnes(a.qtyKg)} à {prixKg(a.unitPrice)} · {modeLabel[a.mode]} · {dateTime(a.date)} · par {nameOf(db, a.by)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.status === "a_completer" && can(perms, me, "remises", "u") && <Button size="sm" icon={<Camera className="size-3.5" />} onClick={() => setPhotoFor(a)}>Joindre la photo</Button>}
                    <ReceiptActions adv={a} compact />
                    {a.status === "annulee" && a.cancelReason && <span className="self-center text-[12px] text-muted">Motif : {a.cancelReason}</span>}
                    {a.status !== "annulee" && staff && deleteMode(perms, me, "remises") !== "interdite" && (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        const queued = deleteMode(perms, me, "remises") === "confirmation";
                        const reason = await askReason({ title: queued ? "Demander l'annulation ?" : "Annuler ce versement ?", html: "Un versement ne s'efface jamais : l'annulation est une contre-écriture tracée.", confirmText: queued ? "Envoyer la demande" : "Annuler le versement", dark: true });
                        if (reason) {
                          const r = await run(() => requestDelete(me, "remises", a.id, `Remise ${a.receiptNo} · ${fcfa(a.amount)}`, reason));
                          if (r) await (r === "queued" ? info("Demande envoyée", "Le patron validera l'annulation.") : success("Versement annulé", "Contre-écriture enregistrée."));
                        }
                      }}>{deleteMode(perms, me, "remises") === "confirmation" ? "Demander l'annulation" : "Annuler"}</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
        {tab === "transports" && (
          <DataTable rows={transports} rowKey={(t) => t.id} onRow={(t) => router.push(`/transports/fiche/?id=${t.id}`)}
            empty={<Empty icon={<Truck className="size-5" />} title="Aucun transport" text="Chaque transport forme un lot suivi de son origine jusqu'à Lomé." />}
            columns={[
              { key: "ref", header: "Lot / transport", mobile: "title", render: (t) => <span className="font-semibold">{t.ref}</span> },
              { key: "route", header: "Trajet", mobile: "sub", render: (t) => `${t.origin} → Lomé` },
              { key: "veh", header: "Véhicule", mobile: "meta", render: (t) => `${t.vehicle} · ${t.driver}` },
              { key: "tons", header: "Tonnes", align: "right", mobile: "value", render: (t) => tonnes(t.tonsKg) },
              { key: "st", header: "Statut", mobile: "meta", render: (t) => <Badge tone={t.status === "receptionne" ? "dark" : "blue"}>{t.status === "en_route" ? "En route" : t.status === "arrive" ? "Pointé à Lomé" : "Réceptionné"}</Badge> },
            ]} />
        )}
        {tab === "livraisons" && (
          <DataTable rows={deliveries} rowKey={(d) => d.id}
            empty={<Empty icon={<Scale className="size-5" />} title="Aucune livraison" text="Les pesées du magasin apparaissent ici ; le prix est figé à la réception." />}
            columns={[
              { key: "t", header: "Ticket", mobile: "title", render: (d) => <span className="font-semibold">{d.ticketNo}</span> },
              { key: "w", header: "Pesée", mobile: "sub", render: (d) => `${date(d.weighedAt)} · brut ${group(d.grossKg)} − tare ${group(d.tareKg)} · ${d.bags} sacs` },
              { key: "s", header: "Statut", mobile: "meta", render: (d) => d.status === "pesee" ? <Badge tone="outline">Pesée, à réceptionner</Badge> : d.status === "contestee" ? <Badge tone="err">Contestée</Badge> : <Badge tone="ok">Réceptionnée</Badge> },
              { key: "p", header: "Prix figé", align: "right", mobile: "meta", render: (d) => (isReceived(d) ? prixKg(d.price) : "—") },
              { key: "n", header: "Net", align: "right", mobile: "value", render: (d) => <span className="font-semibold">{tonnes(d.netKg)}</span> },
              { key: "x", header: "", mobile: "meta", render: (d) => d.status === "receptionnee" && me.role === "fournisseur" ? <Button size="sm" variant="ghost" icon={<ShieldAlert className="size-3.5" />} onClick={async (e) => { e.stopPropagation(); const r = await askReason({ title: `Contester ${d.ticketNo} ?`, html: "Le patron et le magasinier sont alertés. La livraison reste comptée jusqu'à résolution.", confirmText: "Contester", dark: true }); if (r) await run(() => disputeDelivery(me, d.id, r), "Contestation envoyée"); }}>Contester</Button> : d.disputeReason ? <span className="text-[12px] text-muted">« {d.disputeReason} »</span> : null },
            ]} />
        )}
        {tab === "prix" && (
          <ul className="space-y-3">
            {revisions.map((r) => <RevisionItem key={r.id} r={r} />)}
            <li className="card p-4 sm:p-5"><span className="num text-[15px] font-bold">{prixKg(c.initialPrice)}</span> <span className="text-[13px] text-muted">· prix contractuel initial, {date(c.createdAt)}</span></li>
          </ul>
        )}
        {tab === "commissions" && (
          <div className="space-y-4">
            <Card>
              <CardTitle title="Règle du contrat" sub={rule ? rule.label : "Aucune règle de commission"} icon={<HandCoins className="size-[18px]" />}
                action={can(perms, me, "commissions", "u") ? (
                  <Select value={c.commissionRuleId ?? ""} onChange={(e) => run(() => setContractCommissionRule(me, c.id, e.target.value || undefined), "Règle mise à jour")} className="!h-9 !w-auto">
                    <option value="">Aucune</option>
                    {db.settings[0]!.commissionRules.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </Select>
                ) : undefined} />
              {due && (
                <div className="num flex flex-col gap-3 rounded-xl bg-canvas p-4 text-[13.5px] sm:flex-row sm:items-center sm:justify-between">
                  <div>À calculer depuis la précédente : base {group(due.baseKg)} kg · {fcfa(due.baseValue)} → <b>{fcfa(due.amount)}</b> ({due.rule.settlement === "deduite" ? "déduite du solde" : "versée à part"})</div>
                  {can(perms, me, "commissions", "c") && due.amount > 0 && <Button size="sm" onClick={() => run(() => calculateCommission(me, c.id), "Commission calculée", "À valider puis payer dans Commissions.")} data-testid="btn-calc-commission">Calculer</Button>}
                </div>
              )}
            </Card>
            <DataTable rows={commissions} rowKey={(x) => x.id} onRow={() => router.push("/commissions/")}
              empty={<Empty icon={<HandCoins className="size-5" />} title="Aucune commission" />}
              columns={[
                { key: "d", header: "Calculée le", mobile: "sub", render: (x) => date(x.calculatedAt) },
                { key: "b", header: "Base", mobile: "title", render: (x) => `${group(x.baseKg)} kg · ${fcfa(x.baseValue)}` },
                { key: "s", header: "Statut", mobile: "meta", render: (x) => <Badge tone={x.status === "payee" ? "ok" : x.status === "validee" ? "blue" : "outline"}>{x.status === "payee" ? "Payée" : x.status === "validee" ? "Validée" : "Calculée"}</Badge> },
                { key: "a", header: "Montant", align: "right", mobile: "value", render: (x) => <span className="font-semibold">{fcfa(x.amount)}</span> },
              ]} />
          </div>
        )}
        {tab === "releve" && (
          <DataTable rows={lines} rowKey={(l) => l.date + l.label}
            empty={<Empty icon={<Scale className="size-5" />} title="Aucune écriture" />}
            columns={[
              { key: "d", header: "Date", mobile: "sub", render: (l) => date(l.date) },
              { key: "l", header: "Opération", mobile: "title", render: (l) => l.label },
              { key: "db", header: "Débit", align: "right", mobile: "meta", render: (l) => (l.debit ? fcfa(l.debit) : "—") },
              { key: "cr", header: "Crédit", align: "right", mobile: "meta", render: (l) => (l.credit ? fcfa(l.credit) : "—") },
              { key: "b", header: "Solde courant", align: "right", mobile: "value", render: (l) => <span className="font-semibold">{fcfa(l.balance)}</span> },
            ]} />
        )}
      </div>

      {modal === "advance" && <AdvanceModal open onClose={() => setModal(null)} contract={c} />}
      {modal === "revision" && <RevisionModal open onClose={() => setModal(null)} contract={c} />}
      {modal === "partial" && <PartialModal open onClose={() => setModal(null)} contract={c} />}
      {modal === "transport" && <TransportModal open onClose={() => setModal(null)} contractId={c.id} onDone={(tid) => router.push(`/transports/fiche/?id=${tid}`)} />}
      {modal === "settle" && <SettleModal contract={c} onClose={() => setModal(null)} />}
      {photoFor && <AttachPhoto adv={photoFor} onClose={() => setPhotoFor(null)} />}
    </>
  );
}

function AttachPhoto({ adv, onClose }: { adv: Advance; onClose: () => void }) {
  const { me, run } = useApp();
  const [photo, setPhoto] = useState<string>();
  return (
    <Modal open onClose={onClose} title="Joindre la photo de la remise" sub={`${adv.receiptNo} · ${fcfa(adv.amount)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={!photo} onClick={async () => {
        const r = await run(() => attachAdvancePhoto(me, adv.id, photo!), "Versement validé", "La photo de la remise est jointe.");
        if (r !== undefined) onClose();
      }}>Valider le versement</Button></>}>
      <PhotoInput label="Photo de la remise d'argent" value={photo} onChange={setPhoto} />
    </Modal>
  );
}

function RevisionItem({ r }: { r: PriceRevision }) {
  const { db } = useApp();
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void verifyRevision(r).then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, [r]);
  return (
    <li className="card p-4 sm:p-5" data-testid="revision-item">
      <div className="flex flex-wrap items-center gap-2">
        <span className="num text-[15px] font-bold">{prixKg(r.oldPrice)} → {prixKg(r.newPrice)}</span>
        <Badge tone="blue">Reliquat · option {r.option}</Badge>
        {ok === true && <Badge tone="ok">Signature vérifiée</Badge>}
        {ok === false && <Badge tone="err">Signature invalide</Badge>}
        {r.ackAt ? <Badge tone="outline">Lue par le fournisseur le {date(r.ackAt)}</Badge> : <Badge tone="outline">Non encore lue</Badge>}
      </div>
      <div className="num mt-1 text-[13px] text-muted">Reste à livrer {tonnes(r.remainderBeforeKg)} → <b className="text-ink">{tonnes(r.remainderAfterKg)}</b>{r.complement ? ` · complément ${fcfa(r.complement)}` : ""} · effet le {date(r.effectiveAt)} · « {r.reason} »</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-subtle">
        <ShieldCheck className="size-3.5" /> {dateTime(r.at)} · par {nameOf(db, r.by)}
        <span>· SHA-256 <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink">{r.hash.slice(0, 16)}…</code></span>
        <span>· Ed25519 <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink">{r.signature.slice(0, 16)}…</code></span>
      </div>
    </li>
  );
}

function SettleModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const { db, me, run } = useApp();
  const m = metrics(db, contract);
  const over = m.S < 0;
  const others = db.contracts.filter((x) => x.id !== contract.id && x.supplierId === contract.supplierId && x.status === "actif" && !x.deleted);
  type T = "remb" | "rembourse" | "dette" | "reporte" | "regle";
  const [tab, setTab] = useState<T>(over ? "regle" : "remb");
  const [amount, setAmount] = useState(String(Math.abs(m.S)));
  const [kind, setKind] = useState<"remboursement" | "marchandise">("remboursement");
  const [qty, setQty] = useState("");
  const [mode, setMode] = useState<PaymentMode>("especes");
  const [ref, setRef] = useState("");
  const [photo, setPhoto] = useState<string>();
  const [target, setTarget] = useState(others[0]?.id ?? "");
  const [due, setDue] = useState(new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10));

  async function close(choice: CloseChoice, title: string, html: string, okTitle: string) {
    if (!(await confirm({ title, html, confirmText: "Confirmer", dark: true }))) return;
    const r = await run(() => closeContract(me, contract.id, choice), okTitle, "Opération tracée au journal d'audit.");
    if (r) onClose();
  }
  const tabs: { value: T; label: string }[] = over
    ? [{ value: "regle", label: "Régler le trop-livré" }, { value: "reporte", label: "Reporter en avance" }]
    : [{ value: "remb", label: "Remboursement partiel" }, { value: "rembourse", label: "Clore : remboursé" }, { value: "reporte", label: "Clore : report" }, { value: "dette", label: "Clore : dette" }];
  const sup = nameOf(db, contract.supplierId);
  const footer = {
    remb: <Button onClick={async () => { const r = await run(() => recordRepayment(me, contract.id, { kind, amount: kind === "remboursement" ? Number(amount) : undefined, qtyKg: kind === "marchandise" ? Math.round(Number(qty.replace(",", ".")) * 1000) : undefined, mode, reference: ref || undefined, photo }), "Remboursement enregistré", "Le solde est recalculé."); if (r) onClose(); }}>Enregistrer le remboursement</Button>,
    rembourse: <Button variant="dark" onClick={() => close({ mode: "rembourse", payMode: mode, reference: ref || undefined }, "Clore : solde remboursé ?", `${sup} rembourse <b>${fcfa(m.S)}</b> et le contrat est clos.`, "Contrat clos — remboursé")}>Encaisser et clore</Button>,
    reporte: <Button variant="dark" disabled={!target} onClick={() => close({ mode: "reporte", targetContractId: target }, "Reporter le solde ?", `${fcfa(Math.abs(m.S))} seront transférés vers <b>${db.contracts.find((x) => x.id === target)?.ref}</b> (transfert tracé entre contrats, jamais une simple modification de chiffre).`, "Solde reporté")}>Reporter et clore</Button>,
    dette: <Button variant="dark" onClick={() => close({ mode: "dette", dueDate: new Date(due).toISOString() }, "Passer le solde en dette ?", `${fcfa(m.S)} deviendront une dette de ${sup}, échéance le ${date(new Date(due).toISOString())}. Le contrat sera clos.`, "Solde passé en dette")}>Clore et passer en dette</Button>,
    regle: <Button variant="dark" onClick={() => close({ mode: "trop_livre_regle", payMode: mode, reference: ref || undefined }, "Régler le trop-livré ?", `Le patron verse <b>${fcfa(-m.S)}</b> à ${sup} et le contrat est clos — soldé.`, "Trop-livré réglé")}>Verser et clore</Button>,
  }[tab];
  const payFields = (
    <>
      <Field label="Mode"><Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}><option value="especes">Espèces</option><option value="flooz">Flooz</option><option value="tmoney">T-Money</option><option value="virement">Virement</option></Select></Field>
      <Field label="Référence"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Référence Mobile Money (facultative)" /></Field>
    </>
  );
  return (
    <Modal open onClose={onClose} title={`Solder ${contract.ref}`} wide sub={over ? `Trop-livré : le patron doit ${fcfa(-m.S)} au fournisseur` : `Solde restant : ${fcfa(m.S)} · reste à livrer ${tonnes(m.Q)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button>{footer}</>}>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === "remb" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nature du remboursement" className="sm:col-span-2"><Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="remboursement">En argent</option><option value="marchandise">En marchandise (valorisée au prix en vigueur)</option></Select></Field>
          {kind === "remboursement" ? <Field label="Montant reçu (FCFA)"><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            : <Field label="Quantité livrée (tonnes)" hint={qty ? `≈ ${fcfa(Math.round(Number(qty.replace(",", ".")) * 1000) * m.P)} à ${prixKg(m.P)}` : undefined}><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>}
          {payFields}
          <div className="sm:col-span-2"><PhotoInput label="Justificatif" value={photo} onChange={setPhoto} /></div>
        </div>
      )}
      {(tab === "rembourse" || tab === "regle") && <div className="grid gap-4 sm:grid-cols-2">{payFields}</div>}
      {tab === "reporte" && (
        others.length ? (
          <Field label="Contrat qui reçoit le report" hint={over ? "Le trop-livré devient une avance sur ce contrat." : "Le solde dû s'ajoute à ce contrat."}>
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>{others.map((x) => <option key={x.id} value={x.id}>{x.ref} · {productLabel[x.product]} · {tonnes(x.qtyKg)}</option>)}</Select>
          </Field>
        ) : <p className="text-[13.5px] text-muted">Aucun autre contrat actif pour {sup} : créez d&apos;abord le nouveau contrat.</p>
      )}
      {tab === "dette" && (
        <div className="space-y-4">
          <p className="text-[13.5px] text-muted">Le contrat passe à « clos — en dette ». Les remboursements partiels (argent ou marchandise) réduiront la dette ; son statut évolue automatiquement.</p>
          <Field label="Échéance de remboursement"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
      )}
    </Modal>
  );
}
