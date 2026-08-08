import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { initDb } from "@/server/storage/client";
import { startLogBus } from "@/server/events/logBus";
import { initAlerting } from "@/server/alerting";
import { startAppManager } from "@/server/ops";

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

    const processes = await loadProcessList();
    const now = Date.now();

    for (const mon of monRows) {
      const proc = processes.find((p) => p.name === mon.pm2Name);
      if (!proc) continue;
      const summary = normalizeProcessSummary(proc);
      db.insert(processMetrics)
        .values({
          monitorId: mon.id,
          sampledAt: now,
          cpu: summary.cpu,
          memory: summary.memory,
          restarts: summary.restarts,
          uptime: summary.uptime,
          status: summary.status,
          pid: summary.pid,
        })
        .run();
    }
  } catch {}
}, 20 * 1000).unref();

// Host metrics collection every 30 seconds
setInterval(() => {
  try {
    const snapshot = collectHostMetrics();
    storeHostSnapshot(snapshot);
  } catch {}
}, 30 * 1000).unref();

export default createServerEntry({
  async fetch(request) {
    return handler.fetch(request);
  },
});
