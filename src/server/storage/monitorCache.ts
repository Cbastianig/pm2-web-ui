import { getDb } from "./client";
import { monitoring } from "./schema";
import { eq } from "drizzle-orm";

const cache = new Map<string, number | null>();

export function getMonitorId(name: string): number | null {
  if (cache.has(name)) return cache.get(name)!;
  const db = getDb();
  const rows = db
    .select({ id: monitoring.id })
    .from(monitoring)
    .where(eq(monitoring.pm2Name, name))
    .limit(1)
    .all();
  const id = rows[0]?.id ?? null;
  cache.set(name, id);
  return id;
}

export function invalidateMonitor(name: string) {
  cache.delete(name);
}

export function invalidateAllMonitors() {
  cache.clear();
}

export function rebuildMonitorCache(
  rows: Array<{ id: number; pm2Name: string }>,
) {
  cache.clear();
  for (const row of rows) {
    cache.set(row.pm2Name, row.id);
  }
}
