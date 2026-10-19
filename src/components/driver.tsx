"use client";
// Espace chauffeur (mobile-first) : ses ordres d'enlèvement, la prochaine action, ses frais.
import Link from "next/link";
import { ChevronRight, Route } from "lucide-react";
import { useApp } from "./DataProvider";
import { PickupBadge } from "./pickup";
import { Card, Empty } from "./ui";
import { pickupStatus } from "@/lib/calc";
import { dateTime, tonnes } from "@/lib/format";
import type { Database, Pickup, User } from "@/lib/types";

export function myPickups(db: Database, me: User) {
  const ids = db.drivers.filter((d) => d.userId === me.id).map((d) => d.id);
  return db.pickups.filter((p) => !p.deleted && ids.includes(p.driverId)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
}

export function nextAction(p: Pickup) {
  const stop = p.stops.find((s) => !s.confirmedAt);
  if (!p.stops.some((s) => s.confirmedAt)) return `Charger chez l'acheteur (${tonnes(p.stops[0]?.plannedKg ?? 0)})`;
  const st = p.route.filter((r) => !r.passedAt).sort((a, b) => a.order - b.order)[0];
  if (st) return `Confirmer le passage à ${st.place}`;
  if (stop) return "Charger l'arrêt suivant";
  if (!p.arrivalDeclaredAt) return "Déclarer l'arrivée à Lomé (photo)";
  return "Pointage et pesée par le magasin";
}

export function TripList({ limit }: { limit?: number }) {
  const { db, me } = useApp();
  const list = myPickups(db, me).filter((p) => pickupStatus(db, p) !== "cloture");
  const done = myPickups(db, me).filter((p) => pickupStatus(db, p) === "cloture");
  if (!list.length && !done.length) return <Empty icon={<Route className="size-5" />} title="Aucun trajet attribué" text="Vos ordres d'enlèvement apparaîtront ici dès leur création." />;
  return (
    <ul className="space-y-3">
      {[...list, ...(limit ? [] : done)].slice(0, limit).map((p) => (
        <li key={p.id}>
          <Link href={`/enlevements/fiche/?id=${p.id}`} data-testid={`trip-${p.ref}`}>
            <Card className="transition-colors hover:border-brand-600">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-ink text-white"><Route className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{p.ref}</span><PickupBadge db={db} p={p} /></div>
                  <div className="truncate text-[13px] text-muted"><span className="font-mono">{p.vehicle}</span> · {dateTime(p.plannedDate)} · {p.route.map((r) => r.place).join(" → ") || "direct"} → Lomé</div>
                  <div className="mt-1.5 text-[13.5px] font-semibold text-brand-700">{nextAction(p)}</div>
                </div>
                <ChevronRight className="size-5 text-subtle" />
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
