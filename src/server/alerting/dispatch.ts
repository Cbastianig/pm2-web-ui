import { eventBus } from "@/server/events/bus";
import { getDb } from "@/server/storage/client";
import { alertSettings, alertPrefs } from "@/server/storage/schema";
import { eq } from "drizzle-orm";

const dispatchCooldowns = new Map<string, number>();

function getSetting(key: string, fallback: string): string {
  const db = getDb();
  const rows = db.select().from(alertSettings).where(eq(alertSettings.key, key)).all();
  return rows.length > 0 ? rows[0]!.value : fallback;
}

function isMuted(pm2Name: string): boolean {
  const db = getDb();
  const rows = db.select().from(alertPrefs).where(eq(alertPrefs.pm2Name, pm2Name)).all();
  if (rows.length === 0) return false;
  return rows[0]!.alertsEnabled === 0;
}

async function sendWebhook(
  url: string,
  headers: { key: string; value: string }[],
  bodyParams: { key: string; value: string }[],
  payload: { logLevel: string; log_message: string; process_name: string }
) {
  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  for (const h of headers) {
    if (h.key.trim()) {
      reqHeaders[h.key.trim()] = substitute(h.value ?? "", payload);
    }
  }

  const body: Record<string, unknown> = {};
  for (const p of bodyParams) {
    if (p.key.trim()) {
      body[p.key.trim()] = resolveBodyValue(p.value ?? "", payload);
    }
  }

  await fetch(url, {
    method: "POST",
    headers: reqHeaders,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
}

async function sendNtfy(
  serverUrl: string,
  topic: string,
  priority: string,
  token: string,
  payload: { logLevel: string; log_message: string; process_name: string }
) {
  const headers: Record<string, string> = {
    Title: `[${payload.logLevel.toUpperCase()}] ${payload.process_name}`,
    Priority: priority,
  };
  if (priority !== "default") headers["Priority"] = priority;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  await fetch(`${serverUrl}/${topic}`, {
    method: "POST",
    headers,
    body: payload.log_message,
    signal: AbortSignal.timeout(10000),
  });
}

function substitute(template: string, data: Record<string, string>): string {
  return template
    .replace(/\{logLevel\}/g, data.logLevel)
    .replace(/\{log_message\}/g, data.log_message)
    .replace(/\{process_name\}/g, data.process_name);
}

function resolveBodyValue(template: string, data: Record<string, string>): unknown {
  const raw = substitute(template, data);
  try { return JSON.parse(raw); } catch {
    const encoded = substitute(
      template
        .replace(/\{logLevel\}/g, JSON.stringify(data.logLevel))
        .replace(/\{log_message\}/g, JSON.stringify(data.log_message))
        .replace(/\{process_name\}/g, JSON.stringify(data.process_name)),
      data
    );
    try { return JSON.parse(encoded); } catch { return raw; }
  }
}

export function initAlerting() {
  eventBus.on("log", (data: { text: string; processName: string; level: string }) => {
    try {
      if (!data.level || (data.level !== "error" && data.level !== "warn")) return;
      if (isMuted(data.processName)) return;

      const mode = getSetting("alert.mode", "every");
      const throttleMin = parseInt(getSetting("alert.throttleMinutes", "60"), 10);

      if (mode === "throttle") {
        const key = `${data.processName}:${data.level}`;
        const lastDispatch = dispatchCooldowns.get(key) || 0;
        const now = Date.now();
        if (now - lastDispatch < throttleMin * 60 * 1000) return;
        dispatchCooldowns.set(key, now);
      }

      const payload = {
        logLevel: data.level,
        log_message: data.text,
        process_name: data.processName,
      };

      const whEnabled = getSetting("reporter.webhook.enabled", "0");
      if (whEnabled === "1") {
        const whUrl = getSetting("reporter.webhook.url", "");
        let whHeaders: { key: string; value: string }[] = [];
        let whBody: { key: string; value: string }[] = [];
        try { whHeaders = JSON.parse(getSetting("reporter.webhook.headers", "[]")); } catch {}
        try { whBody = JSON.parse(getSetting("reporter.webhook.body", "[]")); } catch {}
        if (whUrl) {
          sendWebhook(whUrl, whHeaders, whBody, payload).catch(() => {});
        }
      }

      const ntfyEnabled = getSetting("reporter.ntfy.enabled", "0");
      if (ntfyEnabled === "1") {
        const ntfyServer = getSetting("reporter.ntfy.serverUrl", "https://ntfy.sh");
        const ntfyTopic = getSetting("reporter.ntfy.topic", "");
        const ntfyPriority = getSetting("reporter.ntfy.priority", "default");
        const ntfyToken = getSetting("reporter.ntfy.token", "");
        if (ntfyTopic) {
          sendNtfy(ntfyServer, ntfyTopic, ntfyPriority, ntfyToken, payload).catch(() => {});
        }
      }
    } catch {}
  });
}
