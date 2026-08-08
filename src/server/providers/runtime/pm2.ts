import type { RuntimeProvider, ProcessInfo } from "../types";
import { loadProcessList, normalizeProcessSummary } from "@/server/pm2";

export const pm2RuntimeProvider: RuntimeProvider = {
  name: "pm2",

  async getProcess(pm2Name: string): Promise<ProcessInfo | null> {
    try {
      const processes = await loadProcessList();
      const proc = processes.find((p) => p.name === pm2Name);
      if (!proc) return null;

      const summary = normalizeProcessSummary(proc);
      return {
        name: summary.name,
        pid: summary.pid,
        status: summary.status,
        cpu: summary.cpu,
        memory: summary.memory,
        uptime: summary.uptime,
        restarts: summary.restarts,
        env: (proc.pm2_env?.env as Record<string, string>) || {},
        cwd: summary.cwd,
        scriptPath: summary.scriptPath,
      };
    } catch {
      return null;
    }
  },

  async getEnv(pm2Name: string): Promise<Record<string, string>> {
    try {
      const processes = await loadProcessList();
      const proc = processes.find((p) => p.name === pm2Name);
      if (!proc) return {};
      return (proc.pm2_env?.env as Record<string, string>) || {};
    } catch {
      return {};
    }
  },
};
