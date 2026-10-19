"use client";
import { useEffect, useState } from "react";
import { CloudOff, FileDown, ScrollText } from "lucide-react";
import { fail, toast } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { Card, CardTitle, Button, PageHeader, Stat } from "@/components/ui";
import { ledger, metrics } from "@/lib/calc";
import { download, statementPdf } from "@/lib/exports";
import { date, dateTime, fcfa, tonnes } from "@/lib/format";
import { isOnline, onNetworkChange } from "@/services/network";

export default function Releve() {
  const { db, me } = useApp();
  const [online, setOnline] = useState(true);
  const [version, setVersion] = useState(new Date().toISOString());
  useEffect(() => {
    setOnline(isOnline());
    return onNetworkChange((o) => {
      setOnline(o);
      if (o) setVersion(new Date().toISOString());
    });
  }, []);
  useEffect(() => {
    if (isOnline()) setVersion(new Date().toISOString());
  }, [db]);
  const contracts = db.contracts.filter((c) => c.supplierId === me.id && !c.deleted);
  const ms = contracts.map((c) => ({ c, m: metrics(db, c) }));
  return (
    <>
      <PageHeader eyebrow="Mon espace" title="Mon relevé" sub="Écritures, solde et reste à livrer de chacun de vos contrats (US-08)."
        actions={<Button icon={<FileDown className="size-4" />} data-testid="btn-statement-pdf" onClick={async () => { try { download(statementPdf(db, me.id, version), `Releve-${me.name.replace(/\s+/g, "-")}.pdf`); toast("Relevé téléchargé", `Version du ${dateTime(version)}`); } catch (e) { await fail(e); } }}>Relevé PDF</Button>} />
      <div className="mb-5 flex items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-[13.5px]" data-testid="statement-version">
        {!online && <CloudOff className="size-4" />}
        <span>{online ? "À jour" : "Hors ligne : dernière version synchronisée"} · version du <b>{dateTime(version)}</b></span>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Solde total" value={fcfa(ms.reduce((s, x) => s + x.m.S, 0))} />
        <Stat label="Reste à livrer" value={tonnes(ms.reduce((s, x) => s + x.m.Q, 0))} />
        <Stat label="Avances reçues" value={fcfa(ms.reduce((s, x) => s + x.m.A, 0))} />
        <Stat label="Livré valorisé" value={fcfa(ms.reduce((s, x) => s + x.m.V, 0))} />
      </div>
      <div className="space-y-6">
        {ms.map(({ c, m }) => (
          <Card key={c.id}>
            <CardTitle title={c.ref} sub={`Solde ${fcfa(m.S)} · reste ${tonnes(m.Q)} · prix en vigueur ${m.P} FCFA/kg`} icon={<ScrollText className="size-[18px]" />} />
            <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6" data-scroll-x>
            <table className="w-full min-w-[30rem] text-[13.5px]">
              <thead><tr className="border-b border-line text-left text-[12px] uppercase tracking-[0.05em] text-subtle"><th className="py-2">Date</th><th>Opération</th><th className="text-right">Débit</th><th className="text-right">Crédit</th><th className="text-right">Solde</th></tr></thead>
              <tbody>
                {ledger(db, c).map((l, i) => (
                  <tr key={i} className="num border-b border-line last:border-0"><td className="py-2 pr-2 whitespace-nowrap">{date(l.date)}</td><td className="pr-2">{l.label}</td><td className="text-right">{l.debit ? fcfa(l.debit) : ""}</td><td className="text-right">{l.credit ? fcfa(l.credit) : ""}</td><td className="text-right font-semibold">{fcfa(l.balance)}</td></tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
