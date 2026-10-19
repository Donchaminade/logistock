"use client";
// Code PIN par appareil (US-01) : définir, changer ou retirer ; liste de ses appareils autorisés.
import { useEffect, useState } from "react";
import { KeyRound, Smartphone } from "lucide-react";
import { askText, confirm } from "./alerts";
import { useApp } from "./DataProvider";
import { Badge, Button, Card, CardTitle } from "./ui";
import { dateTime } from "@/lib/format";
import { hasPin, revokeDevice, setPin } from "@/services/actions";

export function PinCard() {
  const { db, me, run } = useApp();
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    void hasPin(me).then(setHas);
  }, [me, db]);
  const mine = db.devices.filter((d) => d.userId === me.id && !d.deleted);
  const here = typeof window === "undefined" ? "" : localStorage.getItem("logistock:device") ?? "";
  return (
    <Card className="mt-4 animate-in">
      <CardTitle title="Code PIN de cet appareil" sub="Déverrouillage rapide, y compris hors ligne, sur un appareil déjà autorisé. Le PIN n'est jamais stocké en clair (SHA-256 salé)." icon={<KeyRound className="size-[18px]" />}
        action={<Badge tone={has ? "ok" : "outline"}>{has ? "Actif" : "Non défini"}</Badge>} />
      <Button data-testid="btn-set-pin" icon={<KeyRound className="size-4" />} onClick={async () => {
        const pin = await askText({ title: has ? "Nouveau code PIN" : "Définir un code PIN", html: "4 à 6 chiffres, évitez 1234 ou 0000.", input: "password", placeholder: "Code PIN", validate: (v) => (/^\d{4,6}$/.test(v) ? undefined : "4 à 6 chiffres.") });
        if (!pin) return;
        const again = await askText({ title: "Confirmez le code PIN", input: "password", placeholder: "Code PIN", validate: (v) => (v === pin ? undefined : "Les deux codes diffèrent.") });
        if (again) await run(() => setPin(me, pin), "Code PIN enregistré", "Cet appareil est autorisé : déverrouillage par PIN à l'écran de connexion.");
      }}>{has ? "Changer le code PIN" : "Définir un code PIN"}</Button>
      {mine.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {mine.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[13.5px]">
              <Smartphone className="size-4 text-muted" />
              <span className="flex-1"><b>{d.label}</b>{d.id.startsWith(`${here}:`) ? " · cet appareil" : ""} <span className="text-muted">· autorisé le {dateTime(d.authorizedAt)}</span></span>
              <Button size="sm" variant="quiet" onClick={async () => { if (await confirm({ title: "Retirer cet appareil ?", confirmText: "Retirer", dark: true })) await run(() => revokeDevice(me, d.id), "Appareil retiré"); }}>Retirer</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
