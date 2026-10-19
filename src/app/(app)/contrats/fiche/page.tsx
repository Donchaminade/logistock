"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Banknote, Camera, FileSignature, Gavel, Scale, ShieldCheck, Trash2, Truck, TrendingUp,
} from "lucide-react";
import { askReason, confirm, info, success } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { AdvanceModal, ContractBadges, nameOf, PartialModal, ReceiptActions, RevisionModal, TransportModal, WithId } from "@/components/domain";
import { Badge, Button, Card, CardTitle, DataTable, Empty, Field, Input, KV, Modal, PageSkeleton, Photo, PhotoInput, Progress, Select, Tabs } from "@/components/ui";
import { ledger, metrics } from "@/lib/calc";
import { date, dateTime, fcfa, group, modeLabel, prixKg, productLabel, tonnes } from "@/lib/format";
import { can, deleteMode } from "@/lib/permissions";
import type { Advance, Contract, PaymentMode } from "@/lib/types";
import { attachAdvancePhoto, closeContract, markPartialSeen, recordRepayment, requestDelete } from "@/services/actions";

export default function Page() {
  return <WithId>{(id) => (id ? <Fiche id={id} /> : <PageSkeleton />)}</WithId>;
}

function Fiche({ id }: { id: string }) {
  const { db, me, run } = useApp();
  const router = useRouter();
  const sp = useSearchParams();
  const [modal, setModal] = useState<null | "advance" | "revision" | "partial" | "transport" | "settle">(null);
  const [photoFor, setPhotoFor] = useState<Advance | null>(null);
  const [tab, setTab] = useState<"remises" | "transports" | "prix" | "releve">("remises");
  const c = db.contracts.find((x) => x.id === id);

  useEffect(() => {
    if (sp.get("remise") === "1" && c && me.role !== "fournisseur") setModal("advance");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const partial = c ? db.partials.filter((p) => p.contractId === c.id && !p.deleted).sort((a, b) => b.at.localeCompare(a.at))[0] : undefined;
  useEffect(() => {
    if (partial && !partial.seenByPatron && me.role === "patron") void markPartialSeen(me, partial.id);
  }, [partial, me]);

  if (!c || c.deleted || (me.role === "fournisseur" && c.supplierId !== me.id))
    return <Empty icon={<FileSignature className="size-5" />} title="Contrat introuvable" text="Il a peut-être été supprimé (annulation logique)." action={<Link href="/contrats/" className="text-[14px] font-semibold text-brand-700">Retour aux contrats</Link>} />;

  const m = metrics(db, c);
  const perms = db.settings[0]!.perms;
  const advances = db.advances.filter((a) => a.contractId === c.id && !a.deleted).sort((a, b) => b.date.localeCompare(a.date));
  const transports = db.transports.filter((t) => t.contractId === c.id && !t.deleted);
  const revisions = db.revisions.filter((r) => r.contractId === c.id).sort((a, b) => b.at.localeCompare(a.at));
  const lines = ledger(db, c);
  const active = c.status === "actif";
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
            {active && me.role !== "fournisseur" && can(perms, me, "remises", "c") && <Button icon={<Banknote className="size-4" />} onClick={() => setModal("advance")} data-testid="btn-advance">Remise d&apos;argent</Button>}
            {active && me.role !== "fournisseur" && <Button variant={me.role === "patron" ? "dark" : "secondary"} icon={<TrendingUp className="size-4" />} onClick={() => setModal("revision")} data-testid="btn-revision">{me.role === "patron" ? "Ajuster le prix du reliquat" : "Proposer un nouveau prix"}</Button>}
            {active && can(perms, me, "partielles", "c") && <Button variant="secondary" icon={<Scale className="size-4" />} onClick={() => setModal("partial")} data-testid="btn-partial">Livraison partielle</Button>}
            {active && me.role !== "fournisseur" && can(perms, me, "transports", "c") && <Button variant="secondary" icon={<Truck className="size-4" />} onClick={() => setModal("transport")}>Nouveau transport</Button>}
            {active && me.role === "patron" && <Button variant="secondary" icon={<Gavel className="size-4" />} onClick={async () => {
              if (m.S <= 0) {
                if (await confirm({ title: `Clôturer ${c.ref} ?`, html: "Le solde est nul : le contrat passera à « clos — soldé »." })) await run(() => closeContract(me, c.id), "Contrat clos — soldé");
              } else setModal("settle");
            }} data-testid="btn-settle">Solder</Button>}
            {me.role !== "fournisseur" && dm !== "interdite" && !pendingDel && <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={onDelete} data-testid="btn-delete">{dm === "confirmation" ? "Demander la suppression" : "Supprimer"}</Button>}
          </div>
        </div>
      </div>

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

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
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
            ].map(([k, v]) => (
              <div key={k}><div className="text-[11.5px] text-white/50">{k}</div><div className="mt-0.5 text-[14.5px] font-semibold">{v}</div></div>
            ))}
          </div>
          <div className="num mt-5 rounded-2xl bg-white/[0.06] p-4 text-[13px] leading-relaxed text-white/80">
            <div>Solde S = A − V − R + T = {fcfa(m.A)} − {fcfa(m.V)}{m.R ? ` − ${fcfa(m.R)}` : ""}{m.Tf ? ` + ${fcfa(m.Tf)}` : ""} = <b className="text-white">{fcfa(m.S)}</b></div>
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
          ]} />
          {c.needId && <p className="mt-5 rounded-xl bg-canvas px-3.5 py-2.5 text-[12.5px] text-muted">Issu du besoin <b className="text-ink">{db.needs.find((n) => n.id === c.needId)?.ref}</b> et de la proposition validée le {date(db.offers.find((o) => o.id === c.offerId)?.decidedAt)}.</p>}
        </Card>
      </div>

      <div className="mt-8">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: "remises", label: "Remises d'argent", count: advances.length },
          { value: "transports", label: "Transports et lots", count: transports.length },
          { value: "prix", label: "Historique des prix", count: revisions.length + 1 },
          { value: "releve", label: "Relevé", count: lines.length },
        ]} />
        {tab === "remises" && (
          advances.length === 0 ? (
            <Empty icon={<Banknote className="size-5" />} title="Aucune remise d'argent" text="Enregistrez la remise en espèces pour générer le reçu PDF." action={active && me.role !== "fournisseur" && <Button size="sm" onClick={() => setModal("advance")}>Remise d&apos;argent</Button>} />
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
                    {a.status === "a_completer" && me.role !== "fournisseur" && <Button size="sm" icon={<Camera className="size-3.5" />} onClick={() => setPhotoFor(a)}>Joindre la photo</Button>}
                    <ReceiptActions adv={a} compact />
                    {a.status !== "annulee" && me.role !== "fournisseur" && deleteMode(perms, me, "remises") !== "interdite" && (
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
        {tab === "prix" && (
          <ul className="space-y-3">
            {revisions.map((r) => (
              <li key={r.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num text-[15px] font-bold">{prixKg(r.oldPrice)} → {prixKg(r.newPrice)}</span>
                  <Badge tone="blue">Reliquat · option {r.option}</Badge>
                </div>
                <div className="num mt-1 text-[13px] text-muted">Reste à livrer {tonnes(r.remainderBeforeKg)} → <b className="text-ink">{tonnes(r.remainderAfterKg)}</b>{r.complement ? ` · complément ${fcfa(r.complement)}` : ""} · « {r.reason} »</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-subtle"><ShieldCheck className="size-3.5" /> {dateTime(r.at)} · par {nameOf(db, r.by)} · signature <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink">{r.signature}</code></div>
              </li>
            ))}
            <li className="card p-4 sm:p-5"><span className="num text-[15px] font-bold">{prixKg(c.initialPrice)}</span> <span className="text-[13px] text-muted">· prix contractuel initial, {date(c.createdAt)}</span></li>
          </ul>
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

function SettleModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const { db, me, run } = useApp();
  const m = metrics(db, contract);
  const [tab, setTab] = useState<"remb" | "dette">("remb");
  const [amount, setAmount] = useState(String(m.S));
  const [mode, setMode] = useState<PaymentMode>("especes");
  const [ref, setRef] = useState("");
  const [photo, setPhoto] = useState<string>();
  const [due, setDue] = useState(new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10));
  return (
    <Modal open onClose={onClose} title={`Solder ${contract.ref}`} sub={`Solde restant : ${fcfa(m.S)} · reste à livrer ${tonnes(m.Q)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button>{tab === "remb" ? (
        <Button onClick={async () => {
          const r = await run(() => recordRepayment(me, contract.id, { amount: Number(amount), mode, reference: ref || undefined, photo }), "Remboursement enregistré", "Le solde est recalculé.");
          if (r) onClose();
        }}>Enregistrer le remboursement</Button>
      ) : (
        <Button variant="dark" onClick={async () => {
          if (!(await confirm({ title: "Passer le solde en dette ?", html: `${fcfa(m.S)} deviendront une dette de ${nameOf(db, contract.supplierId)}, échéance le ${date(new Date(due).toISOString())}. Le contrat sera clos.`, confirmText: "Passer en dette", dark: true }))) return;
          const r = await run(() => closeContract(me, contract.id, new Date(due).toISOString()), "Solde passé en dette", "Suivi dans Paiements et dettes.");
          if (r) onClose();
        }}>Clore et passer en dette</Button>
      )}</>}>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "remb", label: "Remboursement en argent" }, { value: "dette", label: "Passer en dette" }]} />
      {tab === "remb" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Montant reçu (FCFA)"><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Mode"><Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}><option value="especes">Espèces</option><option value="flooz">Flooz</option><option value="tmoney">T-Money</option><option value="virement">Virement</option></Select></Field>
          {mode !== "especes" && <Field label="Référence" className="sm:col-span-2"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}
          <div className="sm:col-span-2"><PhotoInput label="Justificatif" value={photo} onChange={setPhoto} /></div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[13.5px] text-muted">Le contrat passe à « clos — en dette ». Les remboursements partiels réduiront la dette ; son statut évolue automatiquement.</p>
          <Field label="Échéance de remboursement"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
      )}
    </Modal>
  );
}
