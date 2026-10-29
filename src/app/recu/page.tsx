"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { useData } from "@/components/DataProvider";
import { openReceipt } from "@/components/domain";
import { Logo } from "@/components/Logo";
import { Button, Photo, PageSkeleton } from "@/components/ui";
import { metrics } from "@/lib/calc";
import { date, dateTime, fcfa, modeLabel, prixKg, productLabel, tonnes } from "@/lib/format";
import { displayPhone } from "@/lib/identity";

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><Recu /></Suspense>;
}

function Recu() {
  const { db, me, ready } = useData();
  const id = useSearchParams().get("id");
  if (!ready || !db) return <div className="p-8"><PageSkeleton /></div>;
  const a = db.advances.find((x) => x.id === id);
  if (!me || !a) return <p className="p-8 text-center text-muted">Reçu introuvable ou session expirée. Connectez-vous dans cet onglet.</p>;
  const c = db.contracts.find((x) => x.id === a.contractId)!;
  if (me.role === "fournisseur" && c.supplierId !== me.id) return <p className="p-8 text-center text-muted">Accès refusé.</p>;
  const sup = db.users.find((u) => u.id === c.supplierId)!;
  const m = metrics(db, c);
  return (
    <div className="min-h-dvh bg-canvas py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[52rem] justify-end gap-2 px-4">
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => openReceipt(db, a, "download")}>Télécharger le PDF</Button>
        <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimer</Button>
      </div>
      <article className="mx-auto max-w-[52rem] overflow-hidden rounded-2xl border border-line bg-white print:rounded-none print:border-0" data-testid="receipt">
        <header className="flex items-center justify-between bg-ink px-8 py-6 text-white">
          <Logo inverted sub="Préfinancement soja et cacao · Togo" />
          <div className="text-right">
            <div className="text-[13px] font-bold tracking-wide">{a.kind === "complement" ? "REÇU DE COMPLÉMENT DE PRIX" : "REÇU DE REMISE D'ESPÈCES"}</div>
            <div className="num text-[12.5px] text-white/60">N° {a.receiptNo} · {date(a.date)}</div>
          </div>
        </header>
        <div className="bg-brand-50 py-2 text-center text-[11px] font-bold tracking-[0.08em] text-brand-700">DOCUMENT FICTIF — DÉMONSTRATION MAROCKSTOCK</div>
        <div className="p-8">
          <div className="text-[13px] text-muted">Montant remis</div>
          <div className="num text-[36px] font-bold tracking-[-0.03em]">{fcfa(a.amount)}</div>
          <div className="num text-[14px] text-muted">Soit {tonnes(a.qtyKg)} à {prixKg(a.unitPrice)}</div>
          <dl className="num mt-8 grid grid-cols-2 gap-x-8 gap-y-4 text-[14px]">
            {[
              ["Fournisseur", `${sup.name} · ${displayPhone(sup.phone)}`], ["Contrat", `${c.ref} · ${productLabel[c.product]}`],
              ["Quantité", tonnes(a.qtyKg)], ["Prix unitaire", prixKg(a.unitPrice)],
              ["Mode", modeLabel[a.mode]], ["Date de remise", dateTime(a.date)],
              ["Livraison prévue", `${date(c.deliveryDate)} · ${c.deliveryPlace}`], ["Transport", c.transportPaidByPatron ? "Payé par le patron" : "Non payé par le patron"],
              ["Tonnes contractées", tonnes(c.qtyKg)], ["Reste à livrer", `${tonnes(m.Q)} à ${prixKg(m.P)}`],
            ].map(([k, v]) => <div key={k} className="border-b border-line pb-2"><dt className="text-[12px] text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
          </dl>
          <div className="mt-8 flex items-end gap-8">
            {a.photo && <div><div className="mb-1 text-[12px] text-muted">Photo de la remise</div><Photo src={a.photo} alt="Photo de la remise" className="h-32 w-44" /></div>}
            <div className="grid flex-1 grid-cols-2 gap-8 text-[12px] text-muted">
              <div className="border-t border-line-2 pt-2">Signature du fournisseur</div>
              <div className="border-t border-line-2 pt-2">Signature du patron</div>
            </div>
          </div>
          <div className="mt-8 space-y-1 rounded-xl bg-canvas p-4 font-mono text-[11px] text-subtle break-all">
            <div><span className="font-sans font-semibold">SHA-256 :</span> {a.receiptHash}</div>
            <div><span className="font-sans font-semibold">Signature Ed25519 :</span> {a.receiptSignature}</div>
            <div className="font-sans">Vérifiable sans connexion : <a className="font-semibold text-brand-700 underline" href={`/verifier/?no=${a.receiptNo}&h=${a.receiptHash.slice(0, 16)}`}>/verifier</a> · clé de démonstration, signature côté serveur en production.</div>
          </div>
        </div>
      </article>
    </div>
  );
}
