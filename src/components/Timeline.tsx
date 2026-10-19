"use client";
import { AlertTriangle, Flag, MapPin, PackageCheck, Scale, ShoppingBasket, Truck, Warehouse } from "lucide-react";
import { traceGaps } from "@/lib/calc";
import { dateTime, tonnes } from "@/lib/format";
import type { TraceEvent, TraceType } from "@/lib/types";
import { TRACE_LABEL } from "@/services/actions";
import { Badge, Photo, cx } from "./ui";

const ICON: Record<TraceType, typeof Truck> = {
  achat: ShoppingBasket, chargement: Truck, etape: MapPin, livraison_lieu_prevu: Flag, pointage_lome: Warehouse, pesee: Scale, reception: PackageCheck,
};

/** Vue timeline d'un lot (§2.9, US-21) : origine → étapes → Lomé, réceptionnaires, écarts, preuves. */
export function Timeline({ events, threshold, done }: { events: TraceEvent[]; threshold: number; done: boolean }) {
  const sorted = [...events].sort((a, b) => a.order - b.order);
  const gaps = traceGaps(sorted, threshold);
  return (
    <ol className="relative" data-testid="timeline">
      {sorted.map((e, i) => {
        const Icon = ICON[e.type];
        const last = i === sorted.length - 1;
        const gap = gaps[e.id];
        return (
          <li key={e.id} className="animate-in relative flex gap-4 pb-7 last:pb-0" style={{ animationDelay: `${i * 40}ms` }}>
            {!last && <span className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-0.5 bg-brand-600" />}
            <span className={cx("relative z-10 grid size-10 shrink-0 place-items-center rounded-full ring-4 ring-white", e.type === "reception" ? "bg-ink text-white" : "bg-brand-600 text-white")}>
              <Icon className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14.5px] font-bold">{e.place}</span>
                <Badge tone={e.type === "reception" ? "dark" : "blue"}>{TRACE_LABEL[e.type]}</Badge>
                {gap !== undefined && <Badge tone="err"><AlertTriangle className="size-3" /> Écart {tonnes(gap)}</Badge>}
              </div>
              <div className="num mt-1 text-[13px] text-muted">{dateTime(e.at)} · <b className="text-ink">{tonnes(e.qtyKg)}</b></div>
              <div className="mt-1 text-[13px]">
                <span className="text-muted">Réceptionnaire : </span><span className="font-semibold">{e.receiver}</span> <span className="text-muted">({e.receiverRole})</span>
              </div>
              {(e.vehicle || e.driver) && <div className="mt-0.5 text-[12.5px] text-muted">{[e.vehicle && `Véhicule ${e.vehicle}`, e.driver && `chauffeur ${e.driver}`, e.carrier && `livreur ${e.carrier}`].filter(Boolean).join(" · ")}</div>}
              {e.comment && <div className="mt-1.5 rounded-lg bg-canvas px-3 py-2 text-[12.5px] text-ink/80">{e.comment}</div>}
              <div className="mt-2 flex items-center gap-3">
                {e.photo && <Photo src={e.photo} alt={`Preuve · ${e.place}`} className="size-12" />}
                <code className="font-mono text-[10.5px] text-subtle" title="Empreinte chaînée à l'événement précédent">#{e.hash.slice(0, 10)} ← #{e.prevHash.slice(0, 10)}</code>
              </div>
            </div>
          </li>
        );
      })}
      {!done && (
        <li className="relative flex gap-4 pt-7">
          <span className="absolute left-[19px] top-0 h-7 border-l-2 border-dashed border-line-2" />
          <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-line-2 bg-white text-subtle"><Warehouse className="size-[18px]" /></span>
          <div className="pt-2 text-[13.5px] text-muted">Lomé · magasin central — en attente</div>
        </li>
      )}
    </ol>
  );
}
