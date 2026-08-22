import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useEventSource,
  useEventSourceConnection,
} from "@/hooks/useEventSource";
import { useServerFn } from "@tanstack/react-start";
import {
  restartProcessFn,
  stopProcessFn,
  startProcessFn,
  deleteProcessFn,
} from "@/server/actions/process-actions";
import { toggleMonitoringFn } from "@/server/actions/monitoring-actions";
import { ProcessLogs } from "@/components/process-logs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-dot";
import { buildProcessGroups, type ProcessGroup } from "@/lib/processGroups";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  RotateCcw,
  Power,
  PowerOff,
  Trash2,
  Loader2,
  Cpu,
  MemoryStick,
  Timer,
  Repeat,
  Activity,
  Layers,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/processes/$id")({
  component: ProcessDetailPage,
});

function statusKind(proc: { status: string; isOrphan: boolean }) {
  if (proc.isOrphan) return "warning" as const;
  if (proc.status === "online") return "online" as const;
  if (proc.status === "stopped") return "neutral" as const;
  if (proc.status === "errored" || proc.status === "error")
    return "error" as const;
  return "info" as const;
}

function groupStatusKind(group: ProcessGroup) {
  if (group.kind === "process") return statusKind(group.proc);
  const st = group.status;
  if (st === "online") return "online" as const;
  if (st === "stopped") return "neutral" as const;
  if (st === "errored" || st === "error") return "error" as const;
  return "info" as const;
}

