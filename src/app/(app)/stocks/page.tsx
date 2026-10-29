"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Route, Warehouse } from "lucide-react";
import { fail } from "@/components/alerts";
import { NewPickupModal } from "@/components/pickup";
import { Button, Stat } from "@/components/ui";
import { can } from "@/lib/permissions";
import { download, stocksTable, toXlsx } from "@/lib/exports";
import { productLabel } from "@/lib/format";
import { useApp } from "@/components/DataProvider";
import { activeProducts } from "@/lib/catalog";
import { nameOf } from "@/components/domain";
import { Badge, DataTable, Empty, PageHeader, Photo } from "@/components/ui";
import { supplierStock } from "@/lib/calc";
import { date, modeLabel, prixKg, tonnes } from "@/lib/format";

export default function Stocks() {
  const { db, me } = useApp();
  const router = useRouter();
  const [plan, setPlan] = useState<string | null>(null);
  const threshold = db.settings[0]!.stockAlertKg;
  const canPlan = can(db.settings[0]!.perms, me, "transports", "c") && ["patron", "admin", "gestionnaire"].includes(me.role);
  const received = db.deliveries.filter((d) => d.status === "receptionnee" && !d.deleted);
  const store = activeProducts(db).map((x) => x.id).map((p) => ({ p, kg: received.filter((d) => db.contracts.find((c) => c.id === d.contractId)?.product === p).reduce((s, d) => s + d.netKg, 0) }));
  const suppliers = db.users.filter((u) => u.role === "fournisseur" && !u.deleted).map((u) => ({ u, s: supplierStock(db, u.id) })).sort((a, b) => b.s.available - a.s.available);
  const decl = db.declarations.filter((d) => !d.deleted).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <PageHeader title="Stocks" sub="Stock déclaré chez les acheteurs (pas encore enlevé) et stock reçu au magasin de Lomé. Une déclaration ne réduit pas le solde ; seule une livraison réceptionnée le fait."
        actions={<Button variant="secondary" icon={<Download className="size-4" />} onClick={async () => { try { download(await toXlsx([stocksTable(db)]), "MarockStock-stocks.xlsx"); } catch (e) { await fail(e); } }}>Excel</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Disponible chez les acheteurs" value={tonnes(suppliers.reduce((s, r) => s + r.s.available, 0))} hint={`Seuil d'alerte ${tonnes(threshold)}`} />
        <Stat label="Prêts à enlever" value={String(suppliers.filter((r) => r.s.available >= threshold).length)} hint="Au-dessus du seuil" />
        {store.map((x) => <Stat key={x.p} label={`Magasin de Lomé · ${productLabel[x.p]}`} value={tonnes(x.kg)} hint="Reçu (cumul)" />)}
      </div>
      <h2 className="mb-3 text-[16px] font-bold">Disponible chez chaque fournisseur</h2>
      <DataTable rows={suppliers} rowKey={(r) => r.u.id}
        columns={[
          { key: "n", header: "Fournisseur", mobile: "title", render: (r) => <span className="font-semibold">{r.u.name}</span> },
          { key: "z", header: "Zone", mobile: "sub", render: (r) => r.u.zone ?? "—" },
          { key: "d", header: "Déclaré", align: "right", mobile: "meta", render: (r) => tonnes(r.s.declared) },
          { key: "l", header: "Enlevé", align: "right", mobile: "meta", render: (r) => tonnes(r.s.loaded) },
          { key: "a", header: "Disponible", align: "right", mobile: "value", render: (r) => <span className="font-semibold">{tonnes(r.s.available)}</span> },
          { key: "dt", header: "Dernière déclaration", mobile: "meta", render: (r) => date(r.s.lastDate) },
          { key: "st", header: "", mobile: "meta", render: (r) => (r.s.available >= threshold ? <span className="inline-flex items-center gap-2"><Badge tone="blue">Prêt à enlever</Badge>{canPlan && <Button size="sm" variant="quiet" icon={<Route className="size-3.5" />} data-testid={`plan-${r.u.id}`} onClick={() => setPlan(r.u.id)}>Planifier</Button>}</span> : null) },
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
      {plan && <NewPickupModal presetContractId={db.contracts.find((c) => c.supplierId === plan && c.status === "actif" && !c.deleted)?.id} onClose={() => setPlan(null)} onDone={(p) => router.push(`/enlevements/fiche/?id=${p.id}`)} />}
    </>
  );
}
