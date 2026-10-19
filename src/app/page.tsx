"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, FileCheck2, Lock, Route, Scale } from "lucide-react";
import { askText, fail, toast } from "@/components/alerts";
import { useData } from "@/components/DataProvider";
import { Logo } from "@/components/Logo";
import { Avatar, Button, cx, Field, Input } from "@/components/ui";
import { DEMO_ACCOUNTS, OTHER_ACCOUNTS } from "@/lib/seed";
import { roleLabel } from "@/lib/format";
import { changePassword, login } from "@/services/actions";

const ROLE_DESC = {
  patron: "Tableau de bord complet, validations, droits",
  gestionnaire: "Crée sans supprimer, réception à Kaboli",
  fournisseur: "App mobile : contrats, déclarations, preuves",
} as const;

export default function LoginPage() {
  const { me, ready, refresh, db } = useData();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (ready && me) router.replace("/accueil/");
  }, [ready, me, router]);

  async function doLogin(p: string, pw: string, key: string) {
    setBusy(key);
    try {
      const u = await login(p, pw);
      if (u.mustChangePassword) {
        const np = await askText({
          title: "Choisissez votre mot de passe",
          html: "Première connexion : remplacez le mot de passe provisoire remis par le patron.",
          input: "password",
          placeholder: "Nouveau mot de passe (6 caractères min.)",
          allowCancel: false,
          validate: (v) => (v.length < 6 ? "6 caractères minimum." : undefined),
        });
        if (np) await changePassword(u, np);
      }
      await refresh();
      toast(`Bienvenue, ${u.name.split(" ")[0]}`, roleLabel[u.role]);
      router.replace("/accueil/");
    } catch (e) {
      await fail(e, "Connexion refusée");
    } finally {
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

          <form
            className="mt-7 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void doLogin(identifier, password, "form");
            }}
          >
            <Field label="E-mail ou téléphone" hint="Le numéro se saisit avec ou sans indicatif : +228, 00228 ou 228.">
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

          <div className="space-y-2.5">
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
                className="group flex w-full items-center gap-3.5 rounded-2xl border border-line bg-white p-3.5 text-left transition-colors hover:border-brand-600 hover:bg-brand-50/40 disabled:opacity-60"
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
            <span className="font-semibold text-ink">Astuce de présentation :</span> ouvrez un rôle par onglet. Les actions de l’un apparaissent en direct chez les autres, avec une notification.
          </p>
        </div>
      </main>
    </div>
  );
}
