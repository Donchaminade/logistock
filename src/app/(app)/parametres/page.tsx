"use client";
import { useState } from "react";
import { BadgePercent, Car, MapPin, Plus, Save, SlidersHorizontal, UserRound } from "lucide-react";
import { useApp } from "@/components/DataProvider";
import { Badge, Button, Card, CardTitle, DataTable, Field, Input, Modal, PageHeader, Select, Tabs, Toggle } from "@/components/ui";
import { can } from "@/lib/permissions";
import { prixKg, ruleText, tonnes } from "@/lib/format";
import type { CommissionRule, Location } from "@/lib/types";
import { addDriver, addLocation, addVehicle, saveCommissionRule, updateSettings } from "@/services/actions";

const LOC_TYPE = { origine: "Origine", etape: "Étape", destination: "Destination", autre: "Autre" } as const;

export default function Parametres() {
  const { db, me } = useApp();
  const perms = db.settings[0]!.perms;
  const edit = can(perms, me, "parametres", "u");
  const [tab, setTab] = useState<"seuils" | "commissions" | "vehicules" | "lieux">("seuils");
  return (
    <>
      <PageHeader eyebrow="Administration" title="Paramètres" sub={edit ? "Seuils d'alerte, sécurité, règles de commission et référentiels. Chaque modification est tracée dans le journal." : "Lecture seule pour votre rôle."} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "seuils", label: "Seuils et sécurité" }, { value: "commissions", label: "Commissions", count: db.settings[0]!.commissionRules.length }, { value: "vehicules", label: "Véhicules et chauffeurs", count: db.vehicles.filter((v) => !v.deleted).length }, { value: "lieux", label: "Lieux", count: db.locations.filter((l) => !l.deleted).length }]} />
      {tab === "seuils" && <Seuils edit={edit} />}
      {tab === "commissions" && <Rules edit={edit} />}
      {tab === "vehicules" && <Vehicles edit={can(perms, me, "vehicules", "c")} />}
      {tab === "lieux" && <Lieux edit={can(perms, me, "lieux", "c")} />}
    </>
  );
}

function Seuils({ edit }: { edit: boolean }) {
  const { db, me, run } = useApp();
  const s = db.settings[0]!;
  const [f, setF] = useState({
    weightGapThresholdPct: String(s.weightGapThresholdPct), maxFailedLogins: String(s.maxFailedLogins), lockMinutes: String(s.lockMinutes),
    stockAlertKg: String(s.stockAlertKg / 1000), dueSoonDays: String(s.dueSoonDays), inactivityDays: String(s.inactivityDays), syncAlertHours: String(s.syncAlertHours),
    debtBlockThreshold: String(s.debtBlockThreshold), soja: String(s.resalePrice.soja), cacao: String(s.resalePrice.cacao),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => Number(v.replace(",", "."));
  const field = (k: keyof typeof f, label: string, hint?: string) => <Field label={label} hint={hint}><Input inputMode="decimal" value={f[k]} onChange={set(k)} disabled={!edit} name={k} /></Field>;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle title="Alertes (§2.7)" icon={<SlidersHorizontal className="size-[18px]" />} />
        <div className="grid gap-4 sm:grid-cols-2">
          {field("stockAlertKg", "Stock prêt à enlever (t)", "Alerte quand le stock déclaré dépasse ce seuil.")}
          {field("weightGapThresholdPct", "Écart de pesée (%)", "Annoncé / net au-delà de ce pourcentage.")}
          {field("dueSoonDays", "Échéance proche (jours)")}
          {field("inactivityDays", "Contrat inactif (jours)", "Sans livraison ni déclaration.")}
          {field("syncAlertHours", "Synchronisation en retard (heures)")}
          {field("debtBlockThreshold", "Blocage d'avance si dette > (FCFA)", "0 = désactivé ; le patron peut forcer.")}
        </div>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardTitle title="Sécurité de connexion (US-01)" />
          <div className="grid gap-4 sm:grid-cols-2">
            {field("maxFailedLogins", "Échecs avant blocage")}
            {field("lockMinutes", "Durée du blocage (minutes)")}
          </div>
        </Card>
        <Card>
          <CardTitle title="Prix de revente estimés (marge, §1.7)" />
          <div className="grid gap-4 sm:grid-cols-2">
            {field("soja", "Soja (FCFA/kg)")}
            {field("cacao", "Cacao (FCFA/kg)")}
          </div>
        </Card>
        {edit && <Button className="w-full" icon={<Save className="size-4" />} data-testid="settings-save" onClick={() => run(() => updateSettings(me, {
          weightGapThresholdPct: n(f.weightGapThresholdPct), maxFailedLogins: Math.round(n(f.maxFailedLogins)), lockMinutes: Math.round(n(f.lockMinutes)), stockAlertKg: Math.round(n(f.stockAlertKg) * 1000),
          dueSoonDays: Math.round(n(f.dueSoonDays)), inactivityDays: Math.round(n(f.inactivityDays)), syncAlertHours: Math.round(n(f.syncAlertHours)), debtBlockThreshold: Math.round(n(f.debtBlockThreshold)),
          resalePrice: { soja: Math.round(n(f.soja)), cacao: Math.round(n(f.cacao)) },
        }), "Paramètres enregistrés", "Modification tracée dans le journal d'audit.")}>Enregistrer les paramètres</Button>}
      </div>
    </div>
  );
}

function Rules({ edit }: { edit: boolean }) {
  const { db } = useApp();
  const [open, setOpen] = useState<CommissionRule | "new" | null>(null);
  const rules = db.settings[0]!.commissionRules;
  return (
    <>
      <Card pad={false}>
        <div className="p-5 pb-2"><CardTitle title="Règles de commission (§2.1)" sub="Par kg livré, pourcentage de la valeur livrée ou forfait par contrat ; versée à part ou déduite du solde." icon={<BadgePercent className="size-[18px]" />} action={edit && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setOpen("new")}>Nouvelle règle</Button>} /></div>
        <ul className="divide-y divide-line">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1"><div className="font-semibold">{r.label}</div><div className="text-[13px] text-muted">{ruleText(r)} · {r.settlement === "versee" ? "versée au bénéficiaire (charge du patron)" : "déduite du solde de l'acheteur (J)"}</div></div>
              <Badge tone={r.active ? "ok" : "gray"}>{r.active ? "Active" : "Inactive"}</Badge>
              <span className="text-[12.5px] text-subtle">{db.contracts.filter((c) => c.commissionRuleId === r.id && !c.deleted).length} contrat(s)</span>
              {edit && <Button size="sm" variant="quiet" onClick={() => setOpen(r)}>Modifier</Button>}
            </li>
          ))}
        </ul>
      </Card>
      {open && <RuleModal rule={open === "new" ? undefined : open} onClose={() => setOpen(null)} />}
    </>
  );
}

