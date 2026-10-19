"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowRight, BadgePercent, Banknote, CalendarClock, Camera, ClipboardCheck, CloudOff, FileText, Handshake, Hourglass, KeyRound, Lock,
  PackageCheck, PackagePlus, Receipt, Route, Scale, Settings, TrendingUp, Truck, UserCog, Wallet, Warehouse,
} from "lucide-react";
import { TripList } from "@/components/driver";
import { computeAlerts } from "@/lib/alerts";
import { AGE_LABEL, debtAge, margin } from "@/lib/calc";
import { hasPin, MOBILE_ROLES } from "@/services/actions";
import { useApp } from "@/components/DataProvider";
import { ContractBadges, contractsOf, nameOf, PartialModal, TransportModal } from "@/components/domain";
import { Badge, Button, Card, CardTitle, DataTable, Empty, LinkButton, PageHeader, Progress, Segmented, Select, Stat } from "@/components/ui";
import { debtRemaining, metrics, supplierStock } from "@/lib/calc";
import { fcfa, prixKg, productLabel, relative, tonnes } from "@/lib/format";
import type { Contract, Database, User } from "@/lib/types";

export default function Accueil() {
  const { me } = useApp();
  const home =
    me.role === "fournisseur" ? <SupplierHome /> :
    me.role === "gestionnaire" ? <ManagerHome /> :
    me.role === "chauffeur" ? <DriverHome /> :
    me.role === "magasinier" ? <StorekeeperHome /> :
    me.role === "admin" ? <AdminHome /> :
    <PatronHome />;
  return <><PinBanner />{home}</>;
}

function hello(name: string) {
  const h = new Date().getUTCHours();
  return `${h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir"}, ${name.split(" ")[0]}`;
}

const ALERT_ICON = { actions: ClipboardCheck, partielle: Scale, photo: Camera, echu: AlertTriangle, echeance: CalendarClock, stock: Warehouse, pesee: Scale, inactif: Hourglass, sync: CloudOff, dette: Wallet, frais: Receipt, compte: Lock, commission: BadgePercent, arrivee: Truck } as const;

function Alerts({ db, me }: { db: Database; me: User }) {
  const items = computeAlerts(db, me);
  return (
    <Card>
      <CardTitle title="À traiter" sub={items.length ? `${items.length} point${items.length > 1 ? "s" : ""} d'attention` : "Rien en attente"} icon={<AlertTriangle className="size-[18px]" />} />
      {items.length === 0 ? (
        <p className="rounded-xl bg-canvas px-4 py-6 text-center text-[13.5px] text-muted">Tout est à jour.</p>
      ) : (
        <ul className="-mx-2 space-y-0.5" data-testid="alerts">
          {items.slice(0, 8).map((i) => {
            const Icon = ALERT_ICON[i.kind];
            return (
              <li key={i.title + i.text}>
                <Link href={i.href} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-canvas">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-white"><Icon className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{i.title}</span>
                    <span className="num block truncate text-[12.5px] text-muted">{i.text}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-subtle" />
                </Link>
              </li>
            );
          })}
          {items.length > 8 && <li className="px-2 pt-1 text-[12.5px] text-muted">… et {items.length - 8} autre(s)</li>}
        </ul>
      )}
    </Card>
  );
}

/** Invite à activer le code PIN sur les rôles mobiles (US-01). */
function PinBanner() {
  const { me } = useApp();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if ((MOBILE_ROLES as readonly string[]).includes(me.role)) void hasPin(me).then((h) => setShow(!h));
  }, [me]);
  if (!show) return null;
  return (
    <div className="animate-in mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-4" data-testid="pin-banner">
      <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700"><KeyRound className="size-[18px]" /></span>
      <div className="min-w-0 flex-1 text-[13.5px]"><div className="font-semibold">Activez le déverrouillage par code PIN</div><div className="text-muted">Sur cet appareil, y compris sans réseau, sans retaper votre mot de passe.</div></div>
      <LinkButton size="sm" href="/profil/" variant="primary">Définir mon PIN</LinkButton>
      <button onClick={() => setShow(false)} className="text-[12.5px] font-semibold text-muted hover:text-ink">Plus tard</button>
    </div>
  );
}

