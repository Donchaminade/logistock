// Localisation : consentement, journal de connexion, position sur les écritures sensibles,
// suivi de sécurité et liens de consultation. Aucun accès direct au stockage.
// Prêt à être remplacé par les ressources HTTP (location-consents, login-logs, location-tracks,
// location-positions, location-shares) : l'interface n'appelle que ces fonctions.
import { uuid } from "@/lib/crypto";
import { uid } from "@/lib/hash";
import { consentGranted, LOCATION_POLICY_VERSION } from "@/lib/locationPolicy";
import {
  canShareTrack, canTrackUser, clampShareHours, DEFAULT_SPEED, headingDeg, shareLive, speedMps, TRACK_DAYS,
  type MarkerChoice, type TrackSubject,
} from "@/lib/trackPermissions";
import type { AuditGeo } from "./core";
import type { Database, GeoPing, Id, LocationTrack, TrackShare, User } from "@/lib/types";
import { ActionError, assert, audit, ds, notify, now, requirePerm, settings } from "./core";

const NOTE: Record<string, string> = {
  refusee: "La localisation a été refusée par le navigateur. Autorisez-la dans les réglages du site pour joindre la position.",
  indisponible: "La localisation n'est pas disponible sur cet appareil.",
  timeout: "La localisation n'a pas répondu à temps.",
};

const notices: string[] = [];
export function pushGeoNotice(message: string) {
  notices.push(message);
}
/** Consommé par l'interface après une écriture : un seul message à la fois. */
export function pullGeoNotice() {
  return notices.shift();
}

export interface Fix {
  status: "ok" | "refusee" | "indisponible" | "timeout";
  lat?: number;
  lng?: number;
  accuracy?: number;
}

export function readPosition(timeout = 4000): Promise<Fix> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ status: "indisponible" });
      return;
    }
    let done = false;
    const finish = (f: Fix) => {
      if (done) return;
      done = true;
      resolve(f);
    };
    const timer = setTimeout(() => finish({ status: "timeout" }), timeout + 250);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        finish({ status: "ok", lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) });
      },
      (e) => {
        clearTimeout(timer);
        finish({ status: e.code === 1 ? "refusee" : e.code === 3 ? "timeout" : "indisponible" });
      },
      { enableHighAccuracy: true, timeout, maximumAge: 15000 },
    );
  });
}

function ua() {
  return typeof navigator === "undefined" ? "inconnu" : navigator.userAgent.slice(0, 280);
}

const geoCache = new Map<string, { at: number; geo: AuditGeo }>();

/** Position exigée pour une remise, une transmission ou une modification de compte. */
export async function journalGeo(me: User): Promise<AuditGeo> {
  const list = await ds().repos.consents.list();
  if (!consentGranted(list, me.id)) {
    throw new ActionError("Le consentement à la localisation est absent ou retiré. Ouvrez Confidentialité / localisation pour l'accepter de nouveau.");
  }
  const hit = geoCache.get(me.id);
  if (hit && Date.now() - hit.at < 20000) return hit.geo;
  const fix = await readPosition();
  let geo: AuditGeo;
  if (fix.status === "ok") geo = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy };
  else {
    const note = NOTE[fix.status] ?? NOTE.indisponible!;
    pushGeoNotice(note);
    geo = { positionNote: note };
  }
  geoCache.set(me.id, { at: Date.now(), geo });
  return geo;
}

export async function acceptConsent(me: User, signature: string) {
  assert(signature.startsWith("data:image/png"), "La signature dessinée est obligatoire.");
  assert(signature.length > 80, "Signez dans le cadre avant d'accepter.");
  const at = now();
  await ds().repos.consents.create({
    id: uid("cs"), userId: me.id, policyVersion: LOCATION_POLICY_VERSION, granted: true, at, userAgent: ua(), signature,
  });
  await audit(me, "Consentement à la localisation", "location-consents", me.id, `Version ${LOCATION_POLICY_VERSION} acceptée`);
  const logs = (await ds().repos.loginLogs.list())
    .filter((l) => l.userId === me.id && l.success && l.positionStatus === "sans_consentement")
    .sort((a, b) => b.at.localeCompare(a.at));
  const last = logs[0];
  if (last) {
    const fix = await readPosition();
    if (fix.status === "ok") {
      await ds().repos.loginLogs.update(last.id, { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, positionStatus: "ok" });
    } else {
      await ds().repos.loginLogs.update(last.id, { positionStatus: fix.status, reason: [last.reason, NOTE[fix.status]].filter(Boolean).join(" ") });
    }
  }
}

