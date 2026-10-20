// Socle des services métier : accès aux repositories, droits, journal d'audit chaîné (SHA-256),
// notifications et file hors ligne (outbox). Aucun accès direct au stockage.
import { dataSource } from "@/data";
import { uid } from "@/lib/hash";
import { auditHash, GENESIS } from "@/lib/integrity";
import { can, ownOnly } from "@/lib/permissions";
import type { Database, Id, PermEntity, Role, User } from "@/lib/types";
import { uuid } from "@/lib/crypto";
import { isOnline } from "./network";

export const ds = () => dataSource();
export const now = () => new Date().toISOString();
export const plain = (s: string) => s.replace(/\u00A0/g, " ");

export class ActionError extends Error {}
export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new ActionError(msg);
}
export const posInt = (n: number, label: string) => assert(Number.isInteger(n) && n > 0, `${label} doit être un entier strictement positif.`);

export async function db(): Promise<Database> {
  return ds().snapshot();
}
export async function settings() {
  return (await ds().repos.settings.get("settings"))!;
}
export async function perms() {
  return (await settings()).perms;
}
export async function requirePerm(me: User, entity: PermEntity, action: "c" | "r" | "u" | "d") {
  assert(can(await perms(), me, entity, action), "Vous n'avez pas le droit d'effectuer cette action. Le patron peut ajuster vos droits dans « Rôles et droits ».");
}
/** Droit + portée « ses propres données » quand la matrice l'impose. */
export async function requireOwn(me: User, entity: PermEntity, isMine: boolean) {
  if (ownOnly(await perms(), me, entity)) assert(isMine, "Cet élément ne vous concerne pas.");
}
export function requireRole(me: User, roles: Role[], msg: string) {
  assert(roles.includes(me.role), msg);
}

// ——— Réseau : opérations exigeant une connexion (§6.2) ———
export function requireOnline(what: string) {
  assert(isOnline(), `${what} exige une connexion : le serveur doit valider l'opération (§6.2). Réessayez au retour du réseau.`);
}

// ——— Mode différé : pendant une saisie hors ligne, les notifications sont retenues dans l'outbox ———
let deferred: Id[] | null = null;

export interface AuditGeo {
  lat?: number;
  lng?: number;
  accuracy?: number;
  positionNote?: string;
}

export async function audit(me: User | "system" | "lien", action: string, entity: string, entityId: Id | undefined, detail: string, values?: { before?: unknown; after?: unknown; geo?: AuditGeo }) {
  const list = await ds().repos.audit.list();
  const prevHash = list[list.length - 1]?.hash ?? GENESIS;
  const base = {
    at: now(), by: typeof me === "string" ? me : me.id, action, entity, entityId, detail: plain(detail),
    before: values?.before === undefined ? undefined : JSON.stringify(values.before),
    after: values?.after === undefined ? undefined : JSON.stringify(values.after),
    device: `${ds().device.id().slice(0, 11)}${isOnline() ? "" : " · hors ligne"}`,
    lat: values?.geo?.lat,
    lng: values?.geo?.lng,
    accuracy: values?.geo?.accuracy,
    positionNote: values?.geo?.positionNote,
  };
  await ds().repos.audit.create({ id: uid("au"), ...base, prevHash, hash: await auditHash(prevHash, base) });
}

export async function notify(me: User | "system", to: Role | Id, title: string, body: string, link?: string) {
  const id = uid("nt");
  await ds().repos.notifications.create({ id, to, title, body: plain(body), link, at: now(), by: me === "system" ? "system" : me.id, readBy: [], deferred: deferred ? true : undefined });
  deferred?.push(id);
}

/**
 * Exécute une opération autorisée hors ligne. Sans réseau : l'écriture est faite sur l'appareil,
 * une entrée est ajoutée à l'outbox (clé d'idempotence = UUID) et les notifications attendent la synchronisation.
 */
export async function offlineCapable<T>(me: User, label: string, fn: (clientUuid: string) => Promise<T>): Promise<T> {
  const clientUuid = uuid();
  if (isOnline()) return fn(clientUuid);
  deferred = [];
  try {
    const r = await fn(clientUuid);
    await ds().repos.outbox.create({ id: uid("ob"), uuid: clientUuid, label: plain(label), by: me.id, at: now(), device: ds().device.id(), status: "en_attente", notificationIds: deferred });
    return r;
  } finally {
    deferred = null;
  }
}

/** Envoi de la file d'attente dans l'ordre, au retour du réseau (idempotent : une entrée déjà synchronisée est ignorée). */
export async function syncOutbox(): Promise<number> {
  if (!isOnline()) return 0;
  const device = ds().device.id();
  const items = (await ds().repos.outbox.list()).filter((o) => o.status === "en_attente" && o.device === device).sort((a, b) => a.at.localeCompare(b.at));
  for (const o of items) {
    for (const nid of o.notificationIds) {
      const n = await ds().repos.notifications.get(nid);
      if (n?.deferred) await ds().repos.notifications.update(nid, { deferred: false, at: now() });
    }
    await ds().repos.outbox.update(o.id, { status: "synchronise", syncedAt: now() });
  }
  if (items.length) {
    const by = items[0]!.by;
    const u = await ds().repos.users.get(by);
    if (u) await audit(u, "Synchronisation", "outbox", undefined, `${items.length} opération(s) saisie(s) hors ligne envoyée(s)`);
  }
  return items.length;
}

export async function nextRef(prefix: string, values: string[]) {
  const year = new Date().getFullYear();
  const nums = values.map((v) => Number(v.split("-").pop())).filter((n) => !Number.isNaN(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${year}-${String(n).padStart(prefix === "RC" ? 4 : 3, "0")}`;
}

export async function ensureLocation(me: User, name: string, type: "origine" | "etape" | "destination" | "autre") {
  const n = name.trim();
  if (!n) return;
  const list = await ds().repos.locations.list();
  if (list.some((l) => l.name.toLowerCase() === n.toLowerCase() && !l.deleted)) return;
  await ds().repos.locations.create({ id: uid("lo"), name: n, type, country: /bénin/i.test(n) ? "Bénin" : "Togo", createdBy: me.id });
}

export function roleTitle(u: User) {
  return { patron: "Patron", admin: "Administrateur", gestionnaire: "Gestionnaire délégué", fournisseur: "Fournisseur", magasinier: "Magasinier", chauffeur: "Chauffeur", comptable: "Comptable" }[u.role];
}