function formatBytes(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatUptime(uptime: number | null) {
  if (!uptime) return "-";
  const tot = Math.floor(uptime / 1000);
  const d = Math.floor(tot / 86400);
  const h = Math.floor((tot % 86400) / 3600);
  const m = Math.floor((tot % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${m}m`;
}

function ProcessDetailPage() {
  const { id } = Route.useParams();
  const processes = useEventSource();
  const connected = useEventSourceConnection();
  const restart = useServerFn(restartProcessFn);
  const stop = useServerFn(stopProcessFn);
  const deleteProc = useServerFn(deleteProcessFn);
  const start = useServerFn(startProcessFn);
  const toggleMonitoring = useServerFn(toggleMonitoringFn);

  const groups = useMemo(() => buildProcessGroups(processes), [processes]);
  const appGroup = useMemo<
    Extract<ProcessGroup, { kind: "app" }> | null
  >(
    () =>
      groups.find(
        (g): g is Extract<ProcessGroup, { kind: "app" }> =>
          g.kind === "app" && g.name === String(id),
      ) ?? null,
    [groups, id],
  );

  const proc = useMemo(
    () =>
      appGroup
        ? null
        : processes.find(
            (p) =>
              String(p.id ?? p.name) === String(id) || p.name === String(id),
          ) ?? null,
    [processes, id, appGroup],
  );

  const [confirmAction, setConfirmAction] = useState<
    "restart" | "stop" | "delete" | null
  >(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!connected) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="…"
          description="Waiting for connection..."
          icon={<Activity />}
        />
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border/60 bg-card/40 py-20 backdrop-blur-sm">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse-glow rounded-full bg-primary/30 blur-xl" />
            <Loader2 className="relative size-10 animate-spin text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Connecting to PM2...</p>
          <div className="grid w-full max-w-3xl gap-4 px-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  async function handleAction(
    action: "restart" | "start" | "stop" | "delete",
    processId?: string | number,
  ) {
    const target = String(processId ?? id);
    setBusy(action);
    try {
      if (action === "restart") await restart({ data: { processId: target } });
      else if (action === "start") await start({ data: { processId: target } });
      else if (action === "stop") await stop({ data: { processId: target } });
      else if (action === "delete") {
        await deleteProc({ data: { processId: target } });
        toast.success("Process deleted");
        setBusy(null);
        return;
      }
      toast.success(
        `${action.charAt(0).toUpperCase() + action.slice(1)} successful`,
      );
    } catch (e) {
      toast.error(
        `${action} failed: ${e instanceof Error ? e.message : "error"}`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleMonitoring(name: string, isMonitored: boolean) {
    setBusy("monitor");
    try {
      await toggleMonitoring({
        data: { pm2Name: name, monitored: !isMonitored },
      });
      toast.success(
        isMonitored
          ? `Monitoring disabled for ${name}`
          : `Monitoring enabled for ${name}`,
      );
    } catch (e) {
      toast.error(
        `Monitoring toggle failed: ${e instanceof Error ? e.message : "error"}`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleAppMonitoring(
    members: Array<{ name: string; isMonitored: boolean }>,
    appName: string,
    isMonitored: boolean,
  ) {
    setBusy("monitor");
    try {
      for (const m of members) {
        await toggleMonitoring({
          data: { pm2Name: m.name, monitored: !isMonitored },
        });
      }
      toast.success(
        isMonitored
          ? `Monitoring disabled for ${appName}`
          : `Monitoring enabled for ${appName}`,
      );
    } catch (e) {
      toast.error(
        `Monitoring toggle failed: ${e instanceof Error ? e.message : "error"}`,
      );
    } finally {
      setBusy(null);
    }
  }

  if (appGroup) {
    const group = appGroup;
    const active = group.active;
    const kind = groupStatusKind(group);
    const activeColor = group.members.find((m) => m.appActive)?.appColor;
    return (
      <div className="space-y-6">
        <PageHeader
          title={group.name}
          description={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <StatusPill variant={kind}>{group.status}</StatusPill>
              <span className="flex items-center gap-1">
                <Layers className="size-3" /> app
              </span>
              <span className="text-muted-foreground">
                {activeColor
                  ? `${activeColor.toUpperCase()} active`
                  : "No active environment"}
              </span>
              <span className="text-muted-foreground">
                {group.cpu.toFixed(1)}% CPU · {formatBytes(group.memory)} · PID{" "}
                {group.pid ?? "N/A"}
              </span>
            </span>
          }
          icon={<Activity />}
          actions={
            <>
              <Button
                variant="ghost"
                size="icon"
                nativeButton={false}
                render={<Link to="/processes" />}
                title="Back"
              >
                <ArrowLeft className="size-4" />
              </Button>
              {active.status === "stopped" ? (
                <Button
                  size="sm"
                  disabled={busy === "start"}
                  onClick={() => handleAction("start", active.id!)}
                  className="bg-gradient-to-br from-[oklch(0.78_0.19_155)] to-[oklch(0.7_0.2_165)] text-white shadow-[0_4px_14px_-4px_oklch(0.6_0.22_155/0.5)] hover:brightness-110"
                >
                  {busy === "start" ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : (
                    <Power className="mr-1 size-3" />
                  )}
                  Start
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy === "restart"}
                    onClick={() => setConfirmAction("restart")}
                  >
                    {busy === "restart" ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-1 size-3" />
                    )}
                    Restart
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy === "stop"}
                    onClick={() => setConfirmAction("stop")}
                  >
                    {busy === "stop" ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : (
                      <PowerOff className="mr-1 size-3" />
                    )}
                    Stop
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy === "delete"}
                onClick={() => setConfirmAction("delete")}
                className="text-destructive hover:text-destructive"
              >
                {busy === "delete" ? (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                ) : (
                  <Trash2 className="mr-1 size-3" />
                )}
                Delete
              </Button>
            </>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="CPU"
            value={`${group.cpu.toFixed(1)}%`}
            icon={Cpu}
            gradient="warm"
            description="Combined usage"
          />
          <StatCard
            label="Memory"
            value={formatBytes(group.memory)}
            icon={MemoryStick}
            gradient="info"
            description="Combined RSS"
          />
          <StatCard
            label="Uptime"
            value={formatUptime(group.uptime)}
            icon={Timer}
            gradient="violet"
            description="Active environment"
          />
          <StatCard
            label="Restarts"
            value={group.restarts}
            icon={Repeat}
            gradient="brand"
            description="Cumulative"
          />
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Monitoring</p>
              <p className="text-xs text-muted-foreground">
                {group.isMonitored
                  ? "Logs and metrics are recorded for both environments."
                  : "Logs and metrics are not recorded for this app."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {group.isMonitored ? "Enabled" : "Disabled"}
              </span>
              <Switch
                checked={group.isMonitored}
                disabled={busy === "monitor"}
                onCheckedChange={() =>
                  handleToggleAppMonitoring(
                    group.members,
                    group.name,
                    group.isMonitored,
                  )
                }
              />
            </div>
          </CardContent>
        </Card>

        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <div>
              <p className="text-sm font-medium">Live logs</p>
              <p className="text-xs text-muted-foreground">
                Merged from both environments
              </p>
            </div>
            <StatusPill variant="online">streaming</StatusPill>
          </div>
          <ProcessLogs
            name={group.name}
            isMonitored={group.isMonitored}
            flushProcessId={active.id}
            scrollClassName="min-h-[500px]"
            processes={group.members.map((m) => ({
              name: m.name,
              isMonitored: m.isMonitored,
              flushId: m.id,
              color: m.appColor ?? undefined,
            }))}
          />
        </div>

        <AlertDialog
          open={confirmAction !== null}
          onOpenChange={(v) => !v && setConfirmAction(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm {confirmAction}</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to {confirmAction}{" "}
                <span className="font-medium text-foreground">
                  {active.name}
                </span>
                ?
                {confirmAction === "delete" && " This cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!confirmAction) return;
                  handleAction(confirmAction, active.id!);
                  setConfirmAction(null);
                }}
              >
                {confirmAction === "delete" ? "Delete" : "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (!proc) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-card/60">
          <Activity className="size-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Process not found.</p>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/processes" />}
        >
          <ArrowLeft className="mr-2 size-4" /> Back to processes
        </Button>
      </div>
    );
  }

  const kind = statusKind(proc);

  return (
    <div className="space-y-6">
      <PageHeader
        title={proc.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusPill variant={kind}>{proc.status}</StatusPill>
            <span className="text-muted-foreground">
              PID {proc.pid ?? "N/A"} · {proc.cpu.toFixed(1)}% CPU ·{" "}
              {formatBytes(proc.memory)}
            </span>
          </span>
        }
        icon={<Activity />}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              nativeButton={false}
              render={<Link to="/processes" />}
              title="Back"
            >
              <ArrowLeft className="size-4" />
            </Button>
            {proc.status === "stopped" ? (
              <Button
                size="sm"
                disabled={busy === "start"}
                onClick={() => handleAction("start")}
                className="bg-gradient-to-br from-[oklch(0.78_0.19_155)] to-[oklch(0.7_0.2_165)] text-white shadow-[0_4px_14px_-4px_oklch(0.6_0.22_155/0.5)] hover:brightness-110"
              >
                {busy === "start" ? (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                ) : (
                  <Power className="mr-1 size-3" />
                )}
                Start
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === "restart"}
                  onClick={() => setConfirmAction("restart")}
                >
                  {busy === "restart" ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-1 size-3" />
                  )}
                  Restart
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === "stop"}
                  onClick={() => setConfirmAction("stop")}
                >
                  {busy === "stop" ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : (
                    <PowerOff className="mr-1 size-3" />
                  )}
                  Stop
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={busy === "delete"}
              onClick={() => setConfirmAction("delete")}
              className="text-destructive hover:text-destructive"
            >
              {busy === "delete" ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : (
                <Trash2 className="mr-1 size-3" />
              )}
              Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="CPU"
          value={`${proc.cpu.toFixed(1)}%`}
          icon={Cpu}
          gradient="warm"
          description="Live usage"
        />
        <StatCard
          label="Memory"
          value={formatBytes(proc.memory)}
          icon={MemoryStick}
          gradient="info"
          description="RSS allocation"
        />
        <StatCard
          label="Uptime"
          value={formatUptime(proc.uptime)}
          icon={Timer}
          gradient="violet"
          description="Time running"
        />
        <StatCard
          label="Restarts"
          value={proc.restarts}
          icon={Repeat}
          gradient="brand"
          description="Cumulative"
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">Monitoring</p>
            <p className="text-xs text-muted-foreground">
              {proc.isMonitored
                ? "Logs and metrics are being recorded for this process."
                : "Logs and metrics are not recorded for this process."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {proc.isMonitored ? "Enabled" : "Disabled"}
            </span>
            <Switch
              checked={proc.isMonitored}
              disabled={busy === "monitor"}
              onCheckedChange={() =>
                handleToggleMonitoring(proc.name, proc.isMonitored)
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
          <div>
            <p className="text-sm font-medium">Live logs</p>
            <p className="text-xs text-muted-foreground">
              Streamed in real-time
            </p>
          </div>
          <StatusPill variant="online">streaming</StatusPill>
        </div>
        <ProcessLogs
          name={proc.name}
          isMonitored={proc.isMonitored}
          flushProcessId={proc.id}
          scrollClassName="min-h-[500px]"
        />
      </div>

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(v) => !v && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm {confirmAction}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {confirmAction}{" "}
              <span className="font-medium text-foreground">{proc.name}</span>?
              {confirmAction === "delete" && " This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmAction) return;
                handleAction(confirmAction);
                setConfirmAction(null);
              }}
            >
              {confirmAction === "delete" ? "Delete" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}