export async function withdrawConsent(me: User) {
  await ds().repos.consents.create({
    id: uid("cs"), userId: me.id, policyVersion: LOCATION_POLICY_VERSION, granted: false, at: now(), userAgent: ua(),
  });
  await markOffline(me.id);
  await audit(me, "Retrait du consentement", "location-consents", me.id, `Version ${LOCATION_POLICY_VERSION}`);
  await notify(me, "patron", "Consentement retiré", `${me.name} a retiré son consentement à la localisation.`, "/consentements/");
}

export interface ConnectionInput {
  user?: User | null;
  account: string;
  success: boolean;
  reason?: string;
  method: "mot_de_passe" | "pin";
}

/** Journal de connexion. La position n'est lue que si la personne a déjà consenti. */
export async function logConnection(input: ConnectionInput): Promise<AuditGeo | undefined> {
  const consented = input.user ? consentGranted(await ds().repos.consents.list(), input.user.id) : false;
  let status: "ok" | "refusee" | "indisponible" | "timeout" | "sans_consentement" = "sans_consentement";
  let lat: number | undefined;
  let lng: number | undefined;
  let accuracy: number | undefined;
  let extra = "";
  if (consented && input.user) {
    const fix = await readPosition();
    status = fix.status;
    lat = fix.lat;
    lng = fix.lng;
    accuracy = fix.accuracy;
    if (fix.status !== "ok") {
      extra = NOTE[fix.status] ?? "";
      if (!input.success) pushGeoNotice(extra);
    }
  }
  const reason = [input.reason, extra].filter(Boolean).join(" ") || undefined;
  await ds().repos.loginLogs.create({
    id: uid("ll"),
    userId: input.user?.id,
    account: input.account,
    at: now(),
    success: input.success,
    reason,
    method: input.method,
    lat, lng, accuracy,
    positionStatus: status,
    userAgent: ua(),
  });
  if (input.success && input.user) await notifyTrackersOfLogin(input.user);
  if (status === "ok") return { lat, lng, accuracy };
  return undefined;
}

async function notifyTrackersOfLogin(user: User) {
  const iso = now();
  const tracks = (await ds().repos.tracks.list()).filter((t) => t.subjectId === user.id && t.active && !t.deleted && t.expiresAt > iso);
  if (!tracks.length) return;
  const users = await ds().repos.users.list();
  for (const t of tracks) {
    const tracker = users.find((u) => u.id === t.by);
    await notify(user, t.by, "Connexion pendant un suivi", `${user.name} vient de se connecter. La position est partagée tant que l'application reste ouverte.`, `/suivi/?id=${user.id}`);
    if (tracker && tracker.role !== "patron") {
      await notify(user, "patron", "Connexion pendant un suivi", `${user.name} s'est connecté(e). Suivi ouvert par ${tracker.name}.`, `/suivi/?id=${user.id}`);
    }
  }
}

function subjectOf(u: User): TrackSubject {
  return { id: u.id, role: u.role, managerId: u.managerId };
}

export async function expireTracks() {
  const iso = now();
  const tracks = (await ds().repos.tracks.list()).filter((t) => t.active && !t.deleted && t.expiresAt <= iso);
  for (const t of tracks) await endTrack(t, "system", "Fin automatique au bout de 30 jours");
}

async function endTrack(t: LocationTrack, by: Id | "system", reason: string) {
  const at = now();
  await ds().repos.tracks.update(t.id, { active: false, endedAt: at, endedBy: by, endReason: reason });
  const shares = (await ds().repos.shares.list()).filter((s) => s.trackId === t.id && !s.revokedAt && !s.deleted);
  const actor = by === "system" ? "system" : ((await ds().repos.users.get(by)) ?? "system");
  for (const s of shares) {
    await ds().repos.shares.update(s.id, { revokedAt: at, revokedBy: by === "system" ? undefined : by });
    await audit(actor, "Révocation du lien de suivi", "location-shares", s.id, `${s.recipientName} · le suivi est terminé · ${reason}`);
  }
  const subject = await ds().repos.users.get(t.subjectId);
  await audit(actor, by === "system" ? "Fin automatique du suivi" : "Arrêt du suivi", "location-tracks", t.id, `${subject?.name ?? t.subjectId} · ${reason}`);
  if (subject) await notify(actor, subject.id, "Suivi arrêté", `Le suivi de localisation est terminé. ${reason}`, "/confidentialite/");
}

