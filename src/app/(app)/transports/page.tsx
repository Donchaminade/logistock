"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { useApp } from "@/components/DataProvider";
import { contractsOf, nameOf, TransportModal } from "@/components/domain";
import { Badge, Button, DataTable, Empty, PageHeader, Segmented } from "@/components/ui";
import { dateTime, productLabel, tonnes } from "@/lib/format";
import { can } from "@/lib/permissions";

const TR_STATUS = { en_route: "En route", arrive: "Pointé à Lomé", receptionne: "Réceptionné" } as const;

export default function Transports() {
  const { db, me } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState<"cours" | "all">("cours");
  const mine = new Set(contractsOf(db, me).map((c) => c.id));
  const rows = db.transports
    .filter((t) => !t.deleted && mine.has(t.contractId) && (st === "all" || t.status !== "receptionne"))
    .sort((a, b) => b.loadingDate.localeCompare(a.loadingDate));
  return (
    <>
      <PageHeader title="Transports et lots" sub="Chaque transport est un lot tracé : origine variable, étapes horodatées, réceptionnaires, pointage à Lomé."
        actions={me.role !== "fournisseur" && can(db.settings[0]!.perms, me, "transports", "c") && <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)} data-testid="new-transport">Nouveau transport</Button>} />
      <div className="mb-4"><Segmented value={st} onChange={setSt} options={[{ value: "cours", label: "En cours" }, { value: "all", label: "Tous" }]} /></div>
      <DataTable rows={rows} rowKey={(t) => t.id} onRow={(t) => router.push(`/transports/fiche/?id=${t.id}`)}
        empty={<Empty icon={<Truck className="size-5" />} title="Aucun transport en cours" text="Les transports réceptionnés sont visibles dans « Tous »." />}
        columns={[
          { key: "ref", header: "Lot", mobile: "title", render: (t) => <span className="font-semibold">{t.ref} <span className="font-normal text-muted">· {productLabel[t.product]}</span></span> },
          { key: "route", header: "Trajet", mobile: "sub", render: (t) => `${t.origin} → ${db.traces.filter((e) => e.transportId === t.id && e.type !== "chargement" && e.type !== "achat").length} étape(s) → Lomé` },
          { key: "sup", header: "Fournisseur", mobile: "meta", render: (t) => nameOf(db, db.contracts.find((c) => c.id === t.contractId)?.supplierId) },
          { key: "veh", header: "Véhicule", mobile: "meta", render: (t) => <span className="font-mono text-[13px]">{t.vehicle}</span> },
          { key: "drv", header: "Chauffeur", mobile: "hide", render: (t) => t.driver },
          { key: "date", header: "Chargement", mobile: "hide", render: (t) => dateTime(t.loadingDate) },
          { key: "tons", header: "Tonnes", align: "right", mobile: "value", render: (t) => <span className="font-semibold">{tonnes(t.tonsKg)}</span> },
          { key: "st", header: "Statut", mobile: "meta", render: (t) => <Badge tone={t.status === "receptionne" ? "dark" : t.status === "arrive" ? "outline" : "blue"}>{TR_STATUS[t.status]}</Badge> },
        ]} />
      <TransportModal open={open} onClose={() => setOpen(false)} onDone={(id) => router.push(`/transports/fiche/?id=${id}`)} />
    </>
  );
}
