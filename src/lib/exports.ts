// Exports locaux (aucun service externe) : Excel (write-excel-file) et PDF (jsPDF + jspdf-autotable).
// Stocks, dettes, contrats, relevé fournisseur, fiche contrat et rapport mensuel du patron.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import writeXlsxFile from "write-excel-file/browser";
import { AGE_LABEL, debtAge, debtPaid, debtRemaining, ledger, margin, metrics, supplierStock } from "./calc";
import { date, dateTime, fcfa, modeLabel, prixKg, productLabel, tonnes } from "./format";
import type { Contract, Database, Id, Product } from "./types";

export interface Table {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  /** Index des colonnes numériques (alignées à droite, format milliers). */
  numeric: number[];
}

const nameOf = (db: Database, id?: Id) => db.users.find((u) => u.id === id)?.name ?? "—";
const DEBT_STATUS = { ouverte: "Ouverte", en_remboursement: "En remboursement", en_litige: "En litige", soldee: "Soldée", passee_en_perte: "Passée en perte" } as const;
const CT_STATUS = { brouillon: "Brouillon", actif: "Actif", suspendu: "Suspendu", clos: "Clos", annule: "Annulé" } as const;

export function stocksTable(db: Database, onlySupplier?: Id): Table {
  const sups = db.users.filter((u) => u.role === "fournisseur" && !u.deleted && (!onlySupplier || u.id === onlySupplier));
  return {
    title: "Stocks déclarés chez les acheteurs",
    columns: ["Acheteur", "Zone", "Produit", "Déclaré (kg)", "Enlevé (kg)", "Disponible (kg)", "Dernière déclaration"],
    numeric: [3, 4, 5],
    rows: sups.map((u) => {
      const s = supplierStock(db, u.id);
      const products = [...new Set(db.contracts.filter((c) => c.supplierId === u.id && !c.deleted).map((c) => productLabel[c.product]))].join(", ");
      return [u.name, u.zone ?? "—", products || "—", s.declared, s.loaded, s.available, s.lastDate ? date(s.lastDate) : "—"];
    }),
  };
}

export function debtsTable(db: Database, onlySupplier?: Id): Table {
  const debts = db.debts.filter((d) => !d.deleted && (!onlySupplier || d.supplierId === onlySupplier));
  return {
    title: "Dettes des acheteurs",
    columns: ["Acheteur", "Contrat", "Initial (FCFA)", "Remboursé (FCFA)", "Restant (FCFA)", "Née le", "Échéance", "Ancienneté", "Statut"],
    numeric: [2, 3, 4],
    rows: debts.map((d) => [nameOf(db, d.supplierId), db.contracts.find((c) => c.id === d.contractId)?.ref ?? "—", d.initial, debtPaid(db, d.id), debtRemaining(db, d.id), date(d.createdAt), date(d.dueDate), AGE_LABEL[debtAge(d).bucket], DEBT_STATUS[d.status]]),
  };
}

export function contractsTable(db: Database, filter?: (c: Contract) => boolean): Table {
  const list = db.contracts.filter((c) => !c.deleted && (!filter || filter(c)));
  return {
    title: "Contrats et soldes",
    columns: ["Contrat", "Acheteur", "Produit", "Tonnes (kg)", "Prix (FCFA/kg)", "Avancé A", "Livré V", "Remboursé R", "Ajust. J", "Transport T", "Solde S", "Reste (kg)", "Statut"],
    numeric: [3, 4, 5, 6, 7, 8, 9, 10, 11],
    rows: list.map((c) => {
      const m = metrics(db, c);
      return [c.ref, nameOf(db, c.supplierId), productLabel[c.product], c.qtyKg, m.P, m.A, m.V, m.R, m.J, m.Tf, m.S, m.Q, CT_STATUS[c.status]];
    }),
  };
}

