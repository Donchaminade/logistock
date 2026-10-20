"use client";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MarkerChoice, SpeedThresholds } from "@/lib/trackPermissions";
import { motionFor } from "@/lib/trackPermissions";
import type { SceneMarker } from "./threeMarkers";

export interface TrackMarkerModel {
  id: string;
  name: string;
  lat: number;
  lng: number;
  speedMps: number;
  headingDeg: number;
  choice: MarkerChoice;
  live?: boolean;
}

type Basemap = "plan" | "satellite";
type Engine = "3d" | "dom" | "leaflet";

const LOME = { lng: 1.2314, lat: 6.1725 };

const TILES: Record<Basemap, { tiles: string[]; attribution: string }> = {
  plan: {
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: "© OpenStreetMap",
  },
  satellite: {
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    attribution: "Tuiles © Esri — Source: Esri, Maxar, Earthstar Geographics, et la communauté des utilisateurs SIG",
  },
};

function styleOf(mode: Basemap) {
  const t = TILES[mode];
  return {
    version: 8 as const,
    sources: { base: { type: "raster" as const, tiles: t.tiles, tileSize: 256, attribution: t.attribution } },
    layers: [{ id: "base", type: "raster" as const, source: "base" }],
  };
}

function webgl2() {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

const LABEL: Record<string, string> = { idle: "Au repos", walk: "Marche", run: "Course", moto: "Moto", car: "Voiture" };

export function TrackMap({
  markers, thresholds, className = "h-80", follow = true,
}: {
  markers: TrackMarkerModel[];
  thresholds: SpeedThresholds;
  className?: string;
  follow?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ easeTo: (o: { center: [number, number]; duration: number }) => void } | null>(null);
  const bag = useRef({ markers: [] as SceneMarker[], thresholds });
  bag.current = {
    markers: markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng)).map((m) => ({ ...m })),
    thresholds,
  };
  const [basemap, setBasemap] = useState<Basemap>("plan");
  const [engine, setEngine] = useState<Engine>("3d");
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    setEngine(!webgl2() ? "leaflet" : reduced ? "dom" : "3d");
  }, [reduced]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stop = false;
    setReady(false);
    if (engine === "leaflet") {
      let map: { remove: () => void } | null = null;
        void Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]).then(([mod]) => {
        if (stop || !host.current) return;
        const L = mod.default;
        const first = bag.current.markers[0];
        const m = L.map(host.current, { zoomControl: true }).setView([first?.lat ?? LOME.lat, first?.lng ?? LOME.lng], first ? 16 : 12);
        const spec = TILES[basemap];
        L.tileLayer(spec.tiles[0]!, { attribution: spec.attribution, maxZoom: 19 }).addTo(m);
        for (const mk of bag.current.markers) {
          const clip = motionFor(mk.speedMps, mk.choice, bag.current.thresholds);
          L.circleMarker([mk.lat, mk.lng], { radius: 8, color: "#0b0d12", weight: 2, fillColor: "#1f4fd8", fillOpacity: 1 })
            .bindTooltip(`${mk.name} · ${LABEL[clip] ?? clip}`, { permanent: true, direction: "top" })
            .addTo(m);
        }
        map = m;
        setReady(true);
      });
      return () => {
        stop = true;
        map?.remove();
      };
    }

    let map: import("maplibre-gl").Map | null = null;
    let dispose = () => undefined as void;
    void import("maplibre-gl").then((ml) => {
      if (stop || !host.current) return;
      const first = bag.current.markers[0];
      map = new ml.Map({
        container: host.current,
        style: styleOf(basemap),
        center: [first?.lng ?? LOME.lng, first?.lat ?? LOME.lat],
        zoom: first ? 16.4 : 12,
        pitch: engine === "3d" ? 48 : 0,
        attributionControl: { compact: false },
        maxZoom: 19,
      });
      map.addControl(new ml.NavigationControl({ visualizePitch: true }), "top-right");
      const dom: import("maplibre-gl").Marker[] = [];
      const paintDom = () => {
        for (const d of dom) d.remove();
        dom.length = 0;
        if (!map || engine !== "dom") return;
        for (const mk of bag.current.markers) {
          const el = document.createElement("div");
          el.style.cssText = "width:18px;height:18px;border-radius:999px;background:#1f4fd8;border:2px solid #0b0d12;box-shadow:0 0 0 3px #fff";
          const clip = motionFor(mk.speedMps, mk.choice, bag.current.thresholds);
          const marker = new ml.Marker({ element: el }).setLngLat([mk.lng, mk.lat]).setPopup(new ml.Popup({ offset: 16 }).setText(`${mk.name} · ${LABEL[clip]}`)).addTo(map);
          dom.push(marker);
        }
      };
      mapRef.current = map;
      map.on("load", () => {
        if (!map || stop) return;
        if (engine === "dom") {
          paintDom();
          setReady(true);
          return;
        }
        void import("./threeMarkers").then(({ createMarkerLayer }) => {
          if (!map || stop) return;
          const layer = createMarkerLayer(map, () => bag.current);
          map.addLayer(layer);
          dispose = () => layer.dispose();
          layer.ready.then(() => { if (!stop) setReady(true); }).catch(() => { if (!stop) setEngine("leaflet"); });
          map.triggerRepaint();
        }).catch(() => { if (!stop) setEngine("leaflet"); });
      });
    });
    return () => {
      stop = true;
      mapRef.current = null;
      dispose();
      map?.remove();
    };
  }, [engine, basemap]);

  const followKey = markers[0] ? `${markers[0].lat.toFixed(5)},${markers[0].lng.toFixed(5)}` : "";
  useEffect(() => {
    const m = bag.current.markers[0];
    if (!follow || !m || engine === "leaflet" || !mapRef.current) return;
    mapRef.current.easeTo({ center: [m.lng, m.lat], duration: 900 });
  }, [followKey, follow, engine]);

  const first = markers[0];
  return (
    <div data-testid="track-map" data-ready={ready ? "1" : "0"} data-engine={engine} data-basemap={basemap} className="overflow-hidden rounded-xl border border-line bg-canvas">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-white px-3 py-2">
        <div className="flex gap-1">
          <button type="button" data-testid="basemap-plan" className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${basemap === "plan" ? "bg-ink text-white" : "text-muted"}`} onClick={() => setBasemap("plan")}>Plan</button>
          <button type="button" data-testid="basemap-satellite" className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${basemap === "satellite" ? "bg-ink text-white" : "text-muted"}`} onClick={() => setBasemap("satellite")}>Satellite</button>
        </div>
        <span className="text-[12px] text-muted">{engine === "3d" ? "Marqueurs 3D" : engine === "dom" ? "Marqueurs fixes" : "Repli 2D"}</span>
      </div>
      <div ref={host} className={`relative ${className}`} />
      {!markers.length && <p className="px-3 py-2 text-[12.5px] text-muted">Aucune position pour le moment. Elle arrive tant que l&apos;application de la personne est ouverte.</p>}
      {first && <p className="px-3 py-2 text-[12.5px] text-muted">{first.live === false ? "Dernière position connue, application fermée." : `${first.speedMps.toFixed(1)} m/s`}</p>}
    </div>
  );
}
