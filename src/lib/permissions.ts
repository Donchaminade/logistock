// Droits CRUD par rôle et par entité (§3.2 et §3.3), éditables par le patron dans « Rôles et droits ».
import type { DeleteMode, ManagedRole, Perm, PermEntity, PermMatrix, Role, User } from "./types";

export const ROLES: { key: Role; label: string; short: string; hint: string }[] = [
  { key: "patron", label: "Patron", short: "Patron", hint: "Client et financeur : voit tout, valide les actions sensibles." },
  { key: "admin", label: "Administrateur", short: "Admin", hint: "Comptes, paramètres, référentiels et journal ; assiste le patron." },
  { key: "gestionnaire", label: "Gestionnaire délégué", short: "Délégué", hint: "Crée et met à jour sans supprimer ; réceptionnaire sur place." },
  { key: "fournisseur", label: "Fournisseur", short: "Fournisseur", hint: "Acheteur de terrain : ses contrats, ses déclarations, son relevé." },
  { key: "magasinier", label: "Magasinier", short: "Magasin", hint: "Pointage à Lomé, pesées et réception des livraisons, stocks." },
  { key: "chauffeur", label: "Chauffeur", short: "Chauffeur", hint: "Ses trajets : chargements, étapes, arrivée à Lomé, frais du véhicule." },
  { key: "comptable", label: "Comptable", short: "Compta", hint: "Consulte et exporte, sans rien modifier." },
];
export const MANAGED_ROLES = ROLES.filter((r) => r.key !== "patron").map((r) => r.key as ManagedRole);

export const PERM_ENTITIES: { key: PermEntity; label: string; hint: string; group: string }[] = [
  { key: "utilisateurs", label: "Comptes utilisateurs et rôles", hint: "Création des comptes internes", group: "Administration" },
  { key: "fournisseurs", label: "Comptes fournisseurs", hint: "Création réservée au patron", group: "Administration" },
  { key: "droits", label: "Droits CRUD", hint: "Modification réservée au patron", group: "Administration" },
  { key: "parametres", label: "Paramètres", hint: "Seuils, commissions, arrondis, alertes", group: "Administration" },
  { key: "vehicules", label: "Véhicules et chauffeurs", hint: "Référentiel des matricules", group: "Administration" },
  { key: "lieux", label: "Lieux (origines, étapes)", hint: "Table réutilisable", group: "Administration" },
  { key: "besoins", label: "Besoins (étape 0)", hint: "Expression du besoin du patron", group: "Étape 0 et contrats" },
  { key: "propositions", label: "Propositions (étape 0)", hint: "Soumettre, retirer ; valider = patron", group: "Étape 0 et contrats" },
  { key: "contrats", label: "Contrats", hint: "Contrat à la remise", group: "Étape 0 et contrats" },
  { key: "remises", label: "Remises d'argent et reçus", hint: "Espèces, reçu PDF, photo", group: "Étape 0 et contrats" },
  { key: "revisions", label: "Révisions de prix", hint: "Hors patron : proposition seulement", group: "Étape 0 et contrats" },
  { key: "partielles", label: "Livraisons partielles", hint: "Mention, preuve, reliquat", group: "Étape 0 et contrats" },
  { key: "declarations", label: "Déclarations d'achats et de stock", hint: "Stock déclaré chez l'acheteur", group: "Terrain" },
  { key: "transports", label: "Ordres d'enlèvement et transports", hint: "Véhicule, chauffeur, trajet", group: "Terrain" },
  { key: "pointages", label: "Pointages à Lomé", hint: "Arrivée, matricule vérifié", group: "Terrain" },
  { key: "couts", label: "Coûts de transport", hint: "Débités au pointage", group: "Terrain" },
  { key: "traces", label: "Lots, traces et timeline", hint: "Étapes horodatées, réceptionnaire", group: "Terrain" },
  { key: "pesees", label: "Pesées et livraisons", hint: "Brut, tare, net ; réception", group: "Terrain" },
  { key: "dettes", label: "Remboursements et dettes", hint: "Échéanciers, remboursements", group: "Finances" },
  { key: "pertes", label: "Passage d'une dette en perte", hint: "Réservé au patron, signé", group: "Finances" },
  { key: "commissions", label: "Commissions", hint: "Calculée → validée → payée", group: "Finances" },
  { key: "charges", label: "Maintenance et charges", hint: "Dont frais véhicule des chauffeurs", group: "Finances" },
  { key: "actions", label: "Actions à confirmer", hint: "Soumettre ; valider = patron", group: "Contrôle" },
  { key: "tableau", label: "Tableau de bord global", hint: "Indicateurs consolidés", group: "Contrôle" },
  { key: "journal", label: "Journal d'audit", hint: "Lecture et vérification d'intégrité", group: "Contrôle" },
  { key: "exports", label: "Exports", hint: "Excel, PDF, rapport mensuel", group: "Contrôle" },
];

