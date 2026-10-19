"use client";
// Vérification publique d'un reçu (sans connexion) : empreinte SHA-256 recalculée et signature Ed25519 vérifiée.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FlaskConical, KeyRound, SearchCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import { useData } from "@/components/DataProvider";
import { Logo } from "@/components/Logo";
import { Badge, Button, Card, CardTitle, cx, Field, Input, KV } from "@/components/ui";
import { DEMO_PUBLIC_KEY_HEX, signatureEngine } from "@/lib/crypto";
import { date, fcfa, modeLabel, prixKg, productLabel, tonnes } from "@/lib/format";
import { verifyReceipt, type ReceiptCheck } from "@/lib/integrity";
import type { Advance } from "@/lib/types";

export default function Verifier() {
  const { db, ready } = useData();
  const [no, setNo] = useState("");
  const [hash, setHash] = useState("");
  const [engine, setEngine] = useState("…");
  const [res, setRes] = useState<null | { adv?: Advance; check?: ReceiptCheck; tampered?: boolean }>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void signatureEngine().then(setEngine);
    const q = new URLSearchParams(window.location.search);
    if (q.get("no")) setNo(q.get("no")!);
    if (q.get("h")) setHash(q.get("h")!);
  }, []);
  useEffect(() => {
    if (ready && db && no && hash && !res) void check(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, db]);

  async function check(tamper: boolean) {
    if (!db) return;
    setBusy(true);
    const adv = db.advances.find((a) => a.receiptNo.toLowerCase() === no.trim().toLowerCase());
    if (!adv) {
      setRes({});
      setBusy(false);
      return;
    }
    const check = await verifyReceipt(db, adv, hash || undefined, tamper ? { amount: adv.amount + 1_000_000 } : undefined);
    setRes({ adv, check, tampered: tamper });
    setBusy(false);
  }

  const c = res?.adv && db?.contracts.find((x) => x.id === res.adv!.contractId);
  const sup = c && db?.users.find((u) => u.id === c.supplierId);
  const ok = res?.check && res.check.hashOk && res.check.signatureOk && res.check.printedOk !== false;

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Logo sub="Vérification d'un reçu" />
          <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" /> Connexion</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-5 py-8">
        <div>
          <p className="eyebrow">Sans connexion</p>
          <h1 className="mt-1 text-[26px] font-bold tracking-[-0.025em]">Vérifier un reçu de remise</h1>
          <p className="mt-1.5 text-[14.5px] text-muted">Scannez le QR code du reçu PDF ou saisissez son numéro et l&apos;empreinte imprimée. L&apos;empreinte SHA-256 est recalculée à partir des écritures, puis la signature Ed25519 est vérifiée avec la clé publique.</p>
        </div>
        <Card>
          <form className="grid gap-4 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); void check(false); }}>
            <Field label="Numéro du reçu"><Input value={no} onChange={(e) => setNo(e.target.value)} placeholder="RC-2026-0001" name="receiptNo" /></Field>
            <Field label="Empreinte imprimée (16 caractères ou plus)"><Input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="ex. 3fa1c09b…" className="font-mono" name="receiptHash" /></Field>
            <Button type="submit" loading={busy} icon={<SearchCheck className="size-4" />} data-testid="verify-submit">Vérifier</Button>
          </form>
        </Card>

        {res && !res.adv && <Card><div className="flex items-center gap-3"><ShieldAlert className="size-6" /><div><div className="font-semibold">Reçu introuvable</div><div className="text-[13.5px] text-muted">Aucun reçu « {no} » dans les données de cet appareil.</div></div></div></Card>}

        {res?.adv && res.check && (
          <Card className={cx("border-2", ok ? "border-brand-600" : "border-ink")}>
            <div className="mb-5 flex items-start gap-4" data-testid="verify-result" data-ok={ok ? "1" : "0"}>
              <span className={cx("grid size-12 shrink-0 place-items-center rounded-2xl text-white", ok ? "bg-brand-600" : "bg-ink")}>{ok ? <ShieldCheck className="size-6" /> : <ShieldAlert className="size-6" />}</span>
              <div>
                <div className="text-[19px] font-bold">{ok ? "Reçu authentique" : res.tampered ? "Falsification détectée" : "Reçu non conforme"}</div>
                <div className="text-[13.5px] text-muted">{ok ? "Le contenu n'a pas été modifié depuis sa signature." : res.tampered ? "Simulation : montant augmenté de 1 000 000 FCFA. L'empreinte recalculée ne correspond plus, la signature est rejetée." : "L'empreinte ou la signature ne correspond pas au contenu enregistré."}</div>
              </div>
            </div>
            <div className="mb-5 grid gap-2 sm:grid-cols-3">
              <Check ok={res.check.hashOk} label="Empreinte SHA-256" />
              <Check ok={res.check.signatureOk} label="Signature Ed25519" />
              <Check ok={res.check.printedOk} label="Empreinte imprimée" na="Non saisie" />
            </div>
            <KV items={[
              { k: "Reçu", v: res.adv.receiptNo },
              { k: "Contrat", v: c?.ref ?? "—" },
              { k: "Acheteur", v: sup?.name ?? "—" },
              { k: "Produit", v: c ? productLabel[c.product] : "—" },
              { k: "Montant", v: fcfa(res.tampered ? res.adv.amount + 1_000_000 : res.adv.amount) },
              { k: "Quantité · prix", v: `${tonnes(res.adv.qtyKg)} · ${prixKg(res.adv.unitPrice)}` },
              { k: "Date", v: date(res.adv.date) },
              { k: "Mode", v: modeLabel[res.adv.mode] },
            ]} />
            <div className="mt-5 space-y-2 rounded-2xl bg-canvas p-4 font-mono text-[11.5px] leading-relaxed break-all">
              <div><span className="font-sans font-semibold text-subtle">Empreinte enregistrée · </span>{res.adv.receiptHash}</div>
              <div><span className="font-sans font-semibold text-subtle">Empreinte recalculée · </span><span data-testid="recomputed">{res.check.recomputed}</span></div>
              <div><span className="font-sans font-semibold text-subtle">Signature · </span>{res.adv.receiptSignature}</div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {!res.tampered ? <Button variant="secondary" icon={<FlaskConical className="size-4" />} data-testid="btn-tamper" onClick={() => void check(true)}>Simuler une falsification</Button> : <Button variant="secondary" onClick={() => void check(false)}>Revenir au reçu d&apos;origine</Button>}
            </div>
          </Card>
        )}

        <Card>
          <CardTitle title="Clé et moteur cryptographique" icon={<KeyRound className="size-[18px]" />} />
          <KV items={[{ k: "Algorithmes", v: "SHA-256 · Ed25519" }, { k: "Moteur utilisé", v: <span data-testid="engine">{engine}</span> }]} />
          <div className="mt-3 rounded-xl bg-canvas p-3 font-mono text-[11.5px] break-all"><span className="font-sans font-semibold text-subtle">Clé publique · </span>{DEMO_PUBLIC_KEY_HEX}</div>
          <p className="mt-4 rounded-xl bg-ink px-4 py-3 text-[13px] leading-relaxed text-white" data-testid="demo-key-notice">
            <b>Clé de démonstration.</b> Dans cette maquette, la clé privée est embarquée dans l&apos;application pour fonctionner hors serveur. <b>En production, la signature est faite côté serveur</b> avec une clé conservée hors de la base (coffre de clés) ; seule la clé publique est diffusée, et la vérification interroge l&apos;API.
          </p>
          <p className="mt-3 text-[12px] text-subtle">Données fictives — démo. La vérification utilise les données présentes sur cet appareil.</p>
        </Card>
      </main>
    </div>
  );
}

function Check({ ok, label, na }: { ok?: boolean; label: string; na?: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13.5px]">
      <span className="font-semibold">{label}</span>
      {ok === undefined ? <Badge>{na}</Badge> : <Badge tone={ok ? "ok" : "err"}>{ok ? "Valide" : "Invalide"}</Badge>}
    </div>
  );
}
