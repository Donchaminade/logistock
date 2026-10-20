"use client";
import { useApp } from "@/components/DataProvider";
import { nameOf } from "@/components/domain";
import { Badge, DataTable, Empty, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { Shield } from "lucide-react";

export default function Consentements() {
  const { db, me } = useApp();
  if (me.role !== "patron" && me.role !== "admin") {
    return <Empty icon={<Shield className="size-5" />} title="Accès réservé" text="Le patron et l'administrateur consultent les preuves de consentement." />;
  }
  const rows = [...db.consents].filter((c) => !c.deleted).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <PageHeader eyebrow="Contrôle" title="Consentements" sub="Chaque acceptation et chaque retrait : personne, date, version du texte, signature et user-agent." />
      <DataTable rows={rows} rowKey={(c) => c.id} columns={[
        { key: "u", header: "Personne", mobile: "title", render: (c) => <span className="font-semibold">{nameOf(db, c.userId)}</span> },
        { key: "d", header: "Date", mobile: "sub", render: (c) => dateTime(c.at) },
        { key: "v", header: "Version", mobile: "meta", render: (c) => c.policyVersion },
        { key: "g", header: "Décision", mobile: "meta", render: (c) => <Badge tone={c.granted ? "ok" : "err"}>{c.granted ? "Accepté" : "Retiré"}</Badge> },
        { key: "s", header: "Signature", mobile: "meta", render: (c) => c.signature ? <a href={c.signature} target="_blank" rel="noreferrer" className="font-semibold text-brand-700">Voir</a> : "—" },
        { key: "a", header: "User-agent", mobile: "hide", render: (c) => <span className="line-clamp-2 max-w-xs text-[12px] text-muted">{c.userAgent}</span> },
      ]} />
    </>
  );
}
