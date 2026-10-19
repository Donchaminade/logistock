// Modèle de données de la maquette LogiStock (aligné sur le cahier des charges, §6.3).
// Montants : entiers en FCFA. Quantités : entiers en kg. Dates : chaînes ISO 8601.

export type Role = "patron" | "gestionnaire" | "fournisseur";
export type Product = "soja" | "cacao";
export type Id = string;

export interface Entity {
  id: Id;
  /** Annulation logique : l'élément est masqué mais conservé (§3.3). */
  deleted?: boolean;
}

export interface User extends Entity {
  role: Role;
  name: string;
  /** 8 chiffres locaux, affichés par paires (ex. « 90 11 22 33 »). */
  phone: string;
  /** Identifiant de connexion alternatif. Facultatif pour un compte créé sans e-mail. */
  email?: string;
  password: string;
  title: string;
  zone?: string;
  active: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  createdBy?: Id;
}

export type NeedStatus = "ouvert" | "partiellement_couvert" | "couvert" | "clos" | "annule";
export interface Need extends Entity {
  ref: string;
  product: Product;
  qtyKg: number;
  indicativePrice: number;
  deadline: string;
  zone?: string;
  comment?: string;
  status: NeedStatus;
  createdBy: Id;
  createdAt: string;
}

export type OfferStatus = "soumise" | "acceptee" | "refusee" | "retiree";
export interface Offer extends Entity {
  needId: Id;
  supplierId: Id;
  qtyKg: number;
  price: number;
  advanceRequested: number;
  delayDays: number;
  origin?: string;
  status: OfferStatus;
  createdBy: Id;
  createdAt: string;
  decidedBy?: Id;
  decidedAt?: string;
  reason?: string;
  contractId?: Id;
}

export type ContractStatus = "brouillon" | "actif" | "clos" | "annule";
export interface Contract extends Entity {
  ref: string;
  needId?: Id;
  offerId?: Id;
  supplierId: Id;
  product: Product;
  /** Tonnes contractées, en kg. */
  qtyKg: number;
  initialPrice: number;
  /** Montant remis / avance prévue. */
  amount: number;
  moneyReceivedDate: string;
  deliveryDate: string;
  deliveryPlace: string;
  /** Case « transport payé ou non » : true = transport à la charge du patron. */
  transportPaidByPatron: boolean;
  status: ContractStatus;
  closedAs?: "solde" | "dette";
  createdBy: Id;
  createdAt: string;
}

export interface PriceRevision extends Entity {
  contractId: Id;
  oldPrice: number;
  newPrice: number;
  scope: "reliquat";
  option: "A" | "B";
  complement: number;
  remainderBeforeKg: number;
  remainderAfterKg: number;
  reason: string;
  effectiveAt: string;
  by: Id;
  at: string;
  signature: string;
}

export type PaymentMode = "especes" | "virement" | "flooz" | "tmoney" | "autre";
export type AdvanceStatus = "a_completer" | "validee" | "annulee";
export interface Advance extends Entity {
  contractId: Id;
  kind: "remise" | "complement";
  amount: number;
  qtyKg: number;
  unitPrice: number;
  date: string;
  mode: PaymentMode;
  reference?: string;
  photo?: string;
  status: AdvanceStatus;
  receiptNo: string;
  receiptHash: string;
  by: Id;
  at: string;
}

export interface Location extends Entity {
  name: string;
  type: "origine" | "etape" | "destination" | "autre";
  country: string;
  createdBy?: Id;
}

export type TransportStatus = "en_route" | "arrive" | "receptionne";
export interface Transport extends Entity {
  ref: string;
  contractId: Id;
  product: Product;
  origin: string;
  tonsKg: number;
  vehicle: string;
  driver: string;
  driverPhone?: string;
  carrier: string;
  loadingDate: string;
  departureDate: string;
  arrivalDate?: string;
  status: TransportStatus;
  createdBy: Id;
  createdAt: string;
}

export type TraceType =
  | "achat"
  | "chargement"
  | "etape"
  | "livraison_lieu_prevu"
  | "pointage_lome"
  | "pesee"
  | "reception";
export interface TraceEvent extends Entity {
  transportId: Id;
  order: number;
  type: TraceType;
  place: string;
  at: string;
  qtyKg: number;
  receiver: string;
  receiverRole: string;
  carrier?: string;
  vehicle?: string;
  driver?: string;
  comment?: string;
  photo?: string;
  by: Id;
  hash: string;
  prevHash: string;
}

