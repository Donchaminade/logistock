"use client";
import { useState } from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { confirm } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { Button, Card, Empty, PageHeader, Segmented, Select, Toggle } from "@/components/ui";
import { PERM_ENTITIES } from "@/lib/permissions";
import type { DeleteMode, Perm } from "@/lib/types";
import { resetPerms, setPerm } from "@/services/actions";

const D_LABEL: Record<DeleteMode, string> = { directe: "Directe", confirmation: "Via « Actions à confirmer »", interdite: "Interdite" };

export default function Droits() {
  const { db, me, run } = useApp();
  const [role, setRole] = useState<"gestionnaire" | "fournisseur">("gestionnaire");
  if (me.role !== "patron") return <Empty icon={<ShieldCheck className="size-5" />} title="Réservé au patron" />;
  const perms = db.settings[0]!.perms[role];
  const change = (entity: (typeof PERM_ENTITIES)[number]["key"], key: keyof Perm, value: boolean | DeleteMode) =>
    run(() => setPerm(me, role, entity, key, value), "Droit mis à jour", "Appliqué immédiatement, dans tous les onglets.");
  return (
    <>
      <PageHeader title="Rôles et droits" sub="Droits CRUD par rôle et par entité. Le patron a tous les droits ; chaque modification est tracée et s'applique en direct."
        actions={<Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={async () => { if (await confirm({ title: "Restaurer les droits par défaut ?", confirmText: "Restaurer", dark: true })) await run(() => resetPerms(me), "Droits par défaut restaurés"); }}>Valeurs par défaut</Button>} />
      <div className="mb-4"><Segmented value={role} onChange={setRole} options={[{ value: "gestionnaire", label: "Gestionnaire délégué" }, { value: "fournisseur", label: "Fournisseur" }]} /></div>
      <Card pad={false} className="overflow-hidden">
        <div className="hidden grid-cols-[1.6fr_repeat(3,5.5rem)_14rem] items-center gap-2 border-b border-line bg-canvas/60 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-subtle md:grid">
          <span>Entité</span><span className="text-center">Créer</span><span className="text-center">Lire</span><span className="text-center">Modifier</span><span>Supprimer</span>
        </div>
        <ul className="divide-y divide-line" data-testid="perm-matrix">
          {PERM_ENTITIES.map((e) => {
            const p = perms[e.key];
            return (
              <li key={e.key} className="grid gap-3 px-5 py-4 md:grid-cols-[1.6fr_repeat(3,5.5rem)_14rem] md:items-center md:gap-2">
                <div><div className="text-[14px] font-semibold">{e.label}</div><div className="text-[12.5px] text-muted">{e.hint}</div></div>
                {(["c", "r", "u"] as const).map((k) => (
                  <label key={k} className="flex items-center justify-between gap-2 md:justify-center">
                    <span className="text-[13px] text-muted md:hidden">{{ c: "Créer", r: "Lire", u: "Modifier" }[k]}</span>
                    <Toggle checked={p[k]} onChange={(v) => change(e.key, k, v)} label={`${e.label} : ${k}`} disabled={e.key === "fournisseurs" && k === "c"} />
                  </label>
                ))}
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-muted md:hidden">Supprimer</span>
                  <Select value={p.d} onChange={(ev) => change(e.key, "d", ev.target.value as DeleteMode)} className="!h-9 max-w-[14rem] !py-0 text-[13px]" data-testid={`perm-d-${e.key}`}>
                    {(role === "gestionnaire" ? ["confirmation", "interdite"] : ["interdite"]).map((d) => <option key={d} value={d}>{D_LABEL[d as DeleteMode]}</option>)}
                  </Select>
                </label>
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">Un gestionnaire délégué n&apos;a jamais de suppression directe (US-20) : au mieux, sa demande passe par la file « Actions à confirmer ». La création de comptes fournisseurs reste réservée au patron. Les rôles Admin, Magasinier, Chauffeur et Comptable du cahier des charges ne sont pas simulés dans cette démo.</p>
    </>
  );
}
