"use client";
import { useApp } from "@/components/DataProvider";
import { Badge, DataTable, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";

const STATUS = {
  ok: "Position enregistrée",
  refusee: "Refusée par le navigateur",
  indisponible: "Indisponible",
  timeout: "Délai dépassé",
  sans_consentement: "Sans consentement",
} as const;

export default function Connexions() {
  const { db, me } = useApp();
  const rows = db.loginLogs.filter((l) => l.userId === me.id && !l.deleted).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <PageHeader eyebrow="Compte" title="Mes connexions" sub="Heure, compte, position et précision, ou le motif si la position n'a pas pu être lue. Couvert par votre consentement." />
      <DataTable rows={rows} rowKey={(l) => l.id} empty={<p className="text-[14px] text-muted">Aucune connexion enregistrée pour ce compte.</p>} columns={[
        { key: "d", header: "Date", mobile: "title", render: (l) => dateTime(l.at) },
        { key: "m", header: "Moyen", mobile: "sub", render: (l) => l.method === "pin" ? "Code PIN" : "Mot de passe" },
        { key: "s", header: "Résultat", mobile: "meta", render: (l) => <Badge tone={l.success ? "ok" : "err"}>{l.success ? "Réussie" : "Échec"}</Badge> },
        { key: "p", header: "Position", mobile: "meta", render: (l) => l.lat != null ? <span className="num">{l.lat.toFixed(5)}, {l.lng!.toFixed(5)}{l.accuracy != null ? ` · ±${Math.round(l.accuracy)} m` : ""}</span> : STATUS[l.positionStatus] },
        { key: "r", header: "Précision", mobile: "hide", render: (l) => l.reason || (l.positionStatus === "ok" ? "—" : STATUS[l.positionStatus]) },
      ]} />
    </>
  );
}
