"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Search } from "lucide-react";
import { useApp } from "@/components/DataProvider";
import { ContractBadges, ContractModal, contractsOf, nameOf } from "@/components/domain";
import { Button, DataTable, Empty, Input, PageHeader, Progress, Segmented } from "@/components/ui";
import { metrics } from "@/lib/calc";
import { date, fcfa, prixKg, productLabel, tonnes } from "@/lib/format";
import { can } from "@/lib/permissions";

export default function Contrats() {
  const { db, me } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [st, setSt] = useState<"actif" | "clos" | "all">("actif");
  const rows = contractsOf(db, me)
    .filter((c) => st === "all" || c.status === st)
    .filter((c) => !q || `${c.ref} ${nameOf(db, c.supplierId)} ${c.product} ${c.deliveryPlace}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const canCreate = can(db.settings[0]!.perms, me, "contrats", "c") && me.role !== "fournisseur";
  return (
    <>
      <PageHeader
        title={me.role === "fournisseur" ? "Mes contrats" : "Contrats"}
        sub="Avance, livré valorisé, solde et reste à livrer : tout est recalculé à partir des écritures."
        actions={canCreate && <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)} data-testid="new-contract">Nouveau contrat</Button>}
      />
      <div className="animate-in mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un contrat, un fournisseur, un lieu…" className="pl-10" />
        </div>
        <Segmented value={st} onChange={setSt} options={[{ value: "actif", label: "Actifs" }, { value: "clos", label: "Clos" }, { value: "all", label: "Tous" }]} />
      </div>
      <DataTable
        rows={rows}
        rowKey={(c) => c.id}
        onRow={(c) => router.push(`/contrats/fiche/?id=${c.id}`)}
        empty={<Empty icon={<FileText className="size-5" />} title={q ? "Aucun résultat" : "Aucun contrat"} text={q ? "Essayez un autre mot-clé." : "Les contrats naissent de la validation d'une proposition."} />}
        columns={[
          { key: "ref", header: "Contrat", mobile: "title", render: (c) => <div><div className="font-semibold">{c.ref}</div><div className="text-[12.5px] text-muted md:block hidden">{productLabel[c.product]} · {tonnes(c.qtyKg)}</div></div> },
          { key: "sup", header: "Fournisseur", mobile: "sub", render: (c) => <span>{nameOf(db, c.supplierId)}<span className="text-muted md:hidden"> · {productLabel[c.product]} · {tonnes(c.qtyKg)}</span></span> },
          { key: "liv", header: "Livraison", mobile: "meta", render: (c) => `${c.deliveryPlace} · ${date(c.deliveryDate)}` },
          { key: "adv", header: "Avancé", align: "right", mobile: "meta", render: (c) => fcfa(metrics(db, c).A) },
          { key: "real", header: "Réalisation", mobile: "hide", render: (c) => { const m = metrics(db, c); return <div className="w-24"><div className="mb-1 text-[12px] text-muted">{m.realisation} %</div><Progress value={m.realisation} /></div>; } },
          { key: "p", header: "Prix", align: "right", mobile: "meta", render: (c) => prixKg(metrics(db, c).P) },
          { key: "q", header: "Reste à livrer", align: "right", mobile: "value", render: (c) => <span className="font-semibold">{tonnes(metrics(db, c).Q)}</span> },
          { key: "st", header: "Statut", mobile: "meta", render: (c) => <ContractBadges c={c} m={metrics(db, c)} /> },
        ]}
      />
      <ContractModal open={open} onClose={() => setOpen(false)} onDone={(c) => router.push(`/contrats/fiche/?id=${c.id}&remise=1`)} />
    </>
  );
}
