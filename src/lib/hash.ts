/** Empreinte courte (FNV-1a 32 bits, hex). Démonstration seulement :
 * la version réelle utilisera SHA-256 et une signature Ed25519 côté serveur (§6.5). */
export function fingerprint(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const a = (h >>> 0).toString(16).padStart(8, "0");
  let h2 = 0x01000193 ^ input.length;
  for (let i = input.length - 1; i >= 0; i--) {
    h2 ^= input.charCodeAt(i);
    h2 = Math.imul(h2, 0x811c9dc5);
  }
  return (a + (h2 >>> 0).toString(16).padStart(8, "0")).toUpperCase();
}

export function uid(prefix: string): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${r}`;
}
