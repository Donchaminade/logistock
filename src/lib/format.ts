const NBSP = "\u00A0";

export function group(n: number, sep = NBSP): string {
  const sign = n < 0 ? "−" : "";
  return sign + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** 1 234 567 FCFA (entiers, séparateur espace, sans décimales). */
export function fcfa(n: number, sep = NBSP): string {
  return `${group(n, sep)}${sep}FCFA`;
}

export function kg(n: number): string {
  return `${group(n)}${NBSP}kg`;
}

/** Tonnes avec jusqu'à trois décimales, virgule française. */
export function tonnes(nKg: number, sep = NBSP): string {
  const t = nKg / 1000;
  const s = (Math.round(t * 1000) / 1000).toString().split(".");
  const ent = group(Number(s[0]), sep);
  return `${ent}${s[1] ? "," + s[1] : ""}${sep}t`;
}

export function prixKg(n: number, sep = NBSP): string {
  return `${group(n, sep)}${sep}FCFA/kg`;
}

const TZ = "Africa/Lome";
export function date(iso?: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}
export function dateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const t = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${date(iso)} à ${t.replace(":", " h ")}`;
}
export function relative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  const d = Math.floor(diff / 86400);
  return d === 1 ? "hier" : d < 30 ? `il y a ${d} jours` : date(iso);
}

// Libellés des produits : alimentés par le catalogue du patron (DataProvider), repli lisible sinon.
const catalogNames = new Map<string, string>([["soja", "Soja"], ["cacao", "Cacao"]]);
export function setProductCatalog(list: { id: string; name: string }[]) {
  for (const p of list) catalogNames.set(p.id, p.name);
}
export const productName = (id: string | undefined | null) => (id ? catalogNames.get(id) ?? id.charAt(0).toUpperCase() + id.slice(1) : "—");
export const productLabel: Record<string, string> = new Proxy({} as Record<string, string>, { get: (_t, k) => (typeof k === "string" ? productName(k) : undefined) });
export const modeLabel = { especes: "Espèces", virement: "Virement", flooz: "Flooz", tmoney: "T-Money", autre: "Autre" } as const;
export const roleLabel = {
  patron: "Patron", admin: "Administrateur", gestionnaire: "Gestionnaire délégué", fournisseur: "Fournisseur",
  magasinier: "Magasinier", chauffeur: "Chauffeur", comptable: "Comptable",
} as const;

/** Valeur ISO pour un <input type="datetime-local"> (heure de Lomé = UTC). */
export function toLocalInput(iso: string): string {
  return iso.slice(0, 16);
}
export function fromLocalInput(v: string): string {
  return new Date(v + (v.length === 16 ? ":00Z" : "")).toISOString();
}
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

/** Description lisible d'une règle de commission. */
export function ruleText(r: { mode: "par_kg" | "pourcentage" | "forfait"; value: number }) {
  return r.mode === "par_kg" ? `${r.value} FCFA/kg livré` : r.mode === "pourcentage" ? `${(r.value / 100).toLocaleString("fr-FR")} % de la valeur livrée` : `${fcfa(r.value)} par contrat`;
}
