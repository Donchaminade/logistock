// Implémentation HTTP (à brancher sur l'API Spring Boot, préfixe /api/v1 — cahier des charges §6.4).
// Activée quand NEXT_PUBLIC_API_URL est défini. Les écrans et les services ne changent pas.
import type { Collection, Database, Entity, EntityOf, Id } from "@/lib/types";
import type { ChangeOrigin, DataSource, DeviceStore, PhotoStore, Repositories, Repository, SessionStore } from "../contracts";

/** Correspondance collection → ressource REST. À ajuster selon les contrôleurs Spring Boot. */
export const ENDPOINTS: Record<Collection, string> = {
  users: "users", needs: "needs", offers: "offers", contracts: "contracts", revisions: "price-revisions",
  advances: "advances", locations: "locations", transports: "transports", traces: "lot-trace-events",
  checkins: "arrival-checkins", deliveries: "deliveries", partials: "partial-deliveries",
  declarations: "declarations", payments: "repayments", expenses: "expenses", debts: "debts",
  notifications: "notifications", pending: "pending-actions", audit: "audit-log", settings: "settings",
  devices: "devices", vehicles: "vehicles", drivers: "drivers", pickups: "pickup-orders", adjustments: "adjustments",
  commissions: "commissions", outbox: "sync/outbox",
  consents: "location-consents", loginLogs: "login-logs", tracks: "location-tracks",
  positions: "location-positions", shares: "location-shares",
};

export class HttpDataSource implements DataSource {
  readonly kind = "http" as const;
  readonly repos: Repositories;
  private listeners = new Set<(o: ChangeOrigin) => void>();
  private token: string | null = null;

  constructor(private baseUrl: string, private pollMs = 10000) {
    const repos = {} as Record<Collection, Repository<Entity>>;
    for (const k of Object.keys(ENDPOINTS) as Collection[]) repos[k] = this.makeRepo(k) as unknown as Repository<Entity>;
    this.repos = repos as unknown as Repositories;
    // Synchronisation simple par interrogation ; à remplacer par SSE / WebSocket si l'API les propose.
    if (typeof window !== "undefined") setInterval(() => this.listeners.forEach((l) => l("remote")), this.pollMs);
  }

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v1/${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...init?.headers },
    });
    if (!res.ok) throw new Error(`API ${res.status} sur ${path}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  private makeRepo<K extends Collection>(k: K): Repository<EntityOf<K>> {
    type T = EntityOf<K>;
    const ep = ENDPOINTS[k];
    const changed = <R>(r: R) => (this.listeners.forEach((l) => l("local")), r);
    return {
      list: () => this.call<T[]>(ep),
      get: (id: Id) => this.call<T>(`${ep}/${id}`),
      create: (item: T) => this.call<T>(ep, { method: "POST", body: JSON.stringify(item) }).then(changed),
      update: (id: Id, patch: Partial<T>) => this.call<T>(`${ep}/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).then(changed),
    };
  }

  async snapshot(): Promise<Database> {
    const keys = Object.keys(ENDPOINTS) as Collection[];
    const lists = await Promise.all(keys.map((k) => this.repos[k].list()));
    return Object.fromEntries(keys.map((k, i) => [k, lists[i]])) as unknown as Database;
  }

  subscribe(listener: (o: ChangeOrigin) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async reset() {
    throw new Error("La réinitialisation de la démo n'existe qu'en mode local.");
  }

  readonly photos: PhotoStore = {
    put: async (dataUrl) => (await this.call<{ ref: string }>("files", { method: "POST", body: JSON.stringify({ dataUrl }) })).ref,
    resolve: async (ref) => (ref.startsWith("http") || ref.startsWith("/") ? ref : `${this.baseUrl}/api/v1/files/${ref}`),
    clear: async () => undefined,
  };

  readonly session: SessionStore = {
    get: () => this.sessionUser,
    set: (id) => {
      this.sessionUser = id;
      if (!id) {
        this.token = null;
        this.listeners.forEach((l) => l("local"));
      }
    },
  };
  private sessionUser: Id | null = null;

  readonly device: DeviceStore = {
    id: () => {
      let id = window.localStorage.getItem("logistock:device");
      if (!id) {
        id = `ap-${crypto.randomUUID()}`;
        window.localStorage.setItem("logistock:device", id);
      }
      return id;
    },
  };
}
