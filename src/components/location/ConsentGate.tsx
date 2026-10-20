"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmLogout } from "@/components/AppShell";
import { fail } from "@/components/alerts";
import { useData } from "@/components/DataProvider";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";
import { acceptConsent } from "@/services/location";
import { PolicyBody } from "./PolicyBody";
import { clearSignature, SignaturePad } from "./SignaturePad";

/** Écran bloquant : pas d'accès à l'application sans lecture, case et signature. */
export function ConsentGate() {
  const { me, refresh, signOut } = useData();
  const router = useRouter();
  const [end, setEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pad = useRef<HTMLCanvasElement | null>(null);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12) setEnd(true);
  }

  async function accept() {
    if (!me || !signature) return;
    setBusy(true);
    try {
      await acceptConsent(me, signature);
      await refresh();
    } catch (e) {
      await fail(e, "Consentement non enregistré");
    } finally {
      setBusy(false);
    }
  }

  const ready = end && checked && !!signature;
  return (
    <div data-testid="consent-gate" className="fixed inset-0 z-[60] overflow-y-auto bg-white">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Logo sub="Confidentialité" />
          <button type="button" className="text-[13px] font-semibold text-muted hover:text-ink" onClick={() => void confirmLogout(signOut, router)}>
            Se déconnecter
          </button>
        </div>
        <h1 className="mt-6 text-[22px] font-bold tracking-[-0.02em]">Consentement à la localisation</h1>
        <p className="mt-2 text-[14px] text-muted">Lisez le texte jusqu&apos;en bas, cochez la case et signez. Sans cela, l&apos;application reste fermée.</p>
        <div data-testid="consent-scroll" onScroll={onScroll} className="mt-4 h-[46vh] overflow-y-auto rounded-xl border border-line bg-canvas p-4">
          <PolicyBody />
        </div>
        {!end && <p className="mt-2 text-[12.5px] font-semibold text-brand-700">Faites défiler jusqu&apos;à la fin du texte.</p>}
        <label className="mt-4 flex items-start gap-3 text-[14px]">
          <input data-testid="consent-check" type="checkbox" className="mt-1 size-4 accent-brand-600" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>J&apos;ai lu cette version et j&apos;accepte que ma position soit utilisée comme décrit, uniquement pendant que l&apos;application est ouverte.</span>
        </label>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold">Signature</span>
            <button
              type="button"
              className="text-[13px] font-semibold text-brand-700"
              onClick={() => clearSignature(pad.current ?? document.querySelector("[data-testid=signature-pad]"), setSignature)}
            >
              Effacer
            </button>
          </div>
          <div ref={(n) => { pad.current = n?.querySelector("canvas") ?? null; }}>
            <SignaturePad onChange={setSignature} />
          </div>
        </div>
        <Button data-testid="consent-accept" className="mt-5" disabled={!ready} loading={busy} onClick={() => void accept()}>
          Accepter et continuer
        </Button>
      </div>
    </div>
  );
}
