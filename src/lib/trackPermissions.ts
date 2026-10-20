// Droits de suivi et de partage, vitesse et validité d'un lien.
// Fonctions pures : testées sans navigateur, appelées par le service avant toute écriture.

export const EMPLOYEE_ROLES = ["admin", "gestionnaire", "comptable", "magasinier", "chauffeur"] as const;

export const TRACK_DAYS = 30;
export const SHARE_MAX_HOURS = 24;
export const SHARE_DEFAULT_HOURS = 2;

export type MarkerChoice = "auto" | "marche" | "course" | "moto" | "voiture";
export type MotionClip = "idle" | "walk" | "run" | "moto" | "car";

export interface SpeedThresholds {
  stopMps: number;
  walkMps: number;
  fastMps: number;
}

export const DEFAULT_SPEED: SpeedThresholds = { stopMps: 0.5, walkMps: 1.8, fastMps: 7 };

export interface TrackActor {
  id: string;
  role: string;
}

export interface TrackSubject extends TrackActor {
  managerId?: string;
}

export interface TrackDecision {
  ok: boolean;
  reason: string;
}

const EMPLOYEES = new Set<string>(EMPLOYEE_ROLES);

export function isEmployeeRole(role: string) {
  return EMPLOYEES.has(role);
}

/** Le patron suit tous les employés. Un gestionnaire, seulement son équipe. Un comptable, seulement le périmètre fixé par le patron. */
export function canTrackUser(actor: TrackActor, subject: TrackSubject, comptableScope: readonly string[]): TrackDecision {
  if (actor.id === subject.id) return { ok: false, reason: "Vous ne pouvez pas activer un suivi sur votre propre compte." };
  if (!isEmployeeRole(subject.role)) return { ok: false, reason: "Le suivi concerne les employés côté acheteur, pas les comptes fournisseurs ni le patron." };
  if (actor.role === "patron") return { ok: true, reason: "" };
  if (actor.role === "gestionnaire") {
    if (subject.managerId === actor.id) return { ok: true, reason: "" };
    return { ok: false, reason: "Un gestionnaire ne suit que les employés rattachés à son équipe." };
  }
  if (actor.role === "comptable") {
    if (comptableScope.includes(subject.id)) return { ok: true, reason: "" };
    return { ok: false, reason: "Ce compte est hors du périmètre de suivi configuré par le patron." };
  }
  return { ok: false, reason: "Votre rôle ne permet pas d'activer un suivi de localisation." };
}

/** Partage d'un lien : le patron, ou un utilisateur qu'il a explicitement autorisé sur ce suivi. */
export function canShareTrack(actor: TrackActor, authorizedIds: readonly string[]): TrackDecision {
  if (actor.role === "patron" || authorizedIds.includes(actor.id)) return { ok: true, reason: "" };
  return { ok: false, reason: "Seul le patron, ou une personne qu'il a explicitement autorisée, peut partager ce suivi." };
}

export function clampShareHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return SHARE_DEFAULT_HOURS;
  return Math.min(SHARE_MAX_HOURS, hours);
}

export function shareLive(
  share: { revokedAt?: string; expiresAt: string },
  track: { active: boolean; expiresAt: string } | null | undefined,
  nowIso: string,
) {
  if (!track?.active) return false;
  if (share.revokedAt) return false;
  if (share.expiresAt <= nowIso) return false;
  if (track.expiresAt <= nowIso) return false;
  return true;
}

/** Choix du modèle, puis repli au repos quand la position est stable. */
export function motionFor(speedMps: number, choice: MarkerChoice, thresholds: SpeedThresholds = DEFAULT_SPEED): MotionClip {
  const moving = speedMps >= thresholds.stopMps;
  if (choice === "moto") return "moto";
  if (choice === "voiture") return "car";
  if (!moving) return "idle";
  if (choice === "marche") return "walk";
  if (choice === "course") return "run";
  if (speedMps < thresholds.walkMps) return "walk";
  if (speedMps < thresholds.fastMps) return "run";
  return "moto";
}

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function speedMps(a: { lat: number; lng: number; at: string }, b: { lat: number; lng: number; at: string }) {
  const dt = (new Date(b.at).getTime() - new Date(a.at).getTime()) / 1000;
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return haversineM(a, b) / dt;
}

/** Cap en degrés, 0 = nord, sens horaire. */
export function headingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) * 180) / Math.PI;
}
