"use client";
import Link from "next/link";
import { MapPinned } from "lucide-react";
import { askReason } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { Avatar, Badge, Button, DataTable, PageHeader } from "@/components/ui";
import { roleLabel } from "@/lib/format";
import { isEmployeeRole, canTrackUser } from "@/lib/trackPermissions";
import type { User } from "@/lib/types";
import { activeTrack, startTrack, stopTrack } from "@/services/location";

export default function Personnel() {
  const { db, me, run } = useApp();
  const scope = db.settings[0]!.comptableTrackScope;
  const rows = db.users.filter((u) => !u.deleted && isEmployeeRole(u.role)).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return (
    <>
      <PageHeader eyebrow="Contrôle" title="Personnel" sub="Le patron suit tous les employés. Un gestionnaire, seulement son équipe. Le comptable, seulement le périmètre fixé par le patron." />
      <DataTable rows={rows} rowKey={(u) => u.id} columns={[
        { key: "n", header: "Nom", mobile: "title", render: (u) => <span className="inline-flex items-center gap-2"><Avatar name={u.name} size="sm" /><span className="font-semibold">{u.name}</span></span> },
        { key: "r", header: "Rôle", mobile: "sub", render: (u) => <Badge tone="outline">{roleLabel[u.role]}</Badge> },
        { key: "e", header: "Équipe", mobile: "meta", render: (u) => db.users.find((m) => m.id === u.managerId)?.name ?? "—" },
        { key: "s", header: "Suivi", mobile: "meta", render: (u) => {
          const t = activeTrack(db, u.id);
          return t ? <Badge tone="blue">Actif</Badge> : <Badge>Arrêté</Badge>;
        } },
        { key: "x", header: "", mobile: "meta", render: (u) => <Row u={u} scope={scope} /> },
      ]} />
    </>
  );

  function Row({ u, scope }: { u: User; scope: string[] }) {
    const decision = canTrackUser(me, u, scope);
    const track = activeTrack(db, u.id);
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {decision.ok && !track && (
          <Button size="sm" data-testid={`track-${u.id}`} icon={<MapPinned className="size-3.5" />} onClick={async () => {
            const reason = await askReason({ title: `Suivre ${u.name} ?`, html: "Le motif est obligatoire. Le suivi s'arrête au plus tard dans 30 jours, et seulement tant que l'application de la personne est ouverte.", confirmText: "Activer le suivi" });
            if (reason) await run(() => startTrack(me, u.id, reason), "Suivi activé", u.name);
          }}>Suivre</Button>
        )}
        {track && decision.ok && <Link href={`/suivi/?id=${u.id}`} className="text-[13px] font-semibold text-brand-700" data-testid={`open-track-${u.id}`}>Carte</Link>}
        {track && (decision.ok || me.role === "patron") && (
          <Button size="sm" variant="quiet" onClick={async () => {
            const reason = await askReason({ title: "Arrêter le suivi ?", confirmText: "Arrêter", dark: true });
            if (reason) await run(() => stopTrack(me, track.id, reason), "Suivi arrêté");
          }}>Arrêter</Button>
        )}
        {!decision.ok && <span className="max-w-xs text-[12px] text-muted">{decision.reason}</span>}
      </span>
    );
  }
}
