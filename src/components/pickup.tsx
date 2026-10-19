"use client";
// Ordres d'enlèvement (§2.4, US-06) : création, statut, actions du chauffeur (chargement, étapes, arrivée).
import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { success } from "./alerts";
import { useApp } from "./DataProvider";
import { Badge, Button, Field, Input, Modal, PhotoInput, Select, Textarea } from "./ui";
import { pickupStatus, PICKUP_STATUS_LABEL, supplierStock } from "@/lib/calc";
import { tonnes } from "@/lib/format";
import type { Database, Pickup, PickupStatus } from "@/lib/types";
import { confirmLoading, createPickup, declareArrival, passStage } from "@/services/actions";
import { isOnline } from "@/services/network";

const PENDING = "<br/>Hors ligne : enregistré sur l'appareil, <b>en attente de synchronisation</b>.";
const after = () => (isOnline() ? "" : PENDING);

export function PickupBadge({ db, p }: { db: Database; p: Pickup }) {
  const s: PickupStatus = pickupStatus(db, p);
  return <Badge tone={s === "cloture" ? "ok" : s === "planifie" ? "outline" : s === "livre" ? "dark" : "blue"}>{PICKUP_STATUS_LABEL[s]}</Badge>;
}

/** Lieux du trajet dans l'ordre : origines des arrêts, étapes, Lomé. */
export function pickupPlaces(db: Database, p: Pickup) {
  const origins = p.stops.map((s) => db.users.find((u) => u.id === s.supplierId)?.zone ?? "").filter(Boolean);
  return { places: [...origins, ...p.route.map((r) => r.place), "Lomé"], passed: p.stops.filter((s) => s.confirmedAt).length + p.route.filter((r) => r.passedAt).length + (p.arrivalDeclaredAt ? 1 : 0) };
}

export function NewPickupModal({ onClose, onDone, presetContractId }: { onClose: () => void; onDone?: (p: Pickup) => void; presetContractId?: string }) {
  const { db, me } = useApp();
  const active = db.contracts.filter((c) => !c.deleted && c.status === "actif");
  const vehicles = db.vehicles.filter((v) => !v.deleted && v.active);
  const drivers = db.drivers.filter((d) => !d.deleted && d.active);
  const [f, setF] = useState({ vehicle: vehicles[0]?.plate ?? "", driverId: drivers[0]?.id ?? "", carrier: vehicles[0]?.owner ?? "", date: new Date(Date.now() + 864e5).toISOString().slice(0, 10) });
  const [stops, setStops] = useState([{ contractId: presetContractId ?? active[0]?.id ?? "", tons: "" }]);
  const [route, setRoute] = useState<string[]>(["Kaboli", "Atakpamé"]);
  const [busy, setBusy] = useState(false);
  const places = db.locations.filter((l) => !l.deleted && l.type !== "destination");
  const cap = vehicles.find((v) => v.plate === f.vehicle)?.capacityKg ?? 0;
  const total = stops.reduce((s, x) => s + Math.round(Number(x.tons.replace(",", ".") || 0) * 1000), 0);
  return (
    <Modal open onClose={onClose} wide title="Nouvel ordre d'enlèvement" sub="Véhicule, chauffeur, acheteurs à visiter, quantités prévues et trajet. Le chauffeur et les acheteurs sont notifiés."
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={busy} data-testid="pickup-submit" onClick={async () => {
        setBusy(true);
        try {
          const p = await createPickup(me, { vehicle: f.vehicle, driverId: f.driverId, carrier: f.carrier, plannedDate: new Date(`${f.date}T07:00:00`).toISOString(), stops: stops.map((s) => ({ contractId: s.contractId, plannedKg: Math.round(Number(s.tons.replace(",", ".")) * 1000) })), route });
          onClose();
          await success("Ordre d'enlèvement créé", `${p.ref} · ${p.vehicle} · ${tonnes(total)} prévues.<br/>Le chauffeur et les acheteurs concernés sont notifiés.`);
          onDone?.(p);
        } catch (e) {
          const { fail } = await import("./alerts");
          await fail(e);
        } finally {
          setBusy(false);
        }
      }}>Créer l&apos;ordre</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Véhicule"><Select value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value, carrier: vehicles.find((v) => v.plate === e.target.value)?.owner ?? f.carrier })} name="vehicle">{vehicles.map((v) => <option key={v.id} value={v.plate}>{v.plate} · {v.type}</option>)}</Select></Field>
        <Field label="Chauffeur"><Select value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })} name="driver">{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.userId ? " · accès mobile" : ""}</option>)}</Select></Field>
        <Field label="Transporteur"><Input value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })} /></Field>
        <Field label="Date prévue"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      </div>
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between"><div className="text-[13px] font-semibold">Acheteurs à visiter</div><Button size="sm" variant="quiet" icon={<Plus className="size-3.5" />} onClick={() => setStops([...stops, { contractId: active[0]?.id ?? "", tons: "" }])}>Ajouter un arrêt</Button></div>
        <div className="space-y-2">
          {stops.map((s, i) => {
            const c = active.find((x) => x.id === s.contractId);
            const st = c ? supplierStock(db, c.supplierId) : undefined;
            return (
              <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
                <Field label={i === 0 ? "Contrat (acheteur)" : ""} hint={st ? `Stock disponible déclaré : ${tonnes(st.available)}` : undefined}>
                  <Select value={s.contractId} onChange={(e) => setStops(stops.map((x, k) => (k === i ? { ...x, contractId: e.target.value } : x)))} name={`stop-${i}`}>
                    {active.map((c) => <option key={c.id} value={c.id}>{c.ref} · {db.users.find((u) => u.id === c.supplierId)?.name} · {c.product}</option>)}
                  </Select>
                </Field>
                <Field label={i === 0 ? "Prévu (t)" : ""} hint={st ? " " : undefined}><Input inputMode="decimal" value={s.tons} onChange={(e) => setStops(stops.map((x, k) => (k === i ? { ...x, tons: e.target.value } : x)))} name={`tons-${i}`} placeholder="ex. 10" /></Field>
                <Button size="sm" variant="ghost" aria-label="Retirer" disabled={stops.length === 1} onClick={() => setStops(stops.filter((_, k) => k !== i))} className="mb-6"><Minus className="size-4" /></Button>
              </div>
            );
          })}
        </div>
        {cap > 0 && total > cap && <p className="mt-1 text-[12.5px] font-semibold text-err">Total prévu {tonnes(total)} au-dessus de la capacité du véhicule ({tonnes(cap)}).</p>}
      </div>
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between"><div className="text-[13px] font-semibold">Étapes du trajet (ordre libre, nombre variable)</div><Button size="sm" variant="quiet" icon={<Plus className="size-3.5" />} onClick={() => setRoute([...route, ""])}>Ajouter une étape</Button></div>
        <datalist id="pk-places">{places.map((l) => <option key={l.id} value={l.name} />)}</datalist>
        <div className="grid gap-2 sm:grid-cols-2">
          {route.map((r, i) => (
            <div key={i} className="flex gap-2">
              <span className="num grid size-11 shrink-0 place-items-center rounded-xl bg-canvas text-[13px] font-bold">{i + 1}</span>
              <Input list="pk-places" value={r} onChange={(e) => setRoute(route.map((x, k) => (k === i ? e.target.value : x)))} placeholder="Lieu (table des lieux ou saisie libre)" />
              <Button size="sm" variant="ghost" aria-label="Retirer l'étape" onClick={() => setRoute(route.filter((_, k) => k !== i))}><Minus className="size-4" /></Button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-muted">Destination : Lomé · magasin central. Un lieu saisi librement est ajouté à la table des lieux.</p>
      </div>
    </Modal>
  );
}

export function LoadingModal({ p, stopId, onClose }: { p: Pickup; stopId: string; onClose: () => void }) {
  const { db, me } = useApp();
  const stop = p.stops.find((s) => s.id === stopId)!;
  const sup = db.users.find((u) => u.id === stop.supplierId);
  const [f, setF] = useState({ tons: String(stop.plannedKg / 1000), bags: String(Math.round(stop.plannedKg / 50)), photo: undefined as string | undefined });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Confirmer le chargement" sub={`${sup?.name} · prévu ${tonnes(stop.plannedKg)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={busy} data-testid="loading-submit" onClick={async () => {
        setBusy(true);
        try {
          const t = await confirmLoading(me, p.id, stopId, { loadedKg: Math.round(Number(f.tons.replace(",", ".")) * 1000), bags: Number(f.bags), photo: f.photo });
          onClose();
          await success("Chargement confirmé", `Lot <b>${t.ref}</b> créé et suivi jusqu'à Lomé. La pesée finale se fait au magasin.${after()}`);
        } catch (e) {
          const { fail } = await import("./alerts");
          await fail(e);
        } finally {
          setBusy(false);
        }
      }}>Confirmer</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quantité chargée (t)"><Input inputMode="decimal" value={f.tons} onChange={(e) => setF({ ...f, tons: e.target.value })} name="loadedTons" /></Field>
        <Field label="Nombre de sacs"><Input inputMode="numeric" value={f.bags} onChange={(e) => setF({ ...f, bags: e.target.value })} name="bags" /></Field>
        <div className="sm:col-span-2"><PhotoInput label="Photo du chargement" value={f.photo} onChange={(photo) => setF({ ...f, photo })} /></div>
      </div>
    </Modal>
  );
}

