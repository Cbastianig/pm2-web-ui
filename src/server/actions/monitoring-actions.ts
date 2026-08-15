import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "@/server/storage/client";
import { monitoring, logEntries, processMetrics, alertPrefs, hostMetrics } from "@/server/storage/schema";
import { findMonitorId, queryStoredLogs, getStoredLogsBounds } from "@/server/storage/logQueries";
import { eq, desc, gte, asc, lte, and, min, max } from "drizzle-orm";
import { authMiddleware } from "@/server/auth/middleware";

const auth = () => [authMiddleware];

export const toggleAlertPrefsFn = createServerFn({ method: "POST" })
  .middleware(auth())
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
  .middleware(auth())
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

        // Backfill: read existing log file and insert into DB
        try {
          const { readLogLinesByName, extractTimestamp } = await import("@/server/pm2");
          const { detectLogLevel } = await import("@/server/events/logBus");
          const lines = await readLogLinesByName(data.pm2Name);
          const monRow = db.select().from(monitoring).where(eq(monitoring.pm2Name, data.pm2Name)).all()[0];
          if (monRow && lines.length > 0) {
            for (const line of lines) {
              const ts = extractTimestamp(line.text);
              const loggedAt = ts ? new Date(ts.replace(" ", "T")).getTime() || now : now;
              const level = detectLogLevel ? detectLogLevel(line.text) : "";
              db.insert(logEntries).values({
                monitorId: monRow.id,
                loggedAt,
                logLevel: level || "",
                log: JSON.stringify({ lines: [line.text], raw: line.text }),
                raw: line.text,
              }).run();
            }
          }
        } catch { /* backfill best-effort */ }
      }
    } else {
      db.delete(monitoring)
        .where(eq(monitoring.pm2Name, data.pm2Name))
        .run();
    }

    return { ok: true };
  });

export const getMonitoringStatusFn = createServerFn({ method: "GET" })
  .middleware(auth())
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
  .middleware(auth())
  .validator(z.object({ processName: z.string(), limit: z.number().default(1000) }))
  .handler(async ({ data }) => {
    const db = getDb();
    const monitorId = findMonitorId(db, data.processName);
    if (monitorId == null) return { entries: [] };
    return { entries: queryStoredLogs(db, monitorId, { limit: data.limit }) };
  });

export const getStoredLogsRangeFn = createServerFn({ method: "GET" })
  .middleware(auth())
  .validator(
    z.object({
      processName: z.string(),
      from: z.number().int().optional(),
      to: z.number().int().optional(),
      limit: z.number().int().optional(),
    })
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const monitorId = findMonitorId(db, data.processName);
    if (monitorId == null) return { entries: [] };
    return {
      entries: queryStoredLogs(db, monitorId, {
        from: data.from,
        to: data.to,
        limit: data.limit,
      }),
    };
  });

