// Modèle de données de la maquette LogiStock (aligné sur le cahier des charges, §6.3).
// Montants : entiers en FCFA. Quantités : entiers en kg. Dates : chaînes ISO 8601.

export type Role = "patron" | "admin" | "gestionnaire" | "fournisseur" | "magasinier" | "chauffeur" | "comptable";
/** Rôles soumis à la matrice de droits (le patron a tous les droits). */
export type ManagedRole = Exclude<Role, "patron">;
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
  /** Numéro local (« 90 11 22 33 ») ou international (« +33612345678 »). */
  phone: string;
  /** Identifiant de connexion alternatif. Facultatif pour un compte créé sans e-mail. */
  email?: string;
  password: string;
  title: string;
  zone?: string;
  active: boolean;
  mustChangePassword?: boolean;
  /** Échecs de connexion consécutifs (US-01). */
  failedAttempts?: number;
  /** Compte bloqué temporairement jusqu'à cette date. */
  lockedUntil?: string;
  createdAt: string;
  createdBy?: Id;
  /** Gestionnaire dont cet employé fait partie de l'équipe. */
  managerId?: Id;
}

/** Appareil autorisé : code PIN pour déverrouiller, y compris hors ligne (US-01, §6.5). */
export interface Device extends Entity {
  userId: Id;
  label: string;
  /** SHA-256(sel + PIN), jamais le PIN en clair. */
  pinHash: string;
  salt: string;
  authorizedAt: string;
  lastUnlockAt?: string;
  failedPins: number;
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

export type ContractStatus = "brouillon" | "actif" | "suspendu" | "clos" | "annule";
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
  closedAs?: "solde" | "dette" | "rembourse" | "reporte";
  /** Règle de commission applicable (§2.1). */
  commissionRuleId?: Id;
  /** Contrat qui a reçu le report du solde (§1.10). */
  carriedTo?: Id;
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
  /** SHA-256 du contenu signé, chaîné avec la révision précédente du contrat. */
  hash: string;
  prevHash: string;
  /** Signature Ed25519 (hex) du hash. */
  signature: string;
  /** Accusé de lecture du fournisseur (§1.4). */
  ackAt?: string;
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
  /** SHA-256 (hex) du contenu du reçu. */
  receiptHash: string;
  /** Signature Ed25519 (hex) de l'empreinte. */
  receiptSignature: string;
  by: Id;
  at: string;
  /** Contre-écriture : motif de l'annulation. */
  cancelReason?: string;
}

export interface Location extends Entity {
  name: string;
  type: "origine" | "etape" | "destination" | "autre";
  country: string;
  /** Coordonnées facultatives (carte des trajets). */
  lat?: number;
  lng?: number;
  createdBy?: Id;
}

export interface Vehicle extends Entity {
  plate: string;
  type: string;
  capacityKg: number;
  owner: string;
  active: boolean;
}

export interface Driver extends Entity {
  name: string;
  phone: string;
  licence?: string;
  /** Compte chauffeur lié (facultatif). */
  userId?: Id;
  active: boolean;
}

export interface RouteStage {
  id: Id;
  order: number;
  place: string;
  passedAt?: string;
  comment?: string;
  photo?: string;
  by?: Id;
}

export interface PickupStop {
  id: Id;
  supplierId: Id;
  contractId: Id;
  plannedKg: number;
  loadedKg?: number;
  bags?: number;
  photo?: string;
  confirmedAt?: string;
  confirmedBy?: Id;
  /** Lot (transport) créé à la confirmation du chargement. */
  transportId?: Id;
}

/** Ordre d'enlèvement (§2.4, US-06) : un véhicule, un chauffeur, des acheteurs à visiter, un trajet. */
export interface Pickup extends Entity {
  ref: string;
  vehicle: string;
  driverId: Id;
  carrier: string;
  plannedDate: string;
  stops: PickupStop[];
  route: RouteStage[];
  arrivalDeclaredAt?: string;
  arrivalPhoto?: string;
  createdBy: Id;
  createdAt: string;
}
export type PickupStatus = "planifie" | "en_route" | "charge" | "livre" | "cloture";

export type TransportStatus = "en_route" | "arrive" | "receptionne";
/** Transport = lot suivi de son origine jusqu'à Lomé (traçabilité par lot, §2.9). */
export interface Transport extends Entity {
  ref: string;
  contractId: Id;
  pickupId?: Id;
  driverId?: Id;
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
  | "arrivee_declaree"
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
  /** SHA-256 (hex) de l'événement, chaîné avec l'événement précédent du lot. */
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
  photo?: string;
}