export async function startTrack(me: User, subjectId: Id, reason: string) {
  assert(reason.trim().length >= 3, "Le motif est obligatoire (3 caractères au moins).");
  const subject = await ds().repos.users.get(subjectId);
  assert(subject && !subject.deleted, "Compte introuvable.");
  const s = await settings();
  const decision = canTrackUser(me, subjectOf(subject), s.comptableTrackScope);
  assert(decision.ok, decision.reason);
  await expireTracks();
  const iso = now();
  const existing = (await ds().repos.tracks.list()).find((t) => t.subjectId === subjectId && t.active && !t.deleted && t.expiresAt > iso);
  assert(!existing, "Un suivi est déjà actif pour ce compte.");
  const expiresAt = new Date(Date.now() + TRACK_DAYS * 86400000).toISOString();
  const track: LocationTrack = {
    id: uid("tk"), subjectId, by: me.id, reason: reason.trim(), startedAt: iso, expiresAt, active: true, markerMode: "auto", shareUserIds: [],
  };
  await ds().repos.tracks.create(track);
  await audit(me, "Activation du suivi", "location-tracks", track.id, `${subject.name} · ${reason.trim()}`);
  await notify(me, subjectId, "Suivi de localisation", `${me.name} a activé un suivi de sécurité. Motif : ${reason.trim()}. Un bandeau s'affiche tant que l'application est ouverte.`, "/confidentialite/");
  return track;
}

export async function stopTrack(me: User, trackId: Id, reason: string) {
  assert(reason.trim().length >= 3, "Le motif d'arrêt est obligatoire.");
  const t = await ds().repos.tracks.get(trackId);
  assert(t && t.active && !t.deleted, "Ce suivi n'est plus actif.");
  const subject = await ds().repos.users.get(t.subjectId);
  assert(subject, "Compte introuvable.");
  const s = await settings();
  assert(me.role === "patron" || canTrackUser(me, subjectOf(subject), s.comptableTrackScope).ok, "Vous ne pouvez pas arrêter ce suivi.");
  await endTrack(t, me.id, reason.trim());
}

/** Une consultation est écrite à l'ouverture de l'écran de suivi. */
export async function consultTrack(me: User, subjectId: Id) {
  await expireTracks();
  const subject = await ds().repos.users.get(subjectId);
  assert(subject && !subject.deleted, "Compte introuvable.");
  const s = await settings();
  const decision = canTrackUser(me, subjectOf(subject), s.comptableTrackScope);
  assert(decision.ok, decision.reason);
  const iso = now();
  const t = (await ds().repos.tracks.list()).find((x) => x.subjectId === subjectId && x.active && !x.deleted && x.expiresAt > iso);
  assert(t, "Aucun suivi actif pour ce compte.");
  await audit(me, "Consultation du suivi", "location-tracks", t.id, subject.name);
  return t;
}

export async function setMarkerMode(me: User, trackId: Id, mode: MarkerChoice) {
  const t = await liveTrack(trackId);
  const subject = (await ds().repos.users.get(t.subjectId))!;
  const s = await settings();
  assert(canTrackUser(me, subjectOf(subject), s.comptableTrackScope).ok, "Vous ne pouvez pas modifier ce suivi.");
  await ds().repos.tracks.update(trackId, { markerMode: mode });
  await audit(me, "Modèle du suivi", "location-tracks", trackId, `${subject.name} · ${mode}`);
}

export async function setShareUsers(me: User, trackId: Id, userIds: Id[]) {
  assert(me.role === "patron", "Seul le patron désigne qui peut créer un lien de consultation.");
  const t = await liveTrack(trackId);
  const ids = [...new Set(userIds.filter((id) => id !== t.subjectId && id !== me.id))];
  await ds().repos.tracks.update(trackId, { shareUserIds: ids });
  await audit(me, "Autorisation de partage", "location-tracks", trackId, ids.join(", ") || "aucune");
}

async function liveTrack(trackId: Id) {
  await expireTracks();
  const t = await ds().repos.tracks.get(trackId);
  const iso = now();
  assert(t && t.active && !t.deleted && t.expiresAt > iso, "Ce suivi n'est plus actif.");
  return t;
}

