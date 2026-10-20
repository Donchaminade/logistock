"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dataSource } from "@/data";
import type { AppNotification, Database, User } from "@/lib/types";
import { logout } from "@/services/auth";
import { pullGeoNotice } from "@/services/location";
import { syncOutbox } from "@/services/core";
import { isOnline, onNetworkChange } from "@/services/network";
import { fail, toast } from "./alerts";

interface Ctx {
  db: Database | null;
  me: User | null;
  ready: boolean;
  refresh: () => Promise<void>;
  /** Ferme la session de cet onglet et retire l'utilisateur de l'état affiché. */
  signOut: () => void;
  /** Exécute une action métier : erreurs affichées par SweetAlert2, toast de succès optionnel. */
  run: <T>(fn: () => Promise<T>, okTitle?: string, okText?: string) => Promise<T | undefined>;
}

const DataCtx = createContext<Ctx | null>(null);

/** Notifications destinées à l'utilisateur ; celles saisies hors ligne restent en attente jusqu'à la synchronisation. */
export function forMe(n: AppNotification, me: User) {
  return !n.deferred && (n.to === me.id || n.to === me.role);
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const ds = dataSource();
    const snap = await ds.snapshot();
    const uid = ds.session.get();
    const user = snap.users.find((u) => u.id === uid) ?? null;
    // Toasts pour les notifications émises par un autre rôle (autre onglet)
    if (user) {
      const mine = snap.notifications.filter((n) => forMe(n, user));
      if (seen.current === null) seen.current = new Set(mine.map((n) => n.id));
      else {
        for (const n of mine) {
          if (!seen.current.has(n.id)) {
            seen.current.add(n.id);
            if (n.by !== user.id) toast(n.title, n.body, "info", n.link ? () => router.push(n.link!) : undefined);
          }
        }
      }
    } else seen.current = null;
    setDb(snap);
    setMe(user);
    setReady(true);
  }, [router]);

  useEffect(() => {
    void refresh();
    return dataSource().subscribe(() => void refresh());
  }, [refresh]);

  // Synchronisation automatique de l'outbox au retour du réseau (et au démarrage).
  useEffect(() => {
    const sync = async () => {
      if (!isOnline()) return;
      const n = await syncOutbox();
      if (n > 0) {
        toast("Synchronisé", `${n} opération${n > 1 ? "s" : ""} saisie${n > 1 ? "s" : ""} hors ligne envoyée${n > 1 ? "s" : ""}.`);
        await refresh();
      }
    };
    void sync();
    return onNetworkChange((o) => o && void sync());
  }, [refresh]);

  const signOut = useCallback(() => {
    logout();
    setMe(null);
  }, []);

  const run = useCallback(async <T,>(fn: () => Promise<T>, okTitle?: string, okText?: string) => {
    try {
      const r = await fn();
      if (okTitle) toast(okTitle, okText);
      const note = pullGeoNotice();
      if (note) toast("Position non capturée", note, "info");
      return r;
    } catch (e) {
      await fail(e);
      return undefined;
    }
  }, []);

  const value = useMemo(() => ({ db, me, ready, refresh, signOut, run }), [db, me, ready, refresh, signOut, run]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData hors DataProvider");
  return c;
}

/** Pour les pages de l'application : données et utilisateur garantis. */
export function useApp() {
  const c = useData();
  return { ...c, db: c.db as Database, me: c.me as User };
}
