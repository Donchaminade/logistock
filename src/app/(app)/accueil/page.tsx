"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowRight, Banknote, Camera, ClipboardCheck, FileText, Handshake, PackagePlus, Route, Scale, Truck, Wallet, Warehouse,
} from "lucide-react";
import { useApp } from "@/components/DataProvider";
import { ContractBadges, contractsOf, nameOf, PartialModal, TransportModal } from "@/components/domain";
import { Badge, Button, Card, CardTitle, DataTable, Empty, LinkButton, PageHeader, Progress, Segmented, Select, Stat } from "@/components/ui";
import { debtRemaining, metrics, supplierStock } from "@/lib/calc";
import { fcfa, prixKg, productLabel, relative, tonnes } from "@/lib/format";
import type { Contract, Database, User } from "@/lib/types";

export default function Accueil() {
  const { me } = useApp();
  if (me.role === "fournisseur") return <SupplierHome />;
  if (me.role === "gestionnaire") return <ManagerHome />;
  return <PatronHome />;
}

function hello(name: string) {
  const h = new Date().getUTCHours();
  return `${h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir"}, ${name.split(" ")[0]}`;
}

function Alerts({ db, me }: { db: Database; me: User }) {
  const items: { icon: React.ReactNode; title: string; text: string; href: string }[] = [];
  const pending = db.pending.filter((p) => p.status === "en_attente");
  if (me.role === "patron" && pending.length) items.push({ icon: <ClipboardCheck className="size-4" />, title: `${pending.length} action${pending.length > 1 ? "s" : ""} à confirmer`, text: pending[0]!.label, href: "/actions/" });
  for (const p of db.partials.filter((x) => !x.deleted && !x.seenByPatron)) {
    const c = db.contracts.find((k) => k.id === p.contractId)!;
    items.push({ icon: <Scale className="size-4" />, title: `Livraison partielle · ${c.ref}`, text: `${tonnes(p.foundKg)} sur ${tonnes(p.contractedKg)} — reliquat ${tonnes(p.remainderKg)}`, href: `/contrats/fiche/?id=${c.id}` });
  }
  for (const a of db.advances.filter((x) => x.status === "a_completer" && !x.deleted)) {
    const c = db.contracts.find((k) => k.id === a.contractId)!;
    items.push({ icon: <Camera className="size-4" />, title: `Photo de remise manquante · ${a.receiptNo}`, text: `${fcfa(a.amount)} · ${c.ref}`, href: `/contrats/fiche/?id=${c.id}` });
  }
  for (const c of db.contracts.filter((x) => x.status === "actif" && !x.deleted && new Date(x.deliveryDate) < new Date())) {
    const m = metrics(db, c);
    if (m.S > 0) items.push({ icon: <AlertTriangle className="size-4" />, title: `Contrat échu non soldé · ${c.ref}`, text: `${nameOf(db, c.supplierId)} · solde ${fcfa(m.S)}`, href: `/contrats/fiche/?id=${c.id}` });
  }
  const arrived = db.transports.filter((t) => t.status === "arrive" && !t.deleted);
  for (const t of arrived) items.push({ icon: <Truck className="size-4" />, title: `${t.ref} pointé à Lomé`, text: "En attente de pesée et de réception", href: `/transports/fiche/?id=${t.id}` });
  return (
    <Card>
      <CardTitle title="À traiter" sub={items.length ? `${items.length} point${items.length > 1 ? "s" : ""} d'attention` : "Rien en attente"} icon={<AlertTriangle className="size-[18px]" />} />
      {items.length === 0 ? (
        <p className="rounded-xl bg-canvas px-4 py-6 text-center text-[13.5px] text-muted">Tout est à jour.</p>
      ) : (
        <ul className="-mx-2 space-y-0.5" data-testid="alerts">
          {items.slice(0, 6).map((i) => (
            <li key={i.title + i.text}>
              <Link href={i.href} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-canvas">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-white">{i.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{i.title}</span>
                  <span className="num block truncate text-[12.5px] text-muted">{i.text}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
  const contracts = db.contracts.filter((c) => !c.deleted && (product === "all" || c.product === product) && (supplier === "all" || c.supplierId === supplier));
  const k = useMemo(() => {
    const ms = contracts.map((c) => metrics(db, c));
    const ids = new Set(contracts.map((c) => c.id));
    const sum = (f: (m: ReturnType<typeof metrics>) => number) => ms.reduce((s, m) => s + f(m), 0);
    const charges = db.expenses.filter((e) => !e.deleted && e.debitedOn === "charges_patron" && (!e.contractId || ids.has(e.contractId))).reduce((s, e) => s + e.amount, 0);
    const debts = db.debts.filter((d) => !d.deleted && ids.has(d.contractId)).reduce((s, d) => s + debtRemaining(db, d.id), 0);
    const suppliers = db.users.filter((u) => u.role === "fournisseur" && (supplier === "all" || u.id === supplier));
    const stock = suppliers.reduce((s, u) => s + supplierStock(db, u.id).available, 0);
    return { A: sum((m) => m.A), V: sum((m) => m.V), kg: sum((m) => m.deliveredKg), S: sum((m) => Math.max(0, m.S)), Q: sum((m) => m.Q), charges, debts, stock };
  }, [db, contracts, supplier]);
  const enRoute = db.transports.filter((t) => !t.deleted && t.status !== "receptionne");
  const suppliers = db.users.filter((u) => u.role === "fournisseur" && !u.deleted);
  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lome" }).format(new Date())}
        title={hello(me.name)}
        sub="Situation consolidée de vos préfinancements, recalculée à partir des écritures."
        actions={<><LinkButton href="/besoins/" icon={<Handshake className="size-4" />}>Exprimer un besoin</LinkButton><LinkButton href="/contrats/" variant="primary" icon={<FileText className="size-4" />}>Contrats</LinkButton></>}
      />
      <div className="animate-in mb-5 flex flex-wrap items-center gap-2">
        <Segmented value={product} onChange={setProduct} options={[{ value: "all", label: "Tous produits" }, { value: "soja", label: "Soja" }, { value: "cacao", label: "Cacao" }]} />
        <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="!h-10 w-auto min-w-[12rem] !py-0 text-[13.5px]" aria-label="Filtrer par fournisseur">
          <option value="all">Tous les fournisseurs</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      <div className="animate-in grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpis">
        <Stat accent label="Total avancé" value={fcfa(k.A)} hint={`${contracts.length} contrat${contracts.length > 1 ? "s" : ""}`} icon={<Banknote className="size-4" />} />
        <Stat label="Total livré" value={fcfa(k.V)} hint={tonnes(k.kg)} icon={<Truck className="size-4" />} />
        <Stat label="Soldes ouverts" value={fcfa(k.S)} hint={`Reste à livrer ${tonnes(k.Q)}`} icon={<Scale className="size-4" />} />
        <Stat label="Stock disponible" value={tonnes(k.stock)} hint="Déclaré, non enlevé" icon={<Warehouse className="size-4" />} />
        <Stat label="Charges du patron" value={fcfa(k.charges)} hint="Transport et maintenance" icon={<Wallet className="size-4" />} />
        <Stat label="Dettes en cours" value={fcfa(k.debts)} hint={k.debts ? "À recouvrer" : "Aucune dette"} icon={<AlertTriangle className="size-4" />} />
        <Stat label="Transports en cours" value={String(enRoute.length)} hint={enRoute.map((t) => t.ref).join(", ") || "—"} icon={<Route className="size-4" />} />
        <Stat label="Actions à confirmer" value={String(db.pending.filter((p) => p.status === "en_attente").length)} hint="Demandes des gestionnaires" icon={<ClipboardCheck className="size-4" />} />
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
