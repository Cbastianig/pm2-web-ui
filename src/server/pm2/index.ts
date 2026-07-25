import pm2 from "pm2";
import { promisify } from "node:util";

const pm2Connect = promisify(pm2.connect.bind(pm2));
const pm2List = promisify(pm2.list.bind(pm2));
const pm2Restart = promisify(pm2.restart.bind(pm2));
const pm2Stop = promisify(pm2.stop.bind(pm2));
const pm2Trigger = promisify(pm2.trigger.bind(pm2));
const pm2Delete = promisify(pm2.delete.bind(pm2));

function pm2Start(options: string | object): Promise<object[]> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pm2.start as any)(options, (err: any, apps: any) => {
      if (err instanceof Error) reject(err);
      else if (typeof err === "string" && err.length > 0) reject(new Error(err));
      else resolve(apps ?? err ?? []);
    });
  });
}

let connected = false;
let connectingPromise: Promise<void> | null = null;

async function ensureConnected() {
  if (connected) return;
  if (connectingPromise) return connectingPromise;
  connectingPromise = pm2Connect().then(() => {
    connected = true;
    connectingPromise = null;
  });
  await connectingPromise;
}

function resetConnection() {
  connected = false;
  connectingPromise = null;
}

export async function loadProcessList() {
  await ensureConnected();
  try {
    const list = await pm2List();
    return Array.isArray(list) ? list : [];
  } catch {
    resetConnection();
    return [];
  }
}

export function normalizeProcessSummary(proc: Record<string, any>) {
  const env = proc.pm2_env || {};
  const monit = proc.monit || {};

  return {
    id: proc.pm_id,
    name: proc.name || `pm2-${proc.pm_id}`,
    pid: proc.pid || null,
    status: env.status || "unknown",
    version: env.version || null,
    namespace: env.namespace || null,
    execMode: env.exec_mode || null,
    instances: env.instances ?? null,
    restarts: env.restart_time ?? 0,
    uptime: env.pm_uptime ? Date.now() - env.pm_uptime : null,
    createdAt: env.created_at || null,
    scriptPath: env.pm_exec_path || env.pm_cwd || null,
    cwd: env.pm_cwd || null,
    watch: Boolean(env.watch),
    cpu: safeNumber(monit.cpu),
    memory: safeNumber(monit.memory),
  };
}

export async function loadProcessDetails(processId: string | number) {
  const processes = await loadProcessList();
  const proc = processes.find(
    (entry) => String(entry.pm_id) === String(processId)
  );
  if (!proc) return null;

  const summary = normalizeProcessSummary(proc);
  return {
    process: {
      ...summary,
      interpreter: proc.pm2_env?.exec_interpreter || null,
      nodeVersion: proc.pm2_env?.node_version || null,
      username: proc.pm2_env?.username || null,
      autorestart: proc.pm2_env?.autorestart ?? null,
      unstableRestarts: proc.pm2_env?.unstable_restarts ?? null,
      mergeLogs: proc.pm2_env?.merge_logs ?? null,
    },
  };
}

export async function restartProcess(processId: string | number) {
  await ensureConnected();
  try {
    await pm2Restart(String(processId));
  } catch {
    resetConnection();
    throw new Error("Failed to restart process");
  }
}

export async function stopProcess(processId: string | number) {
  await ensureConnected();
  try {
    await pm2Stop(String(processId));
  } catch {
    resetConnection();
    throw new Error("Failed to stop process");
  }
}

export async function startStoppedProcess(processId: string | number) {
  await ensureConnected();
  try {
    await pm2Start(String(processId));
  } catch {
    resetConnection();
    throw new Error("Failed to start process");
  }
}

export async function startProcess(options: object) {
  await ensureConnected();
  try {
    await pm2Start(options);
  } catch {
    resetConnection();
    throw new Error("Failed to start process");
  }
}

export async function deleteProcess(nameOrId: string | number) {
  await ensureConnected();
  try {
    await pm2Delete(String(nameOrId));
  } catch {
    resetConnection();
    throw new Error("Failed to delete process");
  }
}

