import type { Perm, PermEntity, PermMatrix, Role, User } from "./types";

export const PERM_ENTITIES: { key: PermEntity; label: string; hint: string }[] = [
  { key: "fournisseurs", label: "Comptes fournisseurs", hint: "Création réservée au patron" },
  { key: "besoins", label: "Besoins et propositions", hint: "Étape 0" },
  { key: "contrats", label: "Contrats", hint: "Contrat à la remise" },
  { key: "remises", label: "Remises d'argent et reçus", hint: "Espèces, reçu PDF, photo" },
  { key: "transports", label: "Transports", hint: "Tonnes, matricule, chauffeur" },
  { key: "pointages", label: "Pointages à Lomé", hint: "Arrivée et coûts de transport" },
  { key: "traces", label: "Lots et événements de trace", hint: "Étapes horodatées, réceptionnaire" },
  { key: "partielles", label: "Livraisons partielles", hint: "Mention, preuve, reliquat" },
  { key: "lieux", label: "Lieux (origines, étapes)", hint: "Table réutilisable" },
];

const p = (c: boolean, r: boolean, u: boolean, d: Perm["d"]): Perm => ({ c, r, u, d });

/** Configuration par défaut (§3.3). */
export function defaultPerms(): PermMatrix {
  return {
    gestionnaire: {
      fournisseurs: p(false, true, false, "interdite"),
      besoins: p(false, true, false, "interdite"),
      contrats: p(true, true, true, "confirmation"),
      remises: p(true, true, true, "confirmation"),
      transports: p(true, true, true, "confirmation"),
      pointages: p(true, true, true, "confirmation"),
      traces: p(true, true, true, "confirmation"),
      partielles: p(true, true, true, "confirmation"),
      lieux: p(true, true, true, "interdite"),
    },
    fournisseur: {
      fournisseurs: p(false, true, false, "interdite"),
      besoins: p(false, true, false, "interdite"),
      contrats: p(false, true, false, "interdite"),
      remises: p(false, true, false, "interdite"),
      transports: p(false, true, false, "interdite"),
      pointages: p(false, true, false, "interdite"),
      traces: p(true, true, false, "interdite"),
      partielles: p(true, true, false, "interdite"),
      lieux: p(false, true, false, "interdite"),
    },
  };
}

export type Action = "c" | "r" | "u" | "d";

/** Le patron a tous les droits ; les autres rôles suivent la matrice éditable. */
export function can(perms: PermMatrix, user: User | Role, entity: PermEntity, action: Action): boolean {
  const role = typeof user === "string" ? user : user.role;
  if (role === "patron") return true;
  const e = perms[role][entity];
  if (action === "d") return e.d !== "interdite";
  return e[action];
}

export function deleteMode(perms: PermMatrix, user: User, entity: PermEntity): Perm["d"] {
  if (user.role === "patron") return "directe";
  return perms[user.role][entity].d;
}
