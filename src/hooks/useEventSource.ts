import { useEffect, useRef, useCallback } from "react";
import { create } from "zustand";

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
}

interface EventStore {
  processes: ProcessInfo[];
  connected: boolean;
  host: HostInfo | null;
  lastUpdate: number;
  setProcesses: (processes: ProcessInfo[]) => void;
  setConnected: (connected: boolean) => void;
  setHost: (host: HostInfo) => void;
}

export const useEventStore = create<EventStore>((set) => ({
  processes: [],
  connected: false,
  host: null,
  lastUpdate: 0,
  setProcesses: (processes) => set({ processes, lastUpdate: Date.now() }),
  setConnected: (connected) => set({ connected }),
  setHost: (host) => set({ host }),
}));

export function useEventSource() {
  const setProcesses = useEventStore((s) => s.setProcesses);
  const setConnected = useEventStore((s) => s.setConnected);
  const setHost = useEventStore((s) => s.setHost);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.addEventListener("processes", (event) => {
      try {
        const data = JSON.parse(event.data);
        setProcesses(data.items || []);
        if (data.host) setHost(data.host);
      } catch {}
    });

    es.addEventListener("host", (event) => {
      try {
        const data = JSON.parse(event.data);
        setHost(data);
      } catch {}
    });

    es.addEventListener("logs", () => {});

    es.onerror = () => {
      setConnected(false);
      es.close();
      eventSourceRef.current = null;
      reconnectRef.current = setTimeout(() => connect(), 3000);
    };
  }, [setProcesses, setConnected, setHost]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  return useEventStore((s) => s.processes);
}

export function useEventSourceHost() {
  return useEventStore((s) => s.host);
}

export function useEventSourceConnection() {
  return useEventStore((s) => s.connected);
}
