"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MapPinPlus, Scale, Trash2, Truck, Warehouse } from "lucide-react";
import { askReason, fail, info, success } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { nameOf, WithId } from "@/components/domain";
import { Timeline } from "@/components/Timeline";
import { Badge, Button, Card, CardTitle, Empty, Field, Input, KV, Modal, PageSkeleton, PhotoInput, Select, Textarea } from "@/components/ui";
import { currentPrice } from "@/lib/calc";
import { dateTime, fcfa, fromLocalInput, group, prixKg, productLabel, toLocalInput, tonnes } from "@/lib/format";
import { can, deleteMode } from "@/lib/permissions";
import type { Transport, TraceType } from "@/lib/types";
import { addTraceEvent, checkinLome, requestDelete, weighAndReceive } from "@/services/actions";

export default function Page() {
  return <WithId>{(id) => (id ? <Fiche id={id} /> : <PageSkeleton />)}</WithId>;
}

const STATUS = { en_route: "En route", arrive: "Pointé à Lomé", receptionne: "Réceptionné" } as const;

function Fiche({ id }: { id: string }) {
  const { db, me, run } = useApp();
  const router = useRouter();
  const [modal, setModal] = useState<null | "etape" | "pointage" | "pesee">(null);
  const t = db.transports.find((x) => x.id === id);
  const c = t && db.contracts.find((x) => x.id === t.contractId);
  if (!t || !c || t.deleted || (me.role === "fournisseur" && c.supplierId !== me.id))
    return <Empty icon={<Truck className="size-5" />} title="Transport introuvable" text="Il a peut-être été supprimé après validation du patron." action={<Link href="/transports/" className="text-[14px] font-semibold text-brand-700">Retour aux transports</Link>} />;
  const perms = db.settings[0]!.perms;
  const events = db.traces.filter((e) => e.transportId === t.id && !e.deleted);
  const ck = db.checkins.find((x) => x.transportId === t.id && !x.deleted);
  const delivery = db.deliveries.find((d) => d.transportId === t.id && !d.deleted);
  const dm = deleteMode(perms, me, "transports");
  const pendingDel = db.pending.find((p) => p.entityId === t.id && p.status === "en_attente");

  return (
    <>
      <div className="animate-in mb-6">
        <Link href="/transports/" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" /> Transports</Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-bold tracking-[-0.025em]">{t.ref}</h1>
              <Badge tone={t.status === "receptionne" ? "dark" : "blue"}>{STATUS[t.status]}</Badge>
              {ck?.plateMismatch && <Badge tone="err">Écart de matricule</Badge>}
              {pendingDel && <Badge tone="outline">Suppression demandée</Badge>}
            </div>
            <p className="num mt-1 text-[14.5px] text-muted">{t.origin} → Lomé · {tonnes(t.tonsKg)} de {productLabel[t.product].toLowerCase()} · <Link className="font-semibold text-brand-700 hover:underline" href={`/contrats/fiche/?id=${c.id}`}>{c.ref}</Link> · {nameOf(db, c.supplierId)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {t.status === "en_route" && can(perms, me, "traces", "c") && <Button variant={me.role === "fournisseur" ? "primary" : "secondary"} icon={<MapPinPlus className="size-4" />} onClick={() => setModal("etape")} data-testid="btn-stage">Ajouter une étape</Button>}
            {t.status === "en_route" && me.role !== "fournisseur" && can(perms, me, "pointages", "c") && <Button icon={<Warehouse className="size-4" />} onClick={() => setModal("pointage")} data-testid="btn-checkin">Pointer l&apos;arrivée à Lomé</Button>}
            {t.status === "arrive" && me.role !== "fournisseur" && <Button icon={<Scale className="size-4" />} onClick={() => setModal("pesee")} data-testid="btn-weigh">Pesée et réception</Button>}
            {me.role !== "fournisseur" && dm !== "interdite" && !pendingDel && (
              <Button variant="ghost" icon={<Trash2 className="size-4" />} data-testid="btn-delete-transport" onClick={async () => {
                const queued = dm === "confirmation";
                const reason = await askReason({ title: queued ? "Demander la suppression ?" : "Supprimer ce transport ?", html: queued ? `La demande pour <b>${t.ref}</b> sera envoyée dans « Actions à confirmer ».` : `<b>${t.ref}</b> sera masqué mais conservé.`, confirmText: queued ? "Envoyer la demande" : "Supprimer", dark: true });
                if (!reason) return;
                const r = await run(() => requestDelete(me, "transports", t.id, `Transport ${t.ref} · ${productLabel[t.product].toLowerCase()} · ${tonnes(t.tonsKg)}`, reason));
                if (r === "queued") await info("Demande envoyée", "Le patron a reçu votre demande. Le transport reste visible tant qu'elle n'est pas validée.");
                if (r === "deleted") { await success("Transport supprimé"); router.push("/transports/"); }
              }}>{dm === "confirmation" ? "Demander la suppression" : "Supprimer"}</Button>
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="animate-in">
          <CardTitle title="Timeline du lot" sub="Chaque étape est horodatée et chaînée à la précédente" />
          <Timeline events={events} threshold={db.settings[0]!.weightGapThresholdPct} done={t.status === "receptionne"} />
        </Card>
        <div className="space-y-6">
          <Card className="animate-in">
            <CardTitle title="Transport" />
            <KV items={[
              { k: "Véhicule", v: <span className="font-mono">{t.vehicle}</span> },
              { k: "Chauffeur", v: t.driver },
              { k: "Téléphone", v: t.driverPhone || "—" },
              { k: "Livreur", v: t.carrier },
              { k: "Chargement", v: dateTime(t.loadingDate) },
              { k: "Départ", v: dateTime(t.departureDate) },
              { k: "Arrivée", v: dateTime(t.arrivalDate) },
              { k: "Tonnes chargées", v: tonnes(t.tonsKg) },
            ]} />
          </Card>
          {ck && (
            <Card className="animate-in">
              <CardTitle title="Pointage à Lomé" sub={dateTime(ck.at)} icon={<Warehouse className="size-[18px]" />} />
              <KV items={[
                { k: "Matricule constaté", v: <span className="font-mono">{ck.plateSeen}</span> },
                { k: "Pointé par", v: nameOf(db, ck.by) },
                { k: "Coût de transport", v: fcfa(ck.cost) },
                { k: "Débité sur", v: ck.debitedOn === "charges_patron" ? "Charges du patron" : "Solde du fournisseur" },
              ]} />
            </Card>
          )}
          {delivery && (
            <Card className="animate-in">
              <CardTitle title="Réception" sub={`Ticket ${delivery.ticketNo}`} icon={<Scale className="size-[18px]" />} />
              <KV items={[
                { k: "Poids brut", v: `${group(delivery.grossKg)} kg` },
                { k: "Tare", v: `${group(delivery.tareKg)} kg` },
                { k: "Poids net", v: tonnes(delivery.netKg) },
                { k: "Sacs", v: String(delivery.bags) },
                { k: "Prix figé", v: prixKg(delivery.price) },
                { k: "Valeur", v: fcfa(delivery.value) },
              ]} />
            </Card>
          )}
        </div>
      </div>
      {modal === "etape" && <StageModal t={t} onClose={() => setModal(null)} />}
      {modal === "pointage" && <CheckinModal t={t} onClose={() => setModal(null)} />}
      {modal === "pesee" && <WeighModal t={t} onClose={() => setModal(null)} />}
    </>
  );
}

function StageModal({ t, onClose }: { t: Transport; onClose: () => void }) {
  const { db, me } = useApp();
  const places = db.locations.filter((l) => !l.deleted && l.type !== "destination");
  const last = db.traces.filter((e) => e.transportId === t.id).sort((a, b) => b.order - a.order)[0];
  const [f, setF] = useState({ type: "etape" as TraceType, place: "Kaboli", free: "", save: true, at: toLocalInput(new Date().toISOString()), tons: String((last?.qtyKg ?? t.tonsKg) / 1000), receiver: me.name, role: me.role === "gestionnaire" ? "Gestionnaire délégué (sur place)" : me.role === "fournisseur" ? "Fournisseur" : "Patron", comment: "", photo: undefined as string | undefined });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (f.place === "Kaboli" && me.role !== "gestionnaire") {
      const g = db.users.find((u) => u.role === "gestionnaire" && u.zone === "Kaboli");
      if (g) setF((x) => ({ ...x, receiver: g.name, role: "Gestionnaire délégué (sur place)" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.place]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Ajouter une étape" sub={`${t.ref} · nombre d'étapes libre, Kaboli et la frontière sont facultatifs`} wide
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={busy} data-testid="stage-submit" onClick={async () => {
        setBusy(true);
        try {
          const r = await addTraceEvent(me, t.id, { type: f.type, place: f.place === "__libre" ? f.free : f.place, saveLocation: f.place === "__libre" && f.save, at: fromLocalInput(f.at), qtyKg: Math.round(Number(f.tons.replace(",", ".")) * 1000), receiver: f.receiver, receiverRole: f.role, comment: f.comment || undefined, photo: f.photo });
          onClose();
          await success("Étape enregistrée", r.gap ? "Un écart de quantité avec le chargement est signalé sur la timeline et au patron." : "Elle apparaît dans la timeline du lot.");
        } catch (e) { await fail(e); } finally { setBusy(false); }
      }}>Enregistrer l&apos;étape</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type d'événement">
          <Select value={f.type} onChange={set("type")}>
            <option value="etape">Passage d&apos;étape</option>
            <option value="livraison_lieu_prevu">Livraison au lieu prévu</option>
            <option value="chargement">Chargement complémentaire</option>
          </Select>
        </Field>
        <Field label="Lieu">
          <Select value={f.place} onChange={set("place")}>
            {places.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
            <option value="__libre">Autre lieu (saisie libre)…</option>
          </Select>
        </Field>
        {f.place === "__libre" && (
          <Field label="Lieu libre" className="sm:col-span-2" hint={<label className="inline-flex items-center gap-2"><input type="checkbox" checked={f.save} onChange={(e) => setF({ ...f, save: e.target.checked })} className="accent-brand-600" /> Ajouter à la table des lieux</label>}>
            <Input value={f.free} onChange={set("free")} placeholder="ex. Blitta" />
          </Field>
        )}
        <Field label="Date et heure"><Input type="datetime-local" value={f.at} onChange={set("at")} /></Field>
        <Field label="Tonnes constatées"><Input inputMode="decimal" value={f.tons} onChange={set("tons")} name="stageTons" /></Field>
        <Field label="Réceptionnaire"><Input value={f.receiver} onChange={set("receiver")} /></Field>
        <Field label="Qualité du réceptionnaire"><Input value={f.role} onChange={set("role")} /></Field>
        <Field label="Commentaire" className="sm:col-span-2"><Textarea value={f.comment} onChange={set("comment")} placeholder="Facultatif" /></Field>
        <div className="sm:col-span-2"><PhotoInput label="Photo (facultative)" value={f.photo} onChange={(photo) => setF({ ...f, photo })} /></div>
      </div>
    </Modal>
  );
}

function CheckinModal({ t, onClose }: { t: Transport; onClose: () => void }) {
  const { db, me } = useApp();
  const c = db.contracts.find((x) => x.id === t.contractId)!;
  const [f, setF] = useState({ plate: t.vehicle, driver: t.driver, at: toLocalInput(new Date().toISOString()), tons: String(t.tonsKg / 1000), cost: "", beneficiary: t.carrier });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const mismatch = f.plate.replace(/-/g, "").toUpperCase() !== t.vehicle.replace(/-/g, "");
  return (
    <Modal open onClose={onClose} title="Pointer l'arrivée à Lomé" sub={`${t.ref} · attendu : ${t.vehicle} · ${t.driver}`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={busy} data-testid="checkin-submit" onClick={async () => {
        setBusy(true);
        try {
          const r = await checkinLome(me, t.id, { plateSeen: f.plate, driver: f.driver, at: fromLocalInput(f.at), tonsAnnouncedKg: Math.round(Number(f.tons.replace(",", ".")) * 1000), cost: Number(f.cost || 0), beneficiary: f.beneficiary });
          onClose();
          await success("Véhicule pointé à Lomé", `Coût de transport débité ${r.debitedOn === "charges_patron" ? "dans les <b>charges du patron</b>" : "sur le <b>solde du fournisseur</b>"}.${r.mismatch ? "<br/>Écart de matricule signalé au patron." : ""}<br/>Étape suivante : pesée et réception.`);
        } catch (e) { await fail(e); } finally { setBusy(false); }
      }}>Pointer et débiter les coûts</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Matricule constaté" hint={mismatch ? <span className="font-semibold text-err">Ne correspond pas au transport ({t.vehicle}) : une alerte sera envoyée.</span> : "Conforme au transport."}>
          <Input value={f.plate} onChange={set("plate")} className="font-mono uppercase" name="plate" />
        </Field>
        <Field label="Chauffeur"><Input value={f.driver} onChange={set("driver")} /></Field>
        <Field label="Date et heure d'arrivée"><Input type="datetime-local" value={f.at} onChange={set("at")} /></Field>
        <Field label="Tonnes annoncées"><Input inputMode="decimal" value={f.tons} onChange={set("tons")} /></Field>
        <Field label="Coût de transport (FCFA)"><Input inputMode="numeric" value={f.cost} onChange={set("cost")} placeholder="ex. 450000" name="cost" /></Field>
        <Field label="Bénéficiaire"><Input value={f.beneficiary} onChange={set("beneficiary")} /></Field>
      </div>
      <div className="mt-5 rounded-2xl border border-line bg-canvas p-4 text-[13.5px]">
        <div className="font-semibold">Règle du contrat {c.ref} : transport {c.transportPaidByPatron ? "payé par le patron" : "non payé par le patron"}</div>
        <div className="mt-0.5 text-muted">{c.transportPaidByPatron ? "Le coût sera inscrit dans les charges du patron." : "Le coût sera imputé au fournisseur et augmentera son solde (règle à confirmer avec le client)."}{f.cost ? ` Montant : ${fcfa(Number(f.cost))}.` : ""}</div>
      </div>
    </Modal>
  );
}

function WeighModal({ t, onClose }: { t: Transport; onClose: () => void }) {
  const { db, me } = useApp();
  const c = db.contracts.find((x) => x.id === t.contractId)!;
  const price = currentPrice(db, c);
  const [f, setF] = useState({ gross: String(t.tonsKg + Math.round(t.tonsKg / 50)), tare: String(Math.round(t.tonsKg / 50)), bags: String(Math.round(t.tonsKg / 50)), ticket: `PE-${String(Math.floor(1000 + Math.random() * 8999))}` });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const net = Number(f.gross) - Number(f.tare);
  return (
    <Modal open onClose={onClose} title="Pesée et réception" sub={`${t.ref} · ${tonnes(t.tonsKg)} chargées`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={busy} data-testid="weigh-submit" onClick={async () => {
        setBusy(true);
        try {
          const r = await weighAndReceive(me, t.id, { grossKg: Number(f.gross), tareKg: Number(f.tare), bags: Number(f.bags), ticketNo: f.ticket });
          onClose();
          await success("Livraison réceptionnée", `${tonnes(r.delivery.netKg)} valorisées <b>${fcfa(r.delivery.value)}</b> au prix figé de ${prixKg(r.delivery.price)}.<br/>Reste à livrer : ${tonnes(r.before.Q)} → <b>${tonnes(r.after.Q)}</b>.`);
        } catch (e) { await fail(e); } finally { setBusy(false); }
      }}>Réceptionner</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Poids brut (kg)"><Input inputMode="numeric" value={f.gross} onChange={set("gross")} name="gross" /></Field>
        <Field label="Tare (kg)"><Input inputMode="numeric" value={f.tare} onChange={set("tare")} name="tare" /></Field>
        <Field label="Nombre de sacs"><Input inputMode="numeric" value={f.bags} onChange={set("bags")} /></Field>
        <Field label="Ticket de pesée"><Input value={f.ticket} onChange={set("ticket")} /></Field>
      </div>
      <div className="num mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-ink p-4 text-white">
        <div><div className="text-[11.5px] text-white/55">Poids net</div><div className="text-[16px] font-bold">{net > 0 ? tonnes(net) : "—"}</div></div>
        <div><div className="text-[11.5px] text-white/55">Prix en vigueur</div><div className="text-[16px] font-bold">{prixKg(price)}</div></div>
        <div><div className="text-[11.5px] text-white/55">Valeur</div><div className="text-[16px] font-bold">{net > 0 ? fcfa(net * price) : "—"}</div></div>
      </div>
    </Modal>
  );
}
