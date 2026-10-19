// Reçu de remise d'argent + récapitulatif du contrat, en PDF (jsPDF, généré sur l'appareil).
import { jsPDF } from "jspdf";
import { metrics } from "./calc";
import { date, dateTime, fcfa, modeLabel, prixKg, productLabel, tonnes } from "./format";
import { displayPhone } from "./identity";
import type { Advance, Database } from "./types";

const S = " "; // les polices standard PDF n'ont pas l'espace insécable fine : espace simple

async function toJpeg(src: string): Promise<string | undefined> {
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
    const w = 640;
    const h = Math.round((img.height / img.width) * w) || 480;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  }
}

const clean = (s: string) => s.replace(/[\u00A0\u202F]/g, " ").replace(/[—–]/g, "-").replace(/→/g, "->").replace(/[’]/g, "'");

export async function receiptPdf(db: Database, adv: Advance, photoUrl?: string): Promise<Blob> {
  const c = db.contracts.find((x) => x.id === adv.contractId)!;
  const sup = db.users.find((u) => u.id === c.supplierId)!;
  const by = db.users.find((u) => u.id === adv.by);
  const m = metrics(db, c);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const blue: [number, number, number] = [31, 79, 216];
  const ink: [number, number, number] = [11, 13, 18];
  const muted: [number, number, number] = [93, 100, 114];
  const line: [number, number, number] = [228, 230, 235];
  const t = (s: string, x: number, y: number, o?: Parameters<jsPDF["text"]>[3]) => doc.text(clean(s), x, y, o);

  // En-tête noir
  doc.setFillColor(...ink);
  doc.rect(0, 0, W, 34, "F");
  doc.setFillColor(...blue);
  doc.roundedRect(16, 10, 14, 14, 3, 3, "F");
  // Marque du logo (même dessin que public/logo.svg, échelle 14/32)
  {
    const k = 14 / 32, X = (v: number) => 16 + v * k, Y = (v: number) => 10 + v * k;
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(3 * k);
    doc.setLineCap("round");
    doc.setLineJoin("round");
    doc.lines([[0, 14 * k], [6 * k, 0]], X(9), Y(8), [1, 1], "S", false);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(X(17.5), Y(15), 6 * k, 7 * k, 1.5 * k, 1.5 * k, "F");
    doc.setFillColor(143, 167, 236);
    doc.roundedRect(X(17.5), Y(8), 6 * k, 5 * k, 1.5 * k, 1.5 * k, "F");
    doc.setLineWidth(0.2);
    doc.setLineCap("butt");
    doc.setLineJoin("miter");
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  t("LogiStock", 35, 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(170, 175, 185);
  t("Préfinancement soja et cacao - Togo", 35, 24.5);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  t(adv.kind === "complement" ? "REÇU DE COMPLÉMENT DE PRIX" : "REÇU DE REMISE D'ESPÈCES", W - 16, 17, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  t(`N° ${adv.receiptNo}  ·  ${date(adv.date)}`, W - 16, 23.5, { align: "right" });

  // Bandeau démo
  doc.setFillColor(238, 243, 255);
  doc.rect(0, 34, W, 8, "F");
  doc.setTextColor(...blue);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  t("DOCUMENT FICTIF - DÉMONSTRATION LOGISTOCK - SANS VALEUR JURIDIQUE", W / 2, 39.2, { align: "center" });

  // Montant
  let y = 56;
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  t("Montant remis", 16, y);
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  t(fcfa(adv.amount, S), 16, y + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  t(`Soit ${tonnes(adv.qtyKg, S)} à ${prixKg(adv.unitPrice, S)}  (${adv.qtyKg.toLocaleString("fr-FR").replace(/\s/g, " ")} kg x ${adv.unitPrice} FCFA)`, 16, y + 18);

  // Grille d'informations
  y = 88;
  const rows: [string, string][] = [
    ["Fournisseur", `${sup.name} · ${displayPhone(sup.phone)}`],
    ["Contrat", `${c.ref} · ${productLabel[c.product]}`],
    ["Quantité", tonnes(adv.qtyKg, S)],
    ["Prix unitaire", prixKg(adv.unitPrice, S)],
    ["Mode de paiement", modeLabel[adv.mode] + (adv.reference ? ` · réf. ${adv.reference}` : "")],
    ["Date de remise", dateTime(adv.date)],
    ["Remis par", by ? `${by.name} (${by.title})` : "-"],
    ["Statut", adv.status === "validee" ? "Validé (photo de la remise jointe)" : adv.status === "annulee" ? "Annulé (contre-écriture)" : "À compléter (photo manquante)"],
  ];
  doc.setFontSize(9.5);
  rows.forEach(([k, v], i) => {
    const yy = y + i * 9;
    doc.setDrawColor(...line);
    doc.line(16, yy + 3.2, W - 16, yy + 3.2);
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    t(k, 16, yy);
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "bold");
    t(v, 70, yy);
  });

  // Contrat à la remise
  y = y + rows.length * 9 + 10;
  doc.setFillColor(244, 245, 247);
  doc.roundedRect(16, y, W - 32, 46, 3, 3, "F");
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  t(`Contrat à la remise · ${c.ref}`, 22, y + 8);
  doc.setFontSize(9);
  const cr: [string, string][] = [
    ["Réception de l'argent", date(c.moneyReceivedDate)],
    ["Tonnes contractées", tonnes(c.qtyKg, S)],
    ["Montant du contrat", fcfa(c.amount, S)],
    ["Livraison prévue", `${date(c.deliveryDate)} · ${c.deliveryPlace}`],
    ["Transport", c.transportPaidByPatron ? "Payé par le patron" : "Non payé par le patron (à la charge du fournisseur)"],
    ["Prix en vigueur / reste à livrer", `${prixKg(m.P, S)} · ${tonnes(m.Q, S)}`],
  ];
  cr.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 22 + col * 86;
    const yy = y + 17 + row * 10;
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    t(k, x, yy);
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "bold");
    t(v, x, yy + 4.5, { maxWidth: 82 });
  });

  // Photo
  y += 54;
  if (photoUrl) {
    const jpg = await toJpeg(photoUrl);
    if (jpg) {
      doc.setTextColor(...muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      t("Photo de la remise", 16, y);
      doc.addImage(jpg, "JPEG", 16, y + 2.5, 58, 40);
    }
  }
  // Signatures
  doc.setDrawColor(...line);
  doc.setTextColor(...muted);
  doc.setFontSize(8.5);
  doc.line(86, y + 36, 140, y + 36);
  doc.line(148, y + 36, W - 16, y + 36);
  t("Signature du fournisseur", 86, y + 41);
  t("Signature du patron", 148, y + 41);

  // Pied
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  t(`Empreinte du reçu : ${adv.receiptHash}  ·  Généré le ${dateTime(new Date().toISOString())} (heure de Lomé)`, 16, 285);
  t("LogiStock · maquette interactive · données fictives", W - 16, 285, { align: "right" });

  return doc.output("blob");
}

export function receiptFileName(adv: Advance) {
  return `LogiStock-${adv.receiptNo}.pdf`;
}
