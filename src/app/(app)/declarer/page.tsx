"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MapPin, PackagePlus, Scale } from "lucide-react";
import { fail, success } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { contractsOf, PartialModal } from "@/components/domain";
import { Badge, Button, Card, Empty, Field, Input, PageHeader, PhotoInput, Select, Tabs } from "@/components/ui";
import { fcfa, group, productLabel, tonnes } from "@/lib/format";
import type { Contract, PaymentMode } from "@/lib/types";
import { declarePurchase } from "@/services/actions";

export default function Page() {
  return <Suspense fallback={null}><Declarer /></Suspense>;
}

function Declarer() {
  const { db, me } = useApp();
  const sp = useSearchParams();
  const [tab, setTab] = useState<"achat" | "partielle" | "etape">("achat");
  useEffect(() => {
    const t = sp.get("tab");
    if (t === "etape" || t === "partielle") setTab(t);
  }, [sp]);
  const contracts = contractsOf(db, me).filter((c) => c.status === "actif");
  const [partial, setPartial] = useState<Contract | null>(null);
  const transports = db.transports.filter((t) => !t.deleted && t.status === "en_route" && contracts.some((c) => c.id === t.contractId));

  if (me.role !== "fournisseur") return <Empty icon={<PackagePlus className="size-5" />} title="Réservé aux fournisseurs" />;
  return (
    <>
      <PageHeader title="Déclarer" sub="Vos achats, vos livraisons partielles et les passages de vos transports. Le patron est notifié à chaque déclaration." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "achat", label: "Achat et stock" }, { value: "partielle", label: "Livraison partielle" }, { value: "etape", label: "Étape de transport", count: transports.length }]} />
      {tab === "achat" && <PurchaseForm contracts={contracts} />}
      {tab === "partielle" && (
        contracts.length === 0 ? <Empty icon={<Scale className="size-5" />} title="Aucun contrat actif" /> : (
          <ul className="space-y-3">
            {contracts.map((c) => (
              <li key={c.id} className="card flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{c.ref} · {productLabel[c.product]}</div>
                  <div className="num text-[13px] text-muted">{tonnes(c.qtyKg)} contractées · livraison à {c.deliveryPlace}</div>
                </div>
                <Button size="sm" onClick={() => setPartial(c)} data-testid={`declare-partial-${c.ref}`}>Déclarer</Button>
              </li>
            ))}
          </ul>
        )
      )}
      {tab === "etape" && (
        transports.length === 0 ? <Empty icon={<MapPin className="size-5" />} title="Aucun transport en route" text="Les transports créés pour vos contrats apparaîtront ici." /> : (
          <ul className="space-y-3">
            {transports.map((t) => (
              <li key={t.id} className="card flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-semibold">{t.ref} <Badge tone="blue">En route</Badge></div>
                  <div className="num text-[13px] text-muted">{t.origin} → Lomé · {tonnes(t.tonsKg)} · {t.vehicle}</div>
                </div>
                <Link href={`/transports/fiche/?id=${t.id}`} className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3 text-[13px] font-semibold text-white">Confirmer un passage</Link>
              </li>
            ))}
          </ul>
        )
      )}
      {partial && <PartialModal open onClose={() => setPartial(null)} contract={partial} />}
    </>
  );
}

function PurchaseForm({ contracts }: { contracts: Contract[] }) {
  const { me } = useApp();
  const empty = { contractId: contracts[0]?.id ?? "", date: new Date().toISOString().slice(0, 10), place: "", producer: "", tons: "", price: "", mode: "especes" as PaymentMode, photo: undefined as string | undefined };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const qtyKg = Math.round(Number(f.tons.replace(",", ".")) * 1000);
  if (!contracts.length) return <Empty icon={<PackagePlus className="size-5" />} title="Aucun contrat actif" text="Une déclaration se rattache à un contrat." />;
  return (
    <Card className="animate-in">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contrat" className="sm:col-span-2"><Select value={f.contractId} onChange={set("contractId")}>{contracts.map((c) => <option key={c.id} value={c.id}>{c.ref} · {productLabel[c.product]}</option>)}</Select></Field>
        <Field label="Date d'achat"><Input type="date" value={f.date} onChange={set("date")} /></Field>
        <Field label="Lieu ou village"><Input value={f.place} onChange={set("place")} placeholder="ex. Kougnohou" name="place" /></Field>
        <Field label="Producteur (facultatif)"><Input value={f.producer} onChange={set("producer")} /></Field>
        <Field label="Quantité (tonnes)" hint={qtyKg > 0 ? `${group(qtyKg)} kg` : undefined}><Input inputMode="decimal" value={f.tons} onChange={set("tons")} name="tons" /></Field>
        <Field label="Prix payé (FCFA/kg)" hint={qtyKg && Number(f.price) ? `Montant payé : ${fcfa(qtyKg * Number(f.price))}` : undefined}><Input inputMode="numeric" value={f.price} onChange={set("price")} name="price" /></Field>
        <Field label="Mode de paiement"><Select value={f.mode} onChange={set("mode")}><option value="especes">Espèces</option><option value="flooz">Flooz</option><option value="tmoney">T-Money</option></Select></Field>
        <div className="sm:col-span-2"><PhotoInput label="Photo du reçu ou du carnet" value={f.photo} onChange={(photo) => setF({ ...f, photo })} /></div>
      </div>
      <Button className="mt-5 w-full sm:w-auto" loading={busy} data-testid="purchase-submit" onClick={async () => {
        setBusy(true);
        try {
          await declarePurchase(me, { contractId: f.contractId, date: new Date(f.date).toISOString(), place: f.place, producer: f.producer || undefined, qtyKg, pricePaid: Number(f.price), mode: f.mode, photo: f.photo });
          setF(empty);
          await success("Achat déclaré", `${tonnes(qtyKg)} ajoutées à votre stock disponible. Votre solde ne change pas : seule une livraison réceptionnée le réduit.`);
        } catch (e) { await fail(e); } finally { setBusy(false); }
      }}>Déclarer l&apos;achat</Button>
    </Card>
  );
}