export function ledgerTable(db: Database, c: Contract): Table {
  return {
    title: `Relevé ${c.ref}`,
    columns: ["Date", "Opération", "Débit (FCFA)", "Crédit (FCFA)", "Solde courant (FCFA)"],
    numeric: [2, 3, 4],
    rows: ledger(db, c).map((l) => [date(l.date), l.label, l.debit || "", l.credit || "", l.balance]),
  };
}

// ——— Excel ———
export async function toXlsx(tables: Table[]): Promise<Blob> {
  const head = { fontWeight: "bold" as const, backgroundColor: "#0B0D12", color: "#FFFFFF" };
  const sheets = tables.map((t) => ({
    sheet: t.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "),
    columns: t.columns.map((c, i) => ({ width: t.numeric.includes(i) ? 16 : Math.max(14, c.length + 4) })),
    stickyRowsCount: 3,
    data: [
      [{ value: `${t.title} — Données fictives — démo MarockStock`, fontWeight: "bold" as const }],
      [{ value: `Exporté le ${dateTime(new Date().toISOString())}` }],
      t.columns.map((c) => ({ value: c, ...head })),
      ...t.rows.map((r) => r.map((v, i) => (typeof v === "number" ? { value: v, type: Number, format: t.numeric.includes(i) ? "#,##0" : undefined } : { value: String(v) }))),
    ],
  }));
  return writeXlsxFile(sheets).toBlob();
}

// ——— PDF ———
const ink: [number, number, number] = [11, 13, 18];
const blue: [number, number, number] = [31, 79, 216];
const muted: [number, number, number] = [93, 100, 114];
const clean = (s: string) => String(s).replace(/[\u00A0\u202F]/g, " ").replace(/[—–]/g, "-").replace(/→/g, "->").replace(/[’]/g, "'").replace(/−/g, "-");
const fmt = (v: string | number, num: boolean) => (typeof v === "number" && num ? clean(v.toLocaleString("fr-FR")) : clean(String(v)));

function header(doc: jsPDF, title: string, sub: string) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...ink);
  doc.rect(0, 0, W, 26, "F");
  doc.setFillColor(...blue);
  doc.roundedRect(12, 7, 12, 12, 2.5, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("MarockStock", 28, 14.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(170, 175, 185);
  doc.text(clean("Données fictives - démonstration"), 28, 19.5);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(clean(title), W - 12, 13.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(clean(sub), W - 12, 19, { align: "right" });
}

function footer(doc: jsPDF) {
  const n = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(clean(`Généré le ${dateTime(new Date().toISOString())} (heure de Lomé) · MarockStock · données fictives`), 12, H - 7);
    doc.text(`${i} / ${n}`, W - 12, H - 7, { align: "right" });
  }
}

function table(doc: jsPDF, t: Table, startY: number) {
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(clean(t.title), 12, startY);
  autoTable(doc, {
    startY: startY + 3,
    head: [t.columns.map(clean)],
    body: t.rows.length ? t.rows.map((r) => r.map((v, i) => fmt(v, t.numeric.includes(i)))) : [[{ content: "Aucune ligne", colSpan: t.columns.length }]],
    margin: { left: 12, right: 12 },
    styles: { font: "helvetica", fontSize: 7.8, cellPadding: 1.8, textColor: ink, lineColor: [228, 230, 235], lineWidth: 0.1 },
    headStyles: { fillColor: ink, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 247, 249] },
    columnStyles: Object.fromEntries(t.numeric.map((i) => [i, { halign: "right" as const }])),
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
}

export function tablesPdf(title: string, tables: Table[], landscape = true): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: landscape ? "landscape" : "portrait" });
  header(doc, title, date(new Date().toISOString()));
  let y = 36;
  for (const t of tables) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 20;
    }
    y = table(doc, t, y);
  }
  footer(doc);
  return doc.output("blob");
}

