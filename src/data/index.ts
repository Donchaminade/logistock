import type { DataSource } from "./contracts";
import { HttpDataSource } from "./http/httpDataSource";
import { LocalDataSource } from "./local/localDataSource";

let instance: DataSource | null = null;

/** Point d'entrée unique : local par défaut, HTTP si NEXT_PUBLIC_API_URL est défini. */
export function dataSource(): DataSource {
  if (!instance) {
    const api = process.env.NEXT_PUBLIC_API_URL;
    instance = api ? new HttpDataSource(api.replace(/\/$/, "")) : new LocalDataSource();
  }
  return instance;
}

export type * from "./contracts";
