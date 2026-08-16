import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getDb } from "@/server/storage/client";
import { hostMetrics } from "@/server/storage/schema";
import { readEnv } from "@/lib/env";
import { lte, desc } from "drizzle-orm";

let lastCpus: os.CpuInfo[] | null = null;

const execFileAsync = promisify(execFile);

function cpuTotalTicks(cpu: os.CpuInfo): number {
  return (
    cpu.times.user +
    cpu.times.nice +
    cpu.times.sys +
    cpu.times.idle +
    cpu.times.irq
  );
}

export interface HostSnapshot {
  cpuPercent: number;
  cpuCount: number;
  ramUsed: number;
  ramTotal: number;
  diskUsed: number;
  diskTotal: number;
}

export async function collectHostMetrics(): Promise<HostSnapshot> {
  const cpus = os.cpus();

  let cpuPercent = 0;
  if (lastCpus && lastCpus.length === cpus.length) {
    const prev = lastCpus;
    const tickDelta = cpus.reduce(
      (sum, c, i) => sum + cpuTotalTicks(c) - cpuTotalTicks(prev[i]!),
      0,
    );
    const idleDelta = cpus.reduce(
      (sum, c, i) => sum + c.times.idle - prev[i]!.times.idle,
      0,
    );
    if (tickDelta > 0) {
      cpuPercent = 100 - (idleDelta / tickDelta) * 100;
    }
  }
  lastCpus = cpus;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramUsed = totalMem - freeMem;

  const homeDir = os.homedir();
  let diskUsed = 0;
  let diskTotal = 0;
  try {
    const { stdout } = await execFileAsync("df", ["-B1", homeDir], {
      encoding: "utf8",
      timeout: 3000,
    });
    const lines = stdout.trim().split("\n");
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
  db.insert(hostMetrics)
    .values({
      sampledAt: now,
      cpuPercent: snapshot.cpuPercent,
      ramUsed: snapshot.ramUsed,
      ramTotal: snapshot.ramTotal,
      diskUsed: snapshot.diskUsed,
      diskTotal: snapshot.diskTotal,
    })
    .run();

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
    cpuPercent: r.cpuPercent ?? 0,
    cpuCount: 0,
    ramUsed: r.ramUsed ?? 0,
    ramTotal: r.ramTotal ?? 0,
    diskUsed: r.diskUsed ?? 0,
    diskTotal: r.diskTotal ?? 0,
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
