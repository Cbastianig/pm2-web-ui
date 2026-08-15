import { getDb } from "./client";
import { monitoring, logEntries } from "./schema";
import { eq, gte, lte, and, desc, min, max } from "drizzle-orm";

export type Db = ReturnType<typeof getDb>;

export function findMonitorId(
  db: Db,
  processName: string,
): number | null {
  const rows = db
    .select()
    .from(monitoring)
    .where(eq(monitoring.pm2Name, processName))
    .all();
  return rows[0]?.id ?? null;
}

export function queryStoredLogs(
  db: Db,
  monitorId: number,
  opts: { from?: number; to?: number; limit?: number } = {},
) {
  const conds = [eq(logEntries.monitorId, monitorId)];
  if (opts.from !== undefined) conds.push(gte(logEntries.loggedAt, opts.from));
  if (opts.to !== undefined) conds.push(lte(logEntries.loggedAt, opts.to));

  const query = db
    .select()
    .from(logEntries)
    .where(and(...conds))
    .orderBy(desc(logEntries.loggedAt));

  const rows =
    opts.limit !== undefined ? query.limit(opts.limit).all() : query.all();

  return rows.reverse();
}

export function getStoredLogsBounds(db: Db, monitorId: number) {
  const bounds = db
    .select({ min: min(logEntries.loggedAt), max: max(logEntries.loggedAt) })
    .from(logEntries)
    .where(eq(logEntries.monitorId, monitorId))
    .all()[0];

  return { min: bounds?.min ?? null, max: bounds?.max ?? null };
}
