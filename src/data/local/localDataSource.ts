// Implémentation locale : SEUL fichier de l'application qui touche localStorage / sessionStorage.
// Synchronisation en direct entre onglets : événement « storage » + BroadcastChannel.
import { buildSealedSeed, DEMO_ACCOUNTS, OTHER_ACCOUNTS } from "@/lib/seed";
import { uuid } from "@/lib/crypto";
import type { Collection, Database, Entity, EntityOf, Id } from "@/lib/types";
import type { ChangeOrigin, DataSource, DeviceStore, Repositories, Repository, SessionStore } from "../contracts";
import { IndexedDbPhotoStore } from "./photoStore";

const KEY = "logistock:db:v2";

/** Les comptes de démo déjà en localStorage reçoivent leur e-mail sans effacer la démo en cours. */
function backfillDemoEmails(db: Database): Database {
  const emails = new Map<string, string>([...DEMO_ACCOUNTS, ...OTHER_ACCOUNTS].map((a) => [a.id, a.email]));
  let changed = false;
  const users = db.users.map((u) => {
    const email = emails.get(u.id);
    if (!email || u.email) return u;
    changed = true;
    return { ...u, email };
  });
  return changed ? { ...db, users } : db;
}

/** Anciennes démos : champs de localisation et rattachements d'équipe. */
function backfillLocation(db: Database): Database {
  const managers: Record<string, string> = { "u-mawuli": "u-edem", "u-yao": "u-yawa" };
  let changed = false;
  const users = db.users.map((u) => {
    const managerId = managers[u.id];
    if (!managerId || u.managerId) return u;
    changed = true;
    return { ...u, managerId };
  });
  const s = db.settings[0];
  let settings = db.settings;
  if (s && (s.comptableTrackScope == null || s.speedStopMps == null || s.speedWalkMps == null || s.speedFastMps == null)) {
    changed = true;
    settings = [{ ...s, comptableTrackScope: s.comptableTrackScope ?? [], speedStopMps: s.speedStopMps ?? 0.5, speedWalkMps: s.speedWalkMps ?? 1.8, speedFastMps: s.speedFastMps ?? 7 }];
  }
  return changed ? { ...db, users, settings } : db;
}
const DEVICE_KEY = "logistock:device";
const SESSION_KEY = "logistock:session";
const CHANNEL = "logistock-sync";

export const COLLECTIONS: Collection[] = [
  "users", "devices", "needs", "offers", "contracts", "revisions", "advances", "locations", "vehicles", "drivers", "pickups",
  "transports", "traces", "checkins", "deliveries", "partials", "declarations", "payments", "expenses", "adjustments",
  "commissions", "debts", "notifications", "pending", "audit", "outbox", "settings",
  "consents", "loginLogs", "tracks", "positions", "shares",
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
      if (typeof window === "undefined") return;
      if (id) window.sessionStorage.setItem(SESSION_KEY, id);
      else {
        window.sessionStorage.removeItem(SESSION_KEY);
        // La session n'est pas dans la base : sans cet avis, l'écran reste sur l'utilisateur précédent.
        this.emit("local");
      }
    },
  };

  /** Identifiant de cet appareil (navigateur), conservé d'une session à l'autre. */
  readonly device: DeviceStore = {
    id: () => {
      let id = window.localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = `ap-${uuid()}`;
        window.localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    },
  };

  private seeding: Promise<void> | null = null;

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

  /** Crée la graine scellée (SHA-256 + Ed25519, calculs asynchrones) au premier lancement. */
  private ensure(): Promise<void> {
    if (!this.seeding) {
      this.seeding = (async () => {
        if (this.parse()) return;
        const seed = await buildSealedSeed();
        if (!this.parse()) window.localStorage.setItem(KEY, JSON.stringify(seed));
      })();
    }
    return this.seeding;
  }

  private parse(): Database | null {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const db = JSON.parse(raw) as Database;
      // Données d'une version antérieure : collections manquantes ajoutées vides.
      for (const k of COLLECTIONS) if (!Array.isArray(db[k])) (db[k] as unknown[]) = [];
      if (!db.settings?.length) return null;
      const migrated = backfillLocation(backfillDemoEmails(db));
      if (migrated !== db) window.localStorage.setItem(KEY, JSON.stringify(migrated));
      return migrated;
    } catch {
      return null; // données corrompues : on repart du jeu de démo
    }
  }

  private read(): Database {
    const db = this.parse();
    if (!db) throw new Error("Données locales indisponibles : rechargez la page.");
    return db;
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
      list: async () => (await this.ensure(), [...(this.read()[k] as T[])]),
      get: async (id: Id) => (await this.ensure(), (this.read()[k] as T[]).find((x) => x.id === id)),
      create: async (item: T) => {
        await this.ensure();
        const db = this.read();
        (db[k] as T[]).push(item);
        this.write(db);
        return item;
      },
      update: async (id: Id, patch: Partial<T>) => {
        await this.ensure();
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
    await this.ensure();
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
    this.write(await buildSealedSeed());
  }
}
