import { createFileRoute, Link } from "@tanstack/react-router";
import { useOpsSource, useOpsUnconfigured } from "@/hooks/useEventSource";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { OpsConfigDialog } from "@/components/ops-config-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusDot } from "@/components/status-dot";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  LayoutDashboard,
  GitCommit,
  Heart,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Settings2,
  Cpu,
  MemoryStick,
  Hash,
  Clock,
  GitBranch,
  Rocket,
} from "lucide-react";

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

function OpsDashboard() {
  const apps = useOpsSource();
  const unconfigured = useOpsUnconfigured();
  const [configDir, setConfigDir] = useState<string | null>(null);

  if (!apps.length) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Operations"
          description="Application monitoring and deployment status"
          icon={<LayoutDashboard />}
        />
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border/60 bg-card/40 py-12 backdrop-blur-sm">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse-glow rounded-full bg-primary/30 blur-xl" />
            <Loader2 className="relative size-10 animate-spin text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Scanning for applications...
          </p>
          <div className="grid w-full max-w-4xl gap-4 px-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="card-elevated">
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
      <PageHeader
        title="Operations"
        description={`${apps.length} application${apps.length !== 1 ? "s" : ""} discovered`}
        icon={<LayoutDashboard />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => {
          const activeEnv =
            app.current === "blue"
              ? app.blue
              : app.current === "green"
                ? app.green
                : null;
          const standbyEnv =
            app.current === "blue"
              ? app.green
              : app.current === "green"
                ? app.blue
                : null;
          const runtime = activeEnv?.runtime;

          return (
            <Card
              key={app.app.name}
              className="group/app card-elevated relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-[oklch(0.72_0.18_255/0.4)]"
            >
              <div
                className={cn(
                  "pointer-events-none absolute -right-12 -top-12 size-40 rounded-full opacity-15 blur-3xl transition-opacity duration-500 group-hover/app:opacity-30",
                  app.current === "blue"
                    ? "bg-[oklch(0.78_0.16_220)]"
                    : app.current === "green"
                      ? "bg-[oklch(0.78_0.19_155)]"
                      : "bg-[oklch(0.72_0.18_255)]",
                )}
              />
              <CardHeader className="relative pb-3">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to="/ops/$appName"
                    params={{ appName: app.app.name }}
                    className="block min-w-0 flex-1 rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <div className="flex items-center gap-2">
                      <CardTitle className="truncate text-base">
                        {app.app.name}
                      </CardTitle>
                      {runtime && (
                        <StatusDot
                          variant={
                            runtime.status === "online" ? "online" : "error"
                          }
                          size="sm"
                          pulse={runtime.status === "online"}
                        />
                      )}
                    </div>
                    {app.app.description && (
                      <p className="truncate text-xs text-muted-foreground">
                        {app.app.description}
                      </p>
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
              <CardContent className="relative space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <EnvironmentBadge color={app.current} />
                  {standbyEnv && (
                    <span className="text-xs text-muted-foreground">
                      {standbyEnv.color.toUpperCase()} standby
                    </span>
                  )}
                </div>

                {runtime && (
                  <div className="grid grid-cols-3 gap-2">
                    <MiniMetric
                      icon={Cpu}
                      label="CPU"
                      value={`${runtime.cpu.toFixed(0)}%`}
                      accent="warm"
                    />
                    <MiniMetric
                      icon={MemoryStick}
                      label="Memory"
                      value={formatBytes(runtime.memory)}
                      accent="info"
                    />
                    <MiniMetric
                      icon={Hash}
                      label="PID"
                      value={String(runtime.pid ?? "—")}
                      accent="default"
                    />
                  </div>
                )}

                {(activeEnv?.commit || app.gitlabPipeline) && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <GitCommit className="size-3" />
                      {activeEnv?.commit?.shortHash ||
                        app.gitlabPipeline?.sha.substring(0, 8) ||
                        "—"}
                    </span>
                    {activeEnv?.commit?.branch && (
                      <span className="flex items-center gap-1">
                        <GitBranch className="size-3" />{" "}
                        {activeEnv.commit.branch}
                      </span>
                    )}
                    {app.health && (
                      <span className="flex items-center gap-1">
                        <Heart
                          className={cn(
                            "size-3",
                            app.health.ok
                              ? "text-[oklch(0.85_0.19_155)]"
                              : "text-[oklch(0.82_0.18_25)]",
                          )}
                        />
                        {app.health.responseTimeMs}ms
                      </span>
                    )}
                  </div>
                )}

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

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  {app.lastRelease?.deployedAt
                    ? `Deployed ${formatSince(app.lastRelease.deployedAt)}`
                    : app.pipelineTime
                      ? `Pipeline ${app.pipelineTime}`
                      : app.collectedAt
                        ? `Updated ${formatSince(app.collectedAt)}`
                        : "—"}
                </div>

                {app.gitlabPipeline && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
                    <PipelineBadge status={app.gitlabPipeline.status} />
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ExternalLink className="size-3" /> Pipeline #
                      {app.gitlabPipeline.id}
                    </span>
                    {app.gitlabPipeline.duration != null && (
                      <span className="text-xs text-muted-foreground">
                        · {Math.round(app.gitlabPipeline.duration / 1000)}s
                      </span>
                    )}
                    {app.gitlabPipeline.author &&
                      app.gitlabPipeline.author !== "unknown" && (
                        <span className="text-xs text-muted-foreground">
                          {app.gitlabPipeline.author}
                        </span>
                      )}
                  </div>
                )}

                {app.drift && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-[oklch(0.82_0.17_75/0.3)] bg-[oklch(0.82_0.17_75/0.08)] px-2.5 py-1.5 text-xs text-[oklch(0.88_0.17_75)]">
                    <AlertTriangle className="size-3" />
                    Pipeline {app.drift.pipelineSha} ≠ running{" "}
                    {app.drift.runningSha}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {unconfigured.length > 0 && (
        <div>
          <PageHeader
            title="Unconfigured projects"
            description={`${unconfigured.length} director${unconfigured.length !== 1 ? "ies" : "y"} without an ops.config.json`}
            icon={<Rocket />}
            className="mb-4"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unconfigured.map((u) => (
              <Card key={u.dirName} className="card-elevated">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{u.dirName}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    No config detected
                  </p>
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

function EnvironmentBadge({ color }: { color: "blue" | "green" | string }) {
  if (color === "blue") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.78_0.16_220/0.4)] bg-[oklch(0.78_0.16_220/0.12)] px-2 py-0.5 text-[11px] font-semibold text-[oklch(0.85_0.16_220)]">
        <span className="size-1.5 rounded-full bg-[oklch(0.78_0.16_220)]" />
        BLUE active
      </span>
    );
  }
  if (color === "green") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.78_0.19_155/0.4)] bg-[oklch(0.78_0.19_155/0.12)] px-2 py-0.5 text-[11px] font-semibold text-[oklch(0.85_0.19_155)]">
        <span className="size-1.5 rounded-full bg-[oklch(0.78_0.19_155)]" />
        GREEN active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      unknown
    </span>
  );
}

function MiniMetric({
  icon: Icon,
  label,
  value,
  accent = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: "default" | "warm" | "info";
}) {
  const accentClass = {
    default: "text-foreground",
    warm: "text-[oklch(0.88_0.17_75)]",
    info: "text-[oklch(0.85_0.16_220)]",
  }[accent];
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-2 py-1.5">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-2.5" />
        {label}
      </p>
      <p
        className={cn(
          "truncate text-xs font-semibold tabular-nums",
          accentClass,
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PipelineBadge({ status }: { status: string }) {
  const styles: Record<string, { className: string; label: string }> = {
    success: {
      className:
        "border-[oklch(0.78_0.19_155/0.4)] bg-[oklch(0.78_0.19_155/0.12)] text-[oklch(0.85_0.19_155)]",
      label: "passed",
    },
    failed: {
      className:
        "border-[oklch(0.72_0.22_25/0.4)] bg-[oklch(0.72_0.22_25/0.12)] text-[oklch(0.82_0.18_25)]",
      label: "failed",
    },
    running: {
      className:
        "border-[oklch(0.78_0.16_220/0.4)] bg-[oklch(0.78_0.16_220/0.12)] text-[oklch(0.85_0.16_220)]",
      label: "running",
    },
  };
  const s = styles[status] ?? {
    className: "border-border bg-muted text-muted-foreground",
    label: status,
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}