function RuleModal({ rule, onClose }: { rule?: CommissionRule; onClose: () => void }) {
  const { me, run } = useApp();
  const [f, setF] = useState({ label: rule?.label ?? "", mode: rule?.mode ?? "par_kg", value: rule ? String(rule.mode === "pourcentage" ? rule.value / 100 : rule.value) : "", settlement: rule?.settlement ?? "versee", active: rule?.active ?? true });
  const value = f.mode === "pourcentage" ? Math.round(Number(f.value.replace(",", ".")) * 100) : Math.round(Number(f.value));
  return (
    <Modal open onClose={onClose} title={rule ? "Modifier la règle" : "Nouvelle règle de commission"}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button data-testid="rule-submit" onClick={async () => {
        const r = await run(() => saveCommissionRule(me, { id: rule?.id, label: f.label, mode: f.mode as CommissionRule["mode"], value, settlement: f.settlement as CommissionRule["settlement"], active: f.active }), "Règle enregistrée");
        if (r !== undefined) onClose();
      }}>Enregistrer</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Libellé" className="sm:col-span-2"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="ex. Commission collecteur 4 FCFA/kg" /></Field>
        <Field label="Mode de calcul"><Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as CommissionRule["mode"] })}><option value="par_kg">Par kg livré</option><option value="pourcentage">Pourcentage de la valeur livrée</option><option value="forfait">Forfait par contrat</option></Select></Field>
        <Field label={f.mode === "par_kg" ? "FCFA par kg" : f.mode === "pourcentage" ? "Pourcentage (%)" : "Montant (FCFA)"}><Input inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
        <Field label="Règlement"><Select value={f.settlement} onChange={(e) => setF({ ...f, settlement: e.target.value as CommissionRule["settlement"] })}><option value="versee">Versée à part (charge du patron)</option><option value="deduite">Déduite du solde de l&apos;acheteur</option></Select></Field>
        <Field label="Statut"><Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label={f.active ? "Active" : "Inactive"} /></Field>
      </div>
    </Modal>
  );
}

