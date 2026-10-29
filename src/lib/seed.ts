// Jeu de données de démonstration — DONNÉES FICTIVES.
// Les seuls chiffres venant du client : avance 10 000 000 FCFA, prix 215 → 300 FCFA/kg,
// livraison partielle 100 t / 80 t (reliquat 20 t) et ajustement 200 → 250 FCFA/kg.
import { sealDatabase } from "./integrity";
import { defaultPerms } from "./permissions";
import type { CatalogProduct, Database, Settings, TraceEvent } from "./types";

const d = (s: string) => new Date(s).toISOString();

export const DEMO_ACCOUNTS = [
  { id: "u-patron", role: "patron", name: "Komlan Agbéko", phone: "90 11 22 33", email: "komlan.agbeko@example.com", password: "patron2026", title: "Patron · financeur" },
  { id: "u-yawa", role: "gestionnaire", name: "Yawa Dossou", phone: "91 22 33 44", email: "yawa.dossou@example.com", password: "gestion2026", title: "Gestionnaire déléguée · Kaboli" },
  { id: "u-kossi", role: "fournisseur", name: "Kossi Amegah", phone: "92 33 44 55", email: "kossi.amegah@example.com", password: "fourni2026", title: "Fournisseur · cacao · Badou" },
  { id: "u-admin", role: "admin", name: "Akouvi Mensah", phone: "90 22 33 44", email: "akouvi.mensah@example.com", password: "admin2026", title: "Administratrice · comptes et paramètres" },
  { id: "u-mawuli", role: "magasinier", name: "Mawuli Tété", phone: "94 11 22 33", email: "mawuli.tete@example.com", password: "magasin2026", title: "Magasinier · magasin central de Lomé" },
  { id: "u-yao", role: "chauffeur", name: "Yao Gbadoé", phone: "98 12 34 56", email: "yao.gbadoe@example.com", password: "chauffeur2026", title: "Chauffeur · TG-5520-CA" },
  { id: "u-essi", role: "comptable", name: "Essi Kouma", phone: "90 33 44 55", email: "essi.kouma@example.com", password: "compta2026", title: "Comptable" },
] as const;

export const OTHER_ACCOUNTS = [
  { id: "u-edem", role: "gestionnaire", name: "Edem Kpodar", phone: "91 55 66 77", email: "edem.kpodar@example.com", password: "gestion2026", title: "Gestionnaire délégué · magasin de Lomé" },
  { id: "u-jamilana", role: "fournisseur", name: "Jamilana Issifou", phone: "92 66 77 88", email: "jamilana.issifou@example.com", password: "fourni2026", title: "Fournisseuse · soja · Atakpamé" },
  { id: "u-afi", role: "fournisseur", name: "Afi Lawson", phone: "93 44 55 66", email: "afi.lawson@example.com", password: "fourni2026", title: "Fournisseuse · soja · Notsé" },
] as const;

function chain(events: Omit<TraceEvent, "hash" | "prevHash">[]): TraceEvent[] {
  // Les empreintes SHA-256 sont calculées par sealDatabase (asynchrone, WebCrypto).
  return events.map((e) => ({ ...e, prevHash: "", hash: "" }));
}

