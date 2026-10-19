"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Route } from "lucide-react";
import { useApp } from "@/components/DataProvider";
import { nameOf } from "@/components/domain";
import { NewPickupModal, PickupBadge } from "@/components/pickup";
import { Button, DataTable, Empty, PageHeader } from "@/components/ui";
import { date, tonnes } from "@/lib/format";
import { can } from "@/lib/permissions";

export default function Enlevements() {
  const { db, me } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const myDrivers = db.drivers.filter((d) => d.userId === me.id).map((d) => d.id);
  const list = db.pickups
    .filter((p) => !p.deleted && (me.role === "chauffeur" ? myDrivers.includes(p.driverId) : me.role === "fournisseur" ? p.stops.some((s) => s.supplierId === me.id) : true))
    .sort((a, b) => b.plannedDate.localeCompare(a.plannedDate));
  const canCreate = can(db.settings[0]!.perms, me, "transports", "c") && !["chauffeur", "fournisseur", "magasinier"].includes(me.role);
  return (
    <>
      <PageHeader eyebrow="Terrain" title="Ordres d'enlèvement" sub="Un véhicule, un chauffeur, des acheteurs à visiter et un trajet. Le chauffeur confirme chaque chargement ; la pesée finale a lieu au magasin."
        actions={canCreate && <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)} data-testid="btn-new-pickup">Nouvel ordre</Button>} />
      <DataTable rows={list} rowKey={(p) => p.id} onRow={(p) => router.push(`/enlevements/fiche/?id=${p.id}`)}
        empty={<Empty icon={<Route className="size-5" />} title="Aucun ordre d'enlèvement" text="Planifiez un enlèvement quand un acheteur déclare du stock prêt." />}
        columns={[
          { key: "r", header: "Ordre", mobile: "title", render: (p) => <span className="font-semibold">{p.ref}</span> },
          { key: "v", header: "Véhicule · chauffeur", mobile: "sub", render: (p) => <span><span className="font-mono">{p.vehicle}</span> · {db.drivers.find((d) => d.id === p.driverId)?.name}</span> },
          { key: "s", header: "Acheteurs", mobile: "meta", render: (p) => p.stops.map((s) => nameOf(db, s.supplierId)).join(", ") },
          { key: "d", header: "Date prévue", mobile: "meta", render: (p) => date(p.plannedDate) },
          { key: "st", header: "Statut", mobile: "meta", render: (p) => <PickupBadge db={db} p={p} /> },
          { key: "q", header: "Prévu / chargé", align: "right", mobile: "value", render: (p) => `${tonnes(p.stops.reduce((s, x) => s + x.plannedKg, 0))} / ${tonnes(p.stops.reduce((s, x) => s + (x.loadedKg ?? 0), 0))}` },
        ]} />
      {open && <NewPickupModal onClose={() => setOpen(false)} onDone={(p) => router.push(`/enlevements/fiche/?id=${p.id}`)} />}
    </>
  );
}
