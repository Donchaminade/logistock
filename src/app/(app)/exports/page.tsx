"use client";
import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, LineChart } from "lucide-react";
import { fail, toast } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { Button, Card, CardTitle, Field, PageHeader, Select, Stat } from "@/components/ui";
import { contractsTable, debtsTable, download, monthlyFigures, monthlyReportPdf, stocksTable, tablesPdf, toXlsx, type Table } from "@/lib/exports";
import { fcfa, tonnes } from "@/lib/format";
import type { Product } from "@/lib/types";

export default function Exports() {
  const { db } = useApp();
  const months = useMemo(() => {
    const set = new Set<string>([new Date().toISOString().slice(0, 7)]);
    for (const a of db.advances) set.add(a.date.slice(0, 7));
    for (const d of db.deliveries) if (d.receivedAt) set.add(d.receivedAt.slice(0, 7));
    return [...set].sort().reverse();
  }, [db]);
  const [month, setMonth] = useState(months[0]!);
  const [product, setProduct] = useState<"" | Product>("");
  const f = monthlyFigures(db, month, product || undefined);
  const stamp = new Date().toISOString().slice(0, 10);

  const sets: { key: string; title: string; sub: string; table: () => Table }[] = [
    { key: "stocks", title: "Stocks", sub: "Déclaré, enlevé et disponible chez chaque acheteur", table: () => stocksTable(db) },
    { key: "dettes", title: "Dettes", sub: "Initial, remboursé, restant, ancienneté et statut", table: () => debtsTable(db) },
    { key: "contrats", title: "Contrats", sub: "A, V, R, J, T, solde S et reste à livrer par contrat", table: () => contractsTable(db) },
  ];
  async function go(kind: "xlsx" | "pdf", t: Table[], name: string) {
    try {
      const blob = kind === "xlsx" ? await toXlsx(t) : tablesPdf(t.length === 1 ? t[0]!.title : "Export LogiStock", t);
      download(blob, `LogiStock-${name}-${stamp}.${kind}`);
      toast("Export généré", `${name}.${kind} · fichier local, aucune donnée envoyée.`);
    } catch (e) {
      await fail(e);
    }
  }
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <>
      <PageHeader eyebrow="Finances" title="Exports et rapport mensuel" sub="Fichiers Excel et PDF générés sur l'appareil, sans service externe. Données fictives — démo." />
      <div className="grid gap-4 lg:grid-cols-3">
        {sets.map((s) => (
          <Card key={s.key}>
            <CardTitle title={s.title} sub={s.sub} icon={<FileSpreadsheet className="size-[18px]" />} />
            <div className="flex gap-2">
              <Button size="sm" icon={<Download className="size-3.5" />} data-testid={`xlsx-${s.key}`} onClick={() => go("xlsx", [s.table()], s.key)}>Excel</Button>
              <Button size="sm" variant="secondary" icon={<FileText className="size-3.5" />} data-testid={`pdf-${s.key}`} onClick={() => go("pdf", [s.table()], s.key)}>PDF</Button>
            </div>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <CardTitle title="Classeur complet" sub="Un fichier, un onglet par table (stocks, dettes, contrats)" icon={<FileSpreadsheet className="size-[18px]" />}
          action={<Button size="sm" icon={<Download className="size-3.5" />} data-testid="xlsx-all" onClick={() => go("xlsx", sets.map((s) => s.table()), "classeur")}>Télécharger (.xlsx)</Button>} />
      </Card>

      <Card className="mt-6">
        <CardTitle title="Rapport mensuel du patron" sub="Avances, livraisons, remboursements, charges, soldes, dettes et marge estimée" icon={<LineChart className="size-[18px]" />}
          action={<Button icon={<FileText className="size-4" />} data-testid="btn-monthly" onClick={async () => { try { download(monthlyReportPdf(db, month, product || undefined), `LogiStock-rapport-${month}${product ? `-${product}` : ""}.pdf`); toast("Rapport mensuel généré", label); } catch (e) { await fail(e); } }}>Rapport PDF</Button>} />
        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:max-w-lg">
          <Field label="Mois"><Select value={month} onChange={(e) => setMonth(e.target.value)} name="month">{months.map((m) => <option key={m} value={m}>{new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`))}</option>)}</Select></Field>
          <Field label="Produit"><Select value={product} onChange={(e) => setProduct(e.target.value as "" | Product)}><option value="">Soja et cacao</option><option value="soja">Soja</option><option value="cacao">Cacao</option></Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat accent label="Avancé dans le mois" value={fcfa(f.advanced)} hint={`${f.advances.length} remise(s)`} />
          <Stat label="Livré réceptionné" value={tonnes(f.deliveredKg)} hint={fcfa(f.deliveredValue)} />
          <Stat label="Remboursements" value={fcfa(f.repaid)} />
          <Stat label="Charges du patron" value={fcfa(f.expenses)} />
          <Stat label="Soldes ouverts" value={fcfa(f.openBalances)} hint="À date" />
          <Stat label="Dettes restantes" value={fcfa(f.debts)} hint="À date" />
          <Stat label="Revente estimée" value={fcfa(f.margin.revenue)} hint="Prix de revente paramétrés" />
          <Stat label="Marge estimée" value={fcfa(f.margin.margin)} hint="Revente − livré − transport − commissions" />
        </div>
      </Card>
    </>
  );
}
