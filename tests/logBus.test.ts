import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _resetEnv } from "../src/lib/env";
import { getDb, initDb, closeDb } from "../src/server/storage/client";
import { monitoring, logEntries } from "../src/server/storage/schema";
import { eq, asc } from "drizzle-orm";
import { invalidateAllMonitors } from "../src/server/storage/monitorCache";
import {
  handlePacket,
  startLogBus,
  _resetLogBus,
} from "../src/server/events/logBus";
import { eventBus } from "../src/server/events/bus";

const pm2State = vi.hoisted(() => {
  function makeEmitter() {
    const handlers = new Map<string, Array<(...args: any[]) => void>>();
    return {
      on(evt: string, fn: (...args: any[]) => void) {
        const list = handlers.get(evt) ?? [];
        list.push(fn);
        handlers.set(evt, list);
      },
      emit(evt: string, ...args: any[]) {
        for (const fn of handlers.get(evt) ?? []) fn(...args);
        return true;
      },
    };
  }
  type Emitter = ReturnType<typeof makeEmitter>;
  type BusSock = Emitter & { close: () => void };
  const created: Array<{ bus: Emitter; sock: BusSock }> = [];
  return {
    created,
    connectCalls: 0,
    launchBusCalls: 0,
    failLaunchBus: false,
    pm2Mock: {
      connect(cb: (err: Error | null) => void) {
        pm2State.connectCalls++;
        process.nextTick(() => cb(null));
      },
      launchBus(cb: (err: Error | null, bus?: any, sock?: any) => void) {
        pm2State.launchBusCalls++;
        if (pm2State.failLaunchBus) {
          process.nextTick(() => cb(new Error("bus down")));
          return;
        }
        const bus = makeEmitter();
        const sock = makeEmitter() as BusSock;
        sock.close = () => sock.emit("close");
        pm2State.created.push({ bus, sock });
        process.nextTick(() => cb(null, bus, sock));
      },
      list: vi.fn(),
      restart: vi.fn(),
      stop: vi.fn(),
      delete: vi.fn(),
      start: vi.fn(),
    },
  };
});

vi.mock("pm2", () => ({ default: pm2State.pm2Mock }));

let tmpDir: string;
let emitted: Array<{ text: string; processName: string; level: string }> = [];

function onLog(data: { text: string; processName: string; level: string }) {
  emitted.push(data);
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "logbus-test-"));
  process.env.SQLITE_DB_PATH = path.join(tmpDir, "test.db");
  _resetEnv();
  initDb();
  eventBus.on("log", onLog);
});

