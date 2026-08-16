import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _resetEnv } from "../src/lib/env";
import { getDb, initDb, closeDb } from "../src/server/storage/client";
import { monitoring, logEntries, processMetrics } from "../src/server/storage/schema";
import { eq, asc } from "drizzle-orm";
import {
  pruneLogsByCount,
  pruneMetricsByCount,
} from "../src/server/storage/retention";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "retention-test-"));
  process.env.SQLITE_DB_PATH = path.join(tmpDir, "test.db");
  _resetEnv();
  initDb();
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmpDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
});

beforeEach(() => {
  const db = getDb();
  db.delete(logEntries).run();
  db.delete(processMetrics).run();
  db.delete(monitoring).run();
});

function seedMonitor(name: string): number {
  const db = getDb();
  db.insert(monitoring).values({ pm2Name: name, createdAt: Date.now() }).run();
  const rows = db
    .select()
    .from(monitoring)
    .where(eq(monitoring.pm2Name, name))
    .all();
  if (rows.length === 0) throw new Error("monitor was not seeded");
  return rows[0]!.id;
}

function seedLogs(monId: number, count: number) {
  const db = getDb();
  for (let i = 0; i < count; i++) {
    db.insert(logEntries)
      .values({
        monitorId: monId,
        loggedAt: Date.now() + i,
        logLevel: "",
        log: JSON.stringify({ lines: [`line ${i}`], raw: `line ${i}` }),
        raw: `line ${i}`,
      })
      .run();
  }
}

function seedMetrics(monId: number, count: number) {
  const db = getDb();
  for (let i = 0; i < count; i++) {
    db.insert(processMetrics)
      .values({
        monitorId: monId,
        sampledAt: Date.now() + i,
        cpu: i,
        memory: i,
      })
      .run();
  }
}

function logsFor(monId: number) {
  return getDb()
    .select()
    .from(logEntries)
    .where(eq(logEntries.monitorId, monId))
    .orderBy(asc(logEntries.id))
    .all();
}

function metricsFor(monId: number) {
  return getDb()
    .select()
    .from(processMetrics)
    .where(eq(processMetrics.monitorId, monId))
    .orderBy(asc(processMetrics.id))
    .all();
}

describe("pruneLogsByCount", () => {
  it("keeps only the newest maxLines rows", () => {
    const id = seedMonitor("app-a");
    seedLogs(id, 7);

    pruneLogsByCount(getDb(), id, 3);

    const rows = logsFor(id);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.raw)).toEqual(["line 4", "line 5", "line 6"]);
  });

  it("does nothing when the row count is below the cap", () => {
    const id = seedMonitor("app-b");
    seedLogs(id, 2);

    pruneLogsByCount(getDb(), id, 5);

    expect(logsFor(id)).toHaveLength(2);
  });

  it("does nothing when maxLines is zero or negative", () => {
    const id = seedMonitor("app-c");
    seedLogs(id, 4);

    pruneLogsByCount(getDb(), id, 0);
    pruneLogsByCount(getDb(), id, -1);

    expect(logsFor(id)).toHaveLength(4);
  });

  it("does not touch other monitors", () => {
    const a = seedMonitor("app-d");
    const b = seedMonitor("app-e");
    seedLogs(a, 5);
    seedLogs(b, 5);

    pruneLogsByCount(getDb(), a, 2);

    expect(logsFor(a)).toHaveLength(2);
    expect(logsFor(b)).toHaveLength(5);
  });
});

describe("pruneMetricsByCount", () => {
  it("keeps only the newest maxSamples rows", () => {
    const id = seedMonitor("app-f");
    seedMetrics(id, 6);

    pruneMetricsByCount(getDb(), id, 2);

    const rows = metricsFor(id);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.cpu)).toEqual([4, 5]);
  });

  it("does nothing when the row count is below the cap", () => {
    const id = seedMonitor("app-g");
    seedMetrics(id, 3);

    pruneMetricsByCount(getDb(), id, 10);

    expect(metricsFor(id)).toHaveLength(3);
  });
});
