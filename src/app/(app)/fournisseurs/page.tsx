"use client";
import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { confirm, success } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { Avatar, Badge, Button, DataTable, Empty, Field, Input, Modal, PageHeader, Select, Toggle } from "@/components/ui";
import { date, roleLabel } from "@/lib/format";
import type { Product } from "@/lib/types";
import { createSupplier, setUserActive } from "@/services/actions";

export default function Fournisseurs() {
  const { db, me, run } = useApp();
  const [open, setOpen] = useState(false);
  const users = db.users.filter((u) => !u.deleted && (me.role === "patron" || u.role === "fournisseur")).sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  return (
    <>
      <PageHeader title={me.role === "patron" ? "Comptes" : "Fournisseurs"} sub="Les comptes fournisseurs sont créés par le patron uniquement : pas d'auto-inscription. Mot de passe provisoire à changer à la première connexion."
        actions={me.role === "patron" && <Button icon={<UserPlus className="size-4" />} onClick={() => setOpen(true)} data-testid="new-supplier">Créer un compte fournisseur</Button>} />
      <DataTable rows={users} rowKey={(u) => u.id}
        empty={<Empty icon={<Users className="size-5" />} title="Aucun compte" />}
        columns={[
          { key: "n", header: "Nom", mobile: "title", render: (u) => <span className="flex items-center gap-3"><span className="hidden md:inline-flex"><Avatar name={u.name} size="sm" /></span><span className="font-semibold">{u.name}</span></span> },
          { key: "r", header: "Rôle", mobile: "sub", render: (u) => `${roleLabel[u.role]} · ${u.title.split("·").slice(1).join("·").trim() || u.zone || ""}` },
          { key: "p", header: "Téléphone", mobile: "meta", render: (u) => `+228 ${u.phone}` },
          { key: "e", header: "E-mail", mobile: "meta", render: (u) => u.email ?? "—" },
          { key: "c", header: "Créé le", mobile: "meta", render: (u) => date(u.createdAt) },
          { key: "s", header: "Statut", mobile: "value", render: (u) => (u.mustChangePassword ? <Badge tone="outline">Mot de passe provisoire</Badge> : u.active ? <Badge tone="blue">Actif</Badge> : <Badge>Désactivé</Badge>) },
          { key: "t", header: "Accès", mobile: "meta", render: (u) => (me.role === "patron" && u.role !== "patron" ? (
            <Toggle checked={u.active} label={`Accès de ${u.name}`} onChange={async (v) => {
              if (!v && !(await confirm({ title: `Désactiver ${u.name} ?`, html: "Le compte ne pourra plus se connecter. Ses données sont conservées.", confirmText: "Désactiver", dark: true }))) return;
              await run(() => setUserActive(me, u.id, v), v ? "Compte réactivé" : "Compte désactivé");
            }} />
          ) : null) },
        ]} />
      {open && <CreateModal onClose={() => setOpen(false)} />}
    </>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const { me, run } = useApp();
  const [f, setF] = useState({ name: "", phone: "", email: "", zone: "", product: "soja" as Product });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Créer un compte fournisseur" sub="Le fournisseur recevra ses identifiants (SMS ou remise en main propre)."
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button data-testid="supplier-submit" onClick={async () => {
        const r = await run(() => createSupplier(me, f));
        if (!r) return;
        onClose();
        const emailLine = r.user.email ? `E-mail : <b>${r.user.email}</b><br/>` : "";
        await success("Compte créé", `<div style="text-align:left">Identifiants à transmettre à <b>${r.user.name}</b> :<br/><br/>${emailLine}Téléphone : <b>+228 ${r.user.phone}</b><br/>Mot de passe provisoire : <b style="font-family:monospace">${r.tempPassword}</b><br/><br/>La connexion accepte l'e-mail ou le téléphone, avec ou sans indicatif. Le mot de passe devra être changé à la première connexion. Le compte apparaît aussi dans « Autres comptes de démo ».</div>`);
      }}>Créer le compte</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom complet" className="sm:col-span-2"><Input value={f.name} onChange={set("name")} placeholder="ex. Abla Mensah" name="supplierName" /></Field>
        <Field label="Téléphone" hint="8 chiffres, avec ou sans indicatif +228"><Input inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="96 00 00 00" name="supplierPhone" /></Field>
        <Field label="E-mail" hint="Facultatif. Sert aussi à se connecter."><Input type="email" autoComplete="off" value={f.email} onChange={set("email")} placeholder="abla.mensah@example.com" name="supplierEmail" /></Field>
        <Field label="Zone"><Input value={f.zone} onChange={set("zone")} placeholder="ex. Kpalimé" name="supplierZone" /></Field>
        <Field label="Produit principal"><Select value={f.product} onChange={set("product")}><option value="soja">Soja</option><option value="cacao">Cacao</option></Select></Field>
      </div>
    </Modal>
  );
}
