import { createFileRoute } from "@tanstack/react-router";
import { getSession } from "@/server/auth/store";

export const Route = createFileRoute("/api/alerting/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = getSession();
        if (!session) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as {
          type: "webhook" | "ntfy";
          url?: string;
          headers?: { key: string; value: string }[];
          bodyParams?: { key: string; value: string }[];
          serverUrl?: string;
          topic?: string;
          priority?: string;
          token?: string;
        };

        const payload = {
          logLevel: "error",
          log_message: "Test alert from PM2 Process Web UI",
          process_name: "test-process",
        };

        try {
          if (body.type === "webhook" && body.url) {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            for (const h of body.headers || []) {
              if (h.key.trim()) headers[h.key.trim()] = h.value || "";
            }
            const jsonBody: Record<string, unknown> = {};
            for (const p of body.bodyParams || []) {
              if (p.key.trim()) jsonBody[p.key.trim()] = p.value || "";
            }

            const res = await fetch(body.url, {
              method: "POST",
              headers,
              body: JSON.stringify(jsonBody),
              signal: AbortSignal.timeout(10000),
            });
            return Response.json({ ok: res.ok, status: res.status });
          }

          if (body.type === "ntfy" && body.topic) {
            const headers: Record<string, string> = {
              Title: `[TEST] PM2 Process Web UI`,
              Priority: body.priority || "default",
            };
            if (body.token) headers["Authorization"] = `Bearer ${body.token}`;

            const res = await fetch(`${body.serverUrl || "https://ntfy.sh"}/${body.topic}`, {
              method: "POST",
              headers,
              body: payload.log_message,
              signal: AbortSignal.timeout(10000),
            });
            return Response.json({ ok: res.ok, status: res.status });
          }

          return Response.json({ ok: false, error: "Invalid test configuration" }, { status: 400 });
        } catch (err) {
          return Response.json({
            ok: false,
            error: err instanceof Error ? err.message : "Test request failed",
          });
        }
      },
    },
  },
});
