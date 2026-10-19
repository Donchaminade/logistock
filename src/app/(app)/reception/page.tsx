"use client";
import Link from "next/link";
import { CheckCircle2, ChevronRight, PackageCheck, Scale, Truck, Warehouse } from "lucide-react";
import { success } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { nameOf } from "@/components/domain";
import { Badge, Button, Card, CardTitle, Empty, PageHeader, Stat } from "@/components/ui";
import { dateTime, prixKg, productLabel, tonnes } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Transport } from "@/lib/types";
import { receiveDelivery } from "@/services/actions";

export default function Reception() {
  const { db, me, run } = useApp();
  const perms = db.settings[0]!.perms;
  const ts = db.transports.filter((t) => !t.deleted);
  const deliveries = db.deliveries.filter((d) => !d.deleted);
  const enRoute = ts.filter((t) => t.status === "en_route");
  const arrived = enRoute.filter((t) => t.pickupId && db.pickups.find((p) => p.id === t.pickupId)?.arrivalDeclaredAt);
  const expected = enRoute.filter((t) => !arrived.includes(t));
  const toWeigh = ts.filter((t) => t.status === "arrive" && !deliveries.some((d) => d.transportId === t.id));
  const toReceive = deliveries.filter((d) => d.status === "pesee");
  const received = deliveries.filter((d) => d.status === "receptionnee");
  const stock = (["soja", "cacao"] as const).map((p) => ({ p, kg: received.filter((d) => db.contracts.find((c) => c.id === d.contractId)?.product === p).reduce((s, d) => s + d.netKg, 0) }));
  const gaps = received.filter((d) => { const t = ts.find((x) => x.id === d.transportId); return t && Math.abs(d.netKg - t.tonsKg) / t.tonsKg > db.settings[0]!.weightGapThresholdPct / 100; });

  const Row = ({ t, cta, tid }: { t: Transport; cta: string; tid: string }) => (
    <li>
      <Link href={`/transports/fiche/?id=${t.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5 hover:border-brand-600" data-testid={tid}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas"><Truck className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{t.ref} · <span className="font-mono text-[13px]">{t.vehicle}</span></div>
          <div className="truncate text-[12.5px] text-muted">{tonnes(t.tonsKg)} de {productLabel[t.product].toLowerCase()} · {t.origin} · {nameOf(db, db.contracts.find((c) => c.id === t.contractId)?.supplierId)}</div>
        </div>
        <span className="hidden text-[13px] font-semibold text-brand-700 sm:inline">{cta}</span>
        <ChevronRight className="size-4 text-subtle" />
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader eyebrow="Magasin de Lomé" title="Réception et pesées" sub="Pointage du camion (matricule vérifié), pesée (brut, tare, sacs, humidité), puis réception qui fige le prix et met à jour le solde." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="À pointer" value={String(arrived.length + expected.length)} hint={`${arrived.length} camion(s) arrivé(s)`} />
        <Stat label="À peser" value={String(toWeigh.length)} />
        <Stat label="À réceptionner" value={String(toReceive.length)} hint="Pesées en attente" />
        <Stat label="Stock au magasin" value={tonnes(stock.reduce((s, x) => s + x.kg, 0))} hint={stock.map((x) => `${productLabel[x.p]} ${tonnes(x.kg)}`).join(" · ")} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle title="Camions arrivés : à pointer" sub="Déclarés arrivés par le chauffeur (photo)" icon={<Warehouse className="size-[18px]" />} />
          {arrived.length ? <ul className="space-y-2">{arrived.map((t) => <Row key={t.id} t={t} cta="Pointer" tid={`arrived-${t.ref}`} />)}</ul> : <p className="text-[14px] text-muted">Aucun camion en attente au magasin.</p>}
          {expected.length > 0 && <>
            <div className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-[0.06em] text-subtle">Attendus (en route)</div>
            <ul className="space-y-2">{expected.map((t) => <Row key={t.id} t={t} cta="Voir le trajet" tid={`expected-${t.ref}`} />)}</ul>
          </>}
        </Card>
        <Card>
          <CardTitle title="À peser" sub="Pointés, en attente de pesée" icon={<Scale className="size-[18px]" />} />
          {toWeigh.length ? <ul className="space-y-2">{toWeigh.map((t) => <Row key={t.id} t={t} cta="Peser" tid={`toweigh-${t.ref}`} />)}</ul> : <p className="text-[14px] text-muted">Rien à peser.</p>}
        </Card>
        <Card>
          <CardTitle title="À réceptionner" sub="La réception fige le prix en vigueur" icon={<PackageCheck className="size-[18px]" />} />
          {toReceive.length ? (
            <ul className="divide-y divide-line">
              {toReceive.map((d) => {
                const c = db.contracts.find((x) => x.id === d.contractId)!;
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1"><div className="font-semibold">Ticket {d.ticketNo} · {tonnes(d.netKg)}</div><div className="text-[12.5px] text-muted">{c.ref} · pesé le {dateTime(d.weighedAt)} par {nameOf(db, d.weighedBy)}</div></div>
                    {can(perms, me, "pesees", "u") ? <Button size="sm" icon={<CheckCircle2 className="size-3.5" />} data-testid={`receive-${d.ticketNo}`} onClick={async () => { const r = await run(() => receiveDelivery(me, d.id)); if (r) await success("Livraison réceptionnée", `Prix figé : <b>${prixKg(r.price)}</b>. Reste à livrer : ${tonnes(r.before.Q)} → <b>${tonnes(r.after.Q)}</b>.`); }}>Réceptionner</Button> : <Badge>En attente du patron</Badge>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-[14px] text-muted">Aucune pesée en attente.</p>}
        </Card>
        <Card>
          <CardTitle title="Dernières réceptions" sub={gaps.length ? `${gaps.length} écart(s) de pesée au-delà du seuil` : "Aucun écart au-delà du seuil"} />
          {received.length ? (
            <ul className="divide-y divide-line">
              {received.sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? "")).slice(0, 6).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
                  <span><span className="font-semibold">{d.ticketNo}</span> · {db.contracts.find((c) => c.id === d.contractId)?.ref}{gaps.includes(d) && <Badge tone="err" className="ml-2">Écart</Badge>}</span>
                  <span className="num font-semibold">{tonnes(d.netKg)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty icon={<PackageCheck className="size-5" />} title="Aucune réception" />}
        </Card>
      </div>
    </>
  );
}
