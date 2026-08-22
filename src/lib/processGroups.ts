export interface ProcessLike {
  id: number | null;
  name: string;
  status: string;
  cpu: number;
  memory: number;
  restarts: number;
  uptime: number | null;
  pid: number | null;
  isMonitored: boolean;
  isOrphan: boolean;
  alertsEnabled: boolean;
  appName: string | null;
  appColor: "blue" | "green" | null;
  appActive: boolean | null;
}

export type ProcessGroup =
  | {
      kind: "app";
      key: string;
      name: string;
      members: ProcessLike[];
      active: ProcessLike;
      cpu: number;
      memory: number;
      restarts: number;
      uptime: number | null;
      pid: number | null;
      status: string;
      isMonitored: boolean;
      isOrphan: boolean;
    }
  | { kind: "process"; key: string; name: string; proc: ProcessLike };

export function pickActive(members: ProcessLike[]): ProcessLike {
  const flagged = members.find((p) => p.appActive);
  if (flagged) return flagged;
  const online = members.find((p) => p.status === "online");
  if (online) return online;
  return members[0]!;
}

export function groupStatus(members: ProcessLike[]): string {
  if (members.some((p) => p.status === "online")) return "online";
  if (
    members.some(
      (p) => p.status === "errored" || p.status === "error",
    )
  )
    return "errored";
  if (
    members.some(
      (p) => p.status !== "stopped" && p.status !== "orphan" && p.status,
    )
  )
    return "launching";
  return "stopped";
}

export function buildProcessGroups(processes: ProcessLike[]): ProcessGroup[] {
  const groups: ProcessGroup[] = [];
  const byApp = new Map<string, ProcessLike[]>();

  for (const p of processes) {
    if (p.appName) {
      const arr = byApp.get(p.appName) ?? [];
      arr.push(p);
      byApp.set(p.appName, arr);
    } else {
      groups.push({ kind: "process", key: p.name, name: p.name, proc: p });
    }
  }

  for (const [appName, members] of byApp) {
    const active = pickActive(members);
    groups.push({
      kind: "app",
      key: `app:${appName}`,
      name: appName,
      members,
      active,
      cpu: members.reduce((s, p) => s + p.cpu, 0),
      memory: members.reduce((s, p) => s + p.memory, 0),
      restarts: members.reduce((s, p) => s + p.restarts, 0),
      uptime: active.uptime,
      pid: active.pid,
      status: groupStatus(members),
      isMonitored: members.every((p) => p.isMonitored),
      isOrphan: false,
    });
  }

  return groups;
}

export interface SeriesPoint {
  t: number;
  cpu: number;
  memory: number;
}

export interface ProcessSeries {
  name: string;
  points: SeriesPoint[];
  restartTimes: number[];
  avgCpu: number;
  maxCpu: number;
  avgMemory: number;
  maxMemory: number;
  restarts: number;
  lastStatus: string;
}

export function aggregateSeriesByApp(
  series: ProcessSeries[],
  appByPm2Name: Map<string, string>,
): ProcessSeries[] {
  const groups = new Map<string, ProcessSeries>();
  const order: string[] = [];

  for (const s of series) {
    const appName = appByPm2Name.get(s.name);
    const key = appName ?? s.name;
    let g = groups.get(key);
    if (!g) {
      g = {
        name: key,
        points: [],
        restartTimes: [],
        avgCpu: 0,
        maxCpu: 0,
        avgMemory: 0,
        maxMemory: 0,
        restarts: 0,
        lastStatus: s.lastStatus,
      };
      groups.set(key, g);
      order.push(key);
    }

    const byT = new Map<number, { cpu: number; memory: number }>();
    for (const p of g.points) byT.set(p.t, { cpu: p.cpu, memory: p.memory });
    for (const p of s.points) {
      const cur = byT.get(p.t);
      if (cur) {
        cur.cpu += p.cpu;
        cur.memory += p.memory;
      } else {
        byT.set(p.t, { cpu: p.cpu, memory: p.memory });
      }
    }

    g.points = Array.from(byT.entries())
      .map(([t, v]) => ({ t, cpu: v.cpu, memory: v.memory }))
      .sort((a, b) => a.t - b.t);
    g.restartTimes = [...g.restartTimes, ...s.restartTimes].sort(
      (a, b) => a - b,
    );
    g.restarts += s.restarts;
    g.avgCpu += s.avgCpu;
    g.maxCpu = Math.max(g.maxCpu, s.maxCpu);
    g.avgMemory += s.avgMemory;
    g.maxMemory = Math.max(g.maxMemory, s.maxMemory);
  }

  return order.map((k) => groups.get(k)!);
}