export function buildSeed(): Database {
  const now = new Date().toISOString();
  const zone = { "u-kossi": "Badou", "u-jamilana": "Atakpamé", "u-afi": "Notsé", "u-yawa": "Kaboli", "u-edem": "Lomé", "u-mawuli": "Lomé" } as Record<string, string>;
  const managers: Record<string, string> = { "u-mawuli": "u-edem", "u-yao": "u-yawa" };
  const users = [...DEMO_ACCOUNTS, ...OTHER_ACCOUNTS].map((a) => ({
    ...a,
    zone: zone[a.id],
    managerId: managers[a.id],
    active: true,
    createdAt: d("2026-08-01T09:00:00Z"),
    createdBy: a.role === "patron" ? undefined : "u-patron",
    failedAttempts: 0,
  }));

  const traces: TraceEvent[] = [
    ...chain([
      { id: "ev-28-1", transportId: "tr-028", order: 1, type: "chargement", place: "Glazoué (Bénin)", at: d("2026-09-24T07:30:00Z"), qtyKg: 30000, receiver: "Afi Lawson", receiverRole: "Fournisseur", vehicle: "TG-4417-BQ", driver: "Séna Akakpo", carrier: "Transports Zio (fictif)", by: "u-afi" },
      { id: "ev-28-2", transportId: "tr-028", order: 2, type: "livraison_lieu_prevu", place: "Frontière (Sanvee-Condji)", at: d("2026-09-25T15:10:00Z"), qtyKg: 30000, receiver: "Edem Kpodar", receiverRole: "Gestionnaire délégué (sur place)", vehicle: "TG-4417-BQ", driver: "Séna Akakpo", by: "u-edem" },
      { id: "ev-28-3", transportId: "tr-028", order: 3, type: "pointage_lome", place: "Lomé · magasin central", at: d("2026-09-26T09:05:00Z"), qtyKg: 30000, receiver: "Edem Kpodar", receiverRole: "Gestionnaire délégué", vehicle: "TG-4417-BQ", driver: "Séna Akakpo", by: "u-edem" },
      { id: "ev-28-4", transportId: "tr-028", order: 4, type: "reception", place: "Lomé · magasin central", at: d("2026-09-26T10:20:00Z"), qtyKg: 30000, receiver: "Komlan Agbéko", receiverRole: "Patron", comment: "Pesée PE-0907 · 600 sacs", by: "u-patron" },
    ]),
    ...chain([
      { id: "ev-31-1", transportId: "tr-031", order: 1, type: "chargement", place: "Sotouboua", at: d("2026-09-10T06:45:00Z"), qtyKg: 20000, receiver: "Jamilana Issifou", receiverRole: "Fournisseur", vehicle: "TG-2093-AZ", driver: "Kodjo Ahiadzi", carrier: "Transports Zio (fictif)", by: "u-jamilana" },
      { id: "ev-31-2", transportId: "tr-031", order: 2, type: "livraison_lieu_prevu", place: "Kaboli", at: d("2026-09-11T11:30:00Z"), qtyKg: 20000, receiver: "Yawa Dossou", receiverRole: "Gestionnaire déléguée (sur place)", vehicle: "TG-2093-AZ", driver: "Kodjo Ahiadzi", by: "u-yawa" },
      { id: "ev-31-3", transportId: "tr-031", order: 3, type: "pointage_lome", place: "Lomé · magasin central", at: d("2026-09-12T08:15:00Z"), qtyKg: 20000, receiver: "Edem Kpodar", receiverRole: "Gestionnaire délégué", vehicle: "TG-2093-AZ", driver: "Kodjo Ahiadzi", by: "u-edem" },
      { id: "ev-31-4", transportId: "tr-031", order: 4, type: "reception", place: "Lomé · magasin central", at: d("2026-09-12T09:40:00Z"), qtyKg: 20000, receiver: "Komlan Agbéko", receiverRole: "Patron", comment: "Pesée PE-0912 · 400 sacs", by: "u-patron" },
    ]),
    ...chain([
      { id: "ev-36-1", transportId: "tr-036", order: 1, type: "chargement", place: "Anié", at: d("2026-10-01T07:00:00Z"), qtyKg: 15400, receiver: "Jamilana Issifou", receiverRole: "Fournisseur", vehicle: "TG-7781-BC", driver: "Komi Tchalla", carrier: "Transports Zio (fictif)", by: "u-jamilana" },
      { id: "ev-36-2", transportId: "tr-036", order: 2, type: "livraison_lieu_prevu", place: "Kaboli", at: d("2026-10-02T13:20:00Z"), qtyKg: 15400, receiver: "Yawa Dossou", receiverRole: "Gestionnaire déléguée (sur place)", vehicle: "TG-7781-BC", driver: "Komi Tchalla", by: "u-yawa" },
      { id: "ev-36-3", transportId: "tr-036", order: 3, type: "pointage_lome", place: "Lomé · magasin central", at: d("2026-10-03T08:00:00Z"), qtyKg: 15400, receiver: "Edem Kpodar", receiverRole: "Gestionnaire délégué", vehicle: "TG-7781-BC", driver: "Komi Tchalla", by: "u-edem" },
      { id: "ev-36-4", transportId: "tr-036", order: 4, type: "pesee", place: "Lomé · magasin central", at: d("2026-10-03T09:10:00Z"), qtyKg: 15000, receiver: "Edem Kpodar", receiverRole: "Gestionnaire délégué", comment: "Écart de 400 kg : sacs humides, constaté contradictoirement", by: "u-edem" },
      { id: "ev-36-5", transportId: "tr-036", order: 5, type: "reception", place: "Lomé · magasin central", at: d("2026-10-03T09:45:00Z"), qtyKg: 15000, receiver: "Komlan Agbéko", receiverRole: "Patron", comment: "Pesée PE-0931 · 300 sacs", by: "u-patron" },
    ]),
    ...chain([
      { id: "ev-41-1", transportId: "tr-041", order: 1, type: "achat", place: "Badou", at: d("2026-10-12T10:00:00Z"), qtyKg: 80000, receiver: "Kossi Amegah", receiverRole: "Fournisseur", comment: "Achats groupés auprès de 4 coopératives (fictives)", by: "u-kossi" },
      { id: "ev-41-2", transportId: "tr-041", order: 2, type: "chargement", place: "Badou", at: d("2026-10-14T08:30:00Z"), qtyKg: 80000, receiver: "Kossi Amegah", receiverRole: "Fournisseur", vehicle: "TG-5520-CA", driver: "Yao Gbadoé", carrier: "Transports Agou (fictif)", photo: "/demo/chargement.svg", by: "u-kossi" },
      { id: "ev-41-3", transportId: "tr-041", order: 3, type: "livraison_lieu_prevu", place: "Kaboli", at: d("2026-10-15T16:10:00Z"), qtyKg: 80000, receiver: "Yawa Dossou", receiverRole: "Gestionnaire déléguée (sur place)", vehicle: "TG-5520-CA", driver: "Yao Gbadoé", by: "u-yawa" },
      { id: "ev-41-4", transportId: "tr-041", order: 4, type: "etape", place: "Atakpamé", at: d("2026-10-17T11:40:00Z"), qtyKg: 80000, receiver: "Yao Gbadoé", receiverRole: "Chauffeur", vehicle: "TG-5520-CA", driver: "Yao Gbadoé", by: "u-yao" },
    ]),
    ...chain([
      { id: "ev-40-1", transportId: "tr-040", order: 1, type: "chargement", place: "Badou", at: d("2026-10-14T08:30:00Z"), qtyKg: 12000, receiver: "Komi Tchalla", receiverRole: "Chauffeur", vehicle: "TG-7781-BC", driver: "Komi Tchalla", carrier: "Transports Agou (fictif)", comment: "Saisie en double, suppression à demander", by: "u-yawa" },
    ]),
  ];

  return {
    users,
    needs: [
      { id: "bs-012", ref: "BS-2026-012", product: "soja", qtyKg: 76500, indicativePrice: 215, deadline: d("2026-11-30T00:00:00Z"), zone: "Plateaux", comment: "Campagne soja de rentrée", status: "couvert", createdBy: "u-patron", createdAt: d("2026-08-10T09:00:00Z") },
      { id: "bs-018", ref: "BS-2026-018", product: "cacao", qtyKg: 100000, indicativePrice: 200, deadline: d("2026-10-25T00:00:00Z"), zone: "Badou / Litimé", status: "couvert", createdBy: "u-patron", createdAt: d("2026-09-05T09:00:00Z") },
      { id: "bs-021", ref: "BS-2026-021", product: "soja", qtyKg: 500000, indicativePrice: 350, deadline: d("2026-12-15T00:00:00Z"), zone: "Centrale ou Bénin", comment: "Gros volume pour l'export, livraison possible en plusieurs lots", status: "ouvert", createdBy: "u-patron", createdAt: d("2026-10-16T08:30:00Z") },
    ],
    offers: [
      { id: "of-1", needId: "bs-012", supplierId: "u-jamilana", qtyKg: 46511, price: 215, advanceRequested: 10000000, delayDays: 75, origin: "Sotouboua / Anié", status: "acceptee", createdBy: "u-jamilana", createdAt: d("2026-08-12T10:00:00Z"), decidedBy: "u-patron", decidedAt: d("2026-08-14T09:00:00Z"), contractId: "ct-014" },
      { id: "of-2", needId: "bs-012", supplierId: "u-afi", qtyKg: 30000, price: 210, advanceRequested: 6300000, delayDays: 40, origin: "Glazoué (Bénin)", status: "acceptee", createdBy: "u-afi", createdAt: d("2026-08-13T10:00:00Z"), decidedBy: "u-patron", decidedAt: d("2026-08-14T09:30:00Z"), contractId: "ct-009" },
      { id: "of-3", needId: "bs-018", supplierId: "u-kossi", qtyKg: 100000, price: 200, advanceRequested: 20000000, delayDays: 40, origin: "Badou", status: "acceptee", createdBy: "u-kossi", createdAt: d("2026-09-08T10:00:00Z"), decidedBy: "u-patron", decidedAt: d("2026-09-10T09:00:00Z"), contractId: "ct-017" },
      { id: "of-4", needId: "bs-021", supplierId: "u-afi", qtyKg: 500000, price: 350, advanceRequested: 175000000, delayDays: 45, origin: "Glazoué (Bénin)", status: "soumise", createdBy: "u-afi", createdAt: d("2026-10-17T14:20:00Z") },
      { id: "of-5", needId: "bs-021", supplierId: "u-jamilana", qtyKg: 120000, price: 345, advanceRequested: 41400000, delayDays: 30, origin: "Anié", status: "soumise", createdBy: "u-jamilana", createdAt: d("2026-10-18T09:05:00Z") },
    ],
    contracts: [
      { id: "ct-009", ref: "CT-2026-009", needId: "bs-012", offerId: "of-2", supplierId: "u-afi", product: "soja", qtyKg: 30000, initialPrice: 210, amount: 6300000, moneyReceivedDate: d("2026-08-20T10:00:00Z"), deliveryDate: d("2026-09-30T00:00:00Z"), deliveryPlace: "Frontière (Sanvee-Condji)", transportPaidByPatron: false, status: "actif", createdBy: "u-patron", createdAt: d("2026-08-20T10:00:00Z") },
      { id: "ct-014", ref: "CT-2026-014", needId: "bs-012", offerId: "of-1", supplierId: "u-jamilana", product: "soja", qtyKg: 46511, initialPrice: 215, amount: 10000000, moneyReceivedDate: d("2026-09-01T09:30:00Z"), deliveryDate: d("2026-11-15T00:00:00Z"), deliveryPlace: "Kaboli", transportPaidByPatron: true, status: "actif", commissionRuleId: "cr-kg", createdBy: "u-patron", createdAt: d("2026-09-01T09:30:00Z") },
      { id: "ct-017", ref: "CT-2026-017", needId: "bs-018", offerId: "of-3", supplierId: "u-kossi", product: "cacao", qtyKg: 100000, initialPrice: 200, amount: 20000000, moneyReceivedDate: d("2026-09-15T11:00:00Z"), deliveryDate: d("2026-10-25T00:00:00Z"), deliveryPlace: "Kaboli", transportPaidByPatron: true, status: "actif", commissionRuleId: "cr-pct", createdBy: "u-patron", createdAt: d("2026-09-15T11:00:00Z") },
    ],
    revisions: [],
    advances: [
      { id: "av-009", contractId: "ct-009", kind: "remise", amount: 6300000, qtyKg: 30000, unitPrice: 210, date: d("2026-08-20T10:00:00Z"), mode: "especes", status: "validee", photo: "/demo/remise.svg", receiptNo: "RC-2026-0031", receiptHash: "", receiptSignature: "", by: "u-patron", at: d("2026-08-20T10:05:00Z") },
      { id: "av-014", contractId: "ct-014", kind: "remise", amount: 10000000, qtyKg: 46511, unitPrice: 215, date: d("2026-09-01T09:30:00Z"), mode: "especes", status: "validee", photo: "/demo/remise.svg", receiptNo: "RC-2026-0034", receiptHash: "", receiptSignature: "", by: "u-patron", at: d("2026-09-01T09:35:00Z") },
      { id: "av-017", contractId: "ct-017", kind: "remise", amount: 20000000, qtyKg: 100000, unitPrice: 200, date: d("2026-09-15T11:00:00Z"), mode: "especes", status: "validee", photo: "/demo/remise.svg", receiptNo: "RC-2026-0038", receiptHash: "", receiptSignature: "", by: "u-yawa", at: d("2026-09-15T11:10:00Z") },
    ],
    locations: [
      { id: "lo-lome", name: "Lomé · magasin central", type: "destination", country: "Togo", lat: 6.1375, lng: 1.2123 },
      { id: "lo-kaboli", name: "Kaboli", type: "etape", country: "Togo", lat: 8.2333, lng: 1.0833 },
      { id: "lo-frontiere", name: "Frontière (Sanvee-Condji)", type: "etape", country: "Togo", lat: 6.2167, lng: 1.6167 },
      { id: "lo-atakpame", name: "Atakpamé", type: "etape", country: "Togo", lat: 7.5333, lng: 1.1333 },
      { id: "lo-badou", name: "Badou", type: "origine", country: "Togo", lat: 7.5833, lng: 0.6000 },
      { id: "lo-sotouboua", name: "Sotouboua", type: "origine", country: "Togo", lat: 8.5667, lng: 0.9833 },
      { id: "lo-anie", name: "Anié", type: "origine", country: "Togo", lat: 7.7500, lng: 1.2000 },
      { id: "lo-glazoue", name: "Glazoué (Bénin)", type: "origine", country: "Bénin", lat: 7.9667, lng: 2.2333 },
      { id: "lo-notse", name: "Notsé", type: "etape", country: "Togo", lat: 6.9500, lng: 1.1667 },
      { id: "lo-tsevie", name: "Tsévié", type: "etape", country: "Togo", lat: 6.4250, lng: 1.2133 },
      { id: "lo-elavagnon", name: "Elavagnon", type: "origine", country: "Togo", lat: 7.9500, lng: 0.9500 },
    ],
    vehicles: [
      { id: "vh-5520", plate: "TG-5520-CA", type: "Camion 30 t (semi-remorque)", capacityKg: 80000, owner: "Transports Agou (fictif)", active: true },
      { id: "vh-4417", plate: "TG-4417-BQ", type: "Camion 30 t", capacityKg: 30000, owner: "Transports Zio (fictif)", active: true },
      { id: "vh-2093", plate: "TG-2093-AZ", type: "Camion 20 t", capacityKg: 20000, owner: "Patron (flotte propre)", active: true },
      { id: "vh-7781", plate: "TG-7781-BC", type: "Camion 20 t", capacityKg: 20000, owner: "Transports Zio (fictif)", active: true },
    ],
    drivers: [
      { id: "dr-yao", name: "Yao Gbadoé", phone: "98 12 34 56", licence: "C-TG-0451 (fictif)", userId: "u-yao", active: true },
      { id: "dr-sena", name: "Séna Akakpo", phone: "97 10 20 30", active: true },
      { id: "dr-kodjo", name: "Kodjo Ahiadzi", phone: "97 40 50 60", active: true },
      { id: "dr-komi", name: "Komi Tchalla", phone: "97 70 80 90", active: true },
    ],
    pickups: [
      {
        id: "pk-006", ref: "PK-2026-006", vehicle: "TG-5520-CA", driverId: "dr-yao", carrier: "Transports Agou (fictif)", plannedDate: d("2026-10-14T07:00:00Z"),
        stops: [{ id: "st-006-1", supplierId: "u-kossi", contractId: "ct-017", plannedKg: 80000, loadedKg: 80000, bags: 1600, photo: "/demo/chargement.svg", confirmedAt: d("2026-10-14T08:30:00Z"), confirmedBy: "u-kossi", transportId: "tr-041" }],
        route: [
          { id: "rs-006-1", order: 1, place: "Kaboli", passedAt: d("2026-10-15T16:10:00Z"), by: "u-yawa", comment: "Contrôle par la déléguée" },
          { id: "rs-006-2", order: 2, place: "Atakpamé", passedAt: d("2026-10-17T11:40:00Z"), by: "u-yao" },
          { id: "rs-006-3", order: 3, place: "Tsévié" },
        ],
        createdBy: "u-yawa", createdAt: d("2026-10-13T17:00:00Z"),
      },
      {
        id: "pk-007", ref: "PK-2026-007", vehicle: "TG-2093-AZ", driverId: "dr-yao", carrier: "Patron (flotte propre)", plannedDate: d("2026-10-22T06:30:00Z"),
        stops: [{ id: "st-007-1", supplierId: "u-jamilana", contractId: "ct-014", plannedKg: 8600 }],
        route: [
          { id: "rs-007-1", order: 1, place: "Atakpamé" },
          { id: "rs-007-2", order: 2, place: "Notsé" },
        ],
        createdBy: "u-yawa", createdAt: d("2026-10-18T10:00:00Z"),
      },
    ],
    transports: [
      { id: "tr-028", ref: "TR-2026-028", contractId: "ct-009", product: "soja", origin: "Glazoué (Bénin)", tonsKg: 30000, vehicle: "TG-4417-BQ", driver: "Séna Akakpo", driverPhone: "97 10 20 30", driverId: "dr-sena", carrier: "Transports Zio (fictif)", loadingDate: d("2026-09-24T07:30:00Z"), departureDate: d("2026-09-24T09:00:00Z"), arrivalDate: d("2026-09-26T09:05:00Z"), status: "receptionne", createdBy: "u-edem", createdAt: d("2026-09-24T07:00:00Z") },
      { id: "tr-031", ref: "TR-2026-031", contractId: "ct-014", product: "soja", origin: "Sotouboua", tonsKg: 20000, vehicle: "TG-2093-AZ", driver: "Kodjo Ahiadzi", driverPhone: "97 40 50 60", driverId: "dr-kodjo", carrier: "Transports Zio (fictif)", loadingDate: d("2026-09-10T06:45:00Z"), departureDate: d("2026-09-10T08:00:00Z"), arrivalDate: d("2026-09-12T08:15:00Z"), status: "receptionne", createdBy: "u-yawa", createdAt: d("2026-09-10T06:30:00Z") },
      { id: "tr-036", ref: "TR-2026-036", contractId: "ct-014", product: "soja", origin: "Anié", tonsKg: 15400, vehicle: "TG-7781-BC", driver: "Komi Tchalla", driverPhone: "97 70 80 90", driverId: "dr-komi", carrier: "Transports Zio (fictif)", loadingDate: d("2026-10-01T07:00:00Z"), departureDate: d("2026-10-01T08:30:00Z"), arrivalDate: d("2026-10-03T08:00:00Z"), status: "receptionne", createdBy: "u-yawa", createdAt: d("2026-10-01T06:50:00Z") },
      { id: "tr-040", ref: "TR-2026-040", contractId: "ct-017", product: "cacao", origin: "Badou", tonsKg: 12000, vehicle: "TG-7781-BC", driver: "Komi Tchalla", driverPhone: "97 70 80 90", driverId: "dr-komi", carrier: "Transports Agou (fictif)", loadingDate: d("2026-10-14T08:30:00Z"), departureDate: d("2026-10-14T10:00:00Z"), status: "en_route", createdBy: "u-yawa", createdAt: d("2026-10-14T08:40:00Z") },
      { id: "tr-041", ref: "TR-2026-041", contractId: "ct-017", product: "cacao", origin: "Badou", tonsKg: 80000, vehicle: "TG-5520-CA", driver: "Yao Gbadoé", driverPhone: "98 12 34 56", carrier: "Transports Agou (fictif)", loadingDate: d("2026-10-14T08:30:00Z"), departureDate: d("2026-10-14T10:00:00Z"), status: "en_route", pickupId: "pk-006", driverId: "dr-yao", createdBy: "u-yawa", createdAt: d("2026-10-14T08:35:00Z") },
    ],
    traces,
    checkins: [
      { id: "pt-028", transportId: "tr-028", plateSeen: "TG-4417-BQ", plateMismatch: false, driver: "Séna Akakpo", at: d("2026-09-26T09:05:00Z"), by: "u-edem", tonsAnnouncedKg: 30000, cost: 180000, costBeneficiary: "Transports Zio (fictif)", debitedOn: "solde_fournisseur" },
      { id: "pt-031", transportId: "tr-031", plateSeen: "TG-2093-AZ", plateMismatch: false, driver: "Kodjo Ahiadzi", at: d("2026-09-12T08:15:00Z"), by: "u-edem", tonsAnnouncedKg: 20000, cost: 250000, costBeneficiary: "Transports Zio (fictif)", debitedOn: "charges_patron" },
      { id: "pt-036", transportId: "tr-036", plateSeen: "TG-7781-BC", plateMismatch: false, driver: "Komi Tchalla", at: d("2026-10-03T08:00:00Z"), by: "u-edem", tonsAnnouncedKg: 15400, cost: 190000, costBeneficiary: "Transports Zio (fictif)", debitedOn: "charges_patron" },
    ],
    deliveries: [
      { id: "lv-028", contractId: "ct-009", transportId: "tr-028", grossKg: 30600, tareKg: 600, netKg: 30000, bags: 600, ticketNo: "PE-0907", status: "receptionnee", weighedAt: d("2026-09-26T10:05:00Z"), weighedBy: "u-edem", price: 210, value: 6300000, receivedAt: d("2026-09-26T10:20:00Z"), receivedBy: "u-patron" },
      { id: "lv-031", contractId: "ct-014", transportId: "tr-031", grossKg: 20400, tareKg: 400, netKg: 20000, bags: 400, ticketNo: "PE-0912", status: "receptionnee", weighedAt: d("2026-09-12T09:20:00Z"), weighedBy: "u-edem", price: 215, value: 4300000, receivedAt: d("2026-09-12T09:40:00Z"), receivedBy: "u-patron" },
      { id: "lv-036", contractId: "ct-014", transportId: "tr-036", grossKg: 15300, tareKg: 300, netKg: 15000, bags: 300, ticketNo: "PE-0931", status: "receptionnee", weighedAt: d("2026-10-03T09:10:00Z"), weighedBy: "u-edem", price: 215, value: 3225000, receivedAt: d("2026-10-03T09:45:00Z"), receivedBy: "u-patron" },
    ],
    partials: [],
    declarations: [
      { id: "dc-1", supplierId: "u-jamilana", contractId: "ct-014", date: d("2026-09-08T00:00:00Z"), place: "Sotouboua", producer: "Coopérative Espoir (fictive)", qtyKg: 22000, pricePaid: 205, mode: "especes", photo: "/demo/carnet.svg", createdAt: d("2026-09-08T18:00:00Z") },
      { id: "dc-2", supplierId: "u-jamilana", contractId: "ct-014", date: d("2026-09-28T00:00:00Z"), place: "Anié", qtyKg: 15400, pricePaid: 208, mode: "tmoney", createdAt: d("2026-09-28T18:00:00Z") },
      { id: "dc-3", supplierId: "u-jamilana", contractId: "ct-014", date: d("2026-10-12T00:00:00Z"), place: "Elavagnon", producer: "Groupement Lafia (fictif)", qtyKg: 6200, pricePaid: 210, mode: "especes", photo: "/demo/sacs.svg", createdAt: d("2026-10-12T18:00:00Z") },
      { id: "dc-4", supplierId: "u-kossi", contractId: "ct-017", date: d("2026-10-12T00:00:00Z"), place: "Badou", producer: "4 coopératives (fictives)", qtyKg: 80000, pricePaid: 195, mode: "especes", photo: "/demo/sacs.svg", createdAt: d("2026-10-12T19:00:00Z") },
      { id: "dc-5", supplierId: "u-afi", contractId: "ct-009", date: d("2026-09-20T00:00:00Z"), place: "Glazoué (Bénin)", qtyKg: 30000, pricePaid: 200, mode: "flooz", createdAt: d("2026-09-20T18:00:00Z") },
    ],
    payments: [],
    adjustments: [],
    commissions: [
      { id: "cm-014-1", contractId: "ct-014", ruleId: "cr-kg", beneficiaryId: "u-jamilana", baseKg: 20000, baseValue: 4300000, amount: 100000, status: "payee", calculatedAt: d("2026-09-13T09:00:00Z"), calculatedBy: "u-patron", validatedAt: d("2026-09-13T09:05:00Z"), validatedBy: "u-patron", paidAt: d("2026-09-14T10:00:00Z"), paidBy: "u-patron", mode: "tmoney", reference: "TM-55102 (fictif)" },
    ],
    expenses: [
      { id: "ch-028", category: "transport", label: "Transport TR-2026-028", amount: 180000, date: d("2026-09-26T09:05:00Z"), beneficiary: "Transports Zio (fictif)", transportId: "tr-028", contractId: "ct-009", debitedOn: "solde_fournisseur", by: "u-edem" },
      { id: "ch-031", category: "transport", label: "Transport TR-2026-031", amount: 250000, date: d("2026-09-12T08:15:00Z"), beneficiary: "Transports Zio (fictif)", transportId: "tr-031", contractId: "ct-014", debitedOn: "charges_patron", by: "u-edem" },
      { id: "ch-036", category: "transport", label: "Transport TR-2026-036", amount: 190000, date: d("2026-10-03T08:00:00Z"), beneficiary: "Transports Zio (fictif)", transportId: "tr-036", contractId: "ct-014", debitedOn: "charges_patron", by: "u-edem" },
      { id: "ch-cm1", category: "commission", label: "Commission CT-2026-014 · 20 t × 5 FCFA/kg", amount: 100000, date: d("2026-09-14T10:00:00Z"), beneficiary: "Jamilana Issifou", contractId: "ct-014", commissionId: "cm-014-1", debitedOn: "charges_patron", by: "u-patron" },
      { id: "ch-fv1", category: "frais_vehicule", label: "Carburant à Atakpamé · TG-5520-CA", amount: 65000, date: d("2026-10-17T12:10:00Z"), beneficiary: "Station Atakpamé (fictive)", transportId: "tr-041", vehicle: "TG-5520-CA", photo: "/demo/carnet.svg", debitedOn: "charges_patron", status: "a_valider", by: "u-yao" },
      { id: "ch-m1", category: "maintenance", label: "Vidange et pneus · TG-2093-AZ", amount: 145000, date: d("2026-10-06T10:00:00Z"), beneficiary: "Garage Bè-Kpota (fictif)", debitedOn: "charges_patron", by: "u-patron" },
    ],
    debts: [],
    notifications: [
      { id: "nt-1", to: "patron", title: "Contrat échu non soldé", body: "CT-2026-009 (Afi Lawson) : échéance du 30/09/2026 dépassée, solde de 180 000 FCFA.", link: "/contrats/fiche/?id=ct-009", at: d("2026-10-01T07:00:00Z"), by: "system", readBy: [] },
      { id: "nt-2", to: "patron", title: "Nouvelle proposition", body: "Afi Lawson propose 500 t de soja à 350 FCFA/kg pour BS-2026-021.", link: "/besoins/", at: d("2026-10-17T14:20:00Z"), by: "u-afi", readBy: [] },
      { id: "nt-3", to: "patron", title: "Nouvelle demande à confirmer", body: "Yawa Dossou demande la suppression du transport TR-2026-040 (saisie en double).", link: "/actions/", at: d("2026-10-14T09:00:00Z"), by: "u-yawa", readBy: [] },
      { id: "nt-5", to: "admin", title: "Frais de route à valider", body: "Yao Gbadoé déclare 65 000 FCFA de carburant (TG-5520-CA).", link: "/charges/", at: d("2026-10-17T12:10:00Z"), by: "u-yao", readBy: [] },
      { id: "nt-6", to: "magasinier", title: "Camion attendu à Lomé", body: "PK-2026-006 · TG-5520-CA (80 t de cacao) a passé Atakpamé.", link: "/reception/", at: d("2026-10-17T11:40:00Z"), by: "u-yao", readBy: [] },
      { id: "nt-4", to: "u-kossi", title: "Passage à Kaboli confirmé", body: "TR-2026-041 : 80 t réceptionnées à Kaboli par Yawa Dossou.", link: "/transports/fiche/?id=tr-041", at: d("2026-10-15T16:10:00Z"), by: "u-yawa", readBy: [] },
    ],
    pending: [
      { id: "pa-1", entity: "transports", entityId: "tr-040", label: "Transport TR-2026-040 · cacao · 80 t", kind: "suppression", reason: "Saisie en double de TR-2026-041 (même camion, même chargement).", by: "u-yawa", at: d("2026-10-14T09:00:00Z"), status: "en_attente" },
    ],
    audit: [
      { id: "au-0", at: d("2026-08-01T09:00:00Z"), by: "u-patron", action: "Création des comptes", entity: "utilisateurs", detail: "Comptes de démonstration créés", hash: "", prevHash: "" },
      { id: "au-1", at: d("2026-10-14T09:00:00Z"), by: "u-yawa", action: "Demande de suppression", entity: "transports", entityId: "tr-040", detail: "TR-2026-040 envoyé dans « Actions à confirmer »", hash: "", prevHash: "" },
      { id: "au-2", at: d("2026-10-17T11:40:00Z"), by: "u-yao", action: "Passage d'étape", entity: "traces", entityId: "tr-041", detail: "PK-2026-006 · Atakpamé", device: "Téléphone du chauffeur", hash: "", prevHash: "" },
    ],
    devices: [],
    outbox: [],
    settings: [defaultSettings(now)],
    consents: [],
    loginLogs: [],
    tracks: [],
    positions: [],
    shares: [],
    products: defaultProducts(now),
  };
}

