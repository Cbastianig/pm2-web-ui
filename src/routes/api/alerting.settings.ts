import { createFileRoute } from "@tanstack/react-router";
import { getSession } from "@/server/auth/store";
import { getDb } from "@/server/storage/client";
import { alertSettings } from "@/server/storage/schema";
import { eq } from "drizzle-orm";

export const Route = createFileRoute("/api/alerting/settings")({
  server: {
    handlers: {
      GET: async () => {
        const session = getSession();
        if (!session) return new Response("Unauthorized", { status: 401 });

        const db = getDb();
        const rows = db.select().from(alertSettings).all();
        const settings: Record<string, string> = {};
        for (const row of rows) {
          settings[row.key] = row.value;
        }
        return Response.json({ settings });
      },
      POST: async ({ request }) => {
        const session = getSession();
        if (!session) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as {
          settings: Record<string, string>;
        };
        const db = getDb();

        for (const [key, value] of Object.entries(body.settings)) {
          const existing = db
            .select()
            .from(alertSettings)
            .where(eq(alertSettings.key, key))
            .all();
          if (existing.length > 0) {
            db.update(alertSettings)
              .set({ value })
              .where(eq(alertSettings.key, key))
              .run();
          } else {
            db.insert(alertSettings).values({ key, value }).run();
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
