import os from "node:os";
import { execSync } from "node:child_process";
import { getDb } from "@/server/storage/client";
import { hostMetrics } from "@/server/storage/schema";
import { readEnv } from "@/lib/env";
import { gte, lte, count, desc } from "drizzle-orm";

export interface HostSnapshot {
  cpuPercent: number;
  cpuCount: number;
  ramUsed: number;
  ramTotal: number;
  diskUsed: number;
  diskTotal: number;
}

export function collectHostMetrics(): HostSnapshot {
  const cpus = os.cpus();
  const totalIdle = cpus.reduce((sum, c) => sum + c.times.idle, 0);
  const totalTick = cpus.reduce(
    (sum, c) => sum + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq,
    0
  );
  const cpuPercent = totalTick > 0
    ? 100 - (totalIdle / totalTick) * 100
    : os.loadavg()[0] ? Math.min(os.loadavg()[0]! * 10, 100) : 0;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramUsed = totalMem - freeMem;

  const homeDir = os.homedir();
  let diskUsed = 0;
  let diskTotal = 0;
  try {
    const df = execSync(`df -B1 "${homeDir}"`, { encoding: "utf8", timeout: 3000 });
    const lines = df.trim().split("\n");
    if (lines.length > 1) {
      const cols = lines[1]!.trim().split(/\s+/);
      if (cols.length >= 4) {
        diskTotal = parseInt(cols[1]!, 10) || 0;
        diskUsed = parseInt(cols[2]!, 10) || 0;
      }
    }
  } catch {
    // disk metrics unavailable
  }

  return {
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    cpuCount: cpus.length,
    ramUsed,
    ramTotal: totalMem,
    diskUsed,
    diskTotal,
  };
}

export function storeHostSnapshot(snapshot: HostSnapshot) {
  const db = getDb();
  const now = Date.now();
  db.insert(hostMetrics).values({
    sampledAt: now,
    cpuPercent: snapshot.cpuPercent,
    ramUsed: snapshot.ramUsed,
    ramTotal: snapshot.ramTotal,
    diskUsed: snapshot.diskUsed,
    diskTotal: snapshot.diskTotal,
  }).run();

  const retention = readEnv("METRICS_RETENTION_MS");
  db.delete(hostMetrics)
    .where(lte(hostMetrics.sampledAt, now - retention))
    .run();
}

export function getLastHostReading(): HostSnapshot | null {
  const db = getDb();
  const rows = db
    .select()
    .from(hostMetrics)
    .orderBy(desc(hostMetrics.sampledAt))
    .limit(1)
    .all();
  if (rows.length === 0) return null;
  const r = rows[0]!;
  return {
    cpuPercent: r.cpuPercent,
    cpuCount: 0,
    ramUsed: r.ramUsed,
    ramTotal: r.ramTotal,
    diskUsed: r.diskUsed,
    diskTotal: r.diskTotal,
  };
}

export function getHostMetricsHistory(limit = 144) {
  const db = getDb();
  return db
    .select()
    .from(hostMetrics)
    .orderBy(desc(hostMetrics.sampledAt))
    .limit(limit)
    .all()
    .reverse();
}
