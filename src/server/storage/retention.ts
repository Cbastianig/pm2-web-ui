import { logEntries, processMetrics } from "./schema";
import { eq, lte, desc, and } from "drizzle-orm";
import type { Db } from "./logQueries";

export function pruneLogsByCount(
  db: Db,
  monitorId: number,
  maxLines: number,
) {
  if (maxLines <= 0) return;
  const threshold = db
    .select({ id: logEntries.id })
    .from(logEntries)
    .where(eq(logEntries.monitorId, monitorId))
    .orderBy(desc(logEntries.id))
    .limit(1)
    .offset(maxLines)
    .all()[0];
  if (!threshold) return;
  db.delete(logEntries)
    .where(
      and(
        eq(logEntries.monitorId, monitorId),
        lte(logEntries.id, threshold.id),
      ),
    )
    .run();
}

export function pruneMetricsByCount(
  db: Db,
  monitorId: number,
  maxSamples: number,
) {
  if (maxSamples <= 0) return;
  const threshold = db
    .select({ id: processMetrics.id })
    .from(processMetrics)
    .where(eq(processMetrics.monitorId, monitorId))
    .orderBy(desc(processMetrics.id))
    .limit(1)
    .offset(maxSamples)
    .all()[0];
  if (!threshold) return;
  db.delete(processMetrics)
    .where(
      and(
        eq(processMetrics.monitorId, monitorId),
        lte(processMetrics.id, threshold.id),
      ),
    )
    .run();
}