afterAll(() => {
  eventBus.off("log", onLog);
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
  db.delete(monitoring).run();
  emitted = [];
  invalidateAllMonitors();
  process.env.LOG_MAX_BURST = "1000000";
  process.env.LOG_MAX_LINES_PER_SECOND = "1000000";
  _resetEnv();
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

function storedLines() {
  return getDb()
    .select()
    .from(logEntries)
    .orderBy(asc(logEntries.id))
    .all();
}

describe("handlePacket", () => {
  it("inserts all lines of a packet and forwards them to the bus", () => {
    const monId = seedMonitor("app-a");

    handlePacket({
      process: { name: "app-a" },
      data: "first\nsecond\nthird",
    });

    const rows = storedLines();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.raw)).toEqual(["first", "second", "third"]);
    expect(rows.every((r) => r.monitorId === monId)).toBe(true);
    expect(emitted.map((e) => e.text)).toEqual(["first", "second", "third"]);
    expect(emitted.every((e) => e.processName === "app-a")).toBe(true);
  });

  it("does not store rows for an unmonitored process but still emits", () => {
    handlePacket({ process: { name: "ghost" }, data: "a\nb" });

    expect(storedLines()).toHaveLength(0);
    expect(emitted).toHaveLength(2);
  });

  it("ignores packets without a process name", () => {
    handlePacket({ process: {}, data: "x" });

    expect(storedLines()).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it("detects and stores log levels", () => {
    seedMonitor("app-b");

    handlePacket({ process: { name: "app-b" }, data: "[ERROR] boom\n[INFO] ok" });

    const rows = storedLines();
    expect(rows[0]!.logLevel).toBe("error");
    expect(rows[1]!.logLevel).toBe("info");
  });

  it("uses the packet timestamp when present", () => {
    seedMonitor("app-c");

    handlePacket({ process: { name: "app-c" }, at: 123456789, data: "line" });

    expect(storedLines()[0]!.loggedAt).toBe(123456789);
  });

  it("discards lines beyond the per-process rate limit", () => {
    process.env.LOG_MAX_BURST = "2";
    process.env.LOG_MAX_LINES_PER_SECOND = "0";
    _resetEnv();
    seedMonitor("rate-limited-app");

    handlePacket({
      process: { name: "rate-limited-app" },
      data: "a\nb\nc\nd\ne",
    });

    const rows = storedLines();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.raw)).toEqual(["a", "b"]);

    const real = emitted.filter((e) => e.level !== "warn");
    expect(real.map((e) => e.text)).toEqual(["a", "b"]);
    expect(emitted).toHaveLength(3);
    expect(emitted[2]!.text).toContain("rate limited");
    expect(emitted[2]!.text).toContain("3");
  });

  it("clamps future log timestamps to now", () => {
    seedMonitor("app-clamp");
    const before = Date.now();

    handlePacket({
      process: { name: "app-clamp" },
      data: "9999-12-31T23:59:59 future line",
    });

    const loggedAt = storedLines()[0]!.loggedAt;
    expect(loggedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(loggedAt).toBeLessThanOrEqual(before + 1000);
  });
});

describe("bus reconnection", () => {
  beforeEach(() => {
    _resetLogBus();
    vi.useFakeTimers();
    pm2State.created.length = 0;
    pm2State.connectCalls = 0;
    pm2State.launchBusCalls = 0;
    pm2State.failLaunchBus = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("registers log handlers and watches the bus socket", async () => {
    await startLogBus();

    expect(pm2State.created).toHaveLength(1);
    expect(pm2State.connectCalls).toBe(1);

    const { bus } = pm2State.created[0]!;
    seedMonitor("app-bus");
    bus.emit("log:out", {
      process: { name: "app-bus" },
      data: "hello\nworld",
    });

    expect(storedLines()).toHaveLength(2);
    expect(emitted).toHaveLength(2);
  });

  it("reconnects with exponential backoff after the socket closes", async () => {
    await startLogBus();
    expect(pm2State.launchBusCalls).toBe(1);

    const first = pm2State.created[0]!;
    pm2State.failLaunchBus = true;
    first.sock.emit("close");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("disconnected"),
    );

    await vi.advanceTimersByTimeAsync(1000);
    expect(pm2State.launchBusCalls).toBe(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(pm2State.launchBusCalls).toBe(3);

    await vi.advanceTimersByTimeAsync(4000);
    expect(pm2State.launchBusCalls).toBe(4);

    pm2State.failLaunchBus = false;
    await vi.advanceTimersByTimeAsync(8000);
    expect(pm2State.launchBusCalls).toBe(5);
    expect(pm2State.created).toHaveLength(2);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Reconnected"),
    );

    const second = pm2State.created[1]!;
    seedMonitor("app-reconnect");
    second.bus.emit("log:out", {
      process: { name: "app-reconnect" },
      data: "a\nb",
    });

    expect(storedLines()).toHaveLength(2);
    expect(emitted).toHaveLength(2);
  });

  it("closes the old socket before reconnecting", async () => {
    await startLogBus();

    const first = pm2State.created[0]!;
    const closeSpy = vi.spyOn(first.sock, "close");
    first.sock.emit("error");

    expect(closeSpy).toHaveBeenCalled();
  });

  it("retries after the initial connection fails", async () => {
    pm2State.failLaunchBus = true;

    const promise = startLogBus();
    await vi.advanceTimersByTimeAsync(0);

    expect(pm2State.launchBusCalls).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Initial connection failed"),
      expect.any(String),
    );

    pm2State.failLaunchBus = false;
    await vi.advanceTimersByTimeAsync(1000);

    expect(pm2State.launchBusCalls).toBe(2);
    expect(pm2State.created).toHaveLength(1);
    await promise;
  });
});
