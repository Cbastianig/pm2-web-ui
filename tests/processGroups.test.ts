import { describe, it, expect } from "vitest";
import {
  buildProcessGroups,
  aggregateSeriesByApp,
  pickActive,
  groupStatus,
  type ProcessLike,
  type ProcessSeries,
} from "../src/lib/processGroups";

function proc(overrides: Partial<ProcessLike>): ProcessLike {
  return {
    id: 1,
    name: "p",
    status: "online",
    cpu: 1,
    memory: 1024,
    restarts: 0,
    uptime: 1000,
    pid: 11,
    isMonitored: false,
    isOrphan: false,
    alertsEnabled: true,
    appName: null,
    appColor: null,
    appActive: null,
    ...overrides,
  };
}

describe("pickActive", () => {
  it("prefers the flagged active environment", () => {
    const blue = proc({ name: "app-blue", appActive: false });
    const green = proc({ name: "app-green", appActive: true });
    expect(pickActive([blue, green]).name).toBe("app-green");
  });

  it("falls back to the online member", () => {
    const blue = proc({ name: "app-blue", status: "stopped" });
    const green = proc({ name: "app-green", status: "online" });
    expect(pickActive([blue, green]).name).toBe("app-green");
  });

  it("falls back to the first member", () => {
    const blue = proc({ name: "app-blue", status: "stopped" });
    expect(pickActive([blue]).name).toBe("app-blue");
  });
});

describe("groupStatus", () => {
  it("reports online when any member is online", () => {
    expect(
      groupStatus([
        proc({ status: "online" }),
        proc({ status: "stopped" }),
      ]),
    ).toBe("online");
  });

  it("reports errored when any member is errored", () => {
    expect(
      groupStatus([
        proc({ status: "errored" }),
        proc({ status: "stopped" }),
      ]),
    ).toBe("errored");
  });

  it("reports stopped when all members are stopped", () => {
    expect(
      groupStatus([proc({ status: "stopped" }), proc({ status: "stopped" })]),
    ).toBe("stopped");
  });
});

describe("buildProcessGroups", () => {
  it("keeps processes without an app as individual items", () => {
    const groups = buildProcessGroups([proc({ name: "solo" })]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.kind).toBe("process");
    if (groups[0]!.kind === "process") {
      expect(groups[0].name).toBe("solo");
    }
  });

  it("groups app members into a single aggregated entry", () => {
    const blue = proc({
      name: "app-blue",
      id: 1,
      cpu: 10,
      memory: 100,
      restarts: 2,
      uptime: 500,
      pid: 101,
      isMonitored: true,
      appName: "my-app",
      appColor: "blue",
      appActive: false,
    });
    const green = proc({
      name: "app-green",
      id: 2,
      cpu: 20,
      memory: 300,
      restarts: 3,
      uptime: 900,
      pid: 202,
      isMonitored: true,
      appName: "my-app",
      appColor: "green",
      appActive: true,
    });

    const groups = buildProcessGroups([blue, green]);

    expect(groups).toHaveLength(1);
    const app = groups[0]!;
    expect(app.kind).toBe("app");
    if (app.kind === "app") {
      expect(app.name).toBe("my-app");
      expect(app.cpu).toBe(30);
      expect(app.memory).toBe(400);
      expect(app.restarts).toBe(5);
      expect(app.uptime).toBe(900);
      expect(app.pid).toBe(202);
      expect(app.active.name).toBe("app-green");
      expect(app.isMonitored).toBe(true);
      expect(app.status).toBe("online");
    }
  });

  it("requires all members to be monitored for the app flag", () => {
    const blue = proc({ appName: "app", isMonitored: true });
    const green = proc({ appName: "app", isMonitored: false });
    const app = buildProcessGroups([blue, green])[0]!;
    if (app.kind === "app") {
      expect(app.isMonitored).toBe(false);
    }
  });
});

describe("aggregateSeriesByApp", () => {
  const mkSeries = (
    name: string,
    points: Array<{ t: number; cpu: number; memory: number }>,
    restartTimes: number[] = [],
  ): ProcessSeries => ({
    name,
    points,
    restartTimes,
    avgCpu: 0,
    maxCpu: 0,
    avgMemory: 0,
    maxMemory: 0,
    restarts: restartTimes.length,
    lastStatus: "online",
  });

  it("merges members sharing timestamps by summing cpu and memory", () => {
    const appByPm2Name = new Map([
      ["app-blue", "my-app"],
      ["app-green", "my-app"],
    ]);
    const series = [
      mkSeries("app-blue", [
        { t: 1000, cpu: 5, memory: 50 },
        { t: 2000, cpu: 7, memory: 70 },
      ]),
      mkSeries("app-green", [
        { t: 1000, cpu: 5, memory: 30 },
        { t: 2000, cpu: 3, memory: 40 },
      ]),
    ];

    const merged = aggregateSeriesByApp(series, appByPm2Name);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.name).toBe("my-app");
    expect(merged[0]!.points).toEqual([
      { t: 1000, cpu: 10, memory: 80 },
      { t: 2000, cpu: 10, memory: 110 },
    ]);
  });

  it("combines restart times in ascending order", () => {
    const appByPm2Name = new Map([["app-green", "my-app"]]);
    const series = [
      mkSeries("app-green", [{ t: 1000, cpu: 1, memory: 1 }], [4000, 2000]),
    ];

    const merged = aggregateSeriesByApp(series, appByPm2Name);

    expect(merged[0]!.restartTimes).toEqual([2000, 4000]);
  });

  it("keeps ungrouped series under their own name", () => {
    const appByPm2Name = new Map<string, string>();
    const series = [mkSeries("solo", [{ t: 1000, cpu: 3, memory: 10 }])];

    const merged = aggregateSeriesByApp(series, appByPm2Name);

    expect(merged[0]!.name).toBe("solo");
    expect(merged[0]!.points[0]).toEqual({ t: 1000, cpu: 3, memory: 10 });
  });
});