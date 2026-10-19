"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, ClipboardCheck, X } from "lucide-react";
import { askReason, confirm } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { nameOf } from "@/components/domain";
import { Avatar, Badge, Button, Empty, PageHeader, Tabs } from "@/components/ui";
import { dateTime, relative } from "@/lib/format";
import { PERM_ENTITIES } from "@/lib/permissions";
import { decidePending } from "@/services/actions";

const LINK: Partial<Record<string, string>> = { contrats: "/contrats/fiche/?id=", transports: "/transports/fiche/?id=", remises: "" };

export default function Actions() {
  const { db, me, run } = useApp();
  const [tab, setTab] = useState<"attente" | "traitees">("attente");
  const all = db.pending.filter((p) => me.role === "patron" || p.by === me.id).sort((a, b) => b.at.localeCompare(a.at));
  const rows = all.filter((p) => (tab === "attente" ? p.status === "en_attente" : p.status !== "en_attente"));
  return (
    <>
      <PageHeader title={me.role === "patron" ? "Actions à confirmer" : "Mes demandes"}
        sub={me.role === "patron" ? "Les gestionnaires délégués créent sans supprimer : leurs suppressions et changements sensibles n'ont d'effet qu'après votre validation." : "Vos demandes de suppression et de modification sensible, en attente de la décision du patron."} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "attente", label: "En attente", count: all.filter((p) => p.status === "en_attente").length }, { value: "traitees", label: "Traitées", count: all.filter((p) => p.status !== "en_attente").length }]} />
      {rows.length === 0 ? (
        <Empty icon={<ClipboardCheck className="size-5" />} title={tab === "attente" ? "Aucune demande en attente" : "Aucune demande traitée"} text={tab === "attente" ? "Les demandes des gestionnaires apparaîtront ici, avec un badge dans la navigation." : undefined} />
      ) : (
        <ul className="space-y-3" data-testid="pending-list">
          {rows.map((p) => {
            const ent = PERM_ENTITIES.find((e) => e.key === p.entity)?.label ?? p.entity;
            const href = LINK[p.entity] ? `${LINK[p.entity]}${p.entityId}` : undefined;
            return (
              <li key={p.id} className="card animate-in p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <Avatar name={nameOf(db, p.by)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={p.kind === "suppression" ? "dark" : "blue"}>{p.kind === "suppression" ? "Suppression" : "Modification sensible"}</Badge>
                      <Badge tone="outline">{ent}</Badge>
                      {p.status === "validee" && <Badge tone="ok">Validée</Badge>}
                      {p.status === "refusee" && <Badge tone="err">Refusée</Badge>}
                    </div>
                    <div className="mt-2 text-[15px] font-semibold">{p.label}</div>
                    <div className="mt-1 text-[13.5px] text-ink/80">Motif : « {p.reason} »</div>
                    <div className="mt-1.5 text-[12.5px] text-muted">Demandé par {nameOf(db, p.by)} · {relative(p.at)}{p.decidedAt ? ` · décidé par ${nameOf(db, p.decidedBy)} le ${dateTime(p.decidedAt)}${p.decisionReason ? ` — ${p.decisionReason}` : ""}` : ""}</div>
                    {href && <Link href={href} className="mt-2 inline-block text-[13px] font-semibold text-brand-700 hover:underline">Consulter l&apos;élément et sa timeline</Link>}
                  </div>
                  {me.role === "patron" && p.status === "en_attente" && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="secondary" icon={<X className="size-3.5" />} data-testid={`refuse-${p.id}`} onClick={async () => {
                        const r = await askReason({ title: "Refuser la demande ?", html: `${nameOf(db, p.by)} sera notifié(e) de votre décision.`, confirmText: "Refuser", dark: true });
                        if (r) await run(() => decidePending(me, p.id, false, r), "Demande refusée", "Le gestionnaire est notifié.");
                      }}>Refuser</Button>
                      <Button size="sm" icon={<Check className="size-3.5" />} data-testid={`approve-${p.id}`} onClick={async () => {
                        const ok = await confirm({ title: "Valider la demande ?", html: p.kind === "suppression" ? "L'élément sera masqué mais conservé (annulation logique). La demande et votre décision restent au journal d'audit." : "La modification sera appliquée et notifiée.", confirmText: "Valider" });
                        if (ok) await run(() => decidePending(me, p.id, true, ""), "Demande validée", "Le gestionnaire est notifié.");
                      }}>Valider</Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
