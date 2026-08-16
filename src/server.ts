import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { initDb } from "@/server/storage/client";
import { startLogBus } from "@/server/events/logBus";
import { initAlerting } from "@/server/alerting";
import { startAppManager } from "@/server/ops";
import { serveStatic } from "@/server/static";

initDb();
startLogBus();
initAlerting();
startAppManager();

import { getDb } from "@/server/storage/client";
import {
  logEntries,
  processMetrics,
  hostMetrics,
  monitoring as monTable,
} from "@/server/storage/schema";
import { readEnv } from "@/lib/env";
import { lte } from "drizzle-orm";
import { loadProcessList, normalizeProcessSummary } from "@/server/pm2";
import { collectHostMetrics, storeHostSnapshot } from "@/server/host/metrics";
import { rebuildMonitorCache } from "@/server/storage/monitorCache";
import { pruneLogsByCount, pruneMetricsByCount } from "@/server/storage/retention";

// Cleanup expired data every 10 minutes
setInterval(
  () => {
    try {
      const db = getDb();
      const now = Date.now();
      const logsRetention = readEnv("LOGS_RETENTION_MS");
      const metricsRetention = readEnv("METRICS_RETENTION_MS");

      db.delete(logEntries)
        .where(lte(logEntries.loggedAt, now - logsRetention))
        .run();
      db.delete(processMetrics)
        .where(lte(processMetrics.sampledAt, now - metricsRetention))
        .run();
      db.delete(hostMetrics)
        .where(lte(hostMetrics.sampledAt, now - metricsRetention))
        .run();

      const monRows = db.select().from(monTable).all();
      const logCap = readEnv("MAX_LOG_LINES_PER_MONITOR");
      const metricCap = readEnv("MAX_METRIC_SAMPLES_PER_MONITOR");
      for (const mon of monRows) {
        pruneLogsByCount(db, mon.id, logCap);
        pruneMetricsByCount(db, mon.id, metricCap);
      }
    } catch {}
  },
  10 * 60 * 1000,
).unref();

// Process metrics scheduler every 20 seconds
setInterval(async () => {
  try {
    const db = getDb();
    const monRows = db.select().from(monTable).all();
    if (monRows.length === 0) return;

    rebuildMonitorCache(monRows);

    const processes = await loadProcessList();
    const now = Date.now();

    const procByName = new Map(processes.map((p) => [p.name, p]));
    const rows: Array<typeof processMetrics.$inferInsert> = [];
    for (const mon of monRows) {
      const proc = procByName.get(mon.pm2Name);
      if (!proc) continue;
      const summary = normalizeProcessSummary(proc);
      rows.push({
        monitorId: mon.id,
        sampledAt: now,
        cpu: summary.cpu,
        memory: summary.memory,
        restarts: summary.restarts,
        uptime: summary.uptime,
        status: summary.status,
        pid: summary.pid,
      });
    }

    if (rows.length > 0) {
      db.transaction((tx) => {
        tx.insert(processMetrics).values(rows).run();
      });
    }
  } catch {}
}, 20 * 1000).unref();

// Host metrics collection every 30 seconds
let collectingHostMetrics = false;
setInterval(async () => {
  if (collectingHostMetrics) return;
  collectingHostMetrics = true;
  try {
    const snapshot = await collectHostMetrics();
    storeHostSnapshot(snapshot);
  } catch {
  } finally {
    collectingHostMetrics = false;
  }
}, 30 * 1000).unref();

export default createServerEntry({
  async fetch(request) {
    const staticResponse = await serveStatic(request);
    if (staticResponse) return staticResponse;
    return handler.fetch(request);
  },
});
