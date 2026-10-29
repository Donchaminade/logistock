"use client";
import { useState } from "react";
import { Archive, ArchiveRestore, Package, Pencil, Plus } from "lucide-react";
import { confirm } from "@/components/alerts";
import { useApp } from "@/components/DataProvider";
import { Badge, Button, DataTable, Empty, Field, Input, Modal, PageHeader, Textarea } from "@/components/ui";
import { date, fcfa } from "@/lib/format";
import type { CatalogProduct } from "@/lib/types";
import { saveProduct, setProductArchived } from "@/services/actions";

export default function Produits() {
  const { db, me, run } = useApp();
  const [edit, setEdit] = useState<CatalogProduct | "new" | null>(null);
  const isPatron = me.role === "patron";
  const rows = (db.products ?? []).filter((p) => !p.deleted).sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || a.name.localeCompare(b.name, "fr"));
  const used = (id: string) => db.contracts.filter((c) => !c.deleted && c.product === id).length + db.needs.filter((n) => !n.deleted && n.product === id).length;
  return (
    <>
      <PageHeader title="Catalogue des produits" eyebrow="Patron"
        sub={isPatron ? "Vous créez ici vos produits (soja, cacao et autres). Partout ailleurs, l'équipe choisit simplement le produit dans cette liste." : "Liste des produits définie par le patron. Seul le patron peut la modifier."}
        actions={isPatron && <Button icon={<Plus className="size-4" />} onClick={() => setEdit("new")} data-testid="new-product">Nouveau produit</Button>} />
      <DataTable rows={rows} rowKey={(p) => p.id}
        empty={<Empty icon={<Package className="size-5" />} title="Aucun produit" text="Le patron doit créer au moins un produit." />}
        columns={[
          { key: "n", header: "Produit", mobile: "title", render: (p) => <span className="font-semibold">{p.name}</span> },
          { key: "c", header: "Catégorie", mobile: "sub", render: (p) => p.category ?? "—" },
          { key: "u", header: "Unité", mobile: "meta", render: (p) => p.unit },
          { key: "p", header: "Prix indicatif", align: "right", mobile: "meta", render: (p) => (p.price !== undefined ? `${fcfa(p.price)} / ${p.unit}` : "—") },
          { key: "x", header: "Utilisé", align: "right", mobile: "meta", render: (p) => `${used(p.id)} besoin(s)/contrat(s)` },
          { key: "s", header: "Statut", mobile: "value", render: (p) => (p.archived ? <Badge>Archivé</Badge> : <Badge tone="blue">Actif</Badge>) },
          { key: "d", header: "Créé le", mobile: "meta", render: (p) => date(p.createdAt) },
          { key: "a", header: "", mobile: "meta", render: (p) => (isPatron ? (
            <span className="inline-flex gap-1">
              <Button size="sm" variant="quiet" icon={<Pencil className="size-3.5" />} onClick={() => setEdit(p)} data-testid={`edit-${p.id}`}>Modifier</Button>
              <Button size="sm" variant="quiet" icon={p.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />} data-testid={`archive-${p.id}`} onClick={async () => {
                if (!p.archived && !(await confirm({ title: `Archiver ${p.name} ?`, html: "Il ne sera plus proposé dans les listes. L'historique (besoins, contrats) est conservé.", confirmText: "Archiver", dark: true }))) return;
                await run(() => setProductArchived(me, p.id, !p.archived), p.archived ? "Produit réactivé" : "Produit archivé");
              }}>{p.archived ? "Réactiver" : "Archiver"}</Button>
            </span>
          ) : null) },
        ]} />
      {edit && <ProductModal product={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ProductModal({ product, onClose }: { product?: CatalogProduct; onClose: () => void }) {
  const { me, run } = useApp();
  const [f, setF] = useState({ name: product?.name ?? "", unit: product?.unit ?? "kg", category: product?.category ?? "", price: product?.price !== undefined ? String(product.price) : "", description: product?.description ?? "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={product ? `Modifier ${product.name}` : "Nouveau produit"} sub="Le produit apparaîtra dans toutes les listes déroulantes « Produit »."
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button data-testid="product-submit" onClick={async () => {
        const price = f.price.trim() ? Math.round(Number(f.price.replace(",", "."))) : undefined;
        const r = await run(() => saveProduct(me, { id: product?.id, name: f.name, unit: f.unit, category: f.category, price, description: f.description }), product ? "Produit modifié" : "Produit créé", f.name);
        if (r) onClose();
      }}>{product ? "Enregistrer" : "Créer le produit"}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom du produit" className="sm:col-span-2"><Input value={f.name} onChange={set("name")} placeholder="ex. Maïs, Noix de cajou, Sésame" name="productName" /></Field>
        <Field label="Unité"><Input value={f.unit} onChange={set("unit")} placeholder="kg, sac, tonne" name="productUnit" /></Field>
        <Field label="Catégorie" hint="Facultatif"><Input value={f.category} onChange={set("category")} placeholder="ex. Céréales" name="productCategory" /></Field>
        <Field label="Prix indicatif (FCFA par unité)" hint="Facultatif" className="sm:col-span-2"><Input inputMode="numeric" value={f.price} onChange={set("price")} placeholder="ex. 250" name="productPrice" /></Field>
        <Field label="Description" hint="Facultatif" className="sm:col-span-2"><Textarea value={f.description} onChange={set("description")} name="productDescription" /></Field>
      </div>
    </Modal>
  );
}
