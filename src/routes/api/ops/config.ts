import { createFileRoute } from "@tanstack/react-router";
import { getSession } from "@/server/auth/store";
import fs from "node:fs";
import path from "node:path";
import { OpsConfigSchema } from "@/server/discovery/types";
import { invalidateScanCache, scanAll } from "@/server/discovery/scanner";
import { gitlabProvider } from "@/server/providers";
import { readEnv } from "@/lib/env";

const OPS_CONFIG_FILE = "ops.config.json";

async function verifyGitLab(config: {
  projectId: number;
  branch: string;
  featuresGitlab: boolean;
}): Promise<string | null> {
  if (!config.featuresGitlab) return null;
  if (!readEnv("GITLAB_TOKEN")) {
    return "GITLAB_TOKEN is not configured; skipping GitLab verification.";
  }

  const project = await gitlabProvider.getProject(config.projectId).catch(() => null);
  if (!project) {
    return `GitLab project ID ${config.projectId} not found or inaccessible.`;
  }

  const branch = await gitlabProvider
    .getBranch(config.projectId, config.branch)
    .catch(() => null);
  if (!branch) {
    return `Branch "${config.branch}" does not exist in project ${project.name}.`;
  }

  return null;
}

export const Route = createFileRoute("/api/ops/config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getSession();
        if (!session) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        const dirName = url.searchParams.get("dirName") ?? "";
        const scanPath = readEnv("OPS_APPS_PATH");

        const { apps, unconfigured } = scanAll(scanPath);
        const target =
          apps.find((a) => a.dirName === dirName) ??
          unconfigured.find((u) => u.dirName === dirName);

        if (!target) {
          return Response.json({ error: "App directory not found" }, { status: 404 });
        }

        const configPath = path.join(target.appPath, OPS_CONFIG_FILE);
        let config: Record<string, unknown> | null = null;
        try {
          config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        } catch {
          // not configured yet
        }

        return Response.json({
          dirName,
          appPath: target.appPath,
          configured: config !== null,
          config,
        });
      },
      POST: async ({ request }) => {
        const session = getSession();
        if (!session) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as {
          dirName?: string;
          config?: unknown;
        };
        if (!body.dirName || body.config === undefined) {
          return Response.json({ error: "dirName and config are required" }, { status: 400 });
        }

        const scanPath = readEnv("OPS_APPS_PATH");
        const { apps, unconfigured } = scanAll(scanPath);
        const target =
          apps.find((a) => a.dirName === body.dirName) ??
          unconfigured.find((u) => u.dirName === body.dirName);

        if (!target) {
          return Response.json({ error: "App directory not found" }, { status: 404 });
        }

        const parsed = OpsConfigSchema.safeParse(body.config);
        if (!parsed.success) {
          return Response.json(
            {
              error: parsed.error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; "),
            },
            { status: 400 }
          );
        }

        const gitError = await verifyGitLab({
          projectId: parsed.data.git.projectId,
          branch: parsed.data.git.branch,
          featuresGitlab: parsed.data.features.gitlab,
        });
        if (gitError) {
          return Response.json({ error: gitError }, { status: 400 });
        }

        const configPath = path.join(target.appPath, OPS_CONFIG_FILE);
        fs.writeFileSync(
          configPath,
          JSON.stringify(parsed.data, null, 2) + "\n",
          "utf8"
        );
        invalidateScanCache();

        return Response.json({ ok: true, config: parsed.data });
      },
    },
  },
});
