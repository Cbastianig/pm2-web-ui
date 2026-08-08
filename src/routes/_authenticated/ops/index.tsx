import { createFileRoute, Link } from "@tanstack/react-router";
import { useOpsSource, useOpsUnconfigured } from "@/hooks/useEventSource";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { OpsConfigDialog } from "@/components/ops-config-dialog";
import { LayoutDashboard, Circle, GitCommit, Activity, Heart, Loader2, ExternalLink, AlertTriangle, Settings2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/ops/")({
  component: OpsDashboard,
});

function formatBytes(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatSince(ts: number | null): string {
  if (!ts) return "—";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function OpsDashboard() {
  const apps = useOpsSource();
  const unconfigured = useOpsUnconfigured();
  const [configDir, setConfigDir] = useState<string | null>(null);

  if (!apps.length) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
          <p className="text-muted-foreground">Application monitoring and deployment status</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border py-20">
          <Loader2 className="size-10 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">
            Scanning for applications...
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 w-full max-w-4xl px-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-28" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
        <p className="text-muted-foreground">
          {apps.length} application{apps.length !== 1 ? "s" : ""} discovered
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => {
          const activeEnv = app.current === "blue" ? app.blue : app.current === "green" ? app.green : null;
          const standbyEnv = app.current === "blue" ? app.green : app.current === "green" ? app.blue : null;
          const runtime = activeEnv?.runtime;

          return (
            <div key={app.app.name}>
              <Card className="h-full transition-colors hover:border-accent">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to="/ops/$appName"
                      params={{ appName: app.app.name }}
                      className="block min-w-0 flex-1 rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <div className="flex items-center gap-2">
                        <CardTitle className="truncate text-base">{app.app.name}</CardTitle>
                        {runtime && (
                          <span
                            className={`size-2 shrink-0 rounded-full ${
                              runtime.status === "online" ? "bg-green-500" : "bg-red-500"
                            }`}
                          />
                        )}
                      </div>
                      {app.app.description && (
                        <p className="truncate text-xs text-muted-foreground">{app.app.description}</p>
                      )}
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={`Configure ${app.app.name}`}
                      onClick={() => setConfigDir(app.dirName)}
                    >
                      <Settings2 className="size-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={app.current === "blue" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {app.current === "blue" ? "BLUE active" : app.current === "green" ? "GREEN active" : "unknown"}
                    </Badge>
                    {standbyEnv && (
                      <span className="text-xs text-muted-foreground">
                        {standbyEnv.color.toUpperCase()} standby
                      </span>
                    )}
                  </div>

                  {runtime && (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Activity className="size-3" /> {runtime.cpu.toFixed(0)}%
                      </span>
                      <span>{formatBytes(runtime.memory)}</span>
                      <span>PID {runtime.pid ?? "—"}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {(activeEnv?.commit || app.gitlabPipeline) && (
                      <span className="flex items-center gap-1">
                        <GitCommit className="size-3" />{" "}
                        {activeEnv?.commit?.shortHash || app.gitlabPipeline?.sha.substring(0, 8) || "—"}
                        {activeEnv?.commit?.branch && (
                          <span className="text-[10px]">({activeEnv.commit.branch})</span>
                        )}
                      </span>
                    )}
                    {app.health && (
                      <span className="flex items-center gap-1">
                        <Heart
                          className={`size-3 ${app.health.ok ? "text-green-500" : "text-red-500"}`}
                        />{" "}
                        {app.health.responseTimeMs}ms
                      </span>
                    )}
                  </div>

                  {activeEnv?.commit?.message && (
                    <p className="truncate text-xs font-medium text-foreground/90">
                      {activeEnv.commit.message}
                    </p>
                  )}
                  {activeEnv?.commit?.author && (
                    <p className="truncate text-xs text-muted-foreground">
                      {activeEnv.commit.author}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {app.lastRelease?.deployedAt
                      ? `Deployed ${formatSince(app.lastRelease.deployedAt)}`
                      : app.pipelineTime
                        ? `Pipeline ${app.pipelineTime}`
                        : app.collectedAt
                          ? `Updated ${formatSince(app.collectedAt)}`
                          : ""}
                  </p>

                  {app.gitlabPipeline && (
                    <div className="flex items-center gap-2 border-t border-border pt-2">
                      <PipelineBadge status={app.gitlabPipeline.status} />
                      <span className="text-xs text-muted-foreground">
                        <ExternalLink className="inline size-3" /> Pipeline #{app.gitlabPipeline.id}
                      </span>
                      {app.gitlabPipeline.duration != null && (
                        <span className="text-xs text-muted-foreground">
                          · {Math.round(app.gitlabPipeline.duration / 1000)}s
                        </span>
                      )}
                      {app.gitlabPipeline.author && app.gitlabPipeline.author !== "unknown" && (
                        <span className="text-xs text-muted-foreground">{app.gitlabPipeline.author}</span>
                      )}
                    </div>
                  )}

                  {app.drift && (
                    <div className="flex items-center gap-1 rounded bg-yellow-950/50 px-2 py-1 text-[10px] text-yellow-400">
                      <AlertTriangle className="size-3" />
                      Pipeline {app.drift.pipelineSha} ≠ running {app.drift.runningSha}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {unconfigured.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Unconfigured projects
          </h2>
          <p className="text-muted-foreground">
            {unconfigured.length} director{unconfigured.length !== 1 ? "ies" : "y"} without an
            ops.config.json
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unconfigured.map((u) => (
              <Card key={u.dirName} className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{u.dirName}</CardTitle>
                  <p className="text-xs text-muted-foreground">No config detected</p>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setConfigDir(u.dirName)}
                  >
                    <Settings2 className="size-3.5" /> Create config
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <OpsConfigDialog
        dirName={configDir ?? ""}
        open={configDir !== null}
        onOpenChange={(open) => !open && setConfigDir(null)}
      />
    </div>
  );
}

function PipelineBadge({ status }: { status: string }) {
  const variant =
    status === "success" ? "default" : status === "failed" ? "destructive" : status === "running" ? "default" : "secondary";
  const label =
    status === "success" ? "passed" : status === "failed" ? "failed" : status === "running" ? "running" : status;
  return <Badge variant={variant as any} className="text-[10px]">{label}</Badge>;
}