function ContractsTable({ db, rows }: { db: Database; rows: Contract[] }) {
  const router = useRouter();
  return (
    <DataTable
      rows={rows}
      rowKey={(c) => c.id}
      onRow={(c) => router.push(`/contrats/fiche/?id=${c.id}`)}
      empty={<Empty icon={<FileText className="size-5" />} title="Aucun contrat" text="Les contrats apparaissent dès qu'une proposition est validée." />}
      columns={[
        { key: "ref", header: "Contrat", mobile: "title", render: (c) => <span className="font-semibold">{c.ref} <span className="font-normal text-muted md:hidden">· {productLabel[c.product]}</span></span> },
        { key: "sup", header: "Fournisseur", mobile: "sub", render: (c) => nameOf(db, c.supplierId) },
        { key: "prod", header: "Produit", mobile: "hide", render: (c) => productLabel[c.product] },
        { key: "real", header: "Réalisation", mobile: "hide", render: (c) => { const m = metrics(db, c); return <div className="w-28"><div className="mb-1 text-[12px] text-muted">{m.realisation} %</div><Progress value={m.realisation} /></div>; } },
        { key: "price", header: "Prix en vigueur", mobile: "meta", render: (c) => prixKg(metrics(db, c).P) },
        { key: "rest", header: "Reste à livrer", align: "right", mobile: "value", render: (c) => <span className="font-semibold">{tonnes(metrics(db, c).Q)}</span> },
        { key: "solde", header: "Solde", align: "right", mobile: "meta", render: (c) => fcfa(metrics(db, c).S) },
        { key: "st", header: "Statut", mobile: "meta", render: (c) => <ContractBadges c={c} m={metrics(db, c)} /> },
      ]}
    />
  );
}

