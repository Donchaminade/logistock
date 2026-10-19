"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Handshake, Plus, Undo2, X } from "lucide-react";
import { askReason, confirm, fail } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { ContractModal, nameOf } from "@/components/domain";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Progress, Select, Textarea } from "@/components/ui";
import { date, fcfa, group, prixKg, productLabel, relative, tonnes } from "@/lib/format";
import type { Need, Offer, Product } from "@/lib/types";
import { createNeed, rejectOffer, submitOffer, withdrawOffer } from "@/services/actions";

const NEED_STATUS = { ouvert: "Ouvert", partiellement_couvert: "Partiellement couvert", couvert: "Couvert", clos: "Clos", annule: "Annulé" } as const;
const OFFER_STATUS = { soumise: "Soumise", acceptee: "Acceptée", refusee: "Refusée", retiree: "Retirée" } as const;

export default function Besoins() {
  const { db, me, run } = useApp();
  const router = useRouter();
  const [needOpen, setNeedOpen] = useState(false);
  const [offerFor, setOfferFor] = useState<Need | null>(null);
  const [accept, setAccept] = useState<Offer | null>(null);
  const needs = db.needs.filter((n) => !n.deleted && (me.role !== "fournisseur" || n.status === "ouvert" || n.status === "partiellement_couvert" || db.offers.some((o) => o.needId === n.id && o.supplierId === me.id)));
  const sorted = [...needs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHeader
        eyebrow="Étape 0"
        title={me.role === "fournisseur" ? "Besoins du patron" : "Besoins et propositions"}
        sub={me.role === "fournisseur" ? "Proposez-vous pour aller chercher le produit : quantité, prix, délai et avance demandée." : "Le patron exprime un besoin, les fournisseurs se proposent, le patron valide : le contrat est alors créé."}
        actions={me.role === "patron" && <Button icon={<Plus className="size-4" />} onClick={() => setNeedOpen(true)} data-testid="new-need">Exprimer un besoin</Button>}
      />
      {sorted.length === 0 ? (
        <Empty icon={<Handshake className="size-5" />} title="Aucun besoin ouvert" text="Les nouveaux besoins du patron apparaîtront ici." />
      ) : (
        <div className="space-y-4">
          {sorted.map((n) => {
            const offers = db.offers.filter((o) => o.needId === n.id && !o.deleted && (me.role !== "fournisseur" || o.supplierId === me.id));
            const acceptedKg = db.offers.filter((o) => o.needId === n.id && o.status === "acceptee").reduce((s, o) => s + (db.contracts.find((c) => c.id === o.contractId)?.qtyKg ?? o.qtyKg), 0);
            const cov = Math.min(100, Math.round((acceptedKg / n.qtyKg) * 100));
            const canPropose = me.role !== "gestionnaire" && (n.status === "ouvert" || n.status === "partiellement_couvert");
            return (
              <Card key={n.id} pad={false} className="animate-in overflow-hidden">
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[16px] font-bold">{n.ref}</span>
                        <Badge tone={n.status === "ouvert" ? "blue" : n.status === "couvert" ? "dark" : "outline"}>{NEED_STATUS[n.status]}</Badge>
                      </div>
                      <div className="num mt-1.5 text-[22px] font-bold tracking-[-0.02em]">{tonnes(n.qtyKg)} de {productLabel[n.product].toLowerCase()}</div>
                      <div className="num mt-1 text-[13.5px] text-muted">Prix indicatif {prixKg(n.indicativePrice)} · échéance {date(n.deadline)}{n.zone ? ` · ${n.zone}` : ""}</div>
                      {n.comment && <p className="mt-2 text-[13.5px] text-ink/80">{n.comment}</p>}
                    </div>
                    <div className="w-full shrink-0 sm:w-56">
                      <div className="mb-1.5 flex justify-between text-[12.5px]"><span className="text-muted">Couverture</span><span className="num font-semibold">{cov} %</span></div>
                      <Progress value={cov} />
                      <div className="num mt-1.5 text-[12px] text-subtle">{tonnes(acceptedKg)} acceptées sur {tonnes(n.qtyKg)}</div>
                      {canPropose && (
                        <Button className="mt-3 w-full" size="sm" variant={me.role === "fournisseur" ? "primary" : "secondary"} icon={<Plus className="size-3.5" />} onClick={() => setOfferFor(n)} data-testid={`propose-${n.ref}`}>
                          {me.role === "fournisseur" ? "Me proposer" : "Saisir une proposition"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                {offers.length > 0 && (
                  <div className="border-t border-line bg-canvas/50 px-3 py-3 sm:px-4">
                    <div className="eyebrow px-2 pb-2">Propositions ({offers.length})</div>
                    <ul className="space-y-2">
                      {offers.map((o) => (
                        <li key={o.id} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-3.5 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[14px] font-semibold">{nameOf(db, o.supplierId)}</span>
                              <Badge tone={o.status === "soumise" ? "blue" : o.status === "acceptee" ? "dark" : "gray"}>{OFFER_STATUS[o.status]}</Badge>
                              <span className="text-[12px] text-subtle">{relative(o.createdAt)}</span>
                            </div>
                            <div className="num mt-1 text-[13px] text-muted">
                              {tonnes(o.qtyKg)} à {prixKg(o.price)} · avance {fcfa(o.advanceRequested)} · {o.delayDays} jours{o.origin ? ` · depuis ${o.origin}` : ""}
                            </div>
                            {o.reason && <div className="mt-1 text-[12.5px] text-muted">Motif du refus : {o.reason}</div>}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {me.role === "patron" && o.status === "soumise" && (
                              <>
                                <Button size="sm" variant="secondary" icon={<X className="size-3.5" />} onClick={async () => {
                                  const r = await askReason({ title: "Refuser la proposition ?", html: `${nameOf(db, o.supplierId)} sera notifié(e) avec votre motif.`, confirmText: "Refuser", dark: true });
                                  if (r) await run(() => rejectOffer(me, o.id, r), "Proposition refusée", "Le fournisseur est notifié.");
                                }}>Refuser</Button>
                                <Button size="sm" icon={<Check className="size-3.5" />} onClick={() => setAccept(o)} data-testid={`accept-${o.id}`}>Valider</Button>
                              </>
                            )}
                            {me.role === "fournisseur" && o.status === "soumise" && (
                              <Button size="sm" variant="secondary" icon={<Undo2 className="size-3.5" />} onClick={async () => {
                                if (await confirm({ title: "Retirer votre proposition ?", confirmText: "Retirer", dark: true })) await run(() => withdrawOffer(me, o.id), "Proposition retirée");
                              }}>Retirer</Button>
                            )}
                            {o.contractId && <a href={`/contrats/fiche/?id=${o.contractId}`} className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">Voir le contrat</a>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <NeedModal open={needOpen} onClose={() => setNeedOpen(false)} />
      {offerFor && <OfferModal need={offerFor} onClose={() => setOfferFor(null)} />}
      {accept && (
        <ContractModal open onClose={() => setAccept(null)} offerId={accept.id}
          preset={{ supplierId: accept.supplierId, product: db.needs.find((n) => n.id === accept.needId)!.product, qtyKg: accept.qtyKg, initialPrice: accept.price, amount: accept.advanceRequested }}
          onDone={(c) => router.push(`/contrats/fiche/?id=${c.id}&remise=1`)} />
      )}
    </>
  );
}

function NeedModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, run } = useApp();
  const [f, setF] = useState({ product: "soja" as Product, tons: "", price: "", deadline: new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10), zone: "", comment: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const qtyKg = Math.round(Number(f.tons.replace(",", ".")) * 1000);
  return (
    <Modal open={open} onClose={onClose} title="Exprimer un besoin" sub="Visible immédiatement par les fournisseurs, qui pourront se proposer."
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={busy} onClick={async () => {
        setBusy(true);
        const r = await run(() => createNeed(me, { product: f.product, qtyKg, indicativePrice: Number(f.price), deadline: new Date(f.deadline).toISOString(), zone: f.zone, comment: f.comment }), "Besoin publié", "Les fournisseurs sont notifiés.");
        setBusy(false);
        if (r) onClose();
      }}>Publier le besoin</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Produit"><Select value={f.product} onChange={set("product")}><option value="soja">Soja</option><option value="cacao">Cacao</option></Select></Field>
        <Field label="Quantité visée (tonnes)" hint={qtyKg > 0 ? `${group(qtyKg)} kg` : undefined}><Input inputMode="decimal" value={f.tons} onChange={set("tons")} placeholder="ex. 500" /></Field>
        <Field label="Prix indicatif (FCFA/kg)"><Input inputMode="numeric" value={f.price} onChange={set("price")} placeholder="ex. 350" /></Field>
        <Field label="Échéance souhaitée"><Input type="date" value={f.deadline} onChange={set("deadline")} /></Field>
        <Field label="Zone ou origine indicative" className="sm:col-span-2"><Input value={f.zone} onChange={set("zone")} placeholder="Facultatif" /></Field>
        <Field label="Commentaire" className="sm:col-span-2"><Textarea value={f.comment} onChange={set("comment")} placeholder="Facultatif" /></Field>
      </div>
    </Modal>
  );
}

function OfferModal({ need, onClose }: { need: Need; onClose: () => void }) {
  const { db, me } = useApp();
  const suppliers = db.users.filter((u) => u.role === "fournisseur" && u.active && !u.deleted);
  const [f, setF] = useState({ supplierId: suppliers[0]?.id ?? "", tons: String(need.qtyKg / 1000), price: String(need.indicativePrice), advance: "", delay: "30", origin: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const qtyKg = Math.round(Number(f.tons.replace(",", ".")) * 1000);
  const computed = qtyKg * Number(f.price) || 0;
  return (
    <Modal open onClose={onClose} title={me.role === "fournisseur" ? "Me proposer" : "Saisir une proposition"} sub={`${need.ref} · ${tonnes(need.qtyKg)} de ${productLabel[need.product].toLowerCase()} à ${prixKg(need.indicativePrice)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={busy} data-testid="offer-submit" onClick={async () => {
        setBusy(true);
        try {
          await submitOffer(me, { needId: need.id, supplierId: f.supplierId, qtyKg, price: Number(f.price), advanceRequested: Number(f.advance) || computed, delayDays: Number(f.delay), origin: f.origin || undefined });
          onClose();
          const { success } = await import("@/components/alerts");
          await success("Proposition envoyée", "Le patron est notifié et va l'examiner.");
        } catch (e) {
          await fail(e);
        } finally {
          setBusy(false);
        }
      }}>Envoyer la proposition</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {me.role === "patron" && (
          <Field label="Fournisseur" className="sm:col-span-2"><Select value={f.supplierId} onChange={set("supplierId")}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        )}
        <Field label="Quantité (tonnes)"><Input inputMode="decimal" value={f.tons} onChange={set("tons")} /></Field>
        <Field label="Prix proposé (FCFA/kg)"><Input inputMode="numeric" value={f.price} onChange={set("price")} /></Field>
        <Field label="Avance demandée (FCFA)" hint={computed ? `Quantité × prix = ${fcfa(computed)}` : undefined} className="sm:col-span-2"><Input inputMode="numeric" value={f.advance} onChange={set("advance")} placeholder={String(computed || "")} /></Field>
        <Field label="Délai (jours)"><Input inputMode="numeric" value={f.delay} onChange={set("delay")} /></Field>
        <Field label="Origine envisagée"><Input value={f.origin} onChange={set("origin")} placeholder="ex. Glazoué (Bénin)" /></Field>
      </div>
    </Modal>
  );
}
