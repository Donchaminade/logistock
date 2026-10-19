// Empreintes SHA-256 et signatures Ed25519.
// WebCrypto (crypto.subtle) en priorité ; repli sur @noble (dépendance locale, auditée) quand le navigateur
// ne propose pas Ed25519 ou hors contexte sécurisé.
//
// ⚠️ DÉMONSTRATION : la clé privée ci-dessous est embarquée dans le front pour que la maquette fonctionne seule.
// En production, la signature est faite par le SERVEUR (§6.5) avec une clé conservée hors de la base
// (variable d'environnement chiffrée ou service de gestion de clés). Seule la clé publique est diffusée.
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";

const DEMO_SIGNING_JWK: JsonWebKey = {
  kty: "OKP",
  crv: "Ed25519",
  d: "blsJ7XSJtnIF2tFIhpWi8paFjDsZbKNu_kg-fe5hpLo",
  x: "L6XJ9fudscJlPDy0Z4Vl54Ye1UHwQ1PfGXhQd_vpocM",
};

const enc = new TextEncoder();

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
export function fromHex(h: string): Uint8Array {
  const clean = h.replace(/[^0-9a-f]/gi, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Clé publique de démonstration (hex), affichée sur l'écran de vérification. */
export const DEMO_PUBLIC_KEY_HEX = toHex(b64urlToBytes(DEMO_SIGNING_JWK.x!));

function subtle(): SubtleCrypto | null {
  return typeof crypto !== "undefined" && crypto.subtle ? crypto.subtle : null;
}

/** Sérialisation canonique (clés triées) : même contenu → même empreinte. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const s = subtle();
  if (s) return toHex(new Uint8Array(await s.digest("SHA-256", enc.encode(input))));
  return toHex(nobleSha256(enc.encode(input)));
}

let webEd: Promise<{ priv: CryptoKey; pub: CryptoKey } | null> | null = null;
function webEdKeys() {
  if (!webEd) {
    webEd = (async () => {
      const s = subtle();
      if (!s) return null;
      try {
        const priv = await s.importKey("jwk", DEMO_SIGNING_JWK, { name: "Ed25519" }, false, ["sign"]);
        const pub = await s.importKey("raw", fromHex(DEMO_PUBLIC_KEY_HEX) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
        return { priv, pub };
      } catch {
        return null; // navigateur sans Ed25519 dans WebCrypto
      }
    })();
  }
  return webEd;
}

/** Moteur réellement utilisé (affiché à l'écran de vérification). */
export async function signatureEngine(): Promise<"WebCrypto" | "@noble/curves"> {
  return (await webEdKeys()) ? "WebCrypto" : "@noble/curves";
}

/** Signature Ed25519 (hex, 128 caractères) d'un message texte. */
export async function signEd25519(message: string): Promise<string> {
  const keys = await webEdKeys();
  if (keys) return toHex(new Uint8Array(await subtle()!.sign({ name: "Ed25519" }, keys.priv, enc.encode(message))));
  return toHex(ed25519.sign(enc.encode(message), b64urlToBytes(DEMO_SIGNING_JWK.d!)));
}

export async function verifyEd25519(message: string, signatureHex: string, publicKeyHex = DEMO_PUBLIC_KEY_HEX): Promise<boolean> {
  if (!/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
  try {
    const keys = publicKeyHex === DEMO_PUBLIC_KEY_HEX ? await webEdKeys() : null;
    if (keys) return await subtle()!.verify({ name: "Ed25519" }, keys.pub, fromHex(signatureHex) as BufferSource, enc.encode(message));
    return ed25519.verify(fromHex(signatureHex), enc.encode(message), fromHex(publicKeyHex));
  } catch {
    return false;
  }
}

/** Identifiant unique généré sur l'appareil (sert aussi de clé d'idempotence, §6.2). */
export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
