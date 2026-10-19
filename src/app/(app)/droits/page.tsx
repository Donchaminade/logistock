"use client";
import { useState } from "react";
import { Lock, RotateCcw } from "lucide-react";
import { confirm } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { Button, Card, PageHeader, Select, Toggle, cx } from "@/components/ui";
import { isLocked, MANAGED_ROLES, PERM_ENTITIES, ROLES } from "@/lib/permissions";
import type { DeleteMode, ManagedRole, Perm } from "@/lib/types";
import { resetPerms, setPerm } from "@/services/actions";

const D_LABEL: Record<DeleteMode, string> = { directe: "Directe", confirmation: "Via « Actions à confirmer »", interdite: "Interdite" };

export default function Droits() {
  const { db, me, run } = useApp();
  const [role, setRole] = useState<ManagedRole>("gestionnaire");
  const edit = me.role === "patron";
  const perms = db.settings[0]!.perms[role];
  const change = (entity: (typeof PERM_ENTITIES)[number]["key"], key: keyof Perm, value: boolean | DeleteMode) =>
    run(() => setPerm(me, role, entity, key, value), "Droit mis à jour", "Appliqué immédiatement, dans tous les onglets.");
  const groups = [...new Set(PERM_ENTITIES.map((e) => e.group))];
  return (
    <>
      <PageHeader eyebrow="Contrôle" title="Rôles et droits" sub={edit ? "Droits CRUD par rôle et par entité (§3.2, §3.3). Le patron a tous les droits ; chaque modification est tracée et s'applique en direct." : "Lecture seule : seul le patron modifie les droits."}
        actions={edit && <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={async () => { if (await confirm({ title: "Restaurer les droits par défaut ?", confirmText: "Restaurer", dark: true })) await run(() => resetPerms(me), "Droits par défaut restaurés"); }}>Valeurs par défaut</Button>} />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {MANAGED_ROLES.map((r) => (
          <button key={r} role="tab" aria-selected={role === r} data-testid={`role-${r}`} onClick={() => setRole(r)} className={cx("rounded-full px-3.5 py-2 text-[13px] font-semibold", role === r ? "bg-ink text-white" : "border border-line bg-white text-muted hover:text-ink")}>{ROLES.find((x) => x.key === r)!.label}</button>
        ))}
      </div>
      <p className="mb-4 text-[13.5px] text-muted">{ROLES.find((x) => x.key === role)!.hint}</p>
      <Card pad={false} className="overflow-hidden">
        <div className="hidden grid-cols-[1.6fr_repeat(3,5.5rem)_14rem] items-center gap-2 border-b border-line bg-canvas/60 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-subtle md:grid">
          <span>Entité</span><span className="text-center">Créer</span><span className="text-center">Lire</span><span className="text-center">Modifier</span><span>Supprimer</span>
        </div>
        <div data-testid="perm-matrix">
          {groups.map((g) => (
            <div key={g}>
              <div className="border-b border-line bg-canvas/40 px-5 py-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-subtle">{g}</div>
              <ul className="divide-y divide-line border-b border-line">
                {PERM_ENTITIES.filter((e) => e.group === g).map((e) => {
                  const p = perms[e.key];
                  return (
                    <li key={e.key} className="grid gap-3 px-5 py-3.5 md:grid-cols-[1.6fr_repeat(3,5.5rem)_14rem] md:items-center md:gap-2">
                      <div><div className="text-[14px] font-semibold">{e.label}{p.own && <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted">ses données</span>}</div><div className="text-[12.5px] text-muted">{e.hint}</div></div>
                      {(["c", "r", "u"] as const).map((k) => {
                        const locked = k !== "r" && isLocked(e.key, k);
                        return (
                          <label key={k} className="flex items-center justify-between gap-2 md:justify-center" title={locked ? "Réservé au patron" : undefined}>
                            <span className="text-[13px] text-muted md:hidden">{{ c: "Créer", r: "Lire", u: "Modifier" }[k]}</span>
                            {locked ? <Lock className="size-4 text-subtle" aria-label="Réservé au patron" /> : <Toggle checked={p[k]} onChange={(v) => change(e.key, k, v)} label={`${e.label} : ${k}`} disabled={!edit} />}
                          </label>
                        );
                      })}
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-[13px] text-muted md:hidden">Supprimer</span>
                        {isLocked(e.key, "d") ? <span className="inline-flex items-center gap-1.5 text-[13px] text-subtle"><Lock className="size-3.5" /> Réservé au patron</span> : (
                          <Select value={p.d} disabled={!edit} onChange={(ev) => change(e.key, "d", ev.target.value as DeleteMode)} className="!h-9 max-w-[14rem] !py-0 text-[13px]" data-testid={`perm-d-${e.key}`}>
                            {(["confirmation", "interdite"] as const).map((d) => <option key={d} value={d}>{D_LABEL[d]}</option>)}
                          </Select>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">Aucun rôle autre que le patron n&apos;a de suppression directe (US-20) : une demande passe par « Actions à confirmer ». La création des comptes fournisseurs, la modification des droits et le passage d&apos;une dette en perte restent réservés au patron (cadenas). Aucune écriture financière n&apos;est supprimable : une correction passe par une contre-écriture tracée.</p>
    </>
  );
}
