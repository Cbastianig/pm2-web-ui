import { describe, it, expect } from "vitest";
import { extractTimestamp, normalizeProcessSummary } from "../src/server/pm2";

describe("extractTimestamp", () => {
  it("extracts ISO timestamp from log line", () => {
    const line = "2026-03-14T16:25:41 starting server on port 3000";
    expect(extractTimestamp(line)).toBe("2026-03-14T16:25:41");
  });

  it("extracts timestamp with space separator", () => {
    const line = "2026-03-14 16:25:41 INFO server started";
    expect(extractTimestamp(line)).toBe("2026-03-14 16:25:41");
  });

  it("returns empty string when no timestamp", () => {
    expect(extractTimestamp("hello world")).toBe("");
  });

  it("extracts first timestamp when multiple exist", () => {
    const line = "2026-03-14T16:25:41 retry at 2026-03-14T16:26:00";
    expect(extractTimestamp(line)).toBe("2026-03-14T16:25:41");
  });
});

describe("normalizeProcessSummary", () => {
  it("normalizes a valid PM2 process descriptor", () => {
    const proc = {
      pm_id: 1,
      name: "my-app",
      pid: 12345,
      pm2_env: {
        status: "online",
        version: "1.0.0",
        exec_mode: "fork",
        restart_time: 3,
        pm_uptime: 1700000000000,
        created_at: 1690000000000,
        pm_exec_path: "/app/index.js",
        pm_cwd: "/app",
        watch: true,
      },
      monit: {
        cpu: 2.5,
        memory: 104857600,
      },
    };

    const result = normalizeProcessSummary(proc);

    expect(result.id).toBe(1);
    expect(result.name).toBe("my-app");
    expect(result.pid).toBe(12345);
    expect(result.status).toBe("online");
    expect(result.cpu).toBe(2.5);
    expect(result.memory).toBe(104857600);
    expect(result.restarts).toBe(3);
    expect(result.watch).toBe(true);
  });

  it("handles missing fields with defaults", () => {
    const proc = { pm_id: 0, name: "minimal", pm2_env: {}, monit: {} };
    const result = normalizeProcessSummary(proc);

    expect(result.name).toBe("minimal");
    expect(result.pid).toBeNull();
    expect(result.status).toBe("unknown");
    expect(result.cpu).toBe(0);
    expect(result.memory).toBe(0);
    expect(result.restarts).toBe(0);
    expect(result.watch).toBe(false);
  });

  it("handles NaN values safely", () => {
    const proc = {
      pm_id: 5,
      name: "nan-app",
      pm2_env: {},
      monit: { cpu: NaN, memory: Number.POSITIVE_INFINITY },
    };
    const result = normalizeProcessSummary(proc);
    expect(result.cpu).toBe(0);
    expect(result.memory).toBe(0);
  });
});