export const getStoredLogsBoundsFn = createServerFn({ method: "GET" })
  .middleware(auth())
  .validator(z.object({ processName: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const monitorId = findMonitorId(db, data.processName);
    if (monitorId == null) return { min: null, max: null };
    return getStoredLogsBounds(db, monitorId);
  });

export const getProcessMetricsFn = createServerFn({ method: "GET" })
  .middleware(auth())
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

export const getHistoricalMetricsFn = createServerFn({ method: "GET" })
  .middleware(auth())
  .validator(
    z.object({
      since: z.number().int().optional(),
      from: z.number().int().optional(),
      to: z.number().int().optional(),
    })
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const now = Date.now();
    const from = data.from ?? now - (data.since ?? 24 * 60 * 60 * 1000);
    const to = data.to ?? now;
    const span = Math.max(1, to - from);

    const hostBounds = db
      .select({ min: min(hostMetrics.sampledAt), max: max(hostMetrics.sampledAt) })
      .from(hostMetrics)
      .all()[0];
    const procBounds = db
      .select({ min: min(processMetrics.sampledAt), max: max(processMetrics.sampledAt) })
      .from(processMetrics)
      .all()[0];

    const minSample = Math.min(
      hostBounds?.min ?? now,
      procBounds?.min ?? now
    );
    const maxSample = Math.max(
      hostBounds?.max ?? now,
      procBounds?.max ?? now
    );

    function downsample<T extends { sampledAt: number }>(
      rows: T[],
      getValues: (r: T) => number[]
    ) {
      if (rows.length === 0) return [];
      const maxPoints = 240;
      if (rows.length <= maxPoints) {
        return rows.map((r) => ({ t: r.sampledAt, values: getValues(r) }));
      }
      const bucketMs = Math.max(1, Math.floor(span / maxPoints));
      const buckets = new Map<number, { count: number; acc: number[]; t: number }>();
      for (const r of rows) {
        const b = Math.floor(r.sampledAt / bucketMs);
        const vals = getValues(r);
        const cur = buckets.get(b);
        if (!cur) {
          buckets.set(b, { count: 1, acc: vals, t: r.sampledAt });
        } else {
          cur.count++;
          vals.forEach((v, i) => {
            cur.acc[i] = (cur.acc[i] ?? 0) + v;
          });
        }
      }
      return Array.from(buckets.values()).map((b) => ({
        t: b.t,
        values: b.acc.map((v) => v / b.count),
      }));
    }

    const hostRows = db
      .select()
      .from(hostMetrics)
      .where(
        data.to !== undefined
          ? and(gte(hostMetrics.sampledAt, from), lte(hostMetrics.sampledAt, to))
          : gte(hostMetrics.sampledAt, from)
      )
      .orderBy(asc(hostMetrics.sampledAt))
      .all();

    const host = downsample(hostRows, (r) => {
      const rt = r.ramTotal ?? 0;
      const dt = r.diskTotal ?? 0;
      const ramPct = rt > 0 ? ((r.ramUsed ?? 0) / rt) * 100 : 0;
      const diskPct = dt > 0 ? ((r.diskUsed ?? 0) / dt) * 100 : 0;
      return [r.cpuPercent ?? 0, ramPct, diskPct, r.ramUsed ?? 0, rt, r.diskUsed ?? 0, dt];
    }).map((p) => {
      const v = p.values;
      return {
        t: p.t,
        cpuPercent: v[0] ?? 0,
        ramPercent: v[1] ?? 0,
        diskPercent: v[2] ?? 0,
        ramUsed: v[3] ?? 0,
        ramTotal: v[4] ?? 0,
        diskUsed: v[5] ?? 0,
        diskTotal: v[6] ?? 0,
      };
    });

    const monRows = db.select().from(monitoring).all();
    const processes: Array<{
      name: string;
      points: Array<{ t: number; cpu: number; memory: number }>;
      restartTimes: number[];
      avgCpu: number;
      maxCpu: number;
      avgMemory: number;
      maxMemory: number;
      restarts: number;
      lastStatus: string;
    }> = [];

    for (const mon of monRows) {
      const rows = db
        .select()
        .from(processMetrics)
        .where(
          data.to !== undefined
            ? and(
                eq(processMetrics.monitorId, mon.id),
                gte(processMetrics.sampledAt, from),
                lte(processMetrics.sampledAt, to)
              )
            : and(
                eq(processMetrics.monitorId, mon.id),
                gte(processMetrics.sampledAt, from)
              )
        )
        .orderBy(asc(processMetrics.sampledAt))
        .all();
      if (rows.length === 0) continue;

      const cpuVals = rows.map((r) => r.cpu ?? 0);
      const memVals = rows.map((r) => r.memory ?? 0);
      const last = rows[rows.length - 1]!;

      const restartTimes: number[] = [];
      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1]!;
        const cur = rows[i]!;
        if ((cur.restarts ?? 0) > (prev.restarts ?? 0)) {
          restartTimes.push(cur.sampledAt);
        }
      }

      processes.push({
        name: mon.pm2Name,
        points: downsample(rows, (r) => [r.cpu ?? 0, r.memory ?? 0]).map((p) => ({
          t: p.t,
          cpu: p.values[0]!,
          memory: p.values[1]!,
        })),
        restartTimes,
        avgCpu: cpuVals.reduce((a, b) => a + b, 0) / cpuVals.length,
        maxCpu: Math.max(...cpuVals),
        avgMemory: memVals.reduce((a, b) => a + b, 0) / memVals.length,
        maxMemory: Math.max(...memVals),
        restarts: last.restarts ?? 0,
        lastStatus: last.status ?? "",
      });
    }

    processes.sort((a, b) => b.avgCpu - a.avgCpu);

    return { host, processes, dataBounds: { min: minSample, max: maxSample } };
  });
