"use client";
import { History, ShieldCheck } from "lucide-react";
import { success, fail } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { nameOf } from "@/components/domain";
import { Button, DataTable, Empty, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";

export default function Journal() {
  const { db, me } = useApp();
  if (me.role !== "patron") return <Empty icon={<History className="size-5" />} title="Réservé au patron" />;
  const rows = [...db.audit].reverse();
  return (
    <>
      <PageHeader title="Journal d'audit" sub="Qui, quand, quoi. En ajout seul, chaque ligne est chaînée à la précédente par son empreinte."
        actions={<Button variant="secondary" icon={<ShieldCheck className="size-4" />} onClick={async () => {
          const broken = db.audit.findIndex((a, i) => i > 0 && a.prevHash !== db.audit[i - 1]!.hash);
          if (broken === -1) await success("Chaîne intègre", `${db.audit.length} entrées vérifiées : chaque empreinte correspond à la ligne précédente.`);
          else await fail(`Rupture de chaîne à la ligne ${broken + 1}.`, "Altération détectée");
        }}>Vérifier l&apos;intégrité</Button>} />
      <DataTable rows={rows} rowKey={(a) => a.id} columns={[
        { key: "d", header: "Date", mobile: "meta", render: (a) => dateTime(a.at) },
        { key: "u", header: "Utilisateur", mobile: "sub", render: (a) => (a.by === "system" ? "Système" : nameOf(db, a.by)) },
        { key: "a", header: "Action", mobile: "title", render: (a) => <span className="font-semibold">{a.action}</span> },
        { key: "x", header: "Détail", mobile: "meta", render: (a) => <span className="line-clamp-2 max-w-md text-[13px] text-muted">{a.detail || "—"}</span> },
        { key: "h", header: "Empreinte", mobile: "hide", render: (a) => <code className="font-mono text-[11px] text-subtle">{a.hash.slice(0, 10)}</code> },
      ]} />
    </>
  );
}
