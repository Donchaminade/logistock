"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, CheckCircle2, Circle, MapPin, PackageCheck, Route, Truck } from "lucide-react";
import { useApp } from "@/components/DataProvider";
import { nameOf, WithId } from "@/components/domain";
import { ArrivalModal, LoadingModal, pickupPlaces, PickupBadge, StageModal } from "@/components/pickup";
import { RouteMap } from "@/components/RouteMap";
import { Badge, Button, Card, CardTitle, cx, Empty, KV, PageSkeleton, Photo } from "@/components/ui";
import { dateTime, tonnes } from "@/lib/format";

export default function Page() {
  return <WithId>{(id) => (id ? <Fiche id={id} /> : <PageSkeleton />)}</WithId>;
}

function Fiche({ id }: { id: string }) {
  const { db, me } = useApp();
  const [modal, setModal] = useState<null | { k: "load" | "stage"; id: string } | { k: "arrival" }>(null);
  const p = db.pickups.find((x) => x.id === id);
  const driver = p && db.drivers.find((d) => d.id === p.driverId);
  const mine = me.role === "chauffeur" ? driver?.userId === me.id : me.role === "fournisseur" ? !!p?.stops.some((s) => s.supplierId === me.id) : true;
  if (!p || p.deleted || !mine) return <Empty icon={<Route className="size-5" />} title="Ordre introuvable" action={<Link href={me.role === "chauffeur" ? "/trajets/" : "/enlevements/"} className="text-[14px] font-semibold text-brand-700">Retour</Link>} />;
  const actor = (me.role === "chauffeur" && driver?.userId === me.id) || ["patron", "admin", "gestionnaire"].includes(me.role);
  const lots = db.transports.filter((t) => t.pickupId === p.id && !t.deleted);
  const loaded = p.stops.some((s) => s.confirmedAt);
  const nextStage = p.route.filter((r) => !r.passedAt).sort((a, b) => a.order - b.order)[0];
  const { places, passed } = pickupPlaces(db, p);

  return (
    <>
      <div className="animate-in mb-6">
        <Link href={me.role === "chauffeur" ? "/trajets/" : "/enlevements/"} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" /> {me.role === "chauffeur" ? "Mes trajets" : "Ordres d'enlèvement"}</Link>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-[26px] font-bold tracking-[-0.025em]">{p.ref}</h1><PickupBadge db={db} p={p} /></div>
        <p className="num mt-1 text-[14.5px] text-muted"><span className="font-mono">{p.vehicle}</span> · {driver?.name} · prévu le {dateTime(p.plannedDate)}</p>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardTitle title="1. Chargements chez les acheteurs" sub="Quantité, sacs et photo ; un lot est créé à chaque confirmation" icon={<Truck className="size-[18px]" />} />
            <ul className="space-y-3">
              {p.stops.map((s) => (
                <li key={s.id} className="rounded-2xl border border-line p-4" data-testid={`stop-${s.id}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    {s.confirmedAt ? <CheckCircle2 className="size-5 text-brand-600" /> : <Circle className="size-5 text-subtle" />}
                    <div className="min-w-[13rem] flex-1">
                      <div className="font-semibold">{nameOf(db, s.supplierId)}</div>
                      <div className="text-[13px] text-muted">{db.contracts.find((c) => c.id === s.contractId)?.ref} · prévu {tonnes(s.plannedKg)}{s.confirmedAt ? ` · chargé ${tonnes(s.loadedKg ?? 0)} (${s.bags} sacs) le ${dateTime(s.confirmedAt)}` : ""}</div>
                    </div>
                    {s.photo && <Photo src={s.photo} alt="Chargement" className="size-11" />}
                    {!s.confirmedAt && actor && <Button size="lg" className="w-full sm:w-auto" icon={<PackageCheck className="size-4" />} data-testid="btn-confirm-loading" onClick={() => setModal({ k: "load", id: s.id })}>Confirmer le chargement</Button>}
                    {s.transportId && <Link href={`/transports/fiche/?id=${s.transportId}`} className="text-[13px] font-semibold text-brand-700 hover:underline">Lot {db.transports.find((t) => t.id === s.transportId)?.ref}</Link>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle title="2. Étapes du trajet" sub="Confirmez chaque passage, même sans réseau" icon={<MapPin className="size-[18px]" />} />
            {p.route.length === 0 ? <p className="text-[14px] text-muted">Trajet direct vers Lomé.</p> : (
              <ol className="space-y-2">
                {p.route.slice().sort((a, b) => a.order - b.order).map((r) => (
                  <li key={r.id} className={cx("flex flex-wrap items-center gap-3 rounded-2xl border p-3.5", r.passedAt ? "border-line bg-canvas/50" : "border-line")} data-testid={`stage-${r.place}`}>
                    <span className={cx("num grid size-9 place-items-center rounded-full text-[13px] font-bold", r.passedAt ? "bg-brand-600 text-white" : "bg-canvas text-ink")}>{r.order}</span>
                    <div className="min-w-0 flex-1"><div className="font-semibold">{r.place}</div><div className="text-[12.5px] text-muted">{r.passedAt ? `Passé le ${dateTime(r.passedAt)}${r.by ? ` · ${nameOf(db, r.by)}` : ""}${r.comment ? ` · ${r.comment}` : ""}` : "À venir"}</div></div>
                    {r.photo && <Photo src={r.photo} alt={r.place} className="size-10" />}
                    {!r.passedAt && actor && nextStage?.id === r.id && <Button size="lg" variant={loaded ? "primary" : "secondary"} disabled={!loaded} className="w-full sm:w-auto" data-testid="btn-pass-stage" onClick={() => setModal({ k: "stage", id: r.id })}>Confirmer le passage</Button>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card>
            <CardTitle title="3. Arrivée à Lomé" sub="Photo obligatoire ; le magasinier pointe et pèse ensuite" icon={<Camera className="size-[18px]" />} />
            {p.arrivalDeclaredAt ? (
              <div className="flex items-center gap-3">{p.arrivalPhoto && <Photo src={p.arrivalPhoto} alt="Arrivée" className="size-14" />}<div><Badge tone="dark">Arrivée déclarée</Badge><div className="mt-1 text-[13px] text-muted">{dateTime(p.arrivalDeclaredAt)}</div></div></div>
            ) : actor ? (
              <Button size="lg" className="w-full sm:w-auto" disabled={!loaded} icon={<Camera className="size-4" />} data-testid="btn-arrival" onClick={() => setModal({ k: "arrival" })}>Déclarer l&apos;arrivée avec photo</Button>
            ) : <p className="text-[14px] text-muted">En attente du chauffeur.</p>}
          </Card>
        </div>
        <div className="space-y-6">
          <Card pad={false}>
            <div className="p-5 pb-3"><CardTitle title="Carte du trajet" icon={<Route className="size-[18px]" />} /></div>
            <RouteMap places={places} passed={passed} className="h-64" />
          </Card>
          <Card>
            <CardTitle title="Ordre" />
            <KV items={[{ k: "Véhicule", v: <span className="font-mono">{p.vehicle}</span> }, { k: "Chauffeur", v: driver?.name ?? "—" }, { k: "Téléphone", v: driver?.phone ?? "—" }, { k: "Transporteur", v: p.carrier }, { k: "Créé par", v: nameOf(db, p.createdBy) }, { k: "Lots", v: String(lots.length) }]} />
          </Card>
        </div>
      </div>
      {modal?.k === "load" && <LoadingModal p={p} stopId={modal.id} onClose={() => setModal(null)} />}
      {modal?.k === "stage" && <StageModal p={p} stageId={modal.id} onClose={() => setModal(null)} />}
      {modal?.k === "arrival" && <ArrivalModal p={p} onClose={() => setModal(null)} />}
    </>
  );
}
