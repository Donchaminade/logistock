import type { PhotoStore } from "../contracts";

const DB_NAME = "logistock-photos";
const STORE = "photos";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Photos stockées en base64 dans IndexedDB ; références « idb:… ». Les images de démo sont des chemins publics. */
export class IndexedDbPhotoStore implements PhotoStore {
  async put(dataUrl: string): Promise<string> {
    const id = `ph-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(dataUrl, id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    return `idb:${id}`;
  }

  async resolve(ref: string): Promise<string | undefined> {
    if (!ref.startsWith("idb:")) return ref;
    const db = await open();
    return new Promise((res) => {
      const req = db.transaction(STORE).objectStore(STORE).get(ref.slice(4));
      req.onsuccess = () => res(req.result as string | undefined);
      req.onerror = () => res(undefined);
    });
  }

  async clear() {
    const db = await open();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  }
}
