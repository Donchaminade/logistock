"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CloudOff, Lock, LogOut, RefreshCw, RotateCcw, Wifi } from "lucide-react";
import { resetDemo } from "@/services/actions";
import { roleLabel } from "@/lib/format";
import { choose, confirm, toast } from "./alerts";
import { forMe, useData } from "./DataProvider";
import { Logo, LogoMark } from "./Logo";
import { BOTTOM, routeAllowed, SIDEBAR, type NavItem } from "./nav";
import { Avatar, cx, Empty, PageSkeleton } from "./ui";
import { isOnline, isSimulatedOffline, onNetworkChange, setSimulatedOffline } from "@/services/network";
import { syncOutbox } from "@/services/core";
import { dateTime } from "@/lib/format";
import type { Database, User } from "@/lib/types";

function isActive(path: string, href: string) {
  if (href === "/accueil/") return path.startsWith("/accueil");
  return path.startsWith(href.replace(/\/$/, ""));
}

export async function confirmLogout(signOut: () => void, router: ReturnType<typeof useRouter>) {
  const ok = await confirm({ title: "Se déconnecter ?", confirmText: "Déconnexion", dark: true });
  if (!ok) return;
  signOut();
  router.replace("/");
}

export async function confirmReset(router: ReturnType<typeof useRouter>) {
  const ok = await confirm({
    title: "Réinitialiser la démo ?",
    html: "Toutes les saisies de la démonstration seront effacées et les données fictives d'origine rechargées, dans tous les onglets ouverts.",
    confirmText: "Réinitialiser",
    icon: "warning",
    dark: true,
  });
  if (!ok) return;
  await resetDemo();
  toast("Démo réinitialisée", "Les données fictives d'origine sont rechargées.");
  router.refresh();
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { db, me, ready, signOut } = useData();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && !me) router.replace("/");
  }, [ready, me, router]);

  if (!ready || !me || !db) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <PageSkeleton />
      </div>
    );
  }

  const pending = db.pending.filter((p) => p.status === "en_attente" && (me.role === "patron" || p.by === me.id)).length;
  const unread = db.notifications.filter((n) => forMe(n, me) && !n.readBy.includes(me.id)).length;
  const badgeOf = (i: NavItem) => (i.badge === "pending" ? pending : i.badge === "notifications" ? unread : 0);
  const allowed = routeAllowed(path.replace(/\/$/, ""), me.role);
  const bottom = BOTTOM[me.role];

  return (
    <div className="min-h-dvh lg:pl-[272px]">
      {/* Barre latérale (ordinateur) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] flex-col bg-ink text-white lg:flex">
        <div className="px-6 pb-6 pt-7">
          <Logo inverted sub="Préfinancement soja et cacao" />
        </div>
        <nav className="flex-1 space-y-7 overflow-y-auto px-3">
          {SIDEBAR[me.role].map((g) => (
            <div key={g.group}>
              <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/35">{g.group}</div>
              <ul className="space-y-0.5">
                {g.items.map((i) => {
                  const active = isActive(path, i.href);
                  const b = badgeOf(i);
                  return (
                    <li key={i.href}>
                      <Link href={i.href} className={cx("flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors", active ? "bg-brand-600 text-white" : "text-white/70 hover:bg-white/5 hover:text-white")}>
                        <i.icon className="size-[18px]" strokeWidth={2} />
                        <span className="flex-1">{i.label}</span>
                        {b > 0 && <span className={cx("num grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold", active ? "bg-white text-brand-700" : "bg-brand-600 text-white")}>{b}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="space-y-1 border-t border-white/10 p-3">
          <button onClick={() => confirmReset(router)} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium text-white/60 hover:bg-white/5 hover:text-white">
            <RotateCcw className="size-4" /> Réinitialiser la démo
          </button>
          <Link href="/profil/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5">
            <Avatar name={me.name} dark />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold">{me.name}</div>
              <div className="truncate text-[12px] text-white/50">{roleLabel[me.role]}</div>
            </div>
          </Link>
        </div>
      </aside>

      {/* Barre du haut */}
      <header className="no-print sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
          <Link href="/accueil/" className="lg:hidden" aria-label="Accueil LogiStock">
            <LogoMark className="size-8" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="hidden items-center gap-2 lg:flex">
              <span className="text-[13px] text-muted">{roleLabel[me.role]}</span>
              <span className="text-line-2">/</span>
              <span className="truncate text-[13px] font-semibold">{me.title}</span>
            </div>
            <div className="truncate text-[14px] font-bold lg:hidden">LogiStock</div>
          </div>
          <span className="hidden rounded-full border border-line-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted xl:inline">Données fictives — démo</span>
          <NetworkIndicator db={db} me={me} />
          <Link href="/notifications/" className="relative grid size-10 place-items-center rounded-full text-ink hover:bg-canvas" aria-label={`Notifications (${unread} non lues)`} data-testid="bell">
            <Bell className="size-5" />
            {unread > 0 && <span className="num absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-600 px-1 text-[10.5px] font-bold text-white ring-2 ring-white">{unread}</span>}
          </Link>
          <Link href="/profil/" className="lg:hidden" aria-label="Profil">
            <Avatar name={me.name} size="sm" />
          </Link>
          <button
            onClick={() => void confirmLogout(signOut, router)}
            className="hidden size-10 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink lg:grid"
            aria-label="Déconnexion"
            data-testid="logout-header"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </header>

      <main key={me.id} className="mx-auto max-w-6xl px-4 pb-32 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-16">
        {allowed ? children : <Empty icon={<Lock className="size-5" />} title="Accès réservé" text={`Cet écran n'est pas ouvert au rôle « ${roleLabel[me.role]} ».`} action={<Link href="/accueil/" className="text-[14px] font-semibold text-brand-700">Retour à l&apos;accueil</Link>} />}
      </main>

      {/* Bottom nav (téléphone et tablette) */}
      <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white lg:hidden" aria-label="Navigation principale">
        <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0, 1fr))` }}>
          {bottom.map((i) => {
            const active = isActive(path, i.href);
            const b = badgeOf(i);
            return (
              <li key={i.href}>
                <Link href={i.href} className={cx("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors", active ? "text-brand-600" : "text-muted")}>
                  {active && <span className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-brand-600" />}
                  <span className="relative">
                    <i.icon className="size-[22px]" strokeWidth={active ? 2.4 : 2} />
                    {b > 0 && <span className="num absolute -right-2.5 -top-1.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">{b}</span>}
                  </span>
                  <span className="max-w-full truncate px-1">{i.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Indicateur réseau : en ligne / hors ligne, opérations en attente, dernière synchronisation, simulation hors ligne. */
function NetworkIndicator({ db, me }: { db: Database; me: User }) {
  const [online, setOnline] = useState(true);
  const [sim, setSim] = useState(false);
  useEffect(() => {
    setOnline(isOnline());
    setSim(isSimulatedOffline());
    return onNetworkChange((o) => {
      setOnline(o);
      setSim(isSimulatedOffline());
    });
  }, []);
  const device = typeof window === "undefined" ? "" : localStorage.getItem("logistock:device") ?? "";
  const mine = db.outbox.filter((o) => o.device === device);
  const waiting = mine.filter((o) => o.status === "en_attente");
  const last = mine.filter((o) => o.syncedAt).sort((a, b) => b.syncedAt!.localeCompare(a.syncedAt!))[0]?.syncedAt;

  async function open() {
    const list = waiting.length ? `<ul style="text-align:left;margin:10px 0 0;padding-left:18px;font-size:13px">${waiting.slice(0, 6).map((w) => `<li>${w.label} · ${dateTime(w.at)}</li>`).join("")}</ul>` : "";
    const r = await choose({
      title: online ? "En ligne" : "Hors ligne",
      html: `${online ? "Les saisies sont envoyées immédiatement." : "Les saisies autorisées hors ligne (déclarations, étapes, pointage, pesée, frais) sont gardées sur l'appareil puis envoyées au retour du réseau. Les opérations financières exigent le réseau."}<br/><br/><b>${waiting.length}</b> opération(s) en attente${last ? ` · dernière synchronisation ${dateTime(last)}` : ""}.${list}<br/><small>La simulation ne concerne que cet onglet.</small>`,
      confirmText: sim ? "Rétablir le réseau" : "Simuler hors ligne",
      denyText: online && waiting.length > 0 ? "Synchroniser maintenant" : undefined,
    });
    if (r === "confirm") {
      setSimulatedOffline(!sim);
      toast(!sim ? "Mode hors ligne simulé" : "Réseau rétabli", !sim ? "Dans cet onglet uniquement." : "Synchronisation en cours…", "info");
    } else if (r === "deny") {
      const n = await syncOutbox();
      toast("Synchronisé", `${n} opération(s) envoyée(s).`);
    }
  }
  void me;
  return (
    <button onClick={() => void open()} data-testid="net-indicator" data-online={online ? "1" : "0"} className={cx("inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold", online ? "border border-line-2 text-ink" : "bg-ink text-white")} aria-label={online ? "En ligne" : "Hors ligne"}>
      {online ? (waiting.length ? <RefreshCw className="size-3.5 animate-spin" /> : <Wifi className="size-3.5 text-brand-600" />) : <CloudOff className="size-3.5" />}
      <span className="hidden sm:inline">{online ? (waiting.length ? "Synchronisation…" : "Synchronisé") : "Hors ligne"}</span>
      {waiting.length > 0 && <span className="num grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-600 px-1 text-[10.5px] font-bold text-white" data-testid="outbox-count">{waiting.length}</span>}
    </button>
  );
}