export interface Checkin extends Entity {
  transportId: Id;
  plateSeen: string;
  plateMismatch: boolean;
  driver: string;
  at: string;
  by: Id;
  tonsAnnouncedKg: number;
  cost: number;
  costBeneficiary: string;
  debitedOn: "charges_patron" | "solde_fournisseur";
}

export interface Delivery extends Entity {
  contractId: Id;
  transportId?: Id;
  grossKg: number;
  tareKg: number;
  netKg: number;
  bags: number;
  ticketNo: string;
  price: number;
  value: number;
  receivedAt: string;
  receivedBy: Id;
}

export interface PartialDelivery extends Entity {
  contractId: Id;
  contractedKg: number;
  foundKg: number;
  remainderKg: number;
  reason: string;
  proof?: string;
  by: Id;
  at: string;
  seenByPatron: boolean;
}

export interface Declaration extends Entity {
  supplierId: Id;
  contractId: Id;
  date: string;
  place: string;
  producer?: string;
  qtyKg: number;
  pricePaid: number;
  mode: PaymentMode;
  photo?: string;
  createdAt: string;
}

export interface Payment extends Entity {
  direction: "fournisseur_vers_patron";
  kind: "remboursement";
  contractId: Id;
  debtId?: Id;
  amount: number;
  mode: PaymentMode;
  reference?: string;
  photo?: string;
  date: string;
  by: Id;
}

export interface Expense extends Entity {
  category: "transport" | "maintenance" | "commission" | "autre";
  label: string;
  amount: number;
  date: string;
  beneficiary: string;
  transportId?: Id;
  contractId?: Id;
  debitedOn: "charges_patron" | "solde_fournisseur";
  by: Id;
}

export type DebtStatus = "ouverte" | "en_remboursement" | "soldee";
export interface Debt extends Entity {
  contractId: Id;
  supplierId: Id;
  initial: number;
  createdAt: string;
  dueDate: string;
  status: DebtStatus;
}

export interface AppNotification extends Entity {
  /** Rôle destinataire, ou identifiant d'utilisateur. */
  to: Role | Id;
  title: string;
  body: string;
  link?: string;
  at: string;
  by: Id;
  readBy: Id[];
}

export type PendingKind = "suppression" | "modification_sensible";
export interface PendingAction extends Entity {
  entity: PermEntity;
  entityId: Id;
  label: string;
  kind: PendingKind;
  payload?: Record<string, unknown>;
  reason: string;
  by: Id;
  at: string;
  status: "en_attente" | "validee" | "refusee";
  decidedBy?: Id;
  decidedAt?: string;
  decisionReason?: string;
}

export interface AuditEntry extends Entity {
  at: string;
  by: Id;
  action: string;
  entity: string;
  entityId?: Id;
  detail: string;
  hash: string;
  prevHash: string;
}

export type PermEntity =
  | "fournisseurs"
  | "besoins"
  | "contrats"
  | "remises"
  | "transports"
  | "pointages"
  | "traces"
  | "partielles"
  | "lieux";
export type DeleteMode = "directe" | "confirmation" | "interdite";
export interface Perm {
  c: boolean;
  r: boolean;
  u: boolean;
  d: DeleteMode;
}
export type PermMatrix = Record<"gestionnaire" | "fournisseur", Record<PermEntity, Perm>>;

export interface Settings extends Entity {
  perms: PermMatrix;
  weightGapThresholdPct: number;
  seededAt: string;
}

/** Instantané complet des données, tel que le reçoit l'interface. */
export interface Database {
  users: User[];
  needs: Need[];
  offers: Offer[];
  contracts: Contract[];
  revisions: PriceRevision[];
  advances: Advance[];
  locations: Location[];
  transports: Transport[];
  traces: TraceEvent[];
  checkins: Checkin[];
  deliveries: Delivery[];
  partials: PartialDelivery[];
  declarations: Declaration[];
  payments: Payment[];
  expenses: Expense[];
  debts: Debt[];
  notifications: AppNotification[];
  pending: PendingAction[];
  audit: AuditEntry[];
  settings: Settings[];
}

export type Collection = keyof Database;
export type EntityOf<K extends Collection> = Database[K][number];
