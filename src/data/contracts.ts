// Contrats de la couche d'accès aux données.
// L'interface ne parle qu'à ces interfaces : aujourd'hui l'implémentation est locale (localStorage),
// demain une implémentation HTTP vers l'API Spring Boot prendra le relais sans toucher aux écrans.
import type {
  Adjustment, Advance, AppNotification, AuditEntry, CatalogProduct, Checkin, Collection, Commission, Contract, Database, Declaration, Debt,
  Delivery, Device, Driver, Entity, EntityOf, Expense, GeoPing, Id, Location, LocationConsent, LocationTrack, LoginLog, Need, Offer, OutboxItem, PartialDelivery, Payment,
  PendingAction, Pickup, PriceRevision, Settings, TraceEvent, TrackShare, Transport, User, Vehicle,
} from "@/lib/types";

export interface Repository<T extends Entity> {
  list(): Promise<T[]>;
  get(id: Id): Promise<T | undefined>;
  create(item: T): Promise<T>;
  update(id: Id, patch: Partial<T>): Promise<T>;
}

export type ProductRepository = Repository<CatalogProduct>;
export type UserRepository = Repository<User>;
export type NeedRepository = Repository<Need>;
export type OfferRepository = Repository<Offer>;
export type ContractRepository = Repository<Contract>;
export type PriceRevisionRepository = Repository<PriceRevision>;
export type AdvanceRepository = Repository<Advance>;
export type LocationRepository = Repository<Location>;
export type TransportRepository = Repository<Transport>;
export type TraceEventRepository = Repository<TraceEvent>;
export type CheckinRepository = Repository<Checkin>;
export type DeliveryRepository = Repository<Delivery>;
export type PartialDeliveryRepository = Repository<PartialDelivery>;
export type DeclarationRepository = Repository<Declaration>;
export type PaymentRepository = Repository<Payment>;
export type ExpenseRepository = Repository<Expense>;
export type DebtRepository = Repository<Debt>;
export type NotificationRepository = Repository<AppNotification>;
export type PendingActionRepository = Repository<PendingAction>;
export type AuditRepository = Repository<AuditEntry>;
export type SettingsRepository = Repository<Settings>;
export type DeviceRepository = Repository<Device>;
export type VehicleRepository = Repository<Vehicle>;
export type DriverRepository = Repository<Driver>;
export type PickupRepository = Repository<Pickup>;
export type AdjustmentRepository = Repository<Adjustment>;
export type CommissionRepository = Repository<Commission>;
export type OutboxRepository = Repository<OutboxItem>;
export type ConsentRepository = Repository<LocationConsent>;
export type LoginLogRepository = Repository<LoginLog>;
export type TrackRepository = Repository<LocationTrack>;
export type PositionRepository = Repository<GeoPing>;
export type ShareRepository = Repository<TrackShare>;

export interface Repositories {
  products: ProductRepository;
  users: UserRepository;
  needs: NeedRepository;
  offers: OfferRepository;
  contracts: ContractRepository;
  revisions: PriceRevisionRepository;
  advances: AdvanceRepository;
  locations: LocationRepository;
  transports: TransportRepository;
  traces: TraceEventRepository;
  checkins: CheckinRepository;
  deliveries: DeliveryRepository;
  partials: PartialDeliveryRepository;
  declarations: DeclarationRepository;
  payments: PaymentRepository;
  expenses: ExpenseRepository;
  debts: DebtRepository;
  notifications: NotificationRepository;
  pending: PendingActionRepository;
  audit: AuditRepository;
  settings: SettingsRepository;
  devices: DeviceRepository;
  vehicles: VehicleRepository;
  drivers: DriverRepository;
  pickups: PickupRepository;
  adjustments: AdjustmentRepository;
  commissions: CommissionRepository;
  outbox: OutboxRepository;
  consents: ConsentRepository;
  loginLogs: LoginLogRepository;
  tracks: TrackRepository;
  positions: PositionRepository;
  shares: ShareRepository;
}

// Vérification à la compilation : une entrée par collection, avec le bon type.
export type _Check = { [K in Collection]: Repository<EntityOf<K>> } extends Repositories ? true : never;

/** Photos et justificatifs (IndexedDB aujourd'hui, stockage objet S3 / Vercel Blob demain). */
export interface PhotoStore {
  put(dataUrl: string): Promise<string>;
  resolve(ref: string): Promise<string | undefined>;
  clear(): Promise<void>;
}

/** Session de l'onglet courant (un onglet = un utilisateur, pour la démo multi-rôles). */
export interface SessionStore {
  get(): Id | null;
  set(userId: Id | null): void;
}

/** Identifiant stable de l'appareil (autorisation d'appareil, code PIN, outbox). */
export interface DeviceStore {
  id(): string;
}

export type ChangeOrigin = "local" | "remote";

export interface DataSource {
  readonly kind: "local" | "http";
  repos: Repositories;
  photos: PhotoStore;
  session: SessionStore;
  device: DeviceStore;
  /** Instantané complet pour l'affichage. */
  snapshot(): Promise<Database>;
  /** Changement local (cet onglet) ou distant (autre onglet / serveur). */
  subscribe(listener: (origin: ChangeOrigin) => void): () => void;
  /** Remet les données de démonstration à zéro. */
  reset(): Promise<void>;
}
