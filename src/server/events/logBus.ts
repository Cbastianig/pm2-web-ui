import pm2 from "pm2";
import { promisify } from "node:util";
import { eventBus } from "./bus";
import { extractTimestamp } from "../pm2";
import { getDb } from "../storage/client";
import { monitoring, logEntries } from "../storage/schema";
import { eq } from "drizzle-orm";

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

export async function startLogBus() {
  if (started) return;
  started = true;

  try {
    await pm2Connect();
    const { bus } = await new Promise<{
      bus: NodeJS.EventEmitter;
    }>((resolve, reject) => {
      pm2.launchBus((err: Error | null, bus) => {
        if (err) reject(err);
        else resolve({ bus });
      });
    });

    function handlePacket(packet: any) {
      const appName = packet.process?.name;
      if (!appName) return;

      const rawData = String(packet.data ?? "");
      const lines = rawData.split(/\r?\n/).filter((l: string) => l.length > 0);

      for (const text of lines) {
        const level = detectLogLevel(text);

        try {
          const db = getDb();
          const rows = db
            .select()
            .from(monitoring)
            .where(eq(monitoring.pm2Name, appName))
            .all();
          if (rows.length > 0) {
            const at =
              typeof packet.at === "number" && packet.at > 0
                ? packet.at
                : Date.now();
            const ts = extractTimestamp(text);
            const loggedAt = ts
              ? new Date(ts.replace(" ", "T")).getTime() || at
              : at;
            db.insert(logEntries)
              .values({
                monitorId: rows[0]!.id,
                loggedAt,
                logLevel: level,
                log: JSON.stringify({ lines: [text], raw: text }),
                raw: text,
              })
              .run();
          }
        } catch {
          // never let storage errors affect streaming
        }

        eventBus.emit("log", { text, processName: appName, level });
      }
    }

    bus.on("log:out", handlePacket);
    bus.on("log:err", handlePacket);
    bus.on("error", () => {});
  } catch {
    started = false;
  }
}
