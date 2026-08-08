import { createFileRoute, Link } from "@tanstack/react-router";
import { useOpsSource } from "@/hooks/useEventSource";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OpsConfigDialog } from "@/components/ops-config-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusPill, StatusDot } from "@/components/status-dot";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  GitCommit,
  Heart,
  Clock,
  ExternalLink,
  AlertTriangle,
  Settings2,
  Cpu,
  MemoryStick,
  Hash,
  Timer,
  Repeat,
  Rocket,
  Activity,
} from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/ops/$appName")({
  component: OpsAppDetail,
});

function formatBytes(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatUptime(uptime: number | null): string {
  if (!uptime) return "—";
  const tot = Math.floor(uptime / 1000);
  const d = Math.floor(tot / 86400);
  const h = Math.floor((tot % 86400) / 3600);
  const m = Math.floor((tot % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h ${m}m`;
}

function formatSince(ts: number | null): string {
  if (!ts) return "—";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function MetricRow({
  icon: Icon,
  label,
  value,
  accent = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  accent?: "default" | "warm" | "info" | "success" | "brand";
}) {
  const accentClass = {
    default: "text-foreground",
    warm: "text-[oklch(0.88_0.17_75)]",
    info: "text-[oklch(0.85_0.16_220)]",
    success: "text-[oklch(0.85_0.19_155)]",
    brand: "text-[oklch(0.85_0.18_255)]",
  }[accent];
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className={cn("font-semibold tabular-nums", accentClass)}>
        {value}
      </span>
    </div>
  );
}

function EnvCard({ env, active }: { env: any; active: boolean }) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all",
        active && "border-[oklch(0.72_0.18_255/0.4)]",
      )}
    >
      {active && (
        <div
          className={cn(
            "pointer-events-none absolute -right-12 -top-12 size-40 rounded-full opacity-25 blur-3xl",
            env.color === "blue"
              ? "bg-[oklch(0.78_0.16_220)]"
              : "bg-[oklch(0.78_0.19_155)]",
          )}
        />
      )}
      <CardHeader className="relative pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
            <span
              className={cn(
                "size-2 rounded-full",
                env.color === "blue"
                  ? "bg-[oklch(0.78_0.16_220)] shadow-[0_0_10px_-2px_oklch(0.78_0.16_220/0.7)]"
                  : "bg-[oklch(0.78_0.19_155)] shadow-[0_0_10px_-2px_oklch(0.78_0.19_155/0.7)]",
              )}
            />
            {env.color}
          </CardTitle>
          {active && <StatusPill variant="online">active</StatusPill>}
        </div>
      </CardHeader>
      <CardContent className="relative space-y-3 text-sm">
        {env.runtime ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              nativeButton={false}
              render={
                <Link
                  to="/processes/$id"
                  params={{ id: env.runtime.name }}
                  title={`Open ${env.runtime.name} in Processes`}
                />
              }
            >
              <ExternalLink className="mr-1 size-3" /> View process
            </Button>
            <div className="space-y-2">
              <MetricRow
                icon={Activity}
                label="Status"
                value={
                  <StatusPill
                    variant={
                      env.runtime.status === "online" ? "online" : "error"
                    }
                  >
                    {env.runtime.status}
                  </StatusPill>
                }
              />
              <MetricRow
                icon={Hash}
                label="PID"
                value={env.runtime.pid ?? "—"}
              />
              <MetricRow
                icon={Cpu}
                label="CPU"
                value={`${env.runtime.cpu.toFixed(1)}%`}
                accent="warm"
              />
              <MetricRow
                icon={MemoryStick}
                label="RAM"
                value={formatBytes(env.runtime.memory)}
                accent="info"
              />
              <MetricRow
                icon={Timer}
                label="Uptime"
                value={formatUptime(env.runtime.uptime)}
              />
              <MetricRow
                icon={Repeat}
                label="Restarts"
                value={env.runtime.restarts}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 py-6 text-xs text-muted-foreground">
            <StatusDot variant="neutral" />
            Not running
          </div>
        )}

        <Separator />

        {env.commit ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <GitCommit className="size-3" />
              <code className="font-mono">{env.commit.shortHash}</code>
            </div>
            <p className="truncate text-xs text-foreground/90">
              {env.commit.message}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {env.commit.author} · {env.commit.branch}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No commit info</p>
        )}

        {env.health && (
          <>
            <Separator />
            <MetricRow
              icon={Heart}
              label="Health"
              accent={env.health.ok ? "success" : "warm"}
              value={
                <span className="flex items-center gap-1.5">
                  <span>{env.health.ok ? "OK" : "FAIL"}</span>
                  <span className="text-muted-foreground">
                    · {env.health.responseTimeMs}ms
                  </span>
                </span>
              }
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityIcon(props: { className?: string }) {
  return <Rocket {...props} />;
}

function OpsAppDetail() {
  const { appName } = Route.useParams();
  const apps = useOpsSource();
  const [configOpen, setConfigOpen] = useState(false);

  const app = useMemo(
    () => apps.find((a) => a.app.name === appName),
    [apps, appName],
  );

  if (!app) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-card/60">
          <ActivityIcon className="size-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Application not found.</p>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/ops" />}
        >
          <ArrowLeft className="mr-2 size-4" /> Back to Operations
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={app.app.name}
        description={
          <>
            {app.app.description}
            {app.gitlabProject && (
              <>
                {" · "}
                <a
                  href={app.gitlabProject.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[oklch(0.85_0.18_255)] hover:underline"
                >
                  {app.gitlabProject.name}{" "}
                  <ExternalLink className="inline size-3" />
                </a>
              </>
            )}
          </>
        }
        icon={<Rocket />}
        actions={
          <>
            {app.current !== "unknown" && (
              <StatusPill variant={app.current === "blue" ? "info" : "online"}>
                {app.current.toUpperCase()} active
              </StatusPill>
            )}
            <Button
              variant="outline"
              size="icon-sm"
              title={`Configure ${app.app.name}`}
              onClick={() => setConfigOpen(true)}
            >
              <Settings2 className="size-3.5" />
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <EnvCard env={app.blue} active={app.current === "blue"} />
        <EnvCard env={app.green} active={app.current === "green"} />
      </div>

      {app.gitlabPipeline && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Last Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <PipelineStatusBadge status={app.gitlabPipeline.status} />
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <GitCommit className="size-3" />
                <code className="font-mono text-xs">
                  {app.gitlabPipeline.sha.substring(0, 8)}
                </code>
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="size-3" />
                {app.gitlabPipeline.duration
                  ? `${Math.round(app.gitlabPipeline.duration / 1000)}s`
                  : "—"}
              </span>
              {app.gitlabPipeline.author !== "unknown" && (
                <span className="text-muted-foreground">
                  {app.gitlabPipeline.author}
                </span>
              )}
              {app.pipelineTime && (
                <span className="text-muted-foreground">
                  {app.pipelineTime}
                </span>
              )}
              {app.gitlabPipeline.webUrl && (
                <a
                  href={app.gitlabPipeline.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-[oklch(0.85_0.18_255)] hover:underline"
                >
                  Open <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {app.releases && app.releases.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Release History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {app.releases.map((r: any, i: number) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div className="mt-1 flex flex-col items-center">
                    <div
                      className={cn(
                        "size-2 rounded-full",
                        i === 0
                          ? "bg-[oklch(0.72_0.18_255)] shadow-[0_0_8px_-2px_oklch(0.72_0.18_255/0.7)]"
                          : "bg-border",
                      )}
                    />
                    {i < app.releases.length - 1 && (
                      <div className="w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-xs">
                        {r.commit.substring(0, 8)}
                      </code>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                          r.environment === "blue"
                            ? "border-[oklch(0.78_0.16_220/0.4)] bg-[oklch(0.78_0.16_220/0.12)] text-[oklch(0.85_0.16_220)]"
                            : "border-[oklch(0.78_0.19_155/0.4)] bg-[oklch(0.78_0.19_155/0.12)] text-[oklch(0.85_0.19_155)]",
                        )}
                      >
                        {r.environment.toUpperCase()}
                      </span>
                      {r.pipelineStatus && (
                        <PipelineStatusBadge status={r.pipelineStatus} />
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.message || r.date}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatSince(r.deployedAt)} · {r.author}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {app.drift && (
        <div className="flex items-center gap-3 rounded-xl border border-[oklch(0.82_0.17_75/0.4)] bg-[oklch(0.82_0.17_75/0.08)] px-4 py-3 text-sm text-[oklch(0.92_0.16_75)]">
          <AlertTriangle className="size-4" />
          <span>
            Pipeline commit{" "}
            <code className="rounded bg-[oklch(0.82_0.17_75/0.15)] px-1 font-mono">
              {app.drift.pipelineSha}
            </code>{" "}
            differs from running commit{" "}
            <code className="rounded bg-[oklch(0.82_0.17_75/0.15)] px-1 font-mono">
              {app.drift.runningSha}
            </code>
          </span>
        </div>
      )}

      <OpsConfigDialog
        dirName={app.dirName}
        open={configOpen}
        onOpenChange={setConfigOpen}
      />
    </div>
  );
}

function PipelineStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { className: string }> = {
    success: {
      className:
        "border-[oklch(0.78_0.19_155/0.4)] bg-[oklch(0.78_0.19_155/0.12)] text-[oklch(0.85_0.19_155)]",
    },
    failed: {
      className:
        "border-[oklch(0.72_0.22_25/0.4)] bg-[oklch(0.72_0.22_25/0.12)] text-[oklch(0.82_0.18_25)]",
    },
    running: {
      className:
        "border-[oklch(0.78_0.16_220/0.4)] bg-[oklch(0.78_0.16_220/0.12)] text-[oklch(0.85_0.16_220)]",
    },
  };
  const s = styles[status] ?? {
    className: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        s.className,
      )}
    >
      {status}
    </span>
  );
}
