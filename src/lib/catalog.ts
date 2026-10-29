// Catalogue des produits du patron : seule source des listes de choix « Produit ».
import type { CatalogProduct, Database } from "./types";

const DEFAULTS: Record<string, Pick<CatalogProduct, "name" | "unit" | "category">> = {
  soja: { name: "Soja", unit: "kg", category: "Oléagineux" },
  cacao: { name: "Cacao", unit: "kg", category: "Fèves" },
};

/** Identifiant stable dérivé du nom (« Noix de cajou » → « noix-de-cajou »). */
export function slugify(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "produit";
}

/** Produits proposés dans les listes (non archivés, non supprimés), triés par nom. */
export function activeProducts(db: Pick<Database, "products">, keep?: string) {
  return (db.products ?? []).filter((p) => !p.deleted && (!p.archived || p.id === keep)).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * Migration des données antérieures au catalogue : chaque produit déjà utilisé (besoins, contrats,
 * prix de revente) devient une entrée du catalogue avec le même identifiant, donc aucune référence ne casse.
 * Retourne true si la base a été modifiée.
 */
export function migrateCatalog(db: Database): boolean {
  if (!Array.isArray(db.products)) db.products = [];
  const known = new Set(db.products.map((p) => p.id));
  const used = new Set<string>(["soja", "cacao"]);
  for (const n of db.needs ?? []) if (n.product) used.add(n.product);
  for (const c of db.contracts ?? []) if (c.product) used.add(c.product);
  for (const k of Object.keys(db.settings?.[0]?.resalePrice ?? {})) used.add(k);
  let changed = false;
  if (db.products.length && !used.size) return false;
  for (const id of used) {
    if (known.has(id)) continue;
    // Pas de catalogue du tout : on crée soja et cacao ; sinon seulement les produits réellement utilisés.
    if (db.products.length && !DEFAULTS[id] && !isUsed(db, id)) continue;
    const d = DEFAULTS[id] ?? { name: id.charAt(0).toUpperCase() + id.slice(1), unit: "kg" };
    db.products.push({ id, ...d, createdAt: new Date().toISOString(), description: "Repris des données existantes." });
    known.add(id);
    changed = true;
  }
  return changed;
}

function isUsed(db: Database, id: string) {
  return (db.needs ?? []).some((n) => n.product === id) || (db.contracts ?? []).some((c) => c.product === id);
}