export type DeliveryStatus = "pesee" | "receptionnee" | "contestee";
export interface Delivery extends Entity {
  contractId: Id;
  transportId?: Id;
  grossKg: number;
  tareKg: number;
  netKg: number;
  bags: number;
  ticketNo: string;
  ticketPhoto?: string;
  /** Humidité (%) : facultatif, utile pour le cacao. */
  humidity?: number;
  status: DeliveryStatus;
  weighedAt: string;
  weighedBy: Id;
  /** Prix figé à la réception (0 tant que la livraison n'est que pesée). */
  price: number;
  value: number;
  receivedAt?: string;
  receivedBy?: Id;
  disputeReason?: string;
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
  /** Clé d'idempotence générée sur l'appareil (§6.2). */
  clientUuid?: string;
}

export interface Payment extends Entity {
  direction: "fournisseur_vers_patron" | "patron_vers_fournisseur";
  /** remboursement en argent, en marchandise (valorisée au prix en vigueur), ou règlement d'un trop-livré. */
  kind: "remboursement" | "marchandise" | "trop_livre";
  contractId: Id;
  debtId?: Id;
  amount: number;
  qtyKg?: number;
  mode: PaymentMode;
  reference?: string;
  photo?: string;
  date: string;
  by: Id;
}

export type ExpenseCategory = "transport" | "maintenance" | "commission" | "frais_vehicule" | "autre";
export interface Expense extends Entity {
  category: ExpenseCategory;
  label: string;
  amount: number;
  date: string;
  beneficiary: string;
  transportId?: Id;
  contractId?: Id;
  commissionId?: Id;
  vehicle?: string;
  photo?: string;
  debitedOn: "charges_patron" | "solde_fournisseur";
  /** Frais déclarés par un chauffeur : à valider par le patron ou l'admin. */
  status?: "a_valider" | "validee" | "refusee";
  by: Id;
}

/** Ajustement J du solde (§1.5) : positif = réduit ce que doit le fournisseur. */
export interface Adjustment extends Entity {
  contractId: Id;
  amount: number;
  kind: "perte_acceptee" | "correction" | "commission" | "report_sortant" | "report_entrant";
  reason: string;
  by: Id;
  at: string;
  linkedContractId?: Id;
}

export type CommissionMode = "par_kg" | "pourcentage" | "forfait";
export interface CommissionRule {
  id: Id;
  label: string;
  mode: CommissionMode;
  /** FCFA/kg, pourcentage en points de base (200 = 2 %), ou montant forfaitaire. */
  value: number;
  /** versee : payée à part (charge du patron) ; deduite : déduite du solde de l'acheteur. */
  settlement: "versee" | "deduite";
  active: boolean;
}

export type CommissionStatus = "calculee" | "validee" | "payee";
export interface Commission extends Entity {
  contractId: Id;
  ruleId: Id;
  beneficiaryId: Id;
  /** Base de calcul couverte par cette commission (écart depuis la précédente). */
  baseKg: number;
  baseValue: number;
  amount: number;
  status: CommissionStatus;
  calculatedAt: string;
  calculatedBy: Id;
  validatedAt?: string;
  validatedBy?: Id;
  paidAt?: string;
  paidBy?: Id;
  mode?: PaymentMode | "deduction";
  reference?: string;
}

export type DebtStatus = "ouverte" | "en_remboursement" | "en_litige" | "soldee" | "passee_en_perte";
export interface Debt extends Entity {
  contractId: Id;
  supplierId: Id;
  initial: number;
  createdAt: string;
  dueDate: string;
  status: DebtStatus;
  comment?: string;
  writeOffReason?: string;
  writeOffSignature?: string;
}

/** File d'attente hors ligne (outbox, §6.2) : une entrée par opération saisie sans réseau. */
export interface OutboxItem extends Entity {
  /** Clé d'idempotence (UUID généré sur l'appareil). */
  uuid: string;
  label: string;
  by: Id;
  at: string;
  /** Appareil qui a saisi l'opération. */
  device: string;
  status: "en_attente" | "synchronise";
  syncedAt?: string;
  /** Notifications retenues jusqu'à la synchronisation. */
  notificationIds: Id[];
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
  /** Retenue dans l'outbox tant que l'appareil émetteur est hors ligne. */
  deferred?: boolean;
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
  /** Valeurs avant / après (JSON), quand l'action modifie un élément existant. */
  before?: string;
  after?: string;
  device?: string;
  /** SHA-256 (hex) du contenu de la ligne et du hash de la ligne précédente. */
  hash: string;
  prevHash: string;
  /** Position jointe à une remise, une transmission ou une modification de compte. */
  lat?: number;
  lng?: number;
  accuracy?: number;
  positionNote?: string;
}

export type PermEntity =
  | "utilisateurs" | "fournisseurs" | "droits" | "parametres" | "besoins" | "propositions" | "contrats" | "remises"
  | "revisions" | "partielles" | "declarations" | "transports" | "pointages" | "couts" | "traces" | "pesees"
  | "dettes" | "pertes" | "commissions" | "charges" | "actions" | "tableau" | "journal" | "exports" | "lieux" | "vehicules";