export async function createShare(me: User, trackId: Id, input: { recipientName: string; reason: string; hours: number }) {
  const t = await liveTrack(trackId);
  const decision = canShareTrack(me, t.shareUserIds);
  assert(decision.ok, decision.reason);
  assert(input.recipientName.trim().length >= 2, "Nommez la personne qui recevra le lien.");
  assert(input.reason.trim().length >= 3, "Le motif du partage est obligatoire.");
  const hours = clampShareHours(input.hours);
  const share: TrackShare = {
    id: uid("sh"),
    trackId: t.id,
    token: uuid(),
    recipientName: input.recipientName.trim(),
    reason: input.reason.trim(),
    by: me.id,
    createdAt: now(),
    expiresAt: new Date(Date.now() + hours * 3600000).toISOString(),
  };
  await ds().repos.shares.create(share);
  await audit(me, "Création d'un lien de suivi", "location-shares", share.id, `${share.recipientName} · ${hours} h · ${share.reason}`);
  await notify(me, t.subjectId, "Lien de consultation", `${me.name} a créé un lien de consultation (${share.recipientName}, ${hours} h).`, "/confidentialite/");
  return share;
}

export async function revokeShare(me: User, shareId: Id, reason: string) {
  assert(reason.trim().length >= 3, "Le motif de révocation est obligatoire.");
  const share = await ds().repos.shares.get(shareId);
  assert(share && !share.deleted, "Lien introuvable.");
  const t = await ds().repos.tracks.get(share.trackId);
  assert(t, "Suivi introuvable.");
  const decision = canShareTrack(me, t.shareUserIds);
  assert(me.role === "patron" || decision.ok || share.by === me.id, decision.reason);
  assert(!share.revokedAt, "Ce lien est déjà révoqué.");
  await ds().repos.shares.update(shareId, { revokedAt: now(), revokedBy: me.id });
  await audit(me, "Révocation du lien de suivi", "location-shares", shareId, `${share.recipientName} · ${reason.trim()}`);
}

export interface OpenShareResult {
  ok: boolean;
  message: string;
  share?: TrackShare;
  track?: LocationTrack;
  subject?: User;
  ping?: GeoPing;
}

export async function openShare(token: string): Promise<OpenShareResult> {
  const share = (await ds().repos.shares.list()).find((s) => s.token === token && !s.deleted);
  if (!share) return { ok: false, message: "Ce lien est inconnu." };
  await expireTracks();
  const track = await ds().repos.tracks.get(share.trackId);
  const live = shareLive(share, track ?? undefined, now());
  const sessionId = ds().session.get();
  const actor = sessionId ? await ds().repos.users.get(sessionId) : null;
  const who = actor ?? "lien";
  if (!live || !track) {
    await audit(who, "Ouverture refusée du lien de suivi", "location-shares", share.id, share.recipientName);
    return { ok: false, message: "Ce lien n'est plus valable : il a expiré, il a été révoqué, ou le suivi est terminé." };
  }
  await audit(who, "Ouverture du lien de suivi", "location-shares", share.id, share.recipientName);
  const subject = await ds().repos.users.get(track.subjectId);
  const ping = await ds().repos.positions.get(pingId(track.subjectId));
  return {
    ok: true,
    message: "",
    share,
    track,
    subject: subject ?? undefined,
    ping: ping && !ping.deleted ? ping : undefined,
  };
}

const pingId = (userId: Id) => `ping-${userId}`;

export async function ongoingTransportId(userId: Id): Promise<Id | undefined> {
  const transports = (await ds().repos.transports.list()).filter((t) => t.status === "en_route" && !t.deleted);
  const driverIds = (await ds().repos.drivers.list()).filter((d) => d.userId === userId).map((d) => d.id);
  const asDriver = transports.find((t) => t.driverId && driverIds.includes(t.driverId));
  if (asDriver) return asDriver.id;
  const contracts = await ds().repos.contracts.list();
  return transports.find((t) => contracts.find((c) => c.id === t.contractId)?.supplierId === userId)?.id;
}

