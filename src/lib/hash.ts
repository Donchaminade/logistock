import { uuid } from "./crypto";

/** Identifiant d'enregistrement : préfixe lisible + UUID généré sur l'appareil (clé d'idempotence). */
export function uid(prefix: string): string {
  return `${prefix}-${uuid()}`;
}

/** Forme courte d'une empreinte pour l'affichage (le hash complet reste stocké). */
export function short(hash: string, n = 12): string {
  return hash ? `${hash.slice(0, n).toUpperCase()}…` : "—";
}
