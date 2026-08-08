import { createFileRoute, Link } from "@tanstack/react-router";
import { useOpsSource } from "@/hooks/useEventSource";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OpsConfigDialog } from "@/components/ops-config-dialog";
import { ArrowLeft, Circle, GitCommit, Activity, Heart, Clock, ExternalLink, AlertTriangle, Settings2 } from "lucide-react";
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

function EnvCard({
  env,
  active,
}: {
  env: any;
  active: boolean;
}) {
  return (
    <Card className={active ? "border-accent" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium uppercase">
            <span
              className={`mr-2 inline-block size-2 rounded-full ${
                env.color === "blue" ? "bg-blue-500" : "bg-green-500"
              }`}
            />
            {env.color}
          </CardTitle>
          {active && <Badge>active</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
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
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={env.runtime.status === "online" ? "default" : "destructive"}>
                {env.runtime.status}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">PID</span>
              <span>{env.runtime.pid ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">CPU</span>
              <span>{env.runtime.cpu.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">RAM</span>
              <span>{formatBytes(env.runtime.memory)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Uptime</span>
              <span>{formatUptime(env.runtime.uptime)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Restarts</span>
              <span>{env.runtime.restarts}</span>
            </div>
          </>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">Not running</p>
        )}

        <Separator />

        {env.commit ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <GitCommit className="size-3" />
              {env.commit.shortHash}
            </div>
            <p className="text-xs text-muted-foreground truncate">{env.commit.message}</p>
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
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Heart className={`size-3 ${env.health.ok ? "text-green-500" : "text-red-500"}`} />{" "}
                Health
              </span>
              <span className="text-xs">
                {env.health.ok ? "OK" : "FAIL"} · {env.health.responseTimeMs}ms
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function OpsAppDetail() {
  const { appName } = Route.useParams();
  const apps = useOpsSource();
  const [configOpen, setConfigOpen] = useState(false);

  const app = useMemo(
    () => apps.find((a) => a.app.name === appName),
    [apps, appName]
  );

  if (!app) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-muted-foreground">Application not found.</p>
        <Button variant="outline" nativeButton={false} render={<Link to="/ops" />}>
          <ArrowLeft className="mr-2 size-4" /> Back to Operations
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" nativeButton={false} render={<Link to="/ops" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{app.app.name}</h1>
          <p className="text-muted-foreground text-sm">
            {app.app.description}
            {app.gitlabProject && (
              <>
                {" · "}
                <a
                  href={app.gitlabProject.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  {app.gitlabProject.name} <ExternalLink className="inline size-3" />
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={app.current !== "unknown" ? "default" : "secondary"}>
            {app.current.toUpperCase()} active
          </Badge>
          <Button
            variant="outline"
            size="icon-sm"
            title={`Configure ${app.app.name}`}
            onClick={() => setConfigOpen(true)}
          >
            <Settings2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Side-by-side blue/green */}
      <div className="grid gap-4 lg:grid-cols-2">
        <EnvCard env={app.blue} active={app.current === "blue"} />
        <EnvCard env={app.green} active={app.current === "green"} />
      </div>

      {/* Pipeline info */}
      {app.gitlabPipeline && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Last Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm">
              <Badge
                variant={
                  app.gitlabPipeline.status === "success" ? "default" : app.gitlabPipeline.status === "failed" ? "destructive" : "secondary"
                }
              >
                {app.gitlabPipeline.status}
              </Badge>
              <span className="text-muted-foreground">
                <GitCommit className="inline size-3" /> {app.gitlabPipeline.sha.substring(0, 8)}
              </span>
              <span className="text-muted-foreground">
                <Clock className="inline size-3" />{" "}
                {app.gitlabPipeline.duration ? `${Math.round(app.gitlabPipeline.duration / 1000)}s` : "—"}
              </span>
              {app.gitlabPipeline.author !== "unknown" && (
                <span className="text-muted-foreground">{app.gitlabPipeline.author}</span>
              )}
              {app.pipelineTime && (
                <span className="text-muted-foreground">{app.pipelineTime}</span>
              )}
              {app.gitlabPipeline.webUrl && (
                <a
                  href={app.gitlabPipeline.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-accent hover:underline"
                >
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Release timeline */}
      {app.releases && app.releases.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Release History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {app.releases.map((r, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 flex flex-col items-center">
                    <div className={`size-2 rounded-full ${i === 0 ? "bg-accent" : "bg-border"}`} />
                    {i < app.releases.length - 1 && <div className="w-px flex-1 bg-border" />}
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{r.commit.substring(0, 8)}</span>
                      <Badge variant="outline" className="text-[10px]">{r.environment.toUpperCase()}</Badge>
                      {r.pipelineStatus && (
                        <Badge variant={r.pipelineStatus === "success" ? "default" : "destructive"} className="text-[10px]">
                          {r.pipelineStatus}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{r.message || r.date}</p>
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

      {/* Drift warning */}
      {app.drift && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-800 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-400">
          <AlertTriangle className="size-4" />
          <span>
            Pipeline commit <code className="font-mono">{app.drift.pipelineSha}</code> differs from
            running commit <code className="font-mono">{app.drift.runningSha}</code>
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
