import { useEffect } from "react";
import { create } from "zustand";
import { apiUrl } from "@/lib/basePath";

export interface HostInfo {
  cpuPercent: number;
  cpuCount: number;
  ramUsed: number;
  ramTotal: number;
  diskUsed: number;
  diskTotal: number;
}

interface ProcessInfo {
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

interface OpsProcessInfo {
  name: string;
  pid: number | null;
  status: string;
  cpu: number;
  memory: number;
  uptime: number | null;
  restarts: number;
}

interface OpsEnvironment {
  name: string;
  color: "blue" | "green";
  active: boolean;
  runtime: OpsProcessInfo | null;
  health: { ok: boolean; responseTimeMs: number } | null;
  commit: {
    shortHash: string;
    branch: string;
    author: string;
    message: string;
    date: string;
  } | null;
}

interface OpsApp {
  app: { name: string; description: string; appPath: string };
  dirName: string;
  blue: OpsEnvironment;
  green: OpsEnvironment;
  current: "blue" | "green" | "unknown";
  gitlabPipeline: {
    id: number;
    status: string;
    sha: string;
    webUrl: string;
    duration: number | null;
    author: string;
    createdAt: string;
  } | null;
  gitlabProject: { name: string; webUrl: string } | null;
  health: { ok: boolean; responseTimeMs: number } | null;
  lastRelease: {
    commit: { shortHash: string };
    deployedAt: number;
    environment: string;
  } | null;
  pipelineTime: string | null;
  releases: {
    commit: string;
    branch: string;
    environment: string;
    deployedAt: number;
    pipelineStatus: string | null;
    author: string;
    date: string;
    message: string;
  }[];
  drift: { pipelineSha: string; runningSha: string; behind: string } | null;
  collectedAt: number;
}

interface EventStore {
  processes: ProcessInfo[];
  connected: boolean;
  host: HostInfo | null;
  opsApps: OpsApp[];
  opsUnconfigured: { dirName: string; appPath: string }[];
  opsLoaded: boolean;
  lastUpdate: number;
  setProcesses: (processes: ProcessInfo[]) => void;
  setConnected: (connected: boolean) => void;
  setHost: (host: HostInfo) => void;
  setOpsApps: (apps: OpsApp[]) => void;
  setOpsUnconfigured: (apps: { dirName: string; appPath: string }[]) => void;
}

export const useEventStore = create<EventStore>((set) => ({
  processes: [],
  connected: false,
  host: null,
  opsApps: [],
  opsUnconfigured: [],
  opsLoaded: false,
  lastUpdate: 0,
  setProcesses: (processes) => set({ processes, lastUpdate: Date.now() }),
  setConnected: (connected) => set({ connected }),
  setHost: (host) => set({ host }),
  setOpsApps: (opsApps) => set({ opsApps, opsLoaded: true }),
  setOpsUnconfigured: (opsUnconfigured) =>
    set({ opsUnconfigured, opsLoaded: true }),
}));

let globalEventSource: EventSource | null = null;
let globalReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let listenerCount = 0;

function connectGlobal() {
  if (globalEventSource) return;

  const es = new EventSource(apiUrl("/api/events"));
  globalEventSource = es;

  es.onopen = () => useEventStore.getState().setConnected(true);

  es.addEventListener("processes", (event) => {
    try {
      const data = JSON.parse(event.data);
      useEventStore.getState().setProcesses(data.items || []);
      if (data.host) useEventStore.getState().setHost(data.host);
    } catch {}
  });

  es.addEventListener("host", (event) => {
    try {
      useEventStore.getState().setHost(JSON.parse(event.data));
    } catch {}
  });

  es.addEventListener("ops:applications", (event) => {
    try {
      const data = JSON.parse(event.data);
      useEventStore.getState().setOpsApps(data);
    } catch (e) {
      console.error("[SSE-client] Failed to parse ops:applications:", e);
    }
  });

  es.addEventListener("ops:unconfigured", (event) => {
    try {
      useEventStore.getState().setOpsUnconfigured(JSON.parse(event.data));
    } catch {}
  });

  es.addEventListener("ops:heartbeat", () => {});

  es.onerror = () => {
    useEventStore.getState().setConnected(false);
    es.close();
    globalEventSource = null;
    globalReconnectTimer = setTimeout(() => connectGlobal(), 3000);
  };
}

export function useEventSource() {
  useEffect(() => {
    listenerCount++;
    connectGlobal();

    return () => {
      listenerCount--;
      if (listenerCount <= 0 && globalEventSource) {
        globalEventSource.close();
        globalEventSource = null;
        if (globalReconnectTimer) clearTimeout(globalReconnectTimer);
      }
    };
  }, []);

  return useEventStore((s) => s.processes);
}

export function useEventSourceHost() {
  useEffect(() => {
    listenerCount++;
    connectGlobal();
    return () => {
      listenerCount--;
    };
  }, []);
  return useEventStore((s) => s.host);
}

export function useEventSourceConnection() {
  useEffect(() => {
    listenerCount++;
    connectGlobal();
    return () => {
      listenerCount--;
    };
  }, []);
  return useEventStore((s) => s.connected);
}

export function useOpsSource() {
  useEffect(() => {
    listenerCount++;
    connectGlobal();
    return () => {
      listenerCount--;
    };
  }, []);
  return useEventStore((s) => s.opsApps);
}

export function useOpsLoaded() {
  useEffect(() => {
    listenerCount++;
    connectGlobal();
    return () => {
      listenerCount--;
    };
  }, []);
  return useEventStore((s) => s.opsLoaded);
}

export function useOpsUnconfigured() {
  useEffect(() => {
    listenerCount++;
    connectGlobal();
    return () => {
      listenerCount--;
    };
  }, []);
  return useEventStore((s) => s.opsUnconfigured);
}
