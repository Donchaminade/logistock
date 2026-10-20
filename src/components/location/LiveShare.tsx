"use client";
import { useEffect } from "react";
import { useApp } from "@/components/DataProvider";
import { consentGranted } from "@/lib/locationPolicy";
import { activeTrack, markOffline, publishPing } from "@/services/location";

/** Publie la position tant que l'onglet est ouvert et qu'un suivi ou une livraison est en cours. */
export function LiveShare() {
  const { db, me } = useApp();
  const consented = consentGranted(db.consents, me.id);
  const tracked = !!activeTrack(db, me.id);
  const delivering = db.transports.some((t) => {
    if (t.status !== "en_route" || t.deleted) return false;
    if (db.drivers.some((d) => d.userId === me.id && d.id === t.driverId)) return true;
    const c = db.contracts.find((x) => x.id === t.contractId);
    return c?.supplierId === me.id;
  });

  useEffect(() => {
    if (!consented || (!tracked && !delivering) || typeof navigator === "undefined" || !navigator.geolocation) return;
    let last = 0;
    let stopped = false;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (stopped || document.hidden) return;
        const n = Date.now();
        if (n - last < 3500) return;
        last = n;
        void publishPing(me.id, { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 8000 },
    );
    const hide = () => { if (document.hidden) void markOffline(me.id); };
    const leave = () => void markOffline(me.id);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", hide);
    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(id);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", hide);
      void markOffline(me.id);
    };
  }, [consented, tracked, delivering, me.id]);

  return null;
}
