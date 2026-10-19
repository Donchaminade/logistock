"use client";
import { Warehouse } from "lucide-react";
import { useApp } from "@/components/DataProvider";
import { nameOf } from "@/components/domain";
import { Badge, DataTable, Empty, PageHeader, Photo } from "@/components/ui";
import { supplierStock } from "@/lib/calc";
import { date, modeLabel, prixKg, tonnes } from "@/lib/format";

export default function Stocks() {
  const { db } = useApp();
  const suppliers = db.users.filter((u) => u.role === "fournisseur" && !u.deleted).map((u) => ({ u, s: supplierStock(db, u.id) })).sort((a, b) => b.s.available - a.s.available);
  const decl = db.declarations.filter((d) => !d.deleted).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <PageHeader title="Stocks déclarés" sub="Quantités achetées par les fournisseurs et pas encore enlevées : de quoi organiser l'envoi d'un véhicule. Une déclaration ne réduit pas le solde ; seule une livraison réceptionnée le fait." />
      <h2 className="mb-3 text-[16px] font-bold">Disponible chez chaque fournisseur</h2>
      <DataTable rows={suppliers} rowKey={(r) => r.u.id}
        columns={[
          { key: "n", header: "Fournisseur", mobile: "title", render: (r) => <span className="font-semibold">{r.u.name}</span> },
          { key: "z", header: "Zone", mobile: "sub", render: (r) => r.u.zone ?? "—" },
          { key: "d", header: "Déclaré", align: "right", mobile: "meta", render: (r) => tonnes(r.s.declared) },
          { key: "l", header: "Enlevé", align: "right", mobile: "meta", render: (r) => tonnes(r.s.loaded) },
          { key: "a", header: "Disponible", align: "right", mobile: "value", render: (r) => <span className="font-semibold">{tonnes(r.s.available)}</span> },
          { key: "dt", header: "Dernière déclaration", mobile: "meta", render: (r) => date(r.s.lastDate) },
          { key: "st", header: "", mobile: "hide", render: (r) => (r.s.available >= 5000 ? <Badge tone="blue">Prêt à enlever</Badge> : null) },
        ]} />
      <h2 className="mb-3 mt-8 text-[16px] font-bold">Déclarations d&apos;achats</h2>
      <DataTable rows={decl} rowKey={(d) => d.id}
        empty={<Empty icon={<Warehouse className="size-5" />} title="Aucune déclaration" />}
        columns={[
          { key: "p", header: "", mobile: "hide", render: (d) => (d.photo ? <Photo src={d.photo} alt="Reçu ou carnet" className="size-10" /> : <span className="block size-10 rounded-xl bg-canvas" />) },
          { key: "f", header: "Fournisseur", mobile: "title", render: (d) => <span className="font-semibold">{nameOf(db, d.supplierId)}</span> },
          { key: "l", header: "Lieu", mobile: "sub", render: (d) => `${d.place}${d.producer ? ` · ${d.producer}` : ""}` },
          { key: "d", header: "Date", mobile: "meta", render: (d) => date(d.date) },
          { key: "pr", header: "Prix payé", mobile: "meta", render: (d) => `${prixKg(d.pricePaid)} · ${modeLabel[d.mode]}` },
          { key: "q", header: "Quantité", align: "right", mobile: "value", render: (d) => <span className="font-semibold">{tonnes(d.qtyKg)}</span> },
        ]} />
    </>
  );
}
