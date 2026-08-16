import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _resetEnv } from "../src/lib/env";
import { getDb, initDb, closeDb } from "../src/server/storage/client";
import { monitoring } from "../src/server/storage/schema";
import { eq } from "drizzle-orm";
import {
  getMonitorId,
  invalidateMonitor,
  invalidateAllMonitors,
  rebuildMonitorCache,
} from "../src/server/storage/monitorCache";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "moncache-test-"));
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
  getDb().delete(monitoring).run();
  invalidateAllMonitors();
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

describe("getMonitorId", () => {
  it("returns the id of an existing monitor and caches it", () => {
    const id = seedMonitor("app-a");

    expect(getMonitorId("app-a")).toBe(id);

    getDb().delete(monitoring).run();
    expect(getMonitorId("app-a")).toBe(id);
  });

  it("returns null and caches the miss for an unknown monitor", () => {
    expect(getMonitorId("ghost")).toBeNull();

    const id = seedMonitor("ghost");
    expect(getMonitorId("ghost")).toBeNull();
    expect(id).toBeGreaterThan(0);
  });
});

describe("invalidateMonitor", () => {
  it("forces a fresh lookup after the monitor is removed", () => {
    const id = seedMonitor("app-b");
    expect(getMonitorId("app-b")).toBe(id);

    getDb().delete(monitoring).run();
    invalidateMonitor("app-b");
    expect(getMonitorId("app-b")).toBeNull();
  });
});

describe("rebuildMonitorCache", () => {
  it("replaces stale entries with the given rows", () => {
    seedMonitor("app-c");
    const id = getMonitorId("app-c");
    expect(id).not.toBeNull();

    getDb().delete(monitoring).run();
    seedMonitor("app-d");
    const rows = getDb()
      .select({ id: monitoring.id, pm2Name: monitoring.pm2Name })
      .from(monitoring)
      .all();

    rebuildMonitorCache(rows);

    expect(getMonitorId("app-d")).not.toBeNull();
    expect(getMonitorId("app-c")).toBeNull();
  });

  it("clears negative cache entries", () => {
    expect(getMonitorId("ghost")).toBeNull();

    const id = seedMonitor("ghost");
    const rows = getDb()
      .select({ id: monitoring.id, pm2Name: monitoring.pm2Name })
      .from(monitoring)
      .all();

    rebuildMonitorCache(rows);

    expect(getMonitorId("ghost")).toBe(id);
  });
});