function PatronHome() {
  const { db, me } = useApp();
  const [product, setProduct] = useState<"all" | "soja" | "cacao">("all");
  const [supplier, setSupplier] = useState("all");
  const [period, setPeriod] = useState<"all" | "30" | "90">("all");
  const contracts = db.contracts.filter((c) => !c.deleted && (product === "all" || c.product === product) && (supplier === "all" || c.supplierId === supplier));
  const k = useMemo(() => {
    const ms = contracts.map((c) => metrics(db, c));
    const ids = new Set(contracts.map((c) => c.id));
    const from = period === "all" ? 0 : Date.now() - Number(period) * 864e5;
    const inP = (iso?: string) => !!iso && new Date(iso).getTime() >= from;
    const sum = (f: (m: ReturnType<typeof metrics>) => number) => ms.reduce((s, m) => s + f(m), 0);
    const charges = db.expenses.filter((e) => !e.deleted && e.debitedOn === "charges_patron" && e.status !== "a_valider" && e.status !== "refusee" && inP(e.date) && (!e.contractId || ids.has(e.contractId))).reduce((s, e) => s + e.amount, 0);
    const openDebts = db.debts.filter((d) => !d.deleted && ids.has(d.contractId) && !["soldee", "passee_en_perte"].includes(d.status));
    const debts = openDebts.reduce((s, d) => s + debtRemaining(db, d.id), 0);
    const ages = (Object.keys(AGE_LABEL) as (keyof typeof AGE_LABEL)[]).map((b) => ({ b, v: openDebts.filter((d) => debtAge(d).bucket === b).reduce((s, d) => s + debtRemaining(db, d.id), 0) }));
    const suppliers = db.users.filter((u) => u.role === "fournisseur" && (supplier === "all" || u.id === supplier));
    const stock = suppliers.reduce((s, u) => s + supplierStock(db, u.id).available, 0);
    const adv = db.advances.filter((a) => !a.deleted && a.status !== "annulee" && ids.has(a.contractId) && inP(a.date));
    const dl = db.deliveries.filter((d) => !d.deleted && d.status !== "pesee" && ids.has(d.contractId) && inP(d.receivedAt));
    const mg = margin(db, (c) => ids.has(c.id));
    return { A: adv.reduce((s, a) => s + a.amount, 0), V: dl.reduce((s, d) => s + d.value, 0), kg: dl.reduce((s, d) => s + d.netKg, 0), S: sum((m) => Math.max(0, m.S)), Q: sum((m) => m.Q), charges, debts, ages, stock, mg };
  }, [db, contracts, supplier, period]);
  const enRoute = db.transports.filter((t) => !t.deleted && t.status !== "receptionne");
  const suppliers = db.users.filter((u) => u.role === "fournisseur" && !u.deleted);
  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lome" }).format(new Date())}
        title={hello(me.name)}
        sub={me.role === "comptable" ? "Consultation et exports : paiements, soldes, dettes et commissions. Aucune modification possible." : "Situation consolidée de vos préfinancements, recalculée à partir des écritures."}
        actions={me.role === "comptable" ? <><LinkButton href="/finances/" icon={<Wallet className="size-4" />}>Soldes et dettes</LinkButton><LinkButton href="/exports/" variant="primary" icon={<FileText className="size-4" />}>Exports</LinkButton></> : <><LinkButton href="/besoins/" icon={<Handshake className="size-4" />}>Exprimer un besoin</LinkButton><LinkButton href="/contrats/" variant="primary" icon={<FileText className="size-4" />}>Contrats</LinkButton></>}
      />
      <div className="animate-in mb-5 flex flex-wrap items-center gap-2">
        <Segmented value={period} onChange={setPeriod} options={[{ value: "30", label: "30 jours" }, { value: "90", label: "90 jours" }, { value: "all", label: "Depuis le début" }]} />
        <Segmented value={product} onChange={setProduct} options={[{ value: "all", label: "Tous produits" }, { value: "soja", label: "Soja" }, { value: "cacao", label: "Cacao" }]} />
        <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="!h-10 w-auto min-w-[12rem] !py-0 text-[13.5px]" aria-label="Filtrer par fournisseur">
          <option value="all">Tous les fournisseurs</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      <div className="animate-in grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpis">
        <Stat accent label="Total avancé" value={fcfa(k.A)} hint={`${contracts.length} contrat${contracts.length > 1 ? "s" : ""}${period === "all" ? "" : ` · ${period} derniers jours`}`} icon={<Banknote className="size-4" />} />
        <Stat label="Total livré" value={fcfa(k.V)} hint={tonnes(k.kg)} icon={<Truck className="size-4" />} />
        <Stat label="Soldes ouverts" value={fcfa(k.S)} hint={`Reste à livrer ${tonnes(k.Q)}`} icon={<Scale className="size-4" />} />
        <Stat label="Stock disponible" value={tonnes(k.stock)} hint="Déclaré, non enlevé" icon={<Warehouse className="size-4" />} />
        <Stat label="Charges du patron" value={fcfa(k.charges)} hint="Transport et maintenance" icon={<Wallet className="size-4" />} />
        <Stat label="Dettes en cours" value={fcfa(k.debts)} hint={k.debts ? "À recouvrer" : "Aucune dette"} icon={<AlertTriangle className="size-4" />} />
        <Stat label="Transports en cours" value={String(enRoute.length)} hint={enRoute.map((t) => t.ref).join(", ") || "—"} icon={<Route className="size-4" />} />
        <Stat label="Actions à confirmer" value={String(db.pending.filter((p) => p.status === "en_attente").length)} hint="Demandes des gestionnaires" icon={<ClipboardCheck className="size-4" />} />
      </div>
      <div className="animate-in mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.4fr]">
        <Card className="!p-4" >
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-subtle"><TrendingUp className="size-4" /> Marge estimée (§1.7)</div>
          <div className="num mt-1 text-[22px] font-bold" data-testid="kpi-margin">{fcfa(k.mg.margin)}</div>
          <div className="num mt-1 text-[12.5px] text-muted">Revente {fcfa(k.mg.revenue)} − livré {fcfa(k.mg.cost)} − transport {fcfa(k.mg.transport)} − commissions {fcfa(k.mg.commissions)}</div>
        </Card>
        <Card className="!p-4">
          <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-subtle">Dettes par ancienneté</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {k.ages.map((a) => <div key={a.b}><div className="text-[11.5px] text-muted">{AGE_LABEL[a.b]}</div><div className="num text-[14px] font-semibold">{fcfa(a.v)}</div></div>)}
          </div>
        </Card>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-[16px] font-bold tracking-[-0.01em]">Contrats</h2><Link href="/contrats/" className="text-[13px] font-semibold text-brand-700 hover:underline">Tout voir</Link></div>
          <ContractsTable db={db} rows={contracts} />
        </div>
        <div className="space-y-6">
          <Alerts db={db} me={me} />
          <Card>
            <CardTitle title="Activité récente" sub="Journal d'audit" />
            <ul className="space-y-3.5">
              {[...db.audit].reverse().slice(0, 6).map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">{a.action}</div>
                    <div className="num truncate text-[12.5px] text-muted">{nameOf(db, a.by) === "—" ? "Système" : nameOf(db, a.by)} · {relative(a.at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function ManagerHome() {
  const { db, me } = useApp();
  const router = useRouter();
  const [tr, setTr] = useState(false);
  const active = db.transports.filter((t) => !t.deleted && t.status !== "receptionne");
  const mine = db.pending.filter((p) => p.by === me.id);
  const kaboli = db.traces.filter((e) => e.place === "Kaboli" && e.by === me.id);
  return (
    <>
      <PageHeader eyebrow="Gestionnaire délégué" title={hello(me.name)} sub="Vous créez et mettez à jour ; les suppressions et les changements de prix passent par la validation du patron."
        actions={<Button icon={<Truck className="size-4" />} onClick={() => setTr(true)} data-testid="new-transport">Nouveau transport</Button>} />
      <div className="animate-in grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Transports en cours" value={String(active.length)} hint="À suivre jusqu'à Lomé" icon={<Route className="size-4" />} />
        <Stat label="À pointer à Lomé" value={String(active.filter((t) => t.status === "en_route").length)} hint="Véhicules en route" icon={<Truck className="size-4" />} />
        <Stat label="Réceptions à Kaboli" value={String(kaboli.length)} hint="Saisies par vous" icon={<Warehouse className="size-4" />} />
        <Stat label="Mes demandes en attente" value={String(mine.filter((p) => p.status === "en_attente").length)} hint={`${mine.length} au total`} icon={<ClipboardCheck className="size-4" />} />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          <h2 className="text-[16px] font-bold">Transports en cours</h2>
          <DataTable rows={active} rowKey={(t) => t.id} onRow={(t) => router.push(`/transports/fiche/?id=${t.id}`)}
            empty={<Empty icon={<Truck className="size-5" />} title="Aucun transport en cours" action={<Button size="sm" onClick={() => setTr(true)}>Créer un transport</Button>} />}
            columns={[
              { key: "ref", header: "Transport", mobile: "title", render: (t) => <span className="font-semibold">{t.ref}</span> },
              { key: "route", header: "Trajet", mobile: "sub", render: (t) => `${t.origin} → Lomé` },
              { key: "tons", header: "Tonnes", align: "right", mobile: "value", render: (t) => tonnes(t.tonsKg) },
              { key: "veh", header: "Véhicule", mobile: "meta", render: (t) => t.vehicle },
              { key: "st", header: "Statut", mobile: "meta", render: (t) => <Badge tone={t.status === "arrive" ? "dark" : "blue"}>{t.status === "arrive" ? "Pointé à Lomé" : "En route"}</Badge> },
            ]} />
        </div>
        <Card>
          <CardTitle title="Vos droits actuels" sub="Fixés par le patron, mis à jour en direct" />
          <ul className="space-y-2 text-[13.5px]">
            {(["contrats", "remises", "transports", "pointages", "traces"] as const).map((e) => {
              const p = db.settings[0]!.perms.gestionnaire[e];
              return (
                <li key={e} className="flex items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-2">
                  <span className="capitalize">{e}</span>
                  <span className="num text-[12px] font-semibold text-muted">{[p.c && "Créer", p.u && "Modifier", p.d === "confirmation" ? "Suppr. à confirmer" : p.d === "directe" ? "Supprimer" : null].filter(Boolean).join(" · ") || "Lecture"}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <TransportModal open={tr} onClose={() => setTr(false)} onDone={(id) => router.push(`/transports/fiche/?id=${id}`)} />
    </>
  );
}

function SupplierHome() {
  const { db, me } = useApp();
  const router = useRouter();
  const contracts = contractsOf(db, me);
  const [partial, setPartial] = useState<Contract | null>(null);
  const ms = contracts.map((c) => ({ c, m: metrics(db, c) }));
  const S = ms.reduce((s, x) => s + x.m.S, 0);
  const Q = ms.reduce((s, x) => s + x.m.Q, 0);
  const open = db.needs.filter((n) => n.status === "ouvert" || n.status === "partiellement_couvert");
  const stock = supplierStock(db, me.id);
  return (
    <>
      <div className="animate-in mb-5">
        <div className="eyebrow">Espace fournisseur</div>
        <h1 className="mt-1 text-[24px] font-bold tracking-[-0.025em]">{hello(me.name)}</h1>
      </div>
      <section className="animate-in rounded-3xl bg-ink p-5 text-white sm:p-7" data-testid="supplier-summary">
        <div className="text-[13px] text-white/60">Reste à livrer, tous contrats</div>
        <div className="num mt-1 text-[34px] font-bold leading-none tracking-[-0.03em]">{tonnes(Q)}</div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
          <div><div className="text-[12px] text-white/50">Solde à couvrir</div><div className="num mt-0.5 text-[16px] font-semibold">{fcfa(S)}</div></div>
          <div><div className="text-[12px] text-white/50">Stock déclaré disponible</div><div className="num mt-0.5 text-[16px] font-semibold">{tonnes(stock.available)}</div></div>
        </div>
      </section>
      <div className="animate-in mt-4 grid grid-cols-3 gap-2.5">
        {[
          { href: "/declarer/", label: "Déclarer un achat", icon: PackagePlus },
          { href: "/declarer/?tab=etape", label: "Confirmer une étape", icon: Route },
          { href: "/besoins/", label: "Besoins ouverts", icon: Handshake, badge: open.length },
        ].map((a) => (
          <Link key={a.href} href={a.href} className="card relative flex flex-col items-start gap-2.5 p-3.5 transition-colors hover:border-brand-600">
            <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700"><a.icon className="size-[18px]" /></span>
            <span className="text-[13px] font-semibold leading-tight">{a.label}</span>
            {!!a.badge && <span className="num absolute right-3 top-3 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">{a.badge}</span>}
          </Link>
        ))}
      </div>
      <h2 className="mb-3 mt-7 text-[16px] font-bold">Mes contrats</h2>
      {contracts.length === 0 ? (
        <Empty icon={<FileText className="size-5" />} title="Aucun contrat" text="Proposez-vous sur un besoin du patron pour démarrer." action={<LinkButton href="/besoins/" size="sm" variant="primary">Voir les besoins</LinkButton>} />
      ) : (
        <ul className="space-y-3">
          {ms.map(({ c, m }) => (
            <li key={c.id} className="card animate-in p-4 sm:p-5">
              <button className="w-full text-left" onClick={() => router.push(`/contrats/fiche/?id=${c.id}`)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-semibold">{c.ref} · {productLabel[c.product]}</div>
                    <div className="num mt-0.5 text-[12.5px] text-muted">{tonnes(c.qtyKg)} · livraison à {c.deliveryPlace}</div>
                  </div>
                  <ContractBadges c={c} m={m} />
                </div>
                <div className="num mt-4 grid grid-cols-3 gap-2 text-[12px] text-muted">
                  <div><div>Prix en vigueur</div><div className="text-[14px] font-semibold text-ink">{prixKg(m.P)}</div></div>
                  <div><div>Livré</div><div className="text-[14px] font-semibold text-ink">{tonnes(m.deliveredKg)}</div></div>
                  <div><div>Reste</div><div className="text-[14px] font-semibold text-ink">{tonnes(m.Q)}</div></div>
                </div>
                <Progress value={m.realisation} className="mt-3" />
              </button>
              {c.status === "actif" && (
                <div className="mt-3 flex gap-2 border-t border-line pt-3">
                  <Button size="sm" variant="quiet" icon={<Scale className="size-3.5" />} onClick={() => setPartial(c)} data-testid={`partial-${c.ref}`}>Livraison partielle</Button>
                  <LinkButton size="sm" href={`/contrats/fiche/?id=${c.id}`}>Détail et relevé</LinkButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {partial && <PartialModal open onClose={() => setPartial(null)} contract={partial} />}
    </>
  );
}

function DriverHome() {
  const { me } = useApp();
  return (
    <>
      <div className="animate-in mb-5"><div className="eyebrow">Chauffeur</div><h1 className="mt-1 text-[24px] font-bold tracking-[-0.025em]">{hello(me.name)}</h1><p className="mt-1 text-[14px] text-muted">Vos ordres d&apos;enlèvement et la prochaine action à faire. Fonctionne sans réseau.</p></div>
      <TripList />
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <LinkButton href="/frais/" icon={<Receipt className="size-4" />}>Déclarer des frais</LinkButton>
        <LinkButton href="/trajets/" icon={<Route className="size-4" />}>Tous mes trajets</LinkButton>
      </div>
    </>
  );
}

function StorekeeperHome() {
  const { db, me } = useApp();
  const ts = db.transports.filter((t) => !t.deleted);
  const pesees = db.deliveries.filter((d) => d.status === "pesee" && !d.deleted).length;
  const received = db.deliveries.filter((d) => d.status === "receptionnee" && !d.deleted);
  return (
    <>
      <PageHeader eyebrow="Magasinier · Lomé" title={hello(me.name)} sub="Pointage des camions, pesées et réception des livraisons." actions={<LinkButton href="/reception/" variant="primary" icon={<PackageCheck className="size-4" />}>Réception et pesées</LinkButton>} />
      <div className="animate-in grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Camions attendus" value={String(ts.filter((t) => t.status === "en_route").length)} icon={<Truck className="size-4" />} />
        <Stat label="À peser" value={String(ts.filter((t) => t.status === "arrive" && !db.deliveries.some((d) => d.transportId === t.id)).length)} icon={<Scale className="size-4" />} />
        <Stat label="À réceptionner" value={String(pesees)} icon={<PackageCheck className="size-4" />} />
        <Stat label="Reçu au magasin" value={tonnes(received.reduce((s, d) => s + d.netKg, 0))} icon={<Warehouse className="size-4" />} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2"><Alerts db={db} me={me} /></div>
    </>
  );
}

function AdminHome() {
  const { db, me } = useApp();
  const users = db.users.filter((u) => !u.deleted);
  const locked = users.filter((u) => u.lockedUntil && u.lockedUntil > new Date().toISOString());
  return (
    <>
      <PageHeader eyebrow="Administration" title={hello(me.name)} sub="Comptes, paramètres, référentiels et journal ; vous assistez le patron." actions={<><LinkButton href="/parametres/" icon={<Settings className="size-4" />}>Paramètres</LinkButton><LinkButton href="/utilisateurs/" variant="primary" icon={<UserCog className="size-4" />}>Utilisateurs</LinkButton></>} />
      <div className="animate-in grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Comptes actifs" value={String(users.filter((u) => u.active).length)} hint={`${users.length} au total`} icon={<UserCog className="size-4" />} />
        <Stat label="Comptes bloqués" value={String(locked.length)} icon={<Lock className="size-4" />} />
        <Stat label="Appareils autorisés" value={String(db.devices.filter((d) => !d.deleted).length)} icon={<KeyRound className="size-4" />} />
        <Stat label="Opérations hors ligne en attente" value={String(db.outbox.filter((o) => o.status === "en_attente").length)} icon={<CloudOff className="size-4" />} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Alerts db={db} me={me} />
        <Card>
          <CardTitle title="Dernières opérations" sub="Journal d'audit chaîné" />
          <ul className="space-y-3">
            {[...db.audit].reverse().slice(0, 7).map((a) => (
              <li key={a.id} className="text-[13px]"><span className="font-semibold">{a.action}</span> <span className="text-muted">· {nameOf(db, a.by) === "—" ? "Système" : nameOf(db, a.by)} · {relative(a.at)}</span></li>
            ))}
          </ul>
          <LinkButton href="/journal/" size="sm" className="mt-4">Ouvrir le journal</LinkButton>
        </Card>
      </div>
    </>
  );
}
