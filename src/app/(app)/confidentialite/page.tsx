"use client";
import { useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { confirm } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { PolicyBody } from "@/components/location/PolicyBody";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { consentGranted, latestConsent } from "@/lib/locationPolicy";
import { withdrawConsent } from "@/services/location";

export default function Confidentialite() {
  const { db, me, run, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const current = latestConsent(db.consents, me.id);
  const on = consentGranted(db.consents, me.id);
  return (
    <>
      <PageHeader eyebrow="Compte" title="Confidentialité / localisation" sub="Le texte en vigueur, votre choix, et le retrait. Le retrait bloque les remises, les transmissions et les modifications de compte." />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <Shield className="size-5 text-brand-700" />
          {on ? <Badge tone="ok">Consentement en vigueur</Badge> : <Badge tone="err">Consentement absent ou retiré</Badge>}
          {current && <span className="text-[13px] text-muted">{current.granted ? "Accepté" : "Retiré"} le {dateTime(current.at)} · version {current.policyVersion}</span>}
        </div>
        {on && (
          <Button className="mt-4" variant="dark" loading={busy} data-testid="btn-withdraw" onClick={async () => {
            if (!(await confirm({ title: "Retirer le consentement ?", html: "Les nouvelles positions s'arrêtent. Les remises, transmissions et modifications de compte seront bloquées jusqu'à un nouvel accord.", confirmText: "Retirer", dark: true }))) return;
            setBusy(true);
            await run(() => withdrawConsent(me));
            await refresh();
            setBusy(false);
          }}>Retirer mon consentement</Button>
        )}
        <p className="mt-4 text-[13.5px] text-muted">Votre historique de connexion est dans <Link className="font-semibold text-brand-700" href="/connexions/">Mes connexions</Link>.</p>
      </Card>
      <Card>
        <PolicyBody />
      </Card>
    </>
  );
}
