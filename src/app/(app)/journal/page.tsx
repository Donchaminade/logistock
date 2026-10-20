"use client";
import { useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { fail, success } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { nameOf } from "@/components/domain";
import { Badge, Button, DataTable, Input, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { verifyAuditChain, type ChainCheck } from "@/lib/integrity";
import type { AuditEntry } from "@/lib/types";

function Values({ a }: { a: AuditEntry }) {
  if (!a.before && !a.after) return null;
  const fmt = (s?: string) => (s ? s.replace(/[{}"]/g, "").replace(/,/g, ", ").replace(/:/g, " : ") : "—");
  return (
    <details className="mt-1 text-[12px] text-muted">
      <summary className="cursor-pointer font-semibold text-brand-700">Avant / après</summary>
      <div className="mt-1 grid gap-1 rounded-lg bg-canvas p-2 font-mono text-[11px] break-all">
        <div><span className="font-sans font-semibold">Avant :</span> {fmt(a.before)}</div>
        <div><span className="font-sans font-semibold">Après :</span> {fmt(a.after)}</div>
      </div>
    </details>
  );
}

export default function Journal() {
  const { db } = useApp();
  const [q, setQ] = useState("");
  const [check, setCheck] = useState<ChainCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = [...db.audit].reverse().filter((a) => !q || `${a.action} ${a.detail} ${nameOf(db, a.by)}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader eyebrow="Contrôle" title="Journal d'audit" sub="Qui, quand, quoi, avec les valeurs avant / après et l'appareil. En ajout seul : chaque ligne porte le SHA-256 de son contenu et de la ligne précédente."
        actions={<Button variant="secondary" loading={busy} icon={<ShieldCheck className="size-4" />} data-testid="btn-verify-chain" onClick={async () => {
          setBusy(true);
          const r = await verifyAuditChain(db.audit);
          setCheck(r);
          setBusy(false);
          if (r.ok) await success("Chaîne intègre", `${r.count} entrées : chaque empreinte SHA-256 recalculée correspond au contenu et à la ligne précédente.`);
          else await fail(`Ligne ${(r.brokenAt ?? 0) + 1} : ${r.reason}`, "Altération détectée");
        }}>Vérifier l&apos;intégrité</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une action, une personne, une référence…" className="max-w-md" />
        {check && <Badge tone={check.ok ? "ok" : "err"}>{check.ok ? <><ShieldCheck className="mr-1 inline size-3" />Chaîne vérifiée · {check.count} entrées</> : <><ShieldAlert className="mr-1 inline size-3" />Rupture à la ligne {(check.brokenAt ?? 0) + 1}</>}</Badge>}
      </div>
      <DataTable rows={rows} rowKey={(a) => a.id} columns={[
        { key: "d", header: "Date", mobile: "meta", render: (a) => dateTime(a.at) },
        { key: "u", header: "Utilisateur", mobile: "sub", render: (a) => `${a.by === "system" ? "Système" : nameOf(db, a.by)}${a.device ? ` · ${a.device.length > 20 ? a.device.slice(0, 8) : a.device}` : ""}` },
        { key: "a", header: "Action", mobile: "title", render: (a) => <span className="font-semibold">{a.action}</span> },
        { key: "x", header: "Détail", mobile: "meta", render: (a) => <div className="max-w-md"><span className="line-clamp-2 text-[13px] text-muted">{a.detail || "—"}</span><Values a={a} /></div> },
        { key: "g", header: "Position", mobile: "hide", render: (a) => a.lat != null ? <span className="num text-[12px]">{a.lat.toFixed(4)}, {a.lng?.toFixed(4)}{a.accuracy != null ? ` ±${Math.round(a.accuracy)} m` : ""}</span> : <span className="line-clamp-2 text-[12px] text-muted">{a.positionNote ?? "—"}</span> },
        { key: "h", header: "SHA-256", mobile: "hide", render: (a) => <code className="font-mono text-[11px] text-subtle" title={a.hash}>{a.hash.slice(0, 12)}</code> },
      ]} />
    </>
  );
}
