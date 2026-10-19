// Identifiants de connexion : e-mail, ou téléphone de n'importe quel pays, avec ou sans indicatif.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Indicatifs E.164. */
const CALLING_CODES = new Set([
  "1", "7",
  "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45", "46", "47", "48", "49",
  "51", "52", "53", "54", "55", "56", "57", "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84", "86",
  "90", "91", "92", "93", "94", "95", "98",
  "211", "212", "213", "216", "218", "220", "221", "222", "223", "224", "225", "226", "227", "228", "229",
  "230", "231", "232", "233", "234", "235", "236", "237", "238", "239", "240", "241", "242", "243", "244", "245",
  "246", "247", "248", "249", "250", "251", "252", "253", "254", "255", "256", "257", "258", "260", "261", "262",
  "263", "264", "265", "266", "267", "268", "269", "290", "291", "297", "298", "299",
  "350", "351", "352", "353", "354", "355", "356", "357", "358", "359", "370", "371", "372", "373", "374", "375",
  "376", "377", "378", "380", "381", "382", "383", "385", "386", "387", "389",
  "420", "421", "423",
  "500", "501", "502", "503", "504", "505", "506", "507", "508", "509", "590", "591", "592", "593", "594", "595",
  "596", "597", "598", "599",
  "670", "672", "673", "674", "675", "676", "677", "678", "679", "680", "681", "682", "683", "685", "686", "687",
  "688", "689", "690", "691", "692",
  "850", "852", "853", "855", "856", "880", "886",
  "960", "961", "962", "963", "964", "965", "966", "967", "968", "970", "971", "972", "973", "974", "975", "976",
  "977", "992", "993", "994", "995", "996", "998",
]);

export function normEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isEmail(input: string): boolean {
  return EMAIL_RE.test(normEmail(input));
}

/** Chiffres, avec la variante sans 00 international ni zéro de tronc national. */
function phoneForms(input: string): string[] {
  const digits = input.replace(/\D/g, "");
  if (!digits) return [];
  const forms = new Set<string>([digits]);
  if (digits.startsWith("00") && digits.length > 4) forms.add(digits.slice(2));
  else if (digits.startsWith("0")) forms.add(digits.slice(1));
  return [...forms];
}

/** 2 = mêmes chiffres, 1 = même numéro avec ou sans indicatif connu, 0 = différent. */
export function phoneMatchRank(stored: string, input: string): number {
  const left = phoneForms(stored);
  const right = phoneForms(input);
  if (!left.length || !right.length) return 0;
  if (left.some((a) => right.includes(a))) return 2;
  for (const a of left) {
    for (const b of right) {
      const [short, long] = a.length < b.length ? [a, b] : [b, a];
      const extra = long.length - short.length;
      if (extra < 1 || extra > 3 || short.length < 8 || long.length > 15) continue;
      if (!long.endsWith(short)) continue;
      if (CALLING_CODES.has(long.slice(0, extra))) return 1;
    }
  }
  return 0;
}

export function samePhone(a: string, b: string): boolean {
  return phoneMatchRank(a, b) > 0;
}

/** Le compte le plus précis. Aucun si deux comptes correspondent au même rang. */
export function bestPhoneMatch<T>(items: T[], input: string, phoneOf: (item: T) => string): T | undefined {
  let best = 0;
  let found: T | undefined;
  let ties = 0;
  for (const item of items) {
    const rank = phoneMatchRank(phoneOf(item), input);
    if (rank > best) {
      best = rank;
      found = item;
      ties = 1;
    } else if (rank === best && rank > 0) ties += 1;
  }
  return ties === 1 ? found : undefined;
}

/** Affichage stable des 8 chiffres locaux de la démo : « 90 11 22 33 ». */
export function formatLocalPhone(digits: string): string {
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
}

/** Forme enregistrée. Les 8 chiffres sans indicatif restent le format local de la démo. */
export function canonicalPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (input.trim().startsWith("+")) return "+" + digits;
  if (digits.length === 8) return formatLocalPhone(digits);
  return digits;
}

/**
 * Affiche le numéro tel qu'il a été donné.
 * Les comptes de démo (8 chiffres, sans indicatif) restent présentés en +228.
 */
export function displayPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.length === 8) return `+228 ${formatLocalPhone(digits)}`;
  return trimmed;
}

/** Nombre de chiffres utiles, préfixe 00 retiré. */
export function phoneDigitCount(input: string): number {
  const digits = input.replace(/\D/g, "");
  return (digits.startsWith("00") ? digits.slice(2) : digits).length;
}