export function StageModal({ p, stageId, onClose }: { p: Pickup; stageId: string; onClose: () => void }) {
  const { me } = useApp();
  const st = p.route.find((r) => r.id === stageId)!;
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Passage à ${st.place}`} sub="Date et heure enregistrées maintenant ; possible hors ligne"
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={busy} data-testid="pass-submit" onClick={async () => {
        setBusy(true);
        try {
          await passStage(me, p.id, stageId, { comment: comment || undefined, photo });
          onClose();
          await success(`Étape ${st.place} confirmée`, `Ajoutée à la timeline de chaque lot du camion.${after()}`);
        } catch (e) {
          const { fail } = await import("./alerts");
          await fail(e);
        } finally {
          setBusy(false);
        }
      }}>Confirmer le passage</Button></>}>
      <div className="space-y-4">
        <Field label="Commentaire (facultatif)"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="ex. Contrôle routier, RAS" /></Field>
        <PhotoInput label="Photo (facultative)" value={photo} onChange={setPhoto} />
      </div>
    </Modal>
  );
}

export function ArrivalModal({ p, onClose }: { p: Pickup; onClose: () => void }) {
  const { me } = useApp();
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Déclarer l'arrivée à Lomé" sub={`${p.vehicle} · le magasinier fera ensuite le pointage officiel et la pesée`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={busy} data-testid="arrival-submit" onClick={async () => {
        setBusy(true);
        try {
          await declareArrival(me, p.id, { photo, comment: comment || undefined });
          onClose();
          await success("Arrivée déclarée", `Le magasinier est prévenu : pointage et pesée au magasin.${after()}`);
        } catch (e) {
          const { fail } = await import("./alerts");
          await fail(e);
        } finally {
          setBusy(false);
        }
      }}>Déclarer l&apos;arrivée</Button></>}>
      <div className="space-y-4">
        <PhotoInput label="Photo du camion à l'arrivée (obligatoire)" value={photo} onChange={setPhoto} />
        <Field label="Commentaire (facultatif)"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