function Vehicles({ edit }: { edit: boolean }) {
  const { db } = useApp();
  const [open, setOpen] = useState<"v" | "d" | null>(null);
  const drivers = db.drivers.filter((d) => !d.deleted);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <CardTitle title="Véhicules" sub="Matricule vérifié au pointage à Lomé" icon={<Car className="size-[18px]" />} action={edit && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setOpen("v")} data-testid="btn-add-vehicle">Ajouter</Button>} />
        <DataTable rows={db.vehicles.filter((v) => !v.deleted)} rowKey={(v) => v.id} columns={[
          { key: "p", header: "Matricule", mobile: "title", render: (v) => <span className="font-mono font-semibold">{v.plate}</span> },
          { key: "t", header: "Type", mobile: "sub", render: (v) => `${v.type} · ${v.owner}` },
          { key: "c", header: "Capacité", align: "right", mobile: "value", render: (v) => tonnes(v.capacityKg) },
        ]} />
      </div>
      <div>
        <CardTitle title="Chauffeurs" sub="Obligatoire pour chaque transport" icon={<UserRound className="size-[18px]" />} action={edit && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setOpen("d")}>Ajouter</Button>} />
        <DataTable rows={drivers} rowKey={(d) => d.id} columns={[
          { key: "n", header: "Nom", mobile: "title", render: (d) => <span className="font-semibold">{d.name}</span> },
          { key: "p", header: "Téléphone", mobile: "sub", render: (d) => d.phone },
          { key: "l", header: "Permis", mobile: "meta", render: (d) => d.licence ?? "—" },
          { key: "a", header: "Compte", mobile: "meta", render: (d) => (d.userId ? <Badge tone="blue">Accès mobile</Badge> : <Badge>Sans compte</Badge>) },
        ]} />
      </div>
      {open === "v" && <VehicleModal onClose={() => setOpen(null)} />}
      {open === "d" && <DriverModal onClose={() => setOpen(null)} />}
    </div>
  );
}

function VehicleModal({ onClose }: { onClose: () => void }) {
  const { me, run } = useApp();
  const [f, setF] = useState({ plate: "", type: "Camion 30 t", capacity: "30", owner: "" });
  return (
    <Modal open onClose={onClose} title="Ajouter un véhicule"
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button data-testid="vehicle-submit" onClick={async () => { const r = await run(() => addVehicle(me, { plate: f.plate, type: f.type, capacityKg: Math.round(Number(f.capacity.replace(",", ".")) * 1000), owner: f.owner || "Transporteur" }), "Véhicule ajouté"); if (r) onClose(); }}>Ajouter</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Matricule"><Input value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} placeholder="TG-1234-AB" className="font-mono uppercase" name="plate" /></Field>
        <Field label="Type"><Input value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} /></Field>
        <Field label="Capacité (t)"><Input inputMode="decimal" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
        <Field label="Propriétaire / transporteur"><Input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function DriverModal({ onClose }: { onClose: () => void }) {
  const { me, run } = useApp();
  const [f, setF] = useState({ name: "", phone: "", licence: "" });
  return (
    <Modal open onClose={onClose} title="Ajouter un chauffeur" sub="Pour lui donner un accès mobile, créez aussi un compte « Chauffeur » dans Utilisateurs."
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={async () => { const r = await run(() => addDriver(me, f), "Chauffeur ajouté"); if (r) onClose(); }}>Ajouter</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Téléphone"><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="N° de permis (facultatif)" className="sm:col-span-2"><Input value={f.licence} onChange={(e) => setF({ ...f, licence: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function Lieux({ edit }: { edit: boolean }) {
  const { db, me, run } = useApp();
  const [f, setF] = useState({ name: "", type: "etape" as Location["type"], lat: "", lng: "" });
  const locs = db.locations.filter((l) => !l.deleted);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
      <DataTable rows={locs} rowKey={(l) => l.id} columns={[
        { key: "n", header: "Lieu", mobile: "title", render: (l) => <span className="font-semibold">{l.name}</span> },
        { key: "t", header: "Type", mobile: "sub", render: (l) => LOC_TYPE[l.type] },
        { key: "c", header: "Pays", mobile: "meta", render: (l) => l.country },
        { key: "g", header: "Coordonnées", mobile: "meta", render: (l) => (l.lat !== undefined ? <span className="num text-[12.5px]">{l.lat.toFixed(3)}, {l.lng!.toFixed(3)}</span> : <Badge>Sans carte</Badge>) },
      ]} />
      {edit && (
        <Card>
          <CardTitle title="Ajouter un lieu" sub="Réutilisable comme origine ou étape" icon={<MapPin className="size-[18px]" />} />
          <div className="space-y-4">
            <Field label="Nom"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ex. Blitta" name="locName" /></Field>
            <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Location["type"] })}><option value="origine">Origine</option><option value="etape">Étape</option><option value="destination">Destination</option><option value="autre">Autre</option></Select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude"><Input inputMode="decimal" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} placeholder="8.65" /></Field>
              <Field label="Longitude"><Input inputMode="decimal" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} placeholder="0.99" /></Field>
            </div>
            <Button className="w-full" onClick={async () => {
              const lat = f.lat ? Number(f.lat.replace(",", ".")) : undefined;
              const lng = f.lng ? Number(f.lng.replace(",", ".")) : undefined;
              const r = await run(() => addLocation(me, f.name, f.type, { lat, lng }).then(() => true), "Lieu ajouté");
              if (r) setF({ name: "", type: "etape", lat: "", lng: "" });
            }}>Ajouter le lieu</Button>
          </div>
        </Card>
      )}
      <p className="text-[12.5px] text-muted lg:col-span-2">Prix de revente : soja {prixKg(db.settings[0]!.resalePrice.soja)}, cacao {prixKg(db.settings[0]!.resalePrice.cacao)}.</p>
    </div>
  );
}
