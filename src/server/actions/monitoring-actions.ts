import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "@/server/storage/client";
import { monitoring, logEntries, processMetrics, alertPrefs } from "@/server/storage/schema";
import { eq, desc } from "drizzle-orm";

export const toggleAlertPrefsFn = createServerFn({ method: "POST" })
  .validator(z.object({ pm2Name: z.string(), alertsEnabled: z.boolean() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const existing = db
      .select()
      .from(alertPrefs)
      .where(eq(alertPrefs.pm2Name, data.pm2Name))
      .all();
    if (existing.length > 0) {
      db.update(alertPrefs)
        .set({ alertsEnabled: data.alertsEnabled ? 1 : 0 })
        .where(eq(alertPrefs.pm2Name, data.pm2Name))
        .run();
    } else {
      db.insert(alertPrefs)
        .values({
          pm2Name: data.pm2Name,
          alertsEnabled: data.alertsEnabled ? 1 : 0,
        })
        .run();
    }
    return { ok: true };
  });

export const toggleMonitoringFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      pm2Name: z.string(),
      monitored: z.boolean(),
    })
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const now = Date.now();

    if (data.monitored) {
      const existing = db
        .select()
        .from(monitoring)
        .where(eq(monitoring.pm2Name, data.pm2Name))
        .all();
      if (existing.length === 0) {
        db.insert(monitoring)
          .values({ pm2Name: data.pm2Name, createdAt: now })
          .run();
      }
    } else {
      db.delete(monitoring)
        .where(eq(monitoring.pm2Name, data.pm2Name))
        .run();
    }

    return { ok: true };
  });

export const getMonitoringStatusFn = createServerFn({ method: "GET" })
  .validator(z.object({ pm2Name: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const rows = db
      .select()
      .from(monitoring)
      .where(eq(monitoring.pm2Name, data.pm2Name))
      .all();
    return { monitored: rows.length > 0 };
  });

export const getStoredLogsFn = createServerFn({ method: "GET" })
  .validator(z.object({ processName: z.string(), limit: z.number().default(1000) }))
  .handler(async ({ data }) => {
    const db = getDb();
    const mon = db
      .select()
      .from(monitoring)
      .where(eq(monitoring.pm2Name, data.processName))
      .all();
    if (mon.length === 0) return { entries: [] };

    const entries = db
      .select()
      .from(logEntries)
      .where(eq(logEntries.monitorId, mon[0]!.id))
      .orderBy(desc(logEntries.loggedAt))
      .limit(data.limit)
      .all();

    return { entries: entries.reverse() };
  });

export const getProcessMetricsFn = createServerFn({ method: "GET" })
  .validator(z.object({ processName: z.string(), limit: z.number().default(144) }))
  .handler(async ({ data }) => {
    const db = getDb();
    const mon = db
      .select()
      .from(monitoring)
      .where(eq(monitoring.pm2Name, data.processName))
      .all();
    if (mon.length === 0) return { samples: [] };

    const samples = db
      .select()
      .from(processMetrics)
      .where(eq(processMetrics.monitorId, mon[0]!.id))
      .orderBy(desc(processMetrics.sampledAt))
      .limit(data.limit)
      .all();

    return { samples: samples.reverse() };
  });
