"use client";
import { useApp } from "./DataProvider";
import { MapView, type MapMarker } from "./MapView";

/** Trajet d'un lot ou d'un enlèvement : lieux connus (avec coordonnées) dans l'ordre, segments parcourus en bleu. */
export function RouteMap({ places, passed, className }: { places: string[]; passed: number; className?: string }) {
  const { db } = useApp();
  const find = (name: string) => db.locations.find((l) => !l.deleted && l.lat !== undefined && (l.name === name || name.startsWith(l.name) || l.name.startsWith(name)));
  const seq: { name: string; lat: number; lng: number; idx: number }[] = [];
  places.forEach((p, idx) => {
    const l = find(p);
    if (l && seq[seq.length - 1]?.name !== l.name) seq.push({ name: l.name, lat: l.lat!, lng: l.lng!, idx });
  });
  const passedIdx = seq.filter((x) => x.idx < passed).length - 1;
  const markers: MapMarker[] = seq.map((x, i) => ({ lat: x.lat, lng: x.lng, label: x.name, tone: i <= passedIdx ? "blue" : "ink", radius: i === 0 || i === seq.length - 1 ? 7 : 5 }));
  if (seq.length === 0) return <div className={`grid place-items-center text-[13px] text-muted ${className ?? ""}`}>Aucun lieu géolocalisé dans la table des lieux.</div>;
  return <MapView className={className} markers={markers} lines={[{ points: seq.map((x) => [x.lat, x.lng]), passed: Math.max(0, passedIdx) }]} testId="route-map" />;
}
