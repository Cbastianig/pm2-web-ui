import pm2 from "pm2";
import { promisify } from "node:util";
import { eventBus } from "./bus";
import { extractTimestamp } from "../pm2";
import { getDb } from "../storage/client";
import { logEntries } from "../storage/schema";
import { getMonitorId } from "../storage/monitorCache";
import { readEnv } from "@/lib/env";

const pm2Connect = promisify(pm2.connect.bind(pm2));

export function detectLogLevel(text: string): string {
  // 1. JSON-style "level" field
  if (/"level"\s*:\s*"(?:error|fatal|critical)"/i.test(text)) return "error";
  if (/"level"\s*:\s*"warn(?:ing)?"/i.test(text)) return "warn";
  if (/"level"\s*:\s*"info"/i.test(text)) return "info";
  if (/"level"\s*:\s*"(?:debug|trace|verbose)"/i.test(text)) return "debug";

  // 2. Bracket notation [LEVEL] / (LEVEL)
  if (
    /\[(?:error|fatal|crit(?:ical)?)\]|\((?:error|fatal|crit(?:ical)?)\)/i.test(
      text,
    )
  )
    return "error";
  if (/\[warn(?:ing)?\]|\(warn(?:ing)?\)/i.test(text)) return "warn";
  if (/\[info\]|\(info\)/i.test(text)) return "info";
  if (/\[(?:debug|trace|verbose)\]|\((?:debug|trace|verbose)\)/i.test(text))
    return "debug";

  // 3. Uppercase standalone label (anywhere in the line after whitespace/pipe)
  if (
    /(?:^|[\s|])(?:ERROR|FATAL|CRITICAL|EXCEPTION|CRIT)(?:[:\s|]|$)/.test(text)
  )
    return "error";
  if (/(?:^|[\s|])WARN(?:ING)?(?:[:\s|]|$)/.test(text)) return "warn";
  if (/(?:^|[\s|])INFO(?:[:\s|]|$)/.test(text)) return "info";
  if (/(?:^|[\s|])(?:DEBUG|TRACE|VERBOSE)(?:[:\s|]|$)/.test(text))
    return "debug";

  return "";
}

let started = false;
let busSock: NodeJS.EventEmitter | null = null;
let reconnecting = false;
let retryAttempt = 0;

const MAX_RECONNECT_DELAY_MS = 60_000;

function onDisconnect() {
  if (reconnecting) return;
  console.error("[logBus] PM2 bus disconnected, reconnecting...");
  scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnecting) return;
  reconnecting = true;

  if (busSock && typeof (busSock as any).close === "function") {
    try {
      (busSock as any).close();
    } catch {}
  }
  busSock = null;

  const delay = Math.min(1000 * 2 ** retryAttempt, MAX_RECONNECT_DELAY_MS);
  retryAttempt++;

  setTimeout(async () => {
    try {
      await connectBus();
      retryAttempt = 0;
      reconnecting = false;
      console.warn("[logBus] Reconnected to PM2 bus");
    } catch (e) {
      reconnecting = false;
      console.error(
        "[logBus] Reconnect attempt failed:",
        (e as Error).message,
      );
      scheduleReconnect();
    }
  }, delay).unref();
}

async function connectBus() {
  await pm2Connect();
  const { bus, sock } = await new Promise<{
    bus: NodeJS.EventEmitter;
    sock: NodeJS.EventEmitter;
  }>((resolve, reject) => {
    pm2.launchBus((err: Error | null, bus: any, ...rest: any[]) => {
      const sock = rest[0] as NodeJS.EventEmitter;
      if (err) reject(err);
      else resolve({ bus, sock });
    });
  });

  bus.on("log:out", handlePacket);
  bus.on("log:err", handlePacket);
  sock.on("close", onDisconnect);
  sock.on("error", onDisconnect);
  sock.on("disconnect", onDisconnect);
  busSock = sock;
}

interface TokenBucket {
  tokens: number;
  last: number;
}

const buckets = new Map<string, TokenBucket>();

function takeTokens(name: string, count: number): number {
  const maxPerSec = readEnv("LOG_MAX_LINES_PER_SECOND");
  const burst = readEnv("LOG_MAX_BURST");
  const now = Date.now();
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = { tokens: burst, last: now };
    buckets.set(name, bucket);
  }
  const elapsed = (now - bucket.last) / 1000;
  bucket.tokens = Math.min(burst, bucket.tokens + elapsed * maxPerSec);
  bucket.last = now;
  const allowed = Math.min(count, Math.floor(bucket.tokens));
  bucket.tokens = Math.max(0, bucket.tokens - allowed);
  return allowed;
}

function clampTimestamp(value: number): number {
  const now = Date.now();
  return value > now ? now : value;
}

export function handlePacket(packet: any) {
  const appName = packet.process?.name;
  if (!appName) return;

  const rawData = String(packet.data ?? "");
  const lines = rawData.split(/\r?\n/).filter((l: string) => l.length > 0);
  if (lines.length === 0) return;

  const monitorId = getMonitorId(appName);
  const at =
    typeof packet.at === "number" && packet.at > 0 ? packet.at : Date.now();

  const parsed = lines.map((text) => ({
    text,
    level: detectLogLevel(text),
  }));

  const allowed = takeTokens(appName, parsed.length);
  const kept = allowed > 0 ? parsed.slice(0, allowed) : [];
  const dropped = parsed.length - kept.length;

  if (monitorId != null && kept.length > 0) {
    try {
      const db = getDb();
      db.transaction((tx) => {
        tx.insert(logEntries)
          .values(
            kept.map(({ text, level }) => {
              const ts = extractTimestamp(text);
              const loggedAt = clampTimestamp(
                ts ? new Date(ts.replace(" ", "T")).getTime() || at : at,
              );
              return {
                monitorId,
                loggedAt,
                logLevel: level,
                log: JSON.stringify({ lines: [text], raw: text }),
                raw: text,
              };
            }),
          )
          .run();
      });
    } catch {
      // never let storage errors affect streaming
    }
  }

  for (const { text, level } of kept) {
    eventBus.emit("log", { text, processName: appName, level });
  }

  if (dropped > 0) {
    eventBus.emit("log", {
      text: `[rate limited] ${dropped} line(s) discarded for ${appName}`,
      processName: appName,
      level: "warn",
    });
  }
}

export async function startLogBus() {
  if (started) return;
  started = true;

  try {
    await connectBus();
  } catch (e) {
    console.error("[logBus] Initial connection failed:", (e as Error).message);
    scheduleReconnect();
  }
}

// For tests only — resets the connection state
export function _resetLogBus() {
  started = false;
  busSock = null;
  reconnecting = false;
  retryAttempt = 0;
}
