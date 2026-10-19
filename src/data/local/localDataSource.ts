// Implémentation locale : SEUL fichier de l'application qui touche localStorage / sessionStorage.
// Synchronisation en direct entre onglets : événement « storage » + BroadcastChannel.
import { buildSeed } from "@/lib/seed";
import type { Collection, Database, Entity, EntityOf, Id } from "@/lib/types";
import type { ChangeOrigin, DataSource, Repositories, Repository, SessionStore } from "../contracts";
import { IndexedDbPhotoStore } from "./photoStore";

const KEY = "logistock:db:v1";
const SESSION_KEY = "logistock:session";
const CHANNEL = "logistock-sync";

const COLLECTIONS: Collection[] = [
  "users", "needs", "offers", "contracts", "revisions", "advances", "locations", "transports", "traces", "checkins",
  "deliveries", "partials", "declarations", "payments", "expenses", "debts", "notifications", "pending", "audit", "settings",
];

export class LocalDataSource implements DataSource {
  readonly kind = "local" as const;
  readonly photos = new IndexedDbPhotoStore();
  readonly repos: Repositories;
  private listeners = new Set<(o: ChangeOrigin) => void>();
  private channel: BroadcastChannel | null = null;

  readonly session: SessionStore = {
    get: () => (typeof window === "undefined" ? null : window.sessionStorage.getItem(SESSION_KEY)),
    set: (id) => {
      if (id) window.sessionStorage.setItem(SESSION_KEY, id);
      else window.sessionStorage.removeItem(SESSION_KEY);
    },
  };

  constructor() {
    const repos = {} as Record<Collection, Repository<Entity>>;
    for (const k of COLLECTIONS) repos[k] = this.makeRepo(k) as unknown as Repository<Entity>;
    this.repos = repos as unknown as Repositories;
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key === KEY) this.emit("remote");
      });
      if ("BroadcastChannel" in window) {
        this.channel = new BroadcastChannel(CHANNEL);
        this.channel.onmessage = () => this.emit("remote");
      }
    }
  }

  private read(): Database {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as Database;
      } catch {
        /* données corrompues : on repart du jeu de démo */
      }
    }
    const seed = buildSeed();
    window.localStorage.setItem(KEY, JSON.stringify(seed));
    return seed;
  }

  private write(db: Database) {
    window.localStorage.setItem(KEY, JSON.stringify(db));
    this.channel?.postMessage({ at: Date.now() });
    this.emit("local");
  }

  private emit(o: ChangeOrigin) {
    this.listeners.forEach((l) => l(o));
  }

  private makeRepo<K extends Collection>(k: K): Repository<EntityOf<K>> {
    type T = EntityOf<K>;
    return {
      list: async () => [...(this.read()[k] as T[])],
      get: async (id: Id) => (this.read()[k] as T[]).find((x) => x.id === id),
      create: async (item: T) => {
        const db = this.read();
        (db[k] as T[]).push(item);
        this.write(db);
        return item;
      },
      update: async (id: Id, patch: Partial<T>) => {
        const db = this.read();
        const list = db[k] as T[];
        const i = list.findIndex((x) => x.id === id);
        if (i < 0) throw new Error(`Élément introuvable (${k}/${id})`);
        list[i] = { ...list[i]!, ...patch };
        this.write(db);
        return list[i]!;
      },
    };
  }

  async snapshot(): Promise<Database> {
    return this.read();
  }

  subscribe(listener: (o: ChangeOrigin) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async reset() {
    await this.photos.clear();
    this.write(buildSeed());
  }
}
