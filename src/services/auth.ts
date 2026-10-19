// Connexion (US-01) : mot de passe, blocage après N échecs, code PIN par appareil autorisé (hors ligne compris).
import { sha256Hex, uuid } from "@/lib/crypto";
import { dateTime } from "@/lib/format";
import { bestPhoneMatch, displayPhone, normEmail } from "@/lib/identity";
import type { Id, User } from "@/lib/types";
import { assert, audit, ds, notify, now, requireOnline, settings } from "./core";
import { isOnline } from "./network";
/** Rôles invités à définir un PIN dès la première connexion (usage sur téléphone, terrain). */
export const MOBILE_ROLES = ["fournisseur", "chauffeur", "magasinier", "gestionnaire"] as const;

export class LockedError extends Error {
  constructor(public until: string, msg: string) {
    super(msg);
  }
}

export async function login(identifier: string, password: string): Promise<User> {
  assert(isOnline(), "Hors ligne, la connexion par mot de passe est impossible : déverrouillez avec votre code PIN sur un appareil déjà autorisé.");
  const users = (await ds().repos.users.list()).filter((x) => !x.deleted);
  const raw = identifier.trim();
  const byEmail = raw.includes("@");
  const u = byEmail
    ? users.find((x) => x.email && normEmail(x.email) === normEmail(raw))
    : bestPhoneMatch(users, raw, (x) => x.phone);
  assert(u, "E-mail, numéro ou mot de passe incorrect.");
  const s = await settings();
  if (u.lockedUntil && u.lockedUntil > now()) {
    const min = Math.ceil((new Date(u.lockedUntil).getTime() - Date.now()) / 60000);
    throw new LockedError(u.lockedUntil, `Compte temporairement bloqué après ${s.maxFailedLogins} échecs. Réessayez dans ${min} min (vers ${dateTime(u.lockedUntil)}) ou demandez à l'administrateur de le débloquer.`);
  }
  if (u.password !== password) {
    const failed = (u.lockedUntil ? 0 : u.failedAttempts ?? 0) + 1;
    if (failed >= s.maxFailedLogins) {
      const until = new Date(Date.now() + s.lockMinutes * 60000).toISOString();
      await ds().repos.users.update(u.id, { failedAttempts: failed, lockedUntil: until });
      await audit("system", "Compte bloqué", "users", u.id, `${u.name} · ${failed} échecs consécutifs · bloqué ${s.lockMinutes} min`);
      for (const to of ["admin", "patron"] as const)
        await notify("system", to, "Compte bloqué", `${u.name} (${displayPhone(u.phone)}) : ${failed} échecs de connexion consécutifs. Compte bloqué ${s.lockMinutes} min.`, "/utilisateurs/");
      throw new LockedError(until, `Cinq échecs consécutifs : compte bloqué ${s.lockMinutes} minutes. L'administrateur a été alerté.`);
    }
    await ds().repos.users.update(u.id, { failedAttempts: failed, lockedUntil: undefined });
    const left = s.maxFailedLogins - failed;
    throw new Error(`E-mail, numéro ou mot de passe incorrect. ${left} essai${left > 1 ? "s" : ""} avant blocage temporaire.`);
  }
  assert(u.active, "Ce compte est désactivé. Contactez l'administrateur ou le patron.");
  await ds().repos.users.update(u.id, { failedAttempts: 0, lockedUntil: undefined });
  ds().session.set(u.id);
  await audit(u, "Connexion", "users", u.id, `${u.name} s'est connecté(e)`);
  return u;
}

export function logout() {
  ds().session.set(null);
}

export async function unlockUser(me: User, id: Id) {
  assert(me.role === "patron" || me.role === "admin", "Seuls l'administrateur et le patron débloquent un compte.");
  requireOnline("La gestion des comptes");
  const u = (await ds().repos.users.get(id))!;
  await ds().repos.users.update(id, { failedAttempts: 0, lockedUntil: undefined });
  await audit(me, "Déblocage de compte", "users", id, u.name, { before: { lockedUntil: u.lockedUntil }, after: { lockedUntil: null } });
  await notify(me, id, "Compte débloqué", `${me.name} a débloqué votre compte.`);
}

