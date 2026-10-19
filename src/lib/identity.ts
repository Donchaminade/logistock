// Identifiants de connexion : e-mail, ou téléphone togolais avec ou sans indicatif.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isEmail(input: string): boolean {
  return EMAIL_RE.test(normEmail(input));
}

/**
 * Réduit un numéro à ses 8 chiffres locaux.
 * Accepte « 90 11 22 33 », « +228 90 11 22 33 », « 00228… » et « 228… ».
 */
export function localPhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00228")) digits = digits.slice(5);
  else if (digits.startsWith("228") && digits.length > 8) digits = digits.slice(3);
  return digits;
}

export function samePhone(a: string, b: string): boolean {
  const left = localPhone(a);
  const right = localPhone(b);
  return left.length === 8 && left === right;
}

/** Affichage stable : « 90 11 22 33 ». */
export function formatLocalPhone(digits: string): string {
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
}
