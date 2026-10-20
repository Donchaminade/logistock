"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Logo } from "@/components/Logo";
import { useData } from "@/components/DataProvider";
import { PageSkeleton } from "@/components/ui";
import { openShare, thresholdsOf, type OpenShareResult } from "@/services/location";

const TrackMap = dynamic(() => import("@/components/location/TrackMap").then((m) => m.TrackMap), { ssr: false, loading: () => <PageSkeleton /> });

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Partage />
    </Suspense>
  );
}

function Live({ subjectId, name, choice }: { subjectId: string; name: string; choice: import("@/lib/trackPermissions").MarkerChoice }) {
  const { db } = useData();
  if (!db) return null;
  const ping = db.positions.find((p) => p.userId === subjectId && !p.deleted);
  return (
    <div className="mt-4">
      <TrackMap
        markers={ping ? [{ id: subjectId, name, lat: ping.lat, lng: ping.lng, speedMps: ping.speedMps ?? 0, headingDeg: ping.headingDeg ?? 0, choice, live: ping.live }] : []}
        thresholds={thresholdsOf(db)}
        className="h-[28rem]"
      />
    </div>
  );
}

function Partage() {
  const { db, ready } = useData();
  const token = useSearchParams().get("jeton") ?? "";
  const [res, setRes] = useState<OpenShareResult | null>(null);

  useEffect(() => {
    if (!ready || !token) return;
    let cancel = false;
    void openShare(token).then((r) => { if (!cancel) setRes(r); });
    return () => { cancel = true; };
  }, [ready, token]);

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 py-8">
      <Logo sub="Consultation en lecture seule" />
      <h1 className="mt-6 text-[24px] font-bold tracking-[-0.02em]">Suivi partagé</h1>
      {!token && <p className="mt-3 text-muted">Lien incomplet.</p>}
      {token && !res && <PageSkeleton />}
      {res && !res.ok && <p className="mt-4 text-[15px] text-muted" data-testid="share-closed">{res.message}</p>}
      {res?.ok && res.subject && res.track && db && (
        <>
          <p className="mt-2 text-[14.5px] text-muted">Destinataire : {res.share?.recipientName}. La carte est en lecture seule. Le lien cesse dès que le suivi s&apos;arrête.</p>
          <Live subjectId={res.subject.id} name={res.subject.name} choice={res.track.markerMode} />
        </>
      )}
    </div>
  );
}
