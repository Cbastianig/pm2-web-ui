import { createFileRoute } from "@tanstack/react-router";
import { getSession } from "@/server/auth/store";
import { eventBus } from "@/server/events/bus";
import { loadProcessList, normalizeProcessSummary } from "@/server/pm2";
import { getDb } from "@/server/storage/client";
import { monitoring, alertPrefs } from "@/server/storage/schema";
import { getLastHostReading } from "@/server/host/metrics";

const encoder = new TextEncoder();

function sseEvent(type: string, data: any): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSession();
        if (!session) {
          return new Response("Unauthorized", { status: 401 });
        }

        let closed = false;
        const stream = new ReadableStream({
          start(controller) {
            const send = (type: string, data: any) => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(sseEvent(type, data)));
              } catch {
                closed = true;
              }
            };

            const processInterval = setInterval(async () => {
              if (closed) return;
              try {
                const processes = await loadProcessList();
                const normalised = processes.map(normalizeProcessSummary);
                const activeNames = new Set(normalised.map((p) => p.name));

                const db = getDb();
                const monitoredRows = await db.select().from(monitoring).all();
                const monitoredMap = new Map(monitoredRows.map((r) => [r.pm2Name, r]));
                const alertRows = await db.select().from(alertPrefs).all();
                const alertMap = new Map(alertRows.map((r) => [r.pm2Name, r.alertsEnabled !== 0]));

                const annotated = normalised.map((item) => ({
                  ...item,
                  isMonitored: monitoredMap.has(item.name),
                  isOrphan: false,
                  alertsEnabled: alertMap.get(item.name) ?? true,
                }));

                for (const row of monitoredRows) {
                  if (!activeNames.has(row.pm2Name)) {
                    annotated.push({
                      id: null,
                      name: row.pm2Name,
                      status: "orphan",
                      cpu: 0,
                      memory: 0,
                      restarts: 0,
                      uptime: null,
                      isMonitored: true,
                      isOrphan: true,
                      alertsEnabled: alertMap.get(row.pm2Name) ?? true,
                    });
                  }
                }

                annotated.sort((a, b) => {
                  const rankA = a.isOrphan ? 2 : a.isMonitored ? 0 : 1;
                  const rankB = b.isOrphan ? 2 : b.isMonitored ? 0 : 1;
                  if (rankA !== rankB) return rankA - rankB;
                  return a.name.localeCompare(b.name, "en");
                });

                send("processes", {
                  items: annotated,
                  host: getLastHostReading(),
                  generatedAt: Date.now(),
                });
              } catch {}
            }, 3000);

            const hostInterval = setInterval(() => {
              if (closed) return;
              try {
                const host = getLastHostReading();
                if (host) send("host", host);
              } catch {}
            }, 10000);

            function onLog(data: { text: string; processName: string; level: string }) {
              send("logs", data);
            }

            eventBus.on("log", onLog);

            const cleanup = () => {
              closed = true;
              clearInterval(processInterval);
              clearInterval(hostInterval);
              eventBus.off("log", onLog);
              controller.close();
            };

            request.signal.addEventListener("abort", cleanup);
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
