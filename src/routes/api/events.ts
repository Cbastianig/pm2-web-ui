import { createFileRoute } from "@tanstack/react-router";
import { getSession } from "@/server/auth/store";
import { eventBus } from "@/server/events/bus";
import { loadProcessList, normalizeProcessSummary } from "@/server/pm2";
import { getDb } from "@/server/storage/client";
import { monitoring, alertPrefs } from "@/server/storage/schema";
import { getLastHostReading } from "@/server/host/metrics";
import { scanAll } from "@/server/discovery";
import {
  gitlabProvider,
  blueGreenProvider,
  httpHealthProvider,
} from "@/server/providers";
import type { Application } from "@/server/ops/types";
import { readEnv } from "@/lib/env";
import fs from "node:fs";
import path from "node:path";

const encoder = new TextEncoder();

function sseEvent(type: string, data: any): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

function buildOpsProcessMap(): Map<
  string,
  { appName: string; color: "blue" | "green"; active: boolean }
> {
  const map = new Map<
    string,
    { appName: string; color: "blue" | "green"; active: boolean }
  >();
  try {
    const { apps } = scanAll(readEnv("OPS_APPS_PATH"));
    for (const d of apps) {
      const cfg = d.config;
      let activeColor: "blue" | "green" | null = null;
      try {
        const current = fs
          .readFileSync(
            path.resolve(d.appPath, cfg.deployment.currentFile),
            "utf8",
          )
          .trim()
          .toLowerCase();
        if (current === "blue" || current === "green") activeColor = current;
      } catch {
        // current file not found yet
      }
      map.set(cfg.runtime.blue, {
        appName: cfg.name,
        color: "blue",
        active: activeColor === "blue",
      });
      map.set(cfg.runtime.green, {
        appName: cfg.name,
        color: "green",
        active: activeColor === "green",
      });
    }
  } catch {}
  return map;
}

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getSession();
        if (!session) return new Response("Unauthorized", { status: 401 });

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

            // Process polling
            const processInterval = setInterval(async () => {
              if (closed) return;
              try {
                const processes = await loadProcessList();
                const normalised = processes.map(normalizeProcessSummary);
                const activeNames = new Set(normalised.map((p) => p.name));
                const db = getDb();
                const mRows = await db.select().from(monitoring).all();
                const mMap = new Map(mRows.map((r) => [r.pm2Name, r]));
                const aRows = await db.select().from(alertPrefs).all();
                const aMap = new Map(
                  aRows.map((r) => [r.pm2Name, r.alertsEnabled !== 0]),
                );
                const annotatedBase = normalised.map((item) => ({
                  ...item,
                  isMonitored: mMap.has(item.name),
                  isOrphan: false,
                  alertsEnabled: aMap.get(item.name) ?? true,
                }));
                const opsProcessMap = buildOpsProcessMap();
                const annotate = (item: any) => {
                  const meta = opsProcessMap.get(item.name);
                  return meta
                    ? {
                        ...item,
                        appName: meta.appName,
                        appColor: meta.color,
                        appActive: meta.active,
                      }
                    : {
                        ...item,
                        appName: null,
                        appColor: null,
                        appActive: null,
                      };
                };
                const annotated = annotatedBase.map(annotate);
                for (const row of mRows) {
                  if (!activeNames.has(row.pm2Name)) {
                    annotated.push(
                      annotate({
                        id: null,
                        name: row.pm2Name,
                        pid: null,
                        status: "orphan",
                        version: null,
                        namespace: null,
                        execMode: null,
                        instances: null,
                        restarts: 0,
                        uptime: null,
                        createdAt: null,
                        scriptPath: null,
                        cwd: null,
                        watch: false,
                        cpu: 0,
                        memory: 0,
                        isMonitored: true,
                        isOrphan: true,
                        alertsEnabled: aMap.get(row.pm2Name) ?? true,
                      }),
                    );
                  }
                }
                annotated.sort((a, b) => {
                  const ra = a.isOrphan ? 2 : a.isMonitored ? 0 : 1;
                  const rb = b.isOrphan ? 2 : b.isMonitored ? 0 : 1;
                  return ra !== rb
                    ? ra - rb
                    : a.name.localeCompare(b.name, "en");
                });
                send("processes", {
                  items: annotated,
                  host: getLastHostReading(),
                  generatedAt: Date.now(),
                });
              } catch {}
            }, 3000);

            // Host metrics polling
            const hostInterval = setInterval(() => {
              if (closed) return;
              try {
                const h = getLastHostReading();
                if (h) send("host", h);
              } catch {}
            }, 10000);

            // Log forwarding
            function onLog(data: {
              text: string;
              processName: string;
              level: string;
            }) {
              send("logs", data);
            }
            eventBus.on("log", onLog);

            // Ops apps polling
            let opsSending = false;
            async function sendOps() {
              if (closed || opsSending) return;
              opsSending = true;
              try {
                const scanPath = readEnv("OPS_APPS_PATH");
                const { apps: discovered, unconfigured } = scanAll(scanPath);
                send("ops:unconfigured", unconfigured);
                if (!discovered.length) return;
                const snapshots: any[] = [];
                for (const d of discovered) {
                  const c = d.config;
                  const app: Application = {
                    name: c.name,
                    description: c.description,
                    appPath: d.appPath,
                    provider: c.provider,
                    projectId: c.git.projectId,
                    branch: c.git.branch,
                    runtimeType: c.runtime.type,
                    blueName: c.runtime.blue,
                    greenName: c.runtime.green,
                    strategy: c.deployment.strategy,
                    currentFile: c.deployment.currentFile,
                    healthEnabled: c.healthcheck.enabled,
                    healthPath: c.healthcheck.path,
                    healthPort: c.healthcheck.port,
                    features: c.features,
                  };
                  try {
                    const envs = await blueGreenProvider.getEnvironments({
                      blueName: app.blueName,
                      greenName: app.greenName,
                      currentFile: app.currentFile,
                      appPath: app.appPath,
                    });
                    const blue: any = envs[0]!,
                      green: any = envs[1]!;
                    const current: "blue" | "green" | "unknown" = blue.active
                      ? "blue"
                      : green.active
                        ? "green"
                        : "unknown";

                    // GitLab in parallel
                    let gitlabPipeline: any = null,
                      gitlabProject: any = null;
                    if (app.features.gitlab && readEnv("GITLAB_TOKEN")) {
                      [gitlabProject, gitlabPipeline] = await Promise.all([
                        gitlabProvider
                          .getProject(app.projectId)
                          .catch(() => null),
                        gitlabProvider
                          .getLastPipeline(app.projectId, app.branch)
                          .catch(() => null),
                      ]);
                    }

                    let pipelineTime: string | null = null;
                    if (gitlabPipeline?.createdAt) {
                      const s = Math.floor(
                        (Date.now() -
                          new Date(gitlabPipeline.createdAt).getTime()) /
                          1000,
                      );
                      pipelineTime =
                        s < 60
                          ? `${s}s ago`
                          : s < 3600
                            ? `${Math.floor(s / 60)}m ago`
                            : s < 86400
                              ? `${Math.floor(s / 3600)}h ago`
                              : `${Math.floor(s / 86400)}d ago`;
                    }

                    if (gitlabPipeline?.sha) {
                      const glCommit = await gitlabProvider
                        .getCommit(app.projectId, gitlabPipeline.sha)
                        .catch(() => null);
                      if (glCommit) {
                        glCommit.branch = app.branch;
                        blue.commit = glCommit;
                        green.commit = { ...glCommit };
                        if (gitlabPipeline.author === "unknown")
                          gitlabPipeline.author = glCommit.author;
                      }
                    }
                    if (!blue.commit && gitlabPipeline?.sha) {
                      const fb = {
                        hash: gitlabPipeline.sha,
                        shortHash: gitlabPipeline.sha.substring(0, 8),
                        branch: app.branch,
                        author: gitlabPipeline.author || "pipeline",
                        message: `Pipeline #${gitlabPipeline.id}`,
                        date: gitlabPipeline.createdAt || "",
                      };
                      blue.commit = fb;
                      green.commit = { ...fb };
                    }

                    let health: any = null;
                    if (app.healthEnabled) {
                      const ae =
                        current === "blue"
                          ? blue
                          : current === "green"
                            ? green
                            : null;
                      const p =
                        ae?.port ||
                        (ae?.runtime?.env?.["PORT"]
                          ? parseInt(ae.runtime.env["PORT"], 10)
                          : null);
                      if (p)
                        health = await httpHealthProvider
                          .check(
                            `http://127.0.0.1:${p}${app.healthPath.startsWith("/") ? app.healthPath : `/${app.healthPath}`}`,
                          )
                          .catch(() => null);
                    }

                    let drift: any = null;
                    if (
                      gitlabPipeline?.sha &&
                      blue.commit &&
                      blue.commit.hash !== gitlabPipeline.sha
                    )
                      drift = {
                        pipelineSha: gitlabPipeline.sha.substring(0, 8),
                        runningSha: blue.commit.shortHash,
                        behind: "unknown",
                      };

                    snapshots.push({
                      app,
                      dirName: d.dirName,
                      blue,
                      green,
                      current,
                      gitlabPipeline,
                      gitlabProject,
                      health,
                      drift,
                      pipelineTime,
                      collectedAt: Date.now(),
                    });
                  } catch (err) {
                    console.error(
                      `[OPS-SSE] Error "${app.name}":`,
                      (err as Error).message,
                    );
                  }
                }
                if (snapshots.length > 0) send("ops:applications", snapshots);
              } catch (err) {
                console.error(
                  `[OPS-SSE] sendOps failed:`,
                  (err as Error).message,
                );
              } finally {
                opsSending = false;
              }
            }

            sendOps();
            const opsInterval = setInterval(sendOps, 10_000);

            function onOpsRefresh() {
              sendOps();
            }
            eventBus.on("ops:refresh", onOpsRefresh);

            const cleanup = () => {
              closed = true;
              clearInterval(processInterval);
              clearInterval(hostInterval);
              clearInterval(opsInterval);
              eventBus.off("log", onLog);
              eventBus.off("ops:refresh", onOpsRefresh);
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