export type DeleteMode = "directe" | "confirmation" | "interdite";
export interface Perm {
  c: boolean;
  r: boolean;
  u: boolean;
  d: DeleteMode;
  /** Portée limitée aux données de l'utilisateur (« P » du cahier). */
  own?: boolean;
}
export type PermMatrix = Record<ManagedRole, Record<PermEntity, Perm>>;

export interface Settings extends Entity {
  perms: PermMatrix;
  weightGapThresholdPct: number;
  /** Connexion : échecs avant blocage et durée du blocage (US-01). */
  maxFailedLogins: number;
  lockMinutes: number;
  /** Alertes (§2.7). */
  stockAlertKg: number;
  dueSoonDays: number;
  inactivityDays: number;
  syncAlertHours: number;
  /** Blocage d'une nouvelle avance si la dette ouverte du fournisseur dépasse ce montant (0 = désactivé). */
  debtBlockThreshold: number;
  /** Prix de revente estimés, pour la marge (§1.7). */
  resalePrice: Record<Product, number>;
  commissionRules: CommissionRule[];
  seededAt: string;
  /** Employés que le comptable est autorisé à suivre. Réservé au patron. */
  comptableTrackScope: Id[];
  /** Seuils de vitesse du marqueur (m/s) : repos, marche, course, puis moto en mode automatique. */
  speedStopMps: number;
  speedWalkMps: number;
  speedFastMps: number;
}

export type MarkerChoice = "auto" | "marche" | "course" | "moto" | "voiture";

/** Preuve de consentement à la localisation (ou de son retrait). */
export interface LocationConsent extends Entity {
  userId: Id;
  policyVersion: string;
  granted: boolean;
  at: string;
  userAgent: string;
  /** Image de la signature dessinée. Absente en cas de retrait. */
  signature?: string;
}

export type PositionStatus = "ok" | "refusee" | "indisponible" | "timeout" | "sans_consentement";

/** Journal de connexion : horaire, compte, position et motif d'échec. */
export interface LoginLog extends Entity {
  userId?: Id;
  account: string;
  at: string;
  success: boolean;
  reason?: string;
  method: "mot_de_passe" | "pin";
  lat?: number;
  lng?: number;
  accuracy?: number;
  positionStatus: PositionStatus;
  userAgent: string;
}

/** Suivi de sécurité d'un employé. S'arrête au plus tard 30 jours après l'activation. */
export interface LocationTrack extends Entity {
  subjectId: Id;
  by: Id;
  reason: string;
  startedAt: string;
  expiresAt: string;
  active: boolean;
  endedAt?: string;
  endedBy?: Id | "system";
  endReason?: string;
  markerMode: MarkerChoice;
  /** Utilisateurs, autres que le patron, autorisés à créer un lien de partage. */
  shareUserIds: Id[];
}

/** Dernière position publiée tant que l'application est ouverte. */
export interface GeoPing extends Entity {
  userId: Id;
  lat: number;
  lng: number;
  accuracy: number;
  at: string;
  prevLat?: number;
  prevLng?: number;
  prevAt?: string;
  speedMps?: number;
  headingDeg?: number;
  context: "suivi" | "livraison";
  transportId?: Id;
  live: boolean;
}

/** Lien temporaire de consultation en lecture seule. */
export interface TrackShare extends Entity {
  trackId: Id;
  token: string;
  recipientName: string;
  reason: string;
  by: Id;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  revokedBy?: Id;
}

/** Instantané complet des données, tel que le reçoit l'interface. */
export interface Database {
  users: User[];
  devices: Device[];
  needs: Need[];
  offers: Offer[];
  contracts: Contract[];
  revisions: PriceRevision[];
  advances: Advance[];
  locations: Location[];
  vehicles: Vehicle[];
  drivers: Driver[];
  pickups: Pickup[];
  transports: Transport[];
  traces: TraceEvent[];
  checkins: Checkin[];
  deliveries: Delivery[];
  partials: PartialDelivery[];
  declarations: Declaration[];
  payments: Payment[];
  expenses: Expense[];
  adjustments: Adjustment[];
  commissions: Commission[];
  debts: Debt[];
  notifications: AppNotification[];
  pending: PendingAction[];
  audit: AuditEntry[];
  outbox: OutboxItem[];
  settings: Settings[];
  consents: LocationConsent[];
  loginLogs: LoginLog[];
  tracks: LocationTrack[];
  positions: GeoPing[];
  shares: TrackShare[];
}

export type Collection = keyof Database;
export type EntityOf<K extends Collection> = Database[K][number];