/** Actions qu'aucun réglage ne peut ouvrir à un autre rôle que le patron (règles du cahier). */
export const PATRON_ONLY: Partial<Record<PermEntity, ("c" | "u" | "d")[]>> = {
  fournisseurs: ["c", "u", "d"],
  droits: ["c", "u", "d"],
  pertes: ["c", "u", "d"],
};
export function isLocked(entity: PermEntity, action: "c" | "u" | "d") {
  return PATRON_ONLY[entity]?.includes(action) ?? false;
}

/** Notation compacte : « CRU » + mode de suppression ; « * » = limité à ses propres données. */
function p(spec: string, d: DeleteMode = "interdite"): Perm {
  return { c: spec.includes("C"), r: spec.includes("R"), u: spec.includes("U"), d, own: spec.includes("*") };
}
const NONE = p("");
const conf = "confirmation" as const;

/** Configuration par défaut (§3.2 et §3.3). D* = suppression via « actions à confirmer ». */
export function defaultPerms(): PermMatrix {
  const all = (fill: Perm) => Object.fromEntries(PERM_ENTITIES.map((e) => [e.key, { ...fill }])) as Record<PermEntity, Perm>;
  return {
    admin: {
      ...all(p("CRU", conf)),
      fournisseurs: p("R"), droits: p("R"), pertes: NONE, revisions: p("CR"), actions: p("R"), tableau: p("R"), journal: p("R"),
      declarations: p("R"), exports: p("CR"), dettes: p("CRU"), commissions: p("CRU"), charges: p("CRU"), couts: p("CRU"), parametres: p("CRU"), utilisateurs: p("CRU", conf),
    },
    gestionnaire: {
      ...all(NONE),
      fournisseurs: p("R"), besoins: p("R"), propositions: p("R"), contrats: p("CRU", conf), remises: p("CRU", conf), revisions: p("CR"),
      partielles: p("CRU", conf), declarations: p("R"), transports: p("CRU", conf), pointages: p("CRU", conf), couts: p("CR"),
      traces: p("CRU", conf), pesees: p("CRU", conf), dettes: p("CR"), charges: p("CR"), actions: p("CR"), tableau: p("R"),
      lieux: p("CRU"), vehicules: p("CR"),
    },
    fournisseur: {
      ...all(NONE),
      fournisseurs: p("R*"), besoins: p("R"), propositions: p("CRU*"), contrats: p("R*"), remises: p("R*"), revisions: p("RU*"),
      partielles: p("CR*"), declarations: p("CR*"), transports: p("R*"), pointages: p("R*"), couts: p("R*"), traces: p("CR*"),
      pesees: p("R*"), dettes: p("R*"), commissions: p("R*"), exports: p("R*"), lieux: p("R"),
    },
    magasinier: {
      ...all(NONE),
      contrats: p("R"), declarations: p("R"), transports: p("R"), pointages: p("CR"), traces: p("CR"), pesees: p("CRU", conf),
      lieux: p("R"), vehicules: p("R"),
    },
    chauffeur: {
      ...all(NONE),
      transports: p("RU*"), pointages: p("R*"), traces: p("CR*"), pesees: p("C*"), charges: p("C*"), lieux: p("R"), vehicules: p("R*"),
    },
    comptable: {
      ...all(p("R")),
      exports: p("CR"), droits: NONE, utilisateurs: NONE,
    },
  };
}

export type Action = "c" | "r" | "u" | "d";

/** Complète une matrice ancienne (versions précédentes de la démo) avec les valeurs par défaut. */
export function normalizePerms(m: Partial<Record<ManagedRole, Partial<Record<PermEntity, Perm>>>> | undefined): PermMatrix {
  const def = defaultPerms();
  for (const r of MANAGED_ROLES) for (const e of PERM_ENTITIES) {
    const v = m?.[r]?.[e.key];
    if (v) def[r][e.key] = { ...def[r][e.key], ...v, own: def[r][e.key].own };
  }
  return def;
}

/** Le patron a tous les droits ; les autres rôles suivent la matrice éditable. */
export function can(perms: PermMatrix, user: User | Role, entity: PermEntity, action: Action): boolean {
  const role = typeof user === "string" ? user : user.role;
  if (role === "patron") return true;
  if (action !== "r" && isLocked(entity, action)) return false;
  const e = perms[role]?.[entity];
  if (!e) return false;
  if (action === "d") return e.d !== "interdite";
  return e[action];
}

/** Portée « ses propres données » pour ce rôle et cette entité. */
export function ownOnly(perms: PermMatrix, user: User, entity: PermEntity): boolean {
  if (user.role === "patron") return false;
  return !!perms[user.role]?.[entity]?.own;
}

export function deleteMode(perms: PermMatrix, user: User, entity: PermEntity): DeleteMode {
  if (user.role === "patron") return "directe";
  if (isLocked(entity, "d")) return "interdite";
  const d = perms[user.role]?.[entity]?.d ?? "interdite";
  // Règle US-20 : jamais de suppression directe hors patron.
  return d === "directe" ? "confirmation" : d;
}