export function defaultProducts(now = new Date().toISOString()): CatalogProduct[] {
  return [
    { id: "soja", name: "Soja", unit: "kg", category: "Oléagineux", price: 215, description: "Exemple modifiable par le patron.", createdAt: now, createdBy: "u-patron" },
    { id: "cacao", name: "Cacao", unit: "kg", category: "Fèves", price: 200, description: "Exemple modifiable par le patron.", createdAt: now, createdBy: "u-patron" },
  ];
}

export function defaultSettings(now = new Date().toISOString()): Settings {
  return {
    id: "settings", perms: defaultPerms(), weightGapThresholdPct: 1, maxFailedLogins: 5, lockMinutes: 15,
    stockAlertKg: 5000, dueSoonDays: 7, inactivityDays: 10, syncAlertHours: 24, debtBlockThreshold: 500000,
    resalePrice: { soja: 330, cacao: 240 },
    commissionRules: [
      { id: "cr-kg", label: "5 FCFA par kg livré (versée)", mode: "par_kg", value: 5, settlement: "versee", active: true },
      { id: "cr-pct", label: "2 % de la valeur livrée (déduite du solde)", mode: "pourcentage", value: 200, settlement: "deduite", active: true },
      { id: "cr-forfait", label: "Forfait 50 000 FCFA par contrat (versée)", mode: "forfait", value: 50000, settlement: "versee", active: true },
    ],
    seededAt: now,
    comptableTrackScope: [],
    speedStopMps: 0.5,
    speedWalkMps: 1.8,
    speedFastMps: 7,
  };
}

/** Graine complète, avec empreintes SHA-256 et signatures Ed25519 calculées. */
export function buildSealedSeed(): Promise<Database> {
  return sealDatabase(buildSeed());
}
