import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canShareTrack, canTrackUser, clampShareHours, headingDeg, motionFor, shareLive, speedMps,
} from "./trackPermissions.ts";

const patron = { id: "u-patron", role: "patron" };
const yawa = { id: "u-yawa", role: "gestionnaire" };
const edem = { id: "u-edem", role: "gestionnaire" };
const essi = { id: "u-essi", role: "comptable" };
const admin = { id: "u-admin", role: "admin" };
const mawuli = { id: "u-mawuli", role: "magasinier", managerId: "u-edem" };
const yao = { id: "u-yao", role: "chauffeur", managerId: "u-yawa" };
const kossi = { id: "u-kossi", role: "fournisseur", managerId: "u-yawa" };

describe("canTrackUser", () => {
  it("le patron suit tous les employés", () => {
    for (const subject of [admin, yawa, essi, mawuli, yao]) {
      assert.equal(canTrackUser(patron, subject, []).ok, true, subject.id);
    }
  });

  it("le patron ne se suit pas et ne suit pas un fournisseur", () => {
    assert.equal(canTrackUser(patron, patron, []).ok, false);
    assert.equal(canTrackUser(patron, kossi, []).ok, false);
  });

  it("le gestionnaire ne suit que son équipe", () => {
    assert.equal(canTrackUser(yawa, yao, []).ok, true);
    assert.equal(canTrackUser(edem, mawuli, []).ok, true);
    assert.equal(canTrackUser(yawa, mawuli, []).ok, false);
    assert.equal(canTrackUser(edem, yao, []).ok, false);
    assert.equal(canTrackUser(yawa, essi, []).ok, false);
  });

  it("un fournisseur rattaché par erreur reste hors suivi", () => {
    assert.equal(canTrackUser(yawa, kossi, []).ok, false);
    assert.match(canTrackUser(yawa, kossi, []).reason, /employés/);
  });

  it("le comptable est limité au périmètre du patron", () => {
    assert.equal(canTrackUser(essi, mawuli, ["u-mawuli"]).ok, true);
    assert.equal(canTrackUser(essi, yao, ["u-mawuli"]).ok, false);
    assert.equal(canTrackUser(essi, kossi, ["u-kossi"]).ok, false);
    assert.equal(canTrackUser(essi, mawuli, []).ok, false);
  });

  it("les autres rôles ne lancent pas de suivi", () => {
    assert.equal(canTrackUser(admin, yao, []).ok, false);
    assert.equal(canTrackUser(mawuli, yao, []).ok, false);
    assert.equal(canTrackUser(yao, mawuli, []).ok, false);
  });
});

describe("partage", () => {
  it("le patron partage, un tiers non autorisé non", () => {
    assert.equal(canShareTrack(patron, []).ok, true);
    assert.equal(canShareTrack(yawa, []).ok, false);
    assert.equal(canShareTrack(yawa, ["u-yawa"]).ok, true);
    assert.equal(canShareTrack(essi, ["u-yawa"]).ok, false);
  });

  it("la durée est bornée à 24 h, 2 h par défaut", () => {
    assert.equal(clampShareHours(2), 2);
    assert.equal(clampShareHours(48), 24);
    assert.equal(clampShareHours(0), 2);
    assert.equal(clampShareHours(Number.NaN), 2);
  });

  const share = { expiresAt: "2026-10-20T18:00:00.000Z" };
  const track = { active: true, expiresAt: "2026-11-19T12:00:00.000Z" };

  it("le lien vit, puis meurt si révoqué, expiré ou si le suivi s'arrête", () => {
    assert.equal(shareLive(share, track, "2026-10-20T16:00:00.000Z"), true);
    assert.equal(shareLive({ ...share, revokedAt: "2026-10-20T17:00:00.000Z" }, track, "2026-10-20T16:30:00.000Z"), false);
    assert.equal(shareLive(share, track, "2026-10-20T18:00:00.000Z"), false);
    assert.equal(shareLive(share, { ...track, active: false }, "2026-10-20T16:00:00.000Z"), false);
    assert.equal(shareLive(share, { active: true, expiresAt: "2026-10-20T15:00:00.000Z" }, "2026-10-20T16:00:00.000Z"), false);
  });
});

describe("mouvement", () => {
  const th = { stopMps: 0.5, walkMps: 1.8, fastMps: 7 };

  it("le mode automatique suit les seuils", () => {
    assert.equal(motionFor(0, "auto", th), "idle");
    assert.equal(motionFor(0.49, "auto", th), "idle");
    assert.equal(motionFor(0.5, "auto", th), "walk");
    assert.equal(motionFor(1.7, "auto", th), "walk");
    assert.equal(motionFor(1.8, "auto", th), "run");
    assert.equal(motionFor(6.9, "auto", th), "run");
    assert.equal(motionFor(7, "auto", th), "moto");
  });

  it("le choix manuel prime, le repos fige la personne", () => {
    assert.equal(motionFor(0, "marche", th), "idle");
    assert.equal(motionFor(4, "marche", th), "walk");
    assert.equal(motionFor(0.2, "course", th), "idle");
    assert.equal(motionFor(1, "course", th), "run");
    assert.equal(motionFor(0, "moto", th), "moto");
    assert.equal(motionFor(12, "voiture", th), "car");
  });

  it("calcule une vitesse et un cap à partir de deux positions", () => {
    const a = { lat: 6.13, lng: 1.22, at: "2026-10-20T12:00:00.000Z" };
    const b = { lat: 6.13, lng: 1.22, at: "2026-10-20T12:00:10.000Z" };
    assert.equal(speedMps(a, b), 0);
    const north = { lat: 6.131, lng: 1.22, at: "2026-10-20T12:00:10.000Z" };
    const v = speedMps(a, north);
    assert.ok(v > 10 && v < 12, String(v));
    const cap = headingDeg(a, north);
    assert.ok(Math.abs(cap) < 2, String(cap));
  });
});