export async function publishPing(userId: Id, fix: { lat: number; lng: number; accuracy: number }) {
  if (!consentGranted(await ds().repos.consents.list(), userId)) return;
  const at = now();
  const id = pingId(userId);
  const prev = await ds().repos.positions.get(id);
  let speed = 0;
  let heading = prev?.headingDeg;
  if (prev && prev.at) {
    speed = speedMps({ lat: prev.lat, lng: prev.lng, at: prev.at }, { lat: fix.lat, lng: fix.lng, at });
    if (speed >= 0.4) heading = headingDeg(prev, fix);
  }
  const iso = at;
  const tracked = (await ds().repos.tracks.list()).some((t) => t.subjectId === userId && t.active && !t.deleted && t.expiresAt > iso);
  const transportId = await ongoingTransportId(userId);
  const row: GeoPing = {
    id,
    userId,
    lat: fix.lat,
    lng: fix.lng,
    accuracy: Math.round(fix.accuracy),
    at,
    prevLat: prev?.lat,
    prevLng: prev?.lng,
    prevAt: prev?.at,
    speedMps: Math.round(speed * 10) / 10,
    headingDeg: heading,
    context: tracked ? "suivi" : "livraison",
    transportId,
    live: true,
  };
  if (prev) await ds().repos.positions.update(id, row);
  else await ds().repos.positions.create(row);
}

export async function markOffline(userId: Id) {
  const id = pingId(userId);
  const prev = await ds().repos.positions.get(id);
  if (prev && prev.live) await ds().repos.positions.update(id, { live: false });
}

export async function setManager(me: User, userId: Id, managerId: Id | undefined) {
  assert(me.role === "patron", "Seul le patron rattache un employé à un gestionnaire.");
  const u = await ds().repos.users.get(userId);
  assert(u && !u.deleted, "Compte introuvable.");
  if (managerId) {
    const manager = await ds().repos.users.get(managerId);
    assert(manager && manager.role === "gestionnaire" && !manager.deleted, "Choisissez un gestionnaire.");
  }
  const geo = await journalGeo(me);
  await ds().repos.users.update(userId, { managerId });
  await audit(me, "Rattachement d'équipe", "users", userId, `${u.name} · ${managerId ?? "aucun"}`, { before: { managerId: u.managerId }, after: { managerId }, geo });
}

export async function saveComptableScope(me: User, userIds: Id[]) {
  assert(me.role === "patron", "Seul le patron fixe le périmètre du comptable.");
  const s = await settings();
  const ids = [...new Set(userIds)];
  await ds().repos.settings.update("settings", { comptableTrackScope: ids });
  await audit(me, "Périmètre de suivi du comptable", "settings", "settings", ids.join(", ") || "vide", { before: { comptableTrackScope: s.comptableTrackScope }, after: { comptableTrackScope: ids } });
}

export async function saveSpeedThresholds(me: User, stop: number, walk: number, fast: number) {
  await requirePerm(me, "parametres", "u");
  assert([stop, walk, fast].every((n) => Number.isFinite(n) && n >= 0), "Les seuils de vitesse doivent être des nombres positifs.");
  assert(stop < walk && walk < fast, "Les seuils doivent être croissants : repos, puis marche, puis course.");
  const s = await settings();
  const patch = { speedStopMps: stop, speedWalkMps: walk, speedFastMps: fast };
  await ds().repos.settings.update("settings", patch);
  await audit(me, "Seuils de vitesse du marqueur", "settings", "settings", `${stop} / ${walk} / ${fast} m/s`, {
    before: { speedStopMps: s.speedStopMps, speedWalkMps: s.speedWalkMps, speedFastMps: s.speedFastMps },
    after: patch,
  });
}

export function thresholdsOf(db: Database) {
  const s = db.settings[0];
  return {
    stopMps: s?.speedStopMps ?? DEFAULT_SPEED.stopMps,
    walkMps: s?.speedWalkMps ?? DEFAULT_SPEED.walkMps,
    fastMps: s?.speedFastMps ?? DEFAULT_SPEED.fastMps,
  };
}

export function activeTrack(db: Database, subjectId: Id, iso = new Date().toISOString()) {
  return db.tracks.find((t) => t.subjectId === subjectId && t.active && !t.deleted && t.expiresAt > iso);
}

export function liveShares(db: Database, trackId: Id, iso = new Date().toISOString()) {
  const track = db.tracks.find((t) => t.id === trackId);
  return db.shares.filter((s) => s.trackId === trackId && !s.deleted && shareLive(s, track, iso));
}
