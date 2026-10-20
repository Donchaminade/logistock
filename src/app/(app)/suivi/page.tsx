"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MapPinned } from "lucide-react";
import { askReason } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { nameOf, WithId } from "@/components/domain";
import { Badge, Button, Card, CardTitle, Empty, Field, Input, PageHeader, PageSkeleton, Select } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { canShareTrack, canTrackUser, SHARE_DEFAULT_HOURS, type MarkerChoice } from "@/lib/trackPermissions";
import type { Id } from "@/lib/types";
import { activeTrack, consultTrack, createShare, liveShares, revokeShare, setMarkerMode, setShareUsers, stopTrack, thresholdsOf } from "@/services/location";

const TrackMap = dynamic(() => import("@/components/location/TrackMap").then((m) => m.TrackMap), { ssr: false, loading: () => <PageSkeleton /> });

const MODES: { value: MarkerChoice; label: string }[] = [
  { value: "auto", label: "Automatique (repos, marche, course, moto)" },
  { value: "marche", label: "Marche" },
  { value: "course", label: "Course" },
  { value: "moto", label: "Moto" },
  { value: "voiture", label: "Voiture" },
];

export default function Page() {
  return <WithId>{(id) => (id ? <Suivi id={id} /> : <PageSkeleton />)}</WithId>;
}

function Suivi({ id }: { id: string }) {
  const { db, me, run } = useApp();
  const subject = db.users.find((u) => u.id === id && !u.deleted);
  const scope = db.settings[0]!.comptableTrackScope;
  const decision = subject ? canTrackUser(me, subject, scope) : { ok: false, reason: "Compte introuvable." };
  const track = subject ? activeTrack(db, subject.id) : undefined;
  const ping = db.positions.find((p) => p.userId === id && !p.deleted);
  const once = useRef(false);
  const [denied, setDenied] = useState<string | null>(null);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    void consultTrack(me, id).catch((e: unknown) => setDenied(e instanceof Error ? e.message : "Consultation refusée"));
  }, [id, me]);

  if (!subject || !decision.ok) {
    return <Empty icon={<MapPinned className="size-5" />} title="Suivi inaccessible" text={decision.reason} action={<Link href="/personnel/" className="text-[14px] font-semibold text-brand-700">Retour au personnel</Link>} />;
  }
  if (denied && !track) {
    return <Empty icon={<MapPinned className="size-5" />} title="Suivi inaccessible" text={denied} action={<Link href="/personnel/" className="text-[14px] font-semibold text-brand-700">Retour au personnel</Link>} />;
  }
  if (!track) {
    return <Empty icon={<MapPinned className="size-5" />} title="Aucun suivi actif" text={`${subject.name} n'est pas suivi pour le moment.`} action={<Link href="/personnel/" className="text-[14px] font-semibold text-brand-700">Retour au personnel</Link>} />;
  }

  const shares = liveShares(db, track.id);
  const shareOk = canShareTrack(me, track.shareUserIds).ok;
  const markers = ping ? [{ id: subject.id, name: subject.name, lat: ping.lat, lng: ping.lng, speedMps: ping.speedMps ?? 0, headingDeg: ping.headingDeg ?? 0, choice: track.markerMode, live: ping.live }] : [];

  return (
    <>
      <PageHeader eyebrow="Contrôle" title={`Suivi · ${subject.name}`} sub={`Motif : ${track.reason}. Jusqu'au ${dateTime(track.expiresAt)}. Activé par ${nameOf(db, track.by)}.`}
        actions={<Button variant="dark" onClick={async () => {
          const reason = await askReason({ title: "Arrêter le suivi ?", confirmText: "Arrêter", dark: true });
          if (reason) await run(() => stopTrack(me, track.id, reason), "Suivi arrêté");
        }}>Arrêter</Button>} />
      {denied && <p className="mb-4 text-[13px] text-muted">{denied}</p>}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Modèle">
          <Select value={track.markerMode} onChange={(e) => void run(() => setMarkerMode(me, track.id, e.target.value as MarkerChoice), "Modèle enregistré")} data-testid="marker-mode">
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
        </Field>
        <Badge tone={ping?.live ? "ok" : "outline"}>{ping?.live ? "En direct" : "Hors ligne"}</Badge>
      </div>
      <TrackMap markers={markers} thresholds={thresholdsOf(db)} className="h-[28rem]" />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle title="Lien de consultation" sub="Lecture seule, 2 h par défaut, 24 h au plus. Le lien meurt avec le suivi." />
          {shareOk ? <ShareForm trackId={track.id} /> : <p className="text-[13.5px] text-muted">Seul le patron, ou une personne qu&apos;il a autorisée, peut créer un lien.</p>}
          <ul className="mt-4 divide-y divide-line">
            {shares.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-3 text-[13.5px]">
                <span className="min-w-0 flex-1"><b>{s.recipientName}</b> · jusqu&apos;au {dateTime(s.expiresAt)}<br /><span className="text-muted">{s.reason}</span><br /><Link className="font-semibold text-brand-700" href={`/partage/?jeton=${s.token}`}>/partage/?jeton={s.token.slice(0, 8)}…</Link></span>
                <Button size="sm" variant="quiet" onClick={async () => {
                  const reason = await askReason({ title: "Révoquer ce lien ?", confirmText: "Révoquer", dark: true });
                  if (reason) await run(() => revokeShare(me, s.id, reason), "Lien révoqué");
                }}>Révoquer</Button>
              </li>
            ))}
            {!shares.length && <li className="py-2 text-[13px] text-muted">Aucun lien actif.</li>}
          </ul>
        </Card>
        {me.role === "patron" && (
          <Card>
            <CardTitle title="Qui peut créer un lien" sub="Le patron peut toujours. Cochez les autres personnes autorisées." />
            <ul className="space-y-2">
              {db.users.filter((u) => !u.deleted && u.id !== subject.id && u.role !== "patron" && u.role !== "fournisseur").map((u) => (
                <li key={u.id}>
                  <label className="flex items-center gap-2 text-[14px]">
                    <input type="checkbox" className="size-4 accent-brand-600" checked={track.shareUserIds.includes(u.id)} onChange={(e) => {
                      const ids = e.target.checked ? [...track.shareUserIds, u.id] : track.shareUserIds.filter((x) => x !== u.id);
                      void run(() => setShareUsers(me, track.id, ids), "Autorisations enregistrées");
                    }} />
                    {u.name} <span className="text-muted">· {u.role}</span>
                  </label>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

function ShareForm({ trackId }: { trackId: Id }) {
  const { me, run } = useApp();
  const [name, setName] = useState("");
  const [hours, setHours] = useState(String(SHARE_DEFAULT_HOURS));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Destinataire"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la personne" data-testid="share-name" /></Field>
      <Field label="Durée (heures, max 24)"><Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} data-testid="share-hours" /></Field>
      <div className="sm:col-span-2">
        <Button data-testid="share-create" onClick={async () => {
          const reason = await askReason({ title: "Créer le lien ?", html: "Le motif est obligatoire. L'ouverture du lien sera aussi écrite dans le journal.", confirmText: "Créer le lien" });
          if (!reason) return;
          const share = await run(() => createShare(me, trackId, { recipientName: name, reason, hours: Number(hours.replace(",", ".")) }), "Lien créé");
          if (share) setName("");
        }}>Créer le lien</Button>
      </div>
    </div>
  );
}
