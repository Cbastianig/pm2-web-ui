import { readEnv } from "@/lib/env";
import { scanApps } from "@/server/discovery";
import { getDb } from "@/server/storage/client";
import { releaseHistory } from "@/server/storage/schema";
import { desc, eq } from "drizzle-orm";

let running = false;
let interval: ReturnType<typeof setInterval> | null = null;

export function startAppManager(): void {
  if (running) return;
  running = true;

  async function tick() {
    try {
      const discovered = scanApps(readEnv("OPS_APPS_PATH"));
      if (!discovered.length) return;

      const db = getDb();
      for (const d of discovered) {
        const appName = d.config.name;
        // Store last known commit from DB for drift context
        // Actual commit detection happens via ops SSE pipeline data
        const rows = db.select().from(releaseHistory)
          .where(eq(releaseHistory.appName, appName))
          .orderBy(desc(releaseHistory.deployedAt)).limit(1).all();
        if (!rows.length) {
          // Initial placeholder
          db.insert(releaseHistory).values({
            appName, commit: "unknown", branch: d.config.git.branch,
            pipelineId: null, pipelineStatus: null, pipelineDuration: null,
            author: "", date: new Date().toISOString(),
            environment: "unknown", deployedAt: Date.now(), message: "App discovered",
          }).onConflictDoNothing().run();
        }
      }
    } catch { /* noop */ }
  }

  setTimeout(tick, 5000);
  interval = setInterval(tick, 30_000);
  interval.unref();
}

export function stopAppManager(): void {
  running = false;
  if (interval) { clearInterval(interval); interval = null; }
}
