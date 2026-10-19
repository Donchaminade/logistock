"use client";
import Link from "next/link";
import { Map } from "lucide-react";
import { useApp } from "@/components/DataProvider";
import { MapView, type MapLine, type MapMarker } from "@/components/MapView";
import { pickupPlaces, PickupBadge } from "@/components/pickup";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { pickupStatus, supplierStock } from "@/lib/calc";
import { tonnes } from "@/lib/format";
import type { Location } from "@/lib/types";

export default function Carte() {
  const { db } = useApp();
  const locs = db.locations.filter((l) => !l.deleted && l.lat !== undefined);
  const find = (name: string): Location | undefined => locs.find((l) => l.name === name || name.startsWith(l.name) || l.name.startsWith(name));
  const suppliers = db.users.filter((u) => u.role === "fournisseur" && !u.deleted && u.zone);
  const markers: MapMarker[] = [];
  for (const u of suppliers) {
    const l = find(u.zone!);
    if (!l) continue;
    const s = supplierStock(db, u.id);
    markers.push({ lat: l.lat!, lng: l.lng!, label: u.name, sub: `${u.zone} · stock disponible ${tonnes(s.available, " ")}`, radius: 6 + Math.min(10, Math.round(s.available / 10000)), tone: s.available > 0 ? "blue" : "muted" });
  }
  const lome = find("Lomé");
  if (lome) markers.push({ lat: lome.lat!, lng: lome.lng!, label: "Lomé · magasin central", tone: "ink", radius: 8 });
  const active = db.pickups.filter((p) => !p.deleted && pickupStatus(db, p) !== "cloture");
  const lines: MapLine[] = active.map((p) => {
    const { places, passed } = pickupPlaces(db, p);
    const pts = places.map(find).filter((l): l is Location => !!l).map((l) => [l.lat!, l.lng!] as [number, number]);
    return { points: pts, passed: Math.max(0, Math.min(pts.length - 1, passed - 1)) };
  });
  return (
    <>
      <PageHeader eyebrow="Terrain" title="Carte des lots" sub="Stocks déclarés chez les acheteurs (taille du point) et trajets en cours. Fond schématique local ; fond OpenStreetMap facultatif quand le réseau est disponible." />
      <Card pad={false} className="overflow-hidden">
        <MapView markers={markers} lines={lines} className="h-[62vh] min-h-[22rem]" testId="lots-map" />
      </Card>
      <Card className="mt-6">
        <CardTitle title="Trajets en cours" icon={<Map className="size-[18px]" />} />
        <ul className="divide-y divide-line">
          {active.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
              <Link href={`/enlevements/fiche/?id=${p.id}`} className="font-semibold text-brand-700 hover:underline">{p.ref}</Link>
              <span className="font-mono text-[13px]">{p.vehicle}</span>
              <PickupBadge db={db} p={p} />
              <span className="text-[13px] text-muted">{pickupPlaces(db, p).places.join(" → ")}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
