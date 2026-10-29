"use client";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Printer, Share2 } from "lucide-react";
import { metrics, simulateRevision, type ContractMetrics } from "@/lib/calc";
import { fcfa, group, prixKg, productLabel, tonnes, toLocalInput, fromLocalInput } from "@/lib/format";
import { receiptFileName, receiptPdf } from "@/lib/pdf";
import type { Advance, Contract, Database, Id, PaymentMode, Product, User } from "@/lib/types";
import {
  acceptOffer, createContract, createTransport, declarePartial, recordAdvance, resolvePhoto, reviseRemainderPrice,
  type ContractInput,
} from "@/services/actions";
import { confirm, fail, info, success, toast } from "./alerts";
import { useApp } from "./DataProvider";
import { activeProducts } from "@/lib/catalog";
import { Badge, Button, cx, Field, Input, Modal, PhotoInput, Segmented, Select, Textarea, Toggle } from "./ui";

export const nameOf = (db: Database, id?: Id) => db.users.find((u) => u.id === id)?.name ?? "—";
export const contractsOf = (db: Database, me: User) =>
  db.contracts.filter((c) => !c.deleted && (me.role !== "fournisseur" || c.supplierId === me.id));

export function WithId({ children }: { children: (id: string | null) => ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Inner>{children}</Inner>
    </Suspense>
  );
}
function Inner({ children }: { children: (id: string | null) => ReactNode }) {
  const sp = useSearchParams();
  return <>{children(sp.get("id"))}</>;
}

