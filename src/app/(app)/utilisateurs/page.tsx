"use client";
import { useState } from "react";
import { KeyRound, Lock, Plus, Smartphone, Unlock, UserCog } from "lucide-react";
import { confirm, success } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { Avatar, Badge, Button, Card, CardTitle, DataTable, Field, Input, Modal, PageHeader, Select, Stat, Tabs } from "@/components/ui";
import { can, ROLES } from "@/lib/permissions";
import { dateTime, roleLabel } from "@/lib/format";
import type { ManagedRole, Role, User } from "@/lib/types";
import { createUser, resetUserPassword, revokeDevice, setUserActive, unlockUser } from "@/services/actions";

type Internal = Exclude<ManagedRole, "fournisseur">;

export default function Utilisateurs() {
  const { db, me, run } = useApp();
  const perms = db.settings[0]!.perms;
  const [tab, setTab] = useState<"comptes" | "appareils">("comptes");
  const [role, setRole] = useState<Role | "tous">("tous");
  const [open, setOpen] = useState(false);
  const users = db.users.filter((u) => !u.deleted && (role === "tous" || u.role === role)).sort((a, b) => ROLES.findIndex((r) => r.key === a.role) - ROLES.findIndex((r) => r.key === b.role) || a.name.localeCompare(b.name));
  const locked = db.users.filter((u) => u.lockedUntil && u.lockedUntil > new Date().toISOString());
  const devices = db.devices.filter((d) => !d.deleted);
  const canEdit = can(perms, me, "utilisateurs", "u");

  return (
    <>
      <PageHeader eyebrow="Administration" title="Utilisateurs" sub="Comptes internes, déblocages, mots de passe provisoires et appareils autorisés (code PIN)."
        actions={can(perms, me, "utilisateurs", "c") && <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)} data-testid="btn-new-user">Nouveau compte</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Comptes actifs" value={String(db.users.filter((u) => u.active && !u.deleted).length)} />
        <Stat label="Comptes bloqués" value={String(locked.length)} hint="Après 5 échecs consécutifs" icon={<Lock className="size-4" />} />
        <Stat label="Appareils autorisés" value={String(devices.length)} hint="Déverrouillage par PIN" />
        <Stat label="Rôles" value="7" hint="Patron, admin, délégué, fournisseur, magasinier, chauffeur, comptable" />
      </div>
      {locked.length > 0 && (
        <Card className="mb-6 border-ink">
          <CardTitle title="Comptes bloqués" sub="Débloquez après avoir vérifié l'identité de la personne." icon={<Lock className="size-[18px]" />} />
          <ul className="divide-y divide-line">
            {locked.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={u.name} size="sm" />
                <div className="min-w-0 flex-1"><div className="font-semibold">{u.name}</div><div className="text-[12.5px] text-muted">{u.phone} · bloqué jusqu&apos;à {dateTime(u.lockedUntil)}</div></div>
                <Button size="sm" icon={<Unlock className="size-4" />} data-testid={`unlock-${u.id}`} onClick={() => run(() => unlockUser(me, u.id), "Compte débloqué", u.name)}>Débloquer</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "comptes", label: "Comptes", count: db.users.filter((u) => !u.deleted).length }, { value: "appareils", label: "Appareils", count: devices.length }]} />
      {tab === "comptes" && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {(["tous", ...ROLES.map((r) => r.key)] as const).map((r) => (
              <button key={r} onClick={() => setRole(r)} className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${role === r ? "bg-ink text-white" : "border border-line bg-white text-muted hover:text-ink"}`}>{r === "tous" ? "Tous" : roleLabel[r]}</button>
            ))}
          </div>
          <DataTable rows={users} rowKey={(u) => u.id} columns={[
            { key: "n", header: "Nom", mobile: "title", render: (u) => <span className="inline-flex items-center gap-2.5"><Avatar name={u.name} size="sm" /><span className="font-semibold">{u.name}</span></span> },
            { key: "t", header: "Fonction", mobile: "sub", render: (u) => u.title },
            { key: "r", header: "Rôle", mobile: "meta", render: (u) => <Badge tone={u.role === "patron" ? "dark" : "outline"}>{roleLabel[u.role]}</Badge> },
            { key: "p", header: "Téléphone", mobile: "meta", render: (u) => u.phone },
            { key: "s", header: "Statut", mobile: "meta", render: (u) => <StatusBadge u={u} /> },
            { key: "x", header: "", mobile: "meta", render: (u) => canEdit && u.role !== "patron" ? <UserActions u={u} /> : null },
          ]} />
        </>
      )}
      {tab === "appareils" && (
        <DataTable rows={devices} rowKey={(d) => d.id} empty={<Card><p className="text-[14px] text-muted">Aucun appareil autorisé. Un utilisateur définit son code PIN depuis son profil.</p></Card>} columns={[
          { key: "u", header: "Utilisateur", mobile: "title", render: (d) => <span className="font-semibold">{db.users.find((u) => u.id === d.userId)?.name}</span> },
          { key: "l", header: "Appareil", mobile: "sub", render: (d) => <span className="inline-flex items-center gap-1.5"><Smartphone className="size-4" />{d.label} · {d.id.split(":")[0]!.slice(0, 8)}</span> },
          { key: "a", header: "Autorisé le", mobile: "meta", render: (d) => dateTime(d.authorizedAt) },
          { key: "d", header: "Dernier déverrouillage", mobile: "meta", render: (d) => dateTime(d.lastUnlockAt) },
          { key: "x", header: "", mobile: "meta", render: (d) => <Button size="sm" variant="quiet" onClick={async () => { if (await confirm({ title: "Retirer cet appareil ?", html: "Le code PIN ne fonctionnera plus : connexion par mot de passe obligatoire.", confirmText: "Retirer", dark: true })) await run(() => revokeDevice(me, d.id), "Appareil retiré"); }}>Retirer</Button> },
        ]} />
      )}
      {open && <NewUserModal onClose={() => setOpen(false)} />}
    </>
  );
}

function StatusBadge({ u }: { u: User }) {
  if (u.lockedUntil && u.lockedUntil > new Date().toISOString()) return <Badge tone="err">Bloqué</Badge>;
  if (!u.active) return <Badge>Désactivé</Badge>;
  if (u.mustChangePassword) return <Badge tone="blue">Mot de passe provisoire</Badge>;
  return <Badge tone="ok">Actif</Badge>;
}

function UserActions({ u }: { u: User }) {
  const { me, run } = useApp();
  return (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="quiet" icon={<KeyRound className="size-3.5" />} onClick={async (e) => {
        e.stopPropagation();
        if (!(await confirm({ title: "Réinitialiser le mot de passe ?", html: `Un mot de passe provisoire sera généré pour <b>${u.name}</b>.`, confirmText: "Réinitialiser" }))) return;
        const r = await run(() => resetUserPassword(me, u.id));
        if (r) await success("Mot de passe provisoire", `À remettre à ${u.name} : <b class="num" style="font-size:20px">${r}</b><br/>Il devra le changer à la première connexion.`);
      }}>Mot de passe</Button>
      <Button size="sm" variant="quiet" onClick={async (e) => {
        e.stopPropagation();
        if (await confirm({ title: u.active ? "Désactiver ce compte ?" : "Réactiver ce compte ?", html: u.active ? "La personne ne pourra plus se connecter ; son historique est conservé." : undefined, confirmText: u.active ? "Désactiver" : "Réactiver", dark: u.active }))
          await run(() => setUserActive(me, u.id, !u.active), u.active ? "Compte désactivé" : "Compte réactivé");
      }}>{u.active ? "Désactiver" : "Réactiver"}</Button>
    </span>
  );
}

function NewUserModal({ onClose }: { onClose: () => void }) {
  const { me, run } = useApp();
  const roles: Internal[] = me.role === "patron" ? ["admin", "gestionnaire", "magasinier", "chauffeur", "comptable"] : ["gestionnaire", "magasinier", "chauffeur", "comptable"];
  const [f, setF] = useState({ role: "magasinier" as Internal, name: "", phone: "", zone: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Nouveau compte interne" sub="Les comptes fournisseurs sont créés par le patron dans « Comptes fournisseurs »."
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button data-testid="user-submit" icon={<UserCog className="size-4" />} onClick={async () => {
        const r = await run(() => createUser(me, { role: f.role, name: f.name, phone: f.phone, zone: f.zone || undefined }));
        if (!r) return;
        onClose();
        await success("Compte créé", `${r.user.name} · ${roleLabel[r.user.role]}<br/>Identifiant : <b>${r.user.phone}</b><br/>Mot de passe provisoire : <b class="num" style="font-size:20px" data-testid="temp-pwd">${r.tempPassword}</b>${r.user.role === "chauffeur" ? "<br/>Une fiche chauffeur liée a été créée." : ""}`);
      }}>Créer le compte</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rôle"><Select value={f.role} onChange={set("role")} name="role">{roles.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}</Select></Field>
        <Field label="Téléphone (identifiant)"><Input inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="90 00 00 00" name="phone" /></Field>
        <Field label="Nom complet"><Input value={f.name} onChange={set("name")} name="name" /></Field>
        <Field label="Zone ou affectation (facultatif)"><Input value={f.zone} onChange={set("zone")} placeholder="ex. Magasin de Lomé" /></Field>
      </div>
      <p className="mt-4 text-[13px] text-muted">{ROLES.find((r) => r.key === f.role)?.hint}</p>
    </Modal>
  );
}
