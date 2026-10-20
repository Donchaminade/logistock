"use client";
import { useApp } from "@/components/DataProvider";
import { activeTrack, liveShares } from "@/services/location";

export function LocationBanner() {
  const { db, me } = useApp();
  const track = activeTrack(db, me.id);
  if (!track) return null;
  const shared = liveShares(db, track.id).length > 0;
  return (
    <div data-testid="location-banner" className="border-b border-ink bg-ink px-4 py-2.5 text-center text-[13px] font-semibold text-white">
      Localisation partagée pour vérification de sécurité
      {shared && <span className="mt-0.5 block text-[12px] font-medium text-white/80">Un lien de consultation est actif.</span>}
    </div>
  );
}