export function ContractBadges({ c, m }: { c: Contract; m: ContractMetrics }) {
  const late = c.status === "actif" && new Date(c.deliveryDate) < new Date() && m.S > 0;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {c.status === "actif" && <Badge tone="blue">Actif</Badge>}
      {c.status === "suspendu" && <Badge tone="outline">Suspendu</Badge>}
      {c.status === "clos" && <Badge tone="dark">{{ dette: "Clos — en dette", rembourse: "Clos — remboursé", reporte: "Clos — reporté", solde: "Clos — soldé" }[c.closedAs ?? "solde"]}</Badge>}
      {m.hasPartial && <Badge tone="outline">Livraison partielle</Badge>}
      {m.advancesToComplete > 0 && <Badge tone="err">Photo manquante</Badge>}
      {late && <Badge tone="err">Échu non soldé</Badge>}
    </span>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** Formulaire « contrat à la remise » (US-15) : création directe ou validation d'une proposition. */
export function ContractModal({ open, onClose, offerId, preset, onDone }: { open: boolean; onClose: () => void; offerId?: Id; preset?: Partial<ContractInput>; onDone?: (c: Contract) => void }) {
  const { db, me } = useApp();
  const suppliers = db.users.filter((u) => u.role === "fournisseur" && u.active && !u.deleted);
  const places = db.locations.filter((l) => !l.deleted);
  const [f, setF] = useState({ supplierId: "", product: (activeProducts(db)[0]?.id ?? "") as Product, tons: "", price: "", amount: "", received: today(), delivery: plusDays(30), place: "Kaboli", otherPlace: "", paid: true, rule: "" });
  const [busy, setBusy] = useState(false);
  const rules = db.settings[0]!.commissionRules.filter((r) => r.active);
  useEffect(() => {
    if (!open) return;
    setF({
      supplierId: preset?.supplierId ?? suppliers[0]?.id ?? "",
      product: preset?.product ?? activeProducts(db)[0]?.id ?? "",
      tons: preset?.qtyKg ? String(preset.qtyKg / 1000) : "",
      price: preset?.initialPrice ? String(preset.initialPrice) : "",
      amount: preset?.amount ? String(preset.amount) : "",
      received: today(), delivery: plusDays(30), place: "Kaboli", otherPlace: "", paid: true, rule: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const qtyKg = Math.round(Number(f.tons.replace(",", ".")) * 1000);
  const price = Number(f.price);
  const computed = qtyKg > 0 && price > 0 ? qtyKg * price : 0;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setBusy(true);
    try {
      const input: ContractInput = {
        supplierId: f.supplierId, product: f.product, qtyKg, initialPrice: price, amount: Number(f.amount) || computed,
        moneyReceivedDate: new Date(f.received + "T09:00:00Z").toISOString(), deliveryDate: new Date(f.delivery + "T00:00:00Z").toISOString(),
        deliveryPlace: f.place === "__autre" ? f.otherPlace : f.place, transportPaidByPatron: f.paid,
        commissionRuleId: f.rule || undefined,
      };
      const c = offerId ? await acceptOffer(me, offerId, input) : await createContract(me, input);
      onClose();
      await success(offerId ? "Proposition validée" : "Contrat créé", `Le contrat <b>${c.ref}</b> est actif. Enregistrez maintenant la remise d'argent pour générer le reçu PDF.`);
      onDone?.(c);
    } catch (e) {
      await fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={offerId ? "Valider la proposition" : "Nouveau contrat"} sub="Contrat à la remise : tous les champs sont obligatoires pour l'activer." wide
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={submit} loading={busy} data-testid="contract-submit">{offerId ? "Valider et créer le contrat" : "Créer le contrat"}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fournisseur">
          <Select value={f.supplierId} onChange={set("supplierId")} disabled={!!offerId}>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.zone}</option>)}
          </Select>
        </Field>
        <Field label="Produit">
          <ProductSelect value={f.product} onChange={(v) => setF({ ...f, product: v })} disabled={!!offerId} />
        </Field>
        <Field label="Tonnes contractées" hint={qtyKg > 0 ? `${group(qtyKg)} kg` : undefined}>
          <Input inputMode="decimal" value={f.tons} onChange={set("tons")} placeholder="ex. 500" name="tons" />
        </Field>
        <Field label="Prix au kg (FCFA)">
          <Input inputMode="numeric" value={f.price} onChange={set("price")} placeholder="ex. 350" name="price" />
        </Field>
        <Field label="Montant remis (FCFA)" hint={computed ? <>Calculé : {fcfa(computed)} <button type="button" className="font-semibold text-brand-700 underline-offset-2 hover:underline" onClick={() => setF({ ...f, amount: String(computed) })}>utiliser</button></> : "Tonnes × prix si laissé vide"} className="sm:col-span-2">
          <Input inputMode="numeric" value={f.amount} onChange={set("amount")} placeholder={computed ? String(computed) : "ex. 175000000"} name="amount" />
        </Field>
        <Field label="Date de réception de l'argent">
          <Input type="date" value={f.received} onChange={set("received")} />
        </Field>
        <Field label="Date de livraison prévue">
          <Input type="date" value={f.delivery} onChange={set("delivery")} />
        </Field>
        <Field label="Lieu de livraison" className={f.place === "__autre" ? "" : "sm:col-span-2"}>
          <Select value={f.place} onChange={set("place")}>
            {places.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
            <option value="__autre">Autre lieu (saisie libre)…</option>
          </Select>
        </Field>
        {f.place === "__autre" && (
          <Field label="Autre lieu" hint="Sera ajouté à la table des lieux.">
            <Input value={f.otherPlace} onChange={set("otherPlace")} placeholder="ex. Blitta" />
          </Field>
        )}
        <Field label="Règle de commission (§1.8)" className="sm:col-span-2" hint="Calculée sur les livraisons réceptionnées, puis validée et payée.">
          <Select value={f.rule} onChange={set("rule")} data-testid="contract-rule">
            <option value="">Aucune commission</option>
            {rules.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </Field>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line p-4 sm:col-span-2">
          <div>
            <div className="text-[14px] font-semibold">Transport payé par le patron</div>
            <div className="text-[12.5px] text-muted">{f.paid ? "Les coûts de transport iront dans les charges du patron." : "Les coûts de transport seront déduits du solde du fournisseur."}</div>
          </div>
          <Toggle checked={f.paid} onChange={(v) => setF({ ...f, paid: v })} label="Transport payé par le patron" />
        </div>
      </div>
    </Modal>
  );
}

export async function openReceipt(db: Database, adv: Advance, mode: "download" | "share" | "view") {
  try {
    const photo = adv.photo ? await resolvePhoto(adv.photo) : undefined;
    const blob = await receiptPdf(db, adv, photo);
    const name = receiptFileName(adv);
    const file = new File([blob], name, { type: "application/pdf" });
    if (mode === "share" && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Reçu ${adv.receiptNo}`, text: `Reçu MarockStock ${adv.receiptNo}` });
      return;
    }
    const url = URL.createObjectURL(blob);
    if (mode === "view") {
      window.open(url, "_blank", "noopener");
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    if (mode === "share") toast("Reçu téléchargé", "Le partage direct n'est pas disponible sur cet appareil.", "info");
    else toast("Reçu PDF généré", name);
  } catch (e) {
    if ((e as Error)?.name !== "AbortError") await fail(e, "Reçu non généré");
  }
}

export function ReceiptActions({ adv, compact }: { adv: Advance; compact?: boolean }) {
  const { db } = useApp();
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={() => openReceipt(db, adv, "download")} data-testid="receipt-pdf">{compact ? "PDF" : "Reçu PDF"}</Button>
      <Button size="sm" variant="secondary" icon={<Share2 className="size-3.5" />} onClick={() => openReceipt(db, adv, "share")}>Partager</Button>
      <Button size="sm" variant="ghost" icon={<Printer className="size-3.5" />} onClick={() => window.open(`/recu/?id=${adv.id}`, "_blank")}>Imprimer</Button>
    </div>
  );
}

/** Remise d'argent en espèces + photo (US-14). */
export function AdvanceModal({ open, onClose, contract }: { open: boolean; onClose: () => void; contract: Contract }) {
  const { db, me } = useApp();
  const m = metrics(db, contract);
  const [f, setF] = useState({ tons: "", price: "", amount: "", mode: "especes" as PaymentMode, reference: "", date: "", photo: undefined as string | undefined });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const first = m.A === 0;
    setF({ tons: first ? String(contract.qtyKg / 1000) : "", price: String(m.P), amount: first ? String(contract.amount) : "", mode: "especes", reference: "", date: toLocalInput(new Date().toISOString()), photo: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const qtyKg = Math.round(Number(f.tons.replace(",", ".")) * 1000);
  const computed = qtyKg * Number(f.price) || 0;
  async function submit() {
    setBusy(true);
    try {
      const input = { amount: Number(f.amount) || computed, qtyKg, unitPrice: Number(f.price), date: fromLocalInput(f.date), mode: f.mode, reference: f.reference || undefined, photo: f.photo };
      let adv;
      try {
        adv = await recordAdvance(me, contract.id, input);
      } catch (e) {
        if (me.role !== "patron" || !String((e as Error).message).startsWith("Avance bloquée")) throw e;
        const ok = await confirm({ title: "Dette au-dessus du seuil", html: `${(e as Error).message}<br/><br/>Verser quand même ? La décision sera tracée au journal.`, confirmText: "Verser quand même", icon: "warning", dark: true });
        if (!ok) return;
        adv = await recordAdvance(me, contract.id, { ...input, force: true });
      }
      onClose();
      const snap = await (await import("@/data")).dataSource().snapshot();
      const html = adv.status === "a_completer"
        ? `Reçu <b>${adv.receiptNo}</b> créé. <br/>Sans photo de la remise, le versement reste <b>« à compléter »</b>.`
        : `Reçu <b>${adv.receiptNo}</b> créé avec la photo de la remise.`;
      await success("Remise enregistrée", html);
      await openReceipt(snap, adv, "download");
    } catch (e) {
      await fail(e);
    } finally {
      setBusy(false);
    }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={open} onClose={onClose} title="Remise d'argent" sub={`${contract.ref} · ${nameOf(db, contract.supplierId)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={submit} loading={busy} data-testid="advance-submit">Enregistrer et générer le reçu</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quantité (tonnes)"><Input inputMode="decimal" value={f.tons} onChange={set("tons")} placeholder="ex. 500" /></Field>
        <Field label="Prix unitaire (FCFA/kg)"><Input inputMode="numeric" value={f.price} onChange={set("price")} /></Field>
        <Field label="Montant remis (FCFA)" hint={computed ? `Quantité × prix = ${fcfa(computed)}` : undefined} className="sm:col-span-2">
          <Input inputMode="numeric" value={f.amount} onChange={set("amount")} placeholder={computed ? String(computed) : ""} />
        </Field>
        <Field label="Mode">
          <Select value={f.mode} onChange={set("mode")}>
            <option value="especes">Espèces</option><option value="virement">Virement</option><option value="flooz">Flooz</option><option value="tmoney">T-Money</option>
          </Select>
        </Field>
        <Field label="Date et heure"><Input type="datetime-local" value={f.date} onChange={set("date")} /></Field>
        {f.mode !== "especes" && <Field label="Référence de transaction" className="sm:col-span-2"><Input value={f.reference} onChange={set("reference")} placeholder="ex. TM-2026-889123" /></Field>}
        <div className="sm:col-span-2">
          <PhotoInput label="Photo de la remise d'argent" value={f.photo} onChange={(photo) => setF({ ...f, photo })} />
          {!f.photo && <p className="mt-2 text-[12.5px] text-muted">Sans photo, le versement restera « à compléter » et une alerte sera envoyée au patron.</p>}
        </div>
      </div>
    </Modal>
  );
}

/** Ajustement du prix sur le reliquat (US-19) avec simulation option A / option B. */
export function RevisionModal({ open, onClose, contract }: { open: boolean; onClose: () => void; contract: Contract }) {
  const { db, me } = useApp();
  const m = metrics(db, contract);
  const [price, setPrice] = useState("");
  const [option, setOption] = useState<"A" | "B">("A");
  const [reason, setReason] = useState("");
  const [effect, setEffect] = useState(today());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setPrice("");
      setReason("");
      setOption("A");
      setEffect(today());
    }
  }, [open]);
  const np = Number(price);
  const sim = np > 0 ? simulateRevision(m.S, m.P, np) : null;
  async function submit() {
    setBusy(true);
    try {
      const r = await reviseRemainderPrice(me, contract.id, { newPrice: np, option, reason, effectiveAt: new Date(effect + "T00:00:00Z").toISOString() });
      onClose();
      if (r.queued) await info("Demande envoyée au patron", "La révision de prix est une action sensible : elle s'appliquera après validation dans « Actions à confirmer ».");
      else await success("Prix du reliquat ajusté", `Reste à livrer : <b>${tonnes(r.revision.remainderAfterKg)}</b> au lieu de ${tonnes(r.sim.before)}.${option === "B" ? `<br/>Complément à verser : <b>${fcfa(r.revision.complement)}</b>.` : ""}<br/>Révision horodatée, chaînée (SHA-256) et signée (Ed25519). Le fournisseur est notifié.`);
    } catch (e) {
      await fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Ajuster le prix du reliquat" sub={`${contract.ref} · prix en vigueur ${prixKg(m.P)}`} wide
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={submit} loading={busy} disabled={!sim} data-testid="revision-submit">{me.role === "patron" ? "Appliquer, signer et notifier" : "Envoyer au patron pour validation"}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nouveau prix au kg (FCFA)" hint="Seul le reliquat est revalorisé : les livraisons déjà réceptionnées gardent leur prix.">
          <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={`ex. ${m.P + 50}`} name="newPrice" autoFocus />
        </Field>
        <Field label="Motif"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. Hausse du cours à Kara" name="reason" /></Field>
        <Field label="Date d'effet" hint="Horodatage de l'enregistrement : celui du serveur en production."><Input type="date" value={effect} onChange={(e) => setEffect(e.target.value)} /></Field>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold">Règle appliquée</span>
          <Segmented value={option} onChange={setOption} options={[{ value: "A", label: "Option A" }, { value: "B", label: "Option B" }]} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["A", "B"] as const).map((o) => (
            <button key={o} type="button" onClick={() => setOption(o)} className={cx("rounded-2xl border p-4 text-left transition-colors", option === o ? "border-brand-600 bg-brand-50/50 ring-4 ring-brand-100" : "border-line hover:border-line-2")}>
              <div className="flex items-center justify-between"><span className="text-[13px] font-bold">Option {o}</span>{option === o && <Badge tone="blue">Choisie</Badge>}</div>
              <p className="mt-1 text-[12.5px] text-muted">{o === "A" ? "L'argent restant est fixe : le reste à livrer diminue." : "La quantité reste fixe : le patron verse un complément."}</p>
              <div className="num mt-3 text-[20px] font-bold">{sim ? tonnes(o === "A" ? sim.optionA : sim.optionB) : "—"}</div>
              <div className="num text-[12.5px] text-muted">{sim ? (o === "A" ? `au lieu de ${tonnes(sim.before)}` : `+ complément ${fcfa(sim.complement)}`) : "à livrer"}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 rounded-2xl bg-ink p-4 text-white sm:p-5">
        <div className="eyebrow !text-white/45">Calcul</div>
        <div className="num mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-white/85">
          <div>Solde S = A − V − R − J + T = {fcfa(m.A)} − {fcfa(m.V)}{m.R ? ` − ${fcfa(m.R)}` : ""}{m.J ? ` − ${fcfa(m.J)}` : ""}{m.Tf ? ` + ${fcfa(m.Tf)}` : ""} = <b className="text-white">{fcfa(m.S)}</b></div>
          <div>Avant : S / {m.P} = <b className="text-white">{group(sim?.before ?? m.Q)} kg</b></div>
          {sim && option === "A" && <div>Après (option A) : {group(m.S)} / {np} = <b className="text-brand-200">{group(sim.optionA)} kg</b></div>}
          {sim && option === "B" && <div>Après (option B) : {group(sim.before)} kg × ({np} − {m.P}) = complément <b className="text-brand-200">{fcfa(sim.complement)}</b></div>}
        </div>
      </div>
    </Modal>
  );
}

/** Mention de livraison partielle avec preuve (US-18). */
export function PartialModal({ open, onClose, contract }: { open: boolean; onClose: () => void; contract: Contract }) {
  const { me } = useApp();
  const [found, setFound] = useState("");
  const [reason, setReason] = useState("");
  const [proof, setProof] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setFound("");
      setReason("");
      setProof(undefined);
    }
  }, [open]);
  const foundKg = Math.round(Number(found.replace(",", ".")) * 1000);
  const rem = foundKg > 0 ? contract.qtyKg - foundKg : null;
  async function submit() {
    setBusy(true);
    try {
      const p = await declarePartial(me, contract.id, { foundKg, reason, proof });
      onClose();
      await success("Livraison partielle déclarée", `${tonnes(p.foundKg)} sur ${tonnes(p.contractedKg)} — reliquat <b>${tonnes(p.remainderKg)}</b>.<br/>Le patron est notifié immédiatement.`);
    } catch (e) {
      await fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Déclarer une livraison partielle" sub={`${contract.ref} · ${tonnes(contract.qtyKg)} contractées`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={submit} loading={busy} data-testid="partial-submit">Déclarer et notifier le patron</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-canvas p-3"><div className="text-[12px] text-muted">Contractées</div><div className="num text-[17px] font-bold">{tonnes(contract.qtyKg)}</div></div>
          <div className={cx("rounded-xl p-3", rem !== null && rem > 0 ? "bg-ink text-white" : "bg-canvas")}><div className={cx("text-[12px]", rem !== null && rem > 0 ? "text-white/60" : "text-muted")}>Reliquat</div><div className="num text-[17px] font-bold">{rem !== null && rem > 0 ? tonnes(rem) : "—"}</div></div>
        </div>
        <Field label="Quantité trouvée (tonnes)"><Input inputMode="decimal" value={found} onChange={(e) => setFound(e.target.value)} placeholder="ex. 80" name="found" /></Field>
        <Field label="Motif"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. Récolte plus faible que prévu chez deux coopératives" name="partialReason" /></Field>
        <PhotoInput label="Preuve (photo, ticket de pesée, document)" value={proof} onChange={setProof} />
      </div>
    </Modal>
  );
}

/** Nouveau transport tracé (US-16). */
export function TransportModal({ open, onClose, contractId, onDone }: { open: boolean; onClose: () => void; contractId?: Id; onDone?: (id: Id) => void }) {
  const { db, me } = useApp();
  const contracts = useMemo(() => db.contracts.filter((c) => c.status === "actif" && !c.deleted), [db]);
  const origins = db.locations.filter((l) => !l.deleted && l.type !== "destination");
  const [f, setF] = useState({ contractId: "", origin: "", originFree: "", save: true, tons: "", vehicle: "", driver: "", driverPhone: "", carrier: "", loading: "", departure: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const now = toLocalInput(new Date().toISOString());
    setF({ contractId: contractId ?? contracts[0]?.id ?? "", origin: origins[0]?.name ?? "", originFree: "", save: true, tons: "", vehicle: "", driver: "", driverPhone: "", carrier: "", loading: now, departure: now });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function submit() {
    setBusy(true);
    try {
      const t = await createTransport(me, {
        contractId: f.contractId, origin: f.origin === "__libre" ? f.originFree : f.origin, saveOrigin: f.origin === "__libre" && f.save,
        tonsKg: Math.round(Number(f.tons.replace(",", ".")) * 1000), vehicle: f.vehicle, driver: f.driver, driverPhone: f.driverPhone, carrier: f.carrier,
        loadingDate: fromLocalInput(f.loading), departureDate: fromLocalInput(f.departure),
      });
      onClose();
      toast("Transport créé", `${t.ref} · chargement enregistré dans la timeline.`);
      onDone?.(t.id);
    } catch (e) {
      await fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Nouveau transport" sub="Tonnes, matricule, chauffeur, dates et produit. Origine libre, étapes ajoutées ensuite." wide
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={submit} loading={busy} data-testid="transport-submit">Créer le transport</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contrat" className="sm:col-span-2">
          <Select value={f.contractId} onChange={set("contractId")}>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.ref} · {nameOf(db, c.supplierId)} · {productLabel[c.product]}</option>)}
          </Select>
        </Field>
        <Field label="Origine">
          <Select value={f.origin} onChange={set("origin")}>
            {origins.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
            <option value="__libre">Autre origine (saisie libre)…</option>
          </Select>
        </Field>
        {f.origin === "__libre" ? (
          <Field label="Origine libre" hint={<label className="mt-1 inline-flex items-center gap-2"><input type="checkbox" checked={f.save} onChange={(e) => setF({ ...f, save: e.target.checked })} className="accent-brand-600" /> Ajouter à la table des lieux</label>}>
            <Input value={f.originFree} onChange={set("originFree")} placeholder="ex. Savalou (Bénin)" />
          </Field>
        ) : (
          <Field label="Tonnes chargées"><Input inputMode="decimal" value={f.tons} onChange={set("tons")} placeholder="ex. 30" name="tons" /></Field>
        )}
        {f.origin === "__libre" && <Field label="Tonnes chargées"><Input inputMode="decimal" value={f.tons} onChange={set("tons")} placeholder="ex. 30" name="tons" /></Field>}
        <Field label="Véhicule (matricule)" hint="Choisi dans la liste des véhicules ou créé à la volée.">
          <Input value={f.vehicle} onChange={(e) => { const v = db.vehicles.find((x) => x.plate === e.target.value.toUpperCase()); setF({ ...f, vehicle: e.target.value, carrier: v && !f.carrier ? v.owner : f.carrier }); }} placeholder="TG-1234-AB" className="uppercase" name="vehicle" list="ls-vehicles" />
          <datalist id="ls-vehicles">{db.vehicles.filter((v) => v.active && !v.deleted).map((v) => <option key={v.id} value={v.plate}>{v.type} · {v.owner}</option>)}</datalist>
        </Field>
        <Field label="Chauffeur">
          <Input value={f.driver} onChange={(e) => { const d = db.drivers.find((x) => x.name === e.target.value); setF({ ...f, driver: e.target.value, driverPhone: d ? d.phone : f.driverPhone }); }} placeholder="Nom du chauffeur" name="driver" list="ls-drivers" />
          <datalist id="ls-drivers">{db.drivers.filter((d) => d.active && !d.deleted).map((d) => <option key={d.id} value={d.name}>{d.phone}</option>)}</datalist>
        </Field>
        <Field label="Téléphone du chauffeur"><Input inputMode="tel" value={f.driverPhone} onChange={set("driverPhone")} placeholder="98 00 00 00" /></Field>
        <Field label="Livreur / transporteur"><Input value={f.carrier} onChange={set("carrier")} placeholder="ex. Transports Zio" name="carrier" /></Field>
        <Field label="Chargement"><Input type="datetime-local" value={f.loading} onChange={set("loading")} /></Field>
        <Field label="Départ"><Input type="datetime-local" value={f.departure} onChange={set("departure")} /></Field>
      </div>
    </Modal>
  );
}

/** Liste déroulante des produits du catalogue du patron (jamais de saisie libre). */
export function ProductSelect({ value, onChange, all, disabled, name = "product", className }: { value: string; onChange: (v: string) => void; all?: string; disabled?: boolean; name?: string; className?: string }) {
  const { db } = useApp();
  const list = activeProducts(db, value);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} name={name} className={className} data-testid={`select-${name}`}>
      {all !== undefined && <option value="">{all}</option>}
      {!all && !list.length && <option value="" disabled>Aucun produit : le patron doit en créer un</option>}
      {list.map((p) => <option key={p.id} value={p.id}>{p.name}{p.unit && p.unit !== "kg" ? ` (${p.unit})` : ""}{p.archived ? " · archivé" : ""}</option>)}
    </Select>
  );
}
