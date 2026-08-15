import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _resetEnv } from "../src/lib/env";
import { getDb, initDb } from "../src/server/storage/client";
import { monitoring, logEntries } from "../src/server/storage/schema";
import {
  findMonitorId,
  queryStoredLogs,
  getStoredLogsBounds,
} from "../src/server/storage/logQueries";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "logs-test-"));
  process.env.SQLITE_DB_PATH = path.join(tmpDir, "test.db");
  _resetEnv();
  initDb();
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function cleanDb() {
  const db = getDb();
  db.delete(logEntries).run();
  db.delete(monitoring).run();
}

function seedMonitor(name: string): number {
  const db = getDb();
  db.insert(monitoring).values({ pm2Name: name, createdAt: Date.now() }).run();
  const id = findMonitorId(db, name);
  if (id == null) throw new Error("monitor was not seeded");
  return id;
}

function seedEntry(monId: number, at: number, text: string, level = "") {
  const db = getDb();
  db.insert(logEntries)
    .values({
      monitorId: monId,
      loggedAt: at,
      logLevel: level,
      log: JSON.stringify({ lines: [text], raw: text }),
      raw: text,
    })
    .run();
}

const T0 = 1000;
const T1 = 2000;
const T2 = 3000;
const T3 = 4000;

beforeEach(() => {
  cleanDb();
});

describe("findMonitorId", () => {
  it("returns the id of an existing monitor", () => {
    const mon = seedMonitor("app-a");

    expect(findMonitorId(getDb(), "app-a")).toBe(mon);
  });

  it("returns null for an unknown process", () => {
    expect(findMonitorId(getDb(), "ghost")).toBeNull();
  });
});

describe("queryStoredLogs", () => {
  it("returns all entries in ascending order when no options are given", () => {
    const mon = seedMonitor("app-a");
    seedEntry(mon, T0, "first");
    seedEntry(mon, T2, "third");
    seedEntry(mon, T1, "second");

    const entries = queryStoredLogs(getDb(), mon);

    expect(entries.map((e) => e.raw)).toEqual(["first", "second", "third"]);
    expect(entries.map((e) => e.loggedAt)).toEqual([T0, T1, T2]);
  });

  it("returns only the most recent lines when a limit is set", () => {
    const mon = seedMonitor("app-a");
    seedEntry(mon, T0, "first");
    seedEntry(mon, T1, "second");
    seedEntry(mon, T2, "third");

    const entries = queryStoredLogs(getDb(), mon, { limit: 2 });

    expect(entries.map((e) => e.raw)).toEqual(["second", "third"]);
  });

  it("filters inclusively by from and to", () => {
    const mon = seedMonitor("app-a");
    seedEntry(mon, T0, "first");
    seedEntry(mon, T1, "second");
    seedEntry(mon, T2, "third");
    seedEntry(mon, T3, "fourth");

    const entries = queryStoredLogs(getDb(), mon, { from: T1, to: T3 });

    expect(entries.map((e) => e.raw)).toEqual(["second", "third", "fourth"]);
  });

  it("supports a single-point range", () => {
    const mon = seedMonitor("app-a");
    seedEntry(mon, T0, "first");
    seedEntry(mon, T1, "second");

    const entries = queryStoredLogs(getDb(), mon, { from: T1, to: T1 });

    expect(entries.map((e) => e.raw)).toEqual(["second"]);
  });

  it("combines a range with a limit (most recent window)", () => {
    const mon = seedMonitor("app-a");
    seedEntry(mon, T0, "first");
    seedEntry(mon, T1, "second");
    seedEntry(mon, T2, "third");
    seedEntry(mon, T3, "fourth");

    const entries = queryStoredLogs(getDb(), mon, {
      from: T0,
      to: T3,
      limit: 2,
    });

    expect(entries.map((e) => e.raw)).toEqual(["third", "fourth"]);
  });

  it("returns empty when the range matches nothing", () => {
    const mon = seedMonitor("app-a");
    seedEntry(mon, T0, "first");

    const entries = queryStoredLogs(getDb(), mon, { from: T3, to: T3 });

    expect(entries).toEqual([]);
  });
});

describe("getStoredLogsBounds", () => {
  it("returns the min and max loggedAt", () => {
    const mon = seedMonitor("app-a");
    seedEntry(mon, T1, "b");
    seedEntry(mon, T0, "a");
    seedEntry(mon, T3, "d");

    const bounds = getStoredLogsBounds(getDb(), mon);

    expect(bounds.min).toBe(T0);
    expect(bounds.max).toBe(T3);
  });

  it("returns the same value for a single entry", () => {
    const mon = seedMonitor("app-a");
    seedEntry(mon, T1, "only");

    const bounds = getStoredLogsBounds(getDb(), mon);

    expect(bounds.min).toBe(T1);
    expect(bounds.max).toBe(T1);
  });

  it("returns null bounds when there are no entries", () => {
    const mon = seedMonitor("app-a");

    const bounds = getStoredLogsBounds(getDb(), mon);

    expect(bounds.min).toBeNull();
    expect(bounds.max).toBeNull();
  });
});
