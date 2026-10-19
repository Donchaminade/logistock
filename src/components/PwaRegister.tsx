"use client";
import { useEffect } from "react";

/** Enregistre le service worker (build de production uniquement) : application installable et utilisable hors ligne. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