export function contractPdf(db: Database, c: Contract): Blob {
  const m = metrics(db, c);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, `Contrat ${c.ref}`, `${nameOf(db, c.supplierId)} · ${productLabel[c.product]}`);
  const rows: [string, string][] = [
    ["Acheteur", nameOf(db, c.supplierId)], ["Produit", productLabel[c.product]],
    ["Réception de l'argent", date(c.moneyReceivedDate)], ["Tonnes contractées", tonnes(c.qtyKg, " ")],
    ["Montant", fcfa(c.amount, " ")], ["Prix initial", prixKg(c.initialPrice, " ")],
    ["Livraison", `${date(c.deliveryDate)} · ${c.deliveryPlace}`], ["Transport", c.transportPaidByPatron ? "Payé par le patron" : "À la charge du fournisseur"],
    ["Prix en vigueur", prixKg(m.P, " ")], ["Statut", CT_STATUS[c.status]],
  ];
  autoTable(doc, {
    startY: 34, body: rows.map(([k, v]) => [clean(k), clean(v)]), theme: "plain", margin: { left: 12, right: 12 },
    styles: { fontSize: 9, cellPadding: 1.6, textColor: ink }, columnStyles: { 0: { textColor: muted, cellWidth: 55 }, 1: { fontStyle: "bold" } },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  doc.setFillColor(...ink);
  doc.roundedRect(12, y, 186, 22, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(clean(`S = A − V − R − J + T = ${fcfa(m.A, " ")} − ${fcfa(m.V, " ")} − ${fcfa(m.R, " ")} − ${fcfa(m.J, " ")} + ${fcfa(m.Tf, " ")}`), 17, y + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(clean(`Solde ${fcfa(m.S, " ")}  ·  Reste à livrer ${tonnes(m.Q, " ")}`), 17, y + 16);
  y += 32;
  y = table(doc, ledgerTable(db, c), y);
  const revs = db.revisions.filter((r) => r.contractId === c.id && !r.deleted);
  if (revs.length)
    table(doc, { title: "Révisions de prix (signées Ed25519)", columns: ["Date", "Ancien", "Nouveau", "Option", "Effet", "Empreinte SHA-256"], numeric: [1, 2], rows: revs.map((r) => [date(r.at), r.oldPrice, r.newPrice, r.option, date(r.effectiveAt), `${r.hash.slice(0, 24)}…`]) }, y);
  footer(doc);
  return doc.output("blob");
}

/** Relevé d'un acheteur (US-08) : tous ses contrats, avec la date de la version. */
export function statementPdf(db: Database, supplierId: Id, syncedAt?: string): Blob {
  const contracts = db.contracts.filter((c) => c.supplierId === supplierId && !c.deleted);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, `Relevé de ${nameOf(db, supplierId)}`, `Version du ${dateTime(syncedAt ?? new Date().toISOString())}`);
  let y = 36;
  y = table(doc, { ...contractsTable(db, (c) => c.supplierId === supplierId), title: "Synthèse" }, y);
  for (const c of contracts) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    y = table(doc, ledgerTable(db, c), y);
  }
  footer(doc);
  return doc.output("blob");
}

// ——— Rapport mensuel du patron ———
export function monthlyFigures(db: Database, month: string, product?: Product) {
  const inMonth = (iso?: string) => !!iso && iso.slice(0, 7) === month;
  const ok = (cid: Id) => !product || db.contracts.find((c) => c.id === cid)?.product === product;
  const advances = db.advances.filter((a) => !a.deleted && a.status !== "annulee" && inMonth(a.date) && ok(a.contractId));
  const deliveries = db.deliveries.filter((d) => !d.deleted && d.status !== "pesee" && inMonth(d.receivedAt) && ok(d.contractId));
  const repayments = db.payments.filter((p) => !p.deleted && p.direction === "fournisseur_vers_patron" && inMonth(p.date) && ok(p.contractId));
  const expenses = db.expenses.filter((e) => !e.deleted && e.status !== "refusee" && e.status !== "a_valider" && inMonth(e.date) && e.debitedOn === "charges_patron" && (!e.contractId || ok(e.contractId)));
  const mg = margin(db, (c) => !product || c.product === product);
  return {
    advanced: advances.reduce((s, a) => s + a.amount, 0),
    deliveredKg: deliveries.reduce((s, d) => s + d.netKg, 0),
    deliveredValue: deliveries.reduce((s, d) => s + d.value, 0),
    repaid: repayments.reduce((s, p) => s + p.amount, 0),
    expenses: expenses.reduce((s, e) => s + e.amount, 0),
    byCategory: (["transport", "maintenance", "commission", "frais_vehicule", "autre"] as const).map((k) => [k, expenses.filter((e) => e.category === k).reduce((s, e) => s + e.amount, 0)] as const),
    openBalances: db.contracts.filter((c) => !c.deleted && c.status !== "clos" && (!product || c.product === product)).reduce((s, c) => s + Math.max(0, metrics(db, c).S), 0),
    debts: db.debts.filter((d) => !d.deleted && ok(d.contractId)).reduce((s, d) => s + debtRemaining(db, d.id), 0),
    margin: mg,
    advances, deliveries, repayments,
  };
}

export function monthlyReportPdf(db: Database, month: string, product?: Product): Blob {
  const f = monthlyFigures(db, month, product);
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, `Rapport mensuel · ${label}`, product ? productLabel[product] : "Tous les produits");
  const kpis: [string, string][] = [
    ["Avancé dans le mois", fcfa(f.advanced, " ")], ["Livré réceptionné", `${tonnes(f.deliveredKg, " ")} · ${fcfa(f.deliveredValue, " ")}`],
    ["Remboursements reçus", fcfa(f.repaid, " ")], ["Charges du patron", fcfa(f.expenses, " ")],
    ["Soldes ouverts (à date)", fcfa(f.openBalances, " ")], ["Dettes restantes (à date)", fcfa(f.debts, " ")],
    ["Marge estimée cumulée", fcfa(f.margin.margin, " ")], ["dont revente estimée", fcfa(f.margin.revenue, " ")],
  ];
  kpis.forEach(([k, v], i) => {
    const x = 12 + (i % 2) * 94, y = 36 + Math.floor(i / 2) * 17;
    doc.setFillColor(i === 0 ? 31 : 246, i === 0 ? 79 : 247, i === 0 ? 216 : 249);
    doc.roundedRect(x, y, 90, 14, 2.5, 2.5, "F");
    doc.setTextColor(...(i === 0 ? ([255, 255, 255] as [number, number, number]) : muted));
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.text(clean(k), x + 4, y + 5);
    doc.setTextColor(...(i === 0 ? ([255, 255, 255] as [number, number, number]) : ink));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(clean(v), x + 4, y + 11);
  });
  let y = 36 + 4 * 17 + 8;
  y = table(doc, { title: "Charges par catégorie", columns: ["Catégorie", "Montant (FCFA)"], numeric: [1], rows: f.byCategory.map(([k, v]) => [{ transport: "Transport", maintenance: "Maintenance", commission: "Commissions", frais_vehicule: "Frais de véhicule", autre: "Autres" }[k], v]) }, y);
  y = table(doc, { title: "Avances du mois", columns: ["Date", "Reçu", "Contrat", "Acheteur", "Mode", "Montant (FCFA)"], numeric: [5], rows: f.advances.map((a) => { const c = db.contracts.find((x) => x.id === a.contractId)!; return [date(a.date), a.receiptNo, c.ref, nameOf(db, c.supplierId), modeLabel[a.mode], a.amount]; }) }, y);
  y = table(doc, { title: "Livraisons réceptionnées", columns: ["Date", "Ticket", "Contrat", "Net (kg)", "Prix", "Valeur (FCFA)"], numeric: [3, 4, 5], rows: f.deliveries.map((d) => [date(d.receivedAt), d.ticketNo, db.contracts.find((c) => c.id === d.contractId)?.ref ?? "", d.netKg, d.price, d.value]) }, y);
  if (y > 230) {
    doc.addPage();
    y = 20;
  }
  table(doc, debtsTable(db), y);
  footer(doc);
  return doc.output("blob");
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
