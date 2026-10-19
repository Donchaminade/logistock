"use client";
import { useState } from "react";
import { Receipt } from "lucide-react";
import { fail, success } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { myPickups } from "@/components/driver";
import { Badge, Button, Card, CardTitle, DataTable, Empty, Field, Input, PageHeader, PhotoInput, Select } from "@/components/ui";
import { date, fcfa } from "@/lib/format";
import { addExpense } from "@/services/actions";
import { isOnline } from "@/services/network";

export default function Frais() {
  const { db, me } = useApp();
  const trips = myPickups(db, me);
  const plates = [...new Set(trips.map((p) => p.vehicle))];
  const [f, setF] = useState({ label: "Carburant", amount: "", beneficiary: "", vehicle: plates[0] ?? "", photo: undefined as string | undefined });
  const [busy, setBusy] = useState(false);
  const mine = db.expenses.filter((e) => e.by === me.id && !e.deleted).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <PageHeader eyebrow="Chauffeur" title="Frais du véhicule" sub="Carburant, péage, réparation : déclarez avec le justificatif. Le patron ou l'administrateur valide." />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <CardTitle title="Déclarer des frais" icon={<Receipt className="size-[18px]" />} />
          <div className="space-y-4">
            <Field label="Nature"><Select value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} name="nature"><option>Carburant</option><option>Péage</option><option>Réparation</option><option>Pneumatique</option><option>Autre</option></Select></Field>
            <Field label="Montant (FCFA)"><Input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} name="amount" placeholder="ex. 45000" /></Field>
            <Field label="Véhicule"><Select value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })}>{plates.map((p) => <option key={p}>{p}</option>)}</Select></Field>
            <Field label="Payé à"><Input value={f.beneficiary} onChange={(e) => setF({ ...f, beneficiary: e.target.value })} placeholder="ex. Station de Tsévié" /></Field>
            <PhotoInput label="Justificatif (ticket, facture)" value={f.photo} onChange={(photo) => setF({ ...f, photo })} />
            <Button size="lg" className="w-full" loading={busy} data-testid="frais-submit" onClick={async () => {
              setBusy(true);
              try {
                await addExpense(me, { category: "frais_vehicule", label: `${f.label} · ${f.vehicle}`, amount: Number(f.amount), beneficiary: f.beneficiary || "—", vehicle: f.vehicle, photo: f.photo });
                setF({ ...f, amount: "", beneficiary: "", photo: undefined });
                await success("Frais déclarés", `En attente de validation par le patron.${isOnline() ? "" : "<br/>Hors ligne : enregistré sur l'appareil, <b>en attente de synchronisation</b>."}`);
              } catch (e) { await fail(e); } finally { setBusy(false); }
            }}>Déclarer</Button>
          </div>
        </Card>
        <DataTable rows={mine} rowKey={(e) => e.id} empty={<Empty icon={<Receipt className="size-5" />} title="Aucun frais déclaré" />} columns={[
          { key: "l", header: "Frais", mobile: "title", render: (e) => <span className="font-semibold">{e.label}</span> },
          { key: "b", header: "Payé à", mobile: "sub", render: (e) => e.beneficiary },
          { key: "d", header: "Date", mobile: "meta", render: (e) => date(e.date) },
          { key: "s", header: "Statut", mobile: "meta", render: (e) => (e.status === "a_valider" ? <Badge tone="blue">À valider</Badge> : e.status === "refusee" ? <Badge tone="err">Refusé</Badge> : <Badge tone="ok">Validé</Badge>) },
          { key: "a", header: "Montant", align: "right", mobile: "value", render: (e) => <span className="font-semibold">{fcfa(e.amount)}</span> },
        ]} />
      </div>
    </>
  );
}