export async function flushLogs(processId: string | number) {
  await ensureConnected();
  try {
    return new Promise<void>((resolve, reject) => {
      pm2.flush(String(processId), (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch {
    resetConnection();
    throw new Error("Failed to flush logs");
  }
}

export async function getProcessActions(processId: string | number) {
  const processes = await loadProcessList();
  const proc = processes.find(
    (entry) => String(entry.pm_id) === String(processId)
  );
  if (!proc) return [];
  const axm = proc.pm2_env?.axm_actions || [];
  return axm
    .filter((a: any) => a.action_name)
    .map((a: any) => {
      const params = Array.isArray(a.arity)
        ? a.arity
        : Array.isArray(a.opts)
        ? a.opts
        : [];
      return { name: a.action_name, params };
    });
}

export async function triggerProcessAction(
  processId: string | number,
  actionName: string,
  params?: any
) {
  await ensureConnected();
  try {
    const hasParams =
      params !== undefined && params !== null && params !== "";
    return await pm2Trigger(
      String(processId),
      actionName,
      ...(hasParams ? [params] : [])
    );
  } catch {
    resetConnection();
    throw new Error("Failed to trigger action");
  }
}

export function getLogFiles(processId: string | number) {
  return loadProcessList().then((processes) => {
    const proc = processes.find(
      (entry) => String(entry.pm_id) === String(processId)
    );
    if (!proc) return [];
    const env = proc.pm2_env || {};
    const paths: { type: string; path: string }[] = [];
    const seen = new Set<string>();
    const add = (type: string, p: string | null) => {
      if (!p || p === "/dev/null" || seen.has(p)) return;
      seen.add(p);
      paths.push({ type, path: p });
    };
    add("stdout", env.pm_out_log_path || env.out_file);
    add("stderr", env.pm_err_log_path || env.error_file);
    if (paths.length === 0) {
      add("combined", env.pm_log_path || env.log_file);
    }
    return paths;
  });
}

export async function readLogLinesByName(pm2Name: string) {
  const fs = await import("node:fs/promises");
  const config = await import("@/lib/env");
  const processes = await loadProcessList();
  const proc = processes.find((p) => p.name === pm2Name);
  if (!proc) return [];

  const env = proc.pm2_env || {};
  const paths: string[] = [];
  const seen = new Set<string>();

  const addPath = (p: string | null) => {
    if (!p || p === "/dev/null" || seen.has(p)) return;
    seen.add(p);
    paths.push(p);
  };
  addPath(env.pm_out_log_path || env.out_file);
  addPath(env.pm_err_log_path || env.error_file);
  if (paths.length === 0) {
    addPath(env.pm_log_path || env.log_file);
  }

  const maxBytes = config.readEnv("MAX_LOG_BYTES_PER_FILE");
  const allLines: { text: string; source: string }[] = [];

  for (const filePath of paths) {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;

      let start = 0;
      if (maxBytes > 0 && stat.size > maxBytes) {
        start = stat.size - maxBytes;
      }

      const handle = await fs.open(filePath, "r");
      try {
        const length = Math.max(stat.size - start, 0);
        const buffer = Buffer.alloc(length);
        if (length > 0) {
          await handle.read(buffer, 0, length, start);
        }
        const content = buffer.toString("utf8");
        const normalized = start > 0 ? content.replace(/^[^\n]*\n?/, "") : content;
        const lines = normalized.split(/\r?\n/).filter((l) => l.length > 0);
        const source = filePath.includes("err") ? "stderr" : "stdout";
        for (const line of lines) {
          allLines.push({ text: line, source });
        }
      } finally {
        await handle.close();
      }
    } catch {
      // file not accessible
    }
  }

  allLines.sort((a, b) => {
    const tsA = extractTimestamp(a.text);
    const tsB = extractTimestamp(b.text);
    return tsA < tsB ? -1 : tsA > tsB ? 1 : 0;
  });

  return allLines;
}

export function extractTimestamp(line: string): string {
  return line.match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/)?.[1] ?? "";
}

function safeNumber(value: any, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}