export async function changePassword(me: User, pwd: string) {
  assert(pwd.length >= 6, "Le mot de passe doit contenir au moins 6 caractères.");
  await ds().repos.users.update(me.id, { password: pwd, mustChangePassword: false });
  await audit(me, "Changement de mot de passe", "users", me.id, `${me.name} a changé son mot de passe`);
}

// ——— Code PIN par appareil ———
const deviceKey = (userId: Id) => `${ds().device.id()}:${userId}`;

export async function setPin(me: User, pin: string) {
  assert(/^\d{4,6}$/.test(pin), "Le code PIN doit comporter 4 à 6 chiffres.");
  assert(!/^(\d)\1+$/.test(pin) && !["1234", "123456", "0000"].includes(pin), "Choisissez un code moins évident.");
  const salt = uuid();
  const pinHash = await sha256Hex(`${salt}|${pin}`);
  const id = deviceKey(me.id);
  const existing = await ds().repos.devices.get(id);
  const label = typeof navigator !== "undefined" && /Mobi|Android/i.test(navigator.userAgent) ? "Téléphone" : "Ordinateur ou tablette";
  if (existing) await ds().repos.devices.update(id, { pinHash, salt, failedPins: 0, deleted: false, authorizedAt: now() });
  else await ds().repos.devices.create({ id, userId: me.id, label, pinHash, salt, authorizedAt: now(), failedPins: 0 });
  await audit(me, "Code PIN défini", "devices", id, `${label} autorisé`);
}

/** Comptes déjà autorisés sur cet appareil (proposés à l'écran de connexion). */
export async function pinUsers(): Promise<User[]> {
  const prefix = `${ds().device.id()}:`;
  const devices = (await ds().repos.devices.list()).filter((d) => d.id.startsWith(prefix) && !d.deleted);
  const users = await ds().repos.users.list();
  return devices.map((d) => users.find((u) => u.id === d.userId)).filter((u): u is User => !!u && u.active && !u.deleted);
}

export async function hasPin(me: User) {
  const d = await ds().repos.devices.get(deviceKey(me.id));
  return !!d && !d.deleted;
}

export async function unlockWithPin(userId: Id, pin: string): Promise<User> {
  const id = deviceKey(userId);
  const d = await ds().repos.devices.get(id);
  assert(d && !d.deleted, "Cet appareil n'est plus autorisé : connectez-vous avec votre mot de passe.");
  const u = (await ds().repos.users.get(userId))!;
  assert(u.active, "Ce compte est désactivé.");
  assert(!(u.lockedUntil && u.lockedUntil > now()), "Compte temporairement bloqué : réessayez plus tard.");
  if ((await sha256Hex(`${d.salt}|${pin}`)) !== d.pinHash) {
    const failed = d.failedPins + 1;
    if (failed >= 5) {
      await ds().repos.devices.update(id, { failedPins: failed, deleted: true });
      await audit("system", "PIN révoqué", "devices", id, `${u.name} · 5 codes PIN erronés`);
      throw new Error("Cinq codes PIN erronés : l'autorisation de cet appareil est retirée. Reconnectez-vous avec votre mot de passe.");
    }
    await ds().repos.devices.update(id, { failedPins: failed });
    throw new Error(`Code PIN incorrect. ${5 - failed} essai(s) restant(s).`);
  }
  await ds().repos.devices.update(id, { failedPins: 0, lastUnlockAt: now() });
  ds().session.set(u.id);
  await audit(u, "Déverrouillage par PIN", "devices", id, `${u.name}${isOnline() ? "" : " · hors ligne"}`);
  return u;
}

export async function revokeDevice(me: User, id: Id) {
  const d = (await ds().repos.devices.get(id))!;
  assert(me.role === "patron" || me.role === "admin" || d.userId === me.id, "Action non autorisée.");
  await ds().repos.devices.update(id, { deleted: true });
  await audit(me, "Appareil retiré", "devices", id, d.label);
}
