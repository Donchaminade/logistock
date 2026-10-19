"use client";
// Carte locale (Leaflet embarqué) : fond schématique du Togo dessiné en vecteur, sans aucune requête réseau.
// Le fond OpenStreetMap est facultatif (désactivé par défaut) ; hors ligne, la carte reste sur le fond schématique.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LMap } from "leaflet";
import { isOnline, onNetworkChange } from "@/services/network";
import { cx } from "./ui";

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  sub?: string;
  /** Rayon en pixels (ex. proportionnel au stock). */
  radius?: number;
  tone?: "blue" | "ink" | "muted";
}
export interface MapLine {
  points: [number, number][];
  /** Nombre de segments déjà parcourus (trait plein), le reste en pointillés. */
  passed?: number;
}

// Contour simplifié du Togo (approximatif, pour repère visuel uniquement).
const TOGO: [number, number][] = [
  [6.1, 1.18], [6.23, 1.63], [6.7, 1.6], [7.0, 1.62], [7.4, 1.62], [8.0, 1.63], [8.4, 1.63], [9.0, 1.48], [9.4, 1.4], [9.8, 1.37],
  [10.2, 1.4], [10.6, 0.88], [11.0, 0.92], [11.13, 0.5], [11.0, 0.0], [10.7, -0.05], [10.3, 0.38], [9.8, 0.25], [9.3, 0.55],
  [8.8, 0.48], [8.3, 0.65], [7.9, 0.55], [7.4, 0.55], [7.1, 0.65], [6.9, 0.55], [6.5, 0.75], [6.3, 1.0], [6.1, 1.18],
];
const COLORS = { blue: "#1F4FD8", ink: "#0B0D12", muted: "#8A91A0" };

export function MapView({ markers, lines = [], className, testId }: { markers: MapMarker[]; lines?: MapLine[]; className?: string; testId?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const [osm, setOsm] = useState(false);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(isOnline());
    return onNetworkChange(setOnline);
  }, []);

  const key = JSON.stringify([markers, lines, osm && online]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      map.current?.remove();
      const m = L.map(el.current, { zoomControl: true, attributionControl: osm && online, scrollWheelZoom: false });
      map.current = m;
      if (osm && online) {
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "© OpenStreetMap" }).addTo(m);
      } else {
        L.polygon(TOGO, { color: "#C9CED8", weight: 1.2, fillColor: "#F4F5F7", fillOpacity: 1 }).addTo(m);
      }
      for (const l of lines) {
        const done = l.points.slice(0, (l.passed ?? 0) + 1);
        const todo = l.points.slice(Math.max(0, l.passed ?? 0));
        if (done.length > 1) L.polyline(done, { color: COLORS.blue, weight: 3.5 }).addTo(m);
        if (todo.length > 1) L.polyline(todo, { color: COLORS.ink, weight: 2, dashArray: "6 6" }).addTo(m);
      }
      for (const mk of markers) {
        L.circleMarker([mk.lat, mk.lng], { radius: mk.radius ?? 6, color: "#FFFFFF", weight: 2, fillColor: COLORS[mk.tone ?? "blue"], fillOpacity: 1 })
          .bindTooltip(markers.length <= 10 ? mk.label : `<b>${mk.label}</b>${mk.sub ? `<br/>${mk.sub}` : ""}`, markers.length <= 10 ? { permanent: true, direction: "right", offset: [8, 0], className: "ls-map-label" } : { direction: "top" })
          .bindPopup(`<b>${mk.label}</b>${mk.sub ? `<br/>${mk.sub}` : ""}`)
          .addTo(m);
      }
      const pts: [number, number][] = [...markers.map((x) => [x.lat, x.lng] as [number, number]), ...lines.flatMap((l) => l.points)];
      if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 9 });
      else m.setView(pts[0] ?? [7.6, 1.0], pts.length ? 9 : 6.5);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => void map.current?.remove(), []);

  return (
    <div className={cx("relative", className)} data-testid={testId}>
      <div ref={el} className="ls-map absolute inset-0 overflow-hidden rounded-b-2xl" role="img" aria-label="Carte des lieux et du trajet" />
      <div className="absolute bottom-2 left-2 z-[500] flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-sm ring-1 ring-line">
          <input type="checkbox" checked={osm} onChange={(e) => setOsm(e.target.checked)} className="accent-brand-600" /> Fond OpenStreetMap
        </label>
        {osm && !online && <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-white">Hors ligne : fond schématique local</span>}
        {!osm && <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] text-muted ring-1 ring-line">Fond schématique local · aucun réseau requis</span>}
      </div>
    </div>
  );
}
