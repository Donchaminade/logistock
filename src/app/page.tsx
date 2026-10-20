"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, FileCheck2, KeyRound, Lock, Route, Scale, WifiOff } from "lucide-react";
import { askText, fail, toast } from "@/components/alerts";
import { useData } from "@/components/DataProvider";
import { dataSource } from "@/data";
import { Logo } from "@/components/Logo";
import { Avatar, Button, cx, Field, Input } from "@/components/ui";
import { DEMO_ACCOUNTS, OTHER_ACCOUNTS } from "@/lib/seed";
import { roleLabel } from "@/lib/format";
import { LockedError, login, pinUsers, unlockWithPin } from "@/services/actions";
import { pullGeoNotice } from "@/services/location";
import { isOnline, onNetworkChange } from "@/services/network";
import type { User } from "@/lib/types";

const ROLE_DESC = {
  patron: "Tableau de bord complet, validations, droits",
  admin: "Comptes, paramètres, référentiels, journal",
  gestionnaire: "Crée sans supprimer, réception à Kaboli",
  fournisseur: "Mobile : contrats, déclarations, relevé",
  magasinier: "Pointage, pesées, réception, stocks",
  chauffeur: "Mobile : trajets, étapes, arrivée avec photo",
  comptable: "Paiements, dettes, commissions, exports",
} as const;

