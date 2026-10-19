"use client";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, MonitorSmartphone, RotateCcw } from "lucide-react";
import { confirmReset } from "@/components/AppShell";
import { askText, confirm } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { Avatar, Button, Card, KV, PageHeader } from "@/components/ui";
import { date, roleLabel } from "@/lib/format";
import { displayPhone } from "@/lib/identity";
import { changePassword, logout } from "@/services/actions";

export default function Profil() {
  const { me, run } = useApp();
  const router = useRouter();
  return (
    <>
      <PageHeader title="Profil" />
      <Card className="animate-in">
        <div className="flex items-center gap-4">
          <Avatar name={me.name} size="lg" />
          <div>
            <div className="text-[18px] font-bold">{me.name}</div>
            <div className="text-[13.5px] text-muted">{me.title}</div>
          </div>
        </div>
        <div className="mt-6"><KV items={[{ k: "Rôle", v: roleLabel[me.role] }, { k: "E-mail", v: me.email ?? "—" }, { k: "Téléphone", v: displayPhone(me.phone) }, { k: "Zone", v: me.zone ?? "—" }, { k: "Compte créé le", v: date(me.createdAt) }]} /></div>
      </Card>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Button variant="secondary" size="lg" icon={<KeyRound className="size-4" />} onClick={async () => {
          const p = await askText({ title: "Nouveau mot de passe", input: "password", placeholder: "6 caractères minimum", validate: (v) => (v.length < 6 ? "6 caractères minimum." : undefined) });
          if (p) await run(() => changePassword(me, p), "Mot de passe modifié");
        }}>Changer le mot de passe</Button>
        <Button variant="secondary" size="lg" icon={<RotateCcw className="size-4" />} onClick={() => confirmReset(router)} data-testid="reset-demo">Réinitialiser la démo</Button>
        <Button variant="dark" size="lg" icon={<LogOut className="size-4" />} onClick={async () => {
          if (await confirm({ title: "Se déconnecter ?", confirmText: "Déconnexion", dark: true })) { logout(); router.replace("/"); }
        }}>Déconnexion</Button>
      </div>
      <Card className="mt-4 animate-in">
        <div className="flex gap-3">
          <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-brand-700" />
          <p className="text-[13.5px] leading-relaxed text-muted"><b className="text-ink">Démo multi-rôles :</b> chaque onglet garde sa propre session. Ouvrez la connexion dans un autre onglet pour jouer un autre rôle ; les données sont partagées et se mettent à jour en direct, avec une notification.</p>
        </div>
      </Card>
    </>
  );
}