export default function LoginPage() {
  const { me, ready, refresh, db } = useData();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [online, setOnline] = useState(true);
  const [pinList, setPinList] = useState<User[]>([]);

  useEffect(() => {
    // `me` peut encore être l'utilisateur précédent le temps d'un rendu : on ne revient
    // dans l'application que si la session de l'onglet est réellement ouverte.
    if (ready && me && dataSource().session.get()) router.replace("/accueil/");
  }, [ready, me, router]);
  useEffect(() => {
    setOnline(isOnline());
    return onNetworkChange(setOnline);
  }, []);
  useEffect(() => {
    if (ready) void pinUsers().then(setPinList);
  }, [ready, db]);

  async function doPin(u: User) {
    const pin = await askText({ title: `Code PIN de ${u.name.split(" ")[0]}`, html: "Appareil déjà autorisé : saisissez votre code PIN (4 à 6 chiffres).", input: "password", placeholder: "Code PIN", confirmText: "Déverrouiller", validate: (v) => (/^\d{4,6}$/.test(v) ? undefined : "4 à 6 chiffres.") });
    if (!pin) return;
    setBusy(`pin-${u.id}`);
    try {
      const user = await unlockWithPin(u.id, pin);
      await refresh();
      toast(`Bienvenue, ${user.name.split(" ")[0]}`, isOnline() ? "Déverrouillé par code PIN" : "Déverrouillé hors ligne : données en cache");
      router.replace("/accueil/");
    } catch (e) {
      await fail(e, "Déverrouillage refusé");
      void pinUsers().then(setPinList);
    } finally {
      setBusy(null);
    }
  }

  async function doLogin(p: string, pw: string, key: string) {
    setBusy(key);
    try {
      const u = await login(p, pw);
      await refresh();
      toast(`Bienvenue, ${u.name.split(" ")[0]}`, roleLabel[u.role]);
      router.replace("/accueil/");
    } catch (e) {
      await fail(e, e instanceof LockedError ? "Compte bloqué" : "Connexion refusée");
    } finally {
      const note = pullGeoNotice();
      if (note) toast("Localisation", note, "info");
      setBusy(null);
    }
  }

  const created = db?.users.filter((u) => u.role === "fournisseur" && u.mustChangePassword && !u.deleted) ?? [];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <Logo inverted sub="Préfinancement soja et cacao · Togo" />
        <div className="max-w-md">
          <p className="eyebrow !text-white/40">Maquette interactive</p>
          <h1 className="mt-3 text-[40px] font-bold leading-[1.08] tracking-[-0.035em]">
            Chaque franc avancé,<br />chaque tonne livrée,<br /><span className="text-brand-500">tracés.</span>
          </h1>
          <p className="mt-5 text-[15.5px] leading-relaxed text-white/60">
            Du besoin du patron jusqu’au pointage à Lomé : remises d’argent avec reçu, transports suivis étape par étape, livraisons partielles et reliquats recalculés automatiquement.
          </p>
          <ul className="mt-9 space-y-4">
            {[
              { i: FileCheck2, t: "Reçus PDF et preuves photo à chaque remise" },
              { i: Route, t: "Timeline de chaque lot, de l’origine à Lomé" },
              { i: Scale, t: "Reste à livrer = (avance − livré) / prix en vigueur" },
            ].map(({ i: I, t }) => (
              <li key={t} className="flex items-center gap-3 text-[14.5px] text-white/80">
                <span className="grid size-9 place-items-center rounded-xl bg-white/10"><I className="size-[18px]" /></span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[12.5px] text-white/35">Données fictives — démo. Aucune donnée réelle du client.</p>
      </aside>

      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="animate-in mx-auto w-full max-w-[26rem]">
          <div className="mb-10 lg:hidden"><Logo sub="Préfinancement soja et cacao" /></div>
          <h2 className="text-[26px] font-bold tracking-[-0.025em]">Connexion</h2>
          <p className="mt-1.5 text-[14.5px] text-muted">Accédez à votre espace avec votre e-mail ou votre numéro de téléphone.</p>
          {!online && (
            <div className="mt-5 flex gap-3 rounded-2xl bg-ink p-4 text-[13.5px] text-white" data-testid="login-offline">
              <WifiOff className="mt-0.5 size-4 shrink-0" />
              <span>Hors ligne : la connexion par mot de passe exige le réseau. Un compte déjà autorisé sur cet appareil peut se déverrouiller avec son code PIN.</span>
            </div>
          )}
          {pinList.length > 0 && (
            <div className="mt-6 rounded-2xl border border-line bg-white p-4" data-testid="pin-users">
              <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold"><KeyRound className="size-4 text-brand-600" /> Déverrouiller avec un code PIN</div>
              <div className="flex flex-wrap gap-2">
                {pinList.map((u) => (
                  <button key={u.id} data-testid={`pin-${u.id}`} onClick={() => void doPin(u)} disabled={!!busy} className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-[13px] font-semibold hover:border-brand-600">
                    <Avatar name={u.name} size="sm" /> {u.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form
            className="mt-7 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void doLogin(identifier, password, "form");
            }}
          >
            <Field label="E-mail ou téléphone" hint="Le numéro se saisit avec ou sans indicatif, togolais ou non : +228, +229, +33, 00228…">
              <Input autoComplete="username" placeholder="nom@exemple.com ou 90 12 34 56" value={identifier} onChange={(e) => setIdentifier(e.target.value)} name="phone" />
            </Field>
            <Field label="Mot de passe">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                <Input type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" name="password" />
              </div>
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy === "form"} icon={<ArrowRight className="size-4" />}>Se connecter</Button>
          </form>

          <div className="my-8 flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
            <span className="h-px flex-1 bg-line" /> Connexion rapide · démo <span className="h-px flex-1 bg-line" />
          </div>

          <div className="grid gap-2.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.id}
                data-testid={`quick-${a.role}`}
                onClick={() => {
                  setIdentifier(a.email);
                  setPassword(a.password);
                  void doLogin(a.email, a.password, a.id);
                }}
                disabled={!!busy}
                className="group flex w-full items-center gap-3.5 rounded-2xl border border-line bg-white p-3 text-left transition-colors hover:border-brand-600 hover:bg-brand-50/40 disabled:opacity-60"
              >
                <Avatar name={a.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14.5px] font-semibold">{roleLabel[a.role]}</span>
                    <span className="truncate text-[12.5px] text-subtle">· {a.name}</span>
                  </div>
                  <div className="truncate text-[12.5px] text-muted">{ROLE_DESC[a.role]}</div>
                  <div className="truncate text-[12px] text-subtle">{a.email}</div>
                </div>
                <span className={cx("grid size-8 place-items-center rounded-full bg-canvas text-muted transition-colors group-hover:bg-brand-600 group-hover:text-white")}>
                  {busy === a.id ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ArrowRight className="size-4" />}
                </span>
              </button>
            ))}
          </div>

          <button onClick={() => setMore((v) => !v)} className="mt-4 flex w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink">
            Autres comptes de démo <ChevronDown className={cx("size-4 transition-transform", more && "rotate-180")} />
          </button>
          {more && (
            <ul className="animate-in mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
              {[...OTHER_ACCOUNTS, ...created.map((u) => ({ id: u.id, role: u.role, name: u.name, phone: u.phone, email: u.email, password: u.password, title: u.title }))].map((a) => (
                <li key={a.id}>
                  <button onClick={() => void doLogin(a.email ?? a.phone, a.password, a.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas">
                    <Avatar name={a.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold">{a.name}</div>
                      <div className="truncate text-[12px] text-muted">{a.title}</div>
                    </div>
                    <span className="max-w-[46%] truncate text-right text-[12px] text-subtle">{a.email ?? a.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-8 rounded-xl bg-canvas px-4 py-3 text-[12.5px] leading-relaxed text-muted">
            <span className="font-semibold text-ink">Astuce de présentation :</span> mots de passe affichés dans le README. Ouvrez un rôle par onglet. Les actions de l’un apparaissent en direct chez les autres, avec une notification.
          </p>
        </div>
      </main>
    </div>
  );
}
