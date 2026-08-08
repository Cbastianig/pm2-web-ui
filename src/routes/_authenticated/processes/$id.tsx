import { createFileRoute, Link } from "@tanstack/react-router";
import { useEventSource, useEventSourceConnection } from "@/hooks/useEventSource";
import { useServerFn } from "@tanstack/react-start";
import { restartProcessFn, stopProcessFn, startProcessFn, deleteProcessFn } from "@/server/actions/process-actions";
import { toggleMonitoringFn } from "@/server/actions/monitoring-actions";
import { ProcessLogs } from "@/components/process-logs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useEffect, useMemo, useState } from "react";
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
import { ArrowLeft, RotateCcw, Power, PowerOff, Trash2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/processes/$id")({
  component: ProcessDetailPage,
});

function ProcessDetailPage() {
  const { id } = Route.useParams();
  const processes = useEventSource();
  const connected = useEventSourceConnection();
  const restart = useServerFn(restartProcessFn);
  const stop = useServerFn(stopProcessFn);
  const deleteProc = useServerFn(deleteProcessFn);
  const start = useServerFn(startProcessFn);
  const toggleMonitoring = useServerFn(toggleMonitoringFn);

  const proc = useMemo(
    () =>
      processes.find(
        (p) => String(p.id ?? p.name) === String(id) || p.name === String(id)
      ) ?? null,
    [processes, id]
  );

  const [confirmAction, setConfirmAction] = useState<"restart" | "stop" | "delete" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!proc) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-muted-foreground">Process not found.</p>
        <Button variant="outline" nativeButton={false} render={<Link to="/processes" />}>
          <ArrowLeft className="mr-2 size-4" /> Back to processes
        </Button>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link to="/processes" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{proc.name}</h1>
            <p className="text-sm text-muted-foreground">Waiting for connection...</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border py-20">
          <Loader2 className="size-10 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Connecting to PM2...</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 w-full max-w-2xl px-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-16" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-6 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const formatUptime = (uptime: number | null) => {
    if (!uptime) return "-";
    const tot = Math.floor(uptime / 1000);
    const d = Math.floor(tot / 86400);
    const h = Math.floor((tot % 86400) / 3600);
    const m = Math.floor((tot % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${h}h ${m}m`;
  };

  async function handleAction(action: "restart" | "start" | "stop" | "delete") {
    setBusy(action);
    try {
      if (action === "restart") await restart({ data: { processId: String(id) } });
      else if (action === "start") await start({ data: { processId: String(id) } });
      else if (action === "stop") await stop({ data: { processId: String(id) } });
      else if (action === "delete") { await deleteProc({ data: { processId: String(id) } }); toast.success("Process deleted"); setBusy(null); return; }
      toast.success(`${action.charAt(0).toUpperCase() + action.slice(1)} successful`);
    } catch (e) {
      toast.error(`${action} failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleMonitoring(name: string, isMonitored: boolean) {
    setBusy("monitor");
    try {
      await toggleMonitoring({ data: { pm2Name: name, monitored: !isMonitored } });
      toast.success(isMonitored ? `Monitoring disabled for ${name}` : `Monitoring enabled for ${name}`);
    } catch (e) {
      toast.error(`Monitoring toggle failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" render={<Link to="/processes" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{proc.name}</h1>
          <p className="text-muted-foreground text-sm">
            PID {proc.pid ?? "N/A"} ·{" "}
            {proc.status} ·{" "}
            {proc.cpu.toFixed(1)}% CPU ·{" "}
            {formatBytes(proc.memory)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {proc.status === "stopped" ? (
            <Button variant="outline" size="sm" disabled={busy === "start"} onClick={() => handleAction("start")}>
              {busy === "start" ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Power className="mr-1 size-3" />} Start
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" disabled={busy === "restart"} onClick={() => setConfirmAction("restart")}>
                {busy === "restart" ? <Loader2 className="mr-1 size-3 animate-spin" /> : <RotateCcw className="mr-1 size-3" />} Restart
              </Button>
              <Button variant="outline" size="sm" disabled={busy === "stop"} onClick={() => setConfirmAction("stop")}>
                {busy === "stop" ? <Loader2 className="mr-1 size-3 animate-spin" /> : <PowerOff className="mr-1 size-3" />} Stop
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" disabled={busy === "delete"} onClick={() => setConfirmAction("delete")}>
            {busy === "delete" ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Trash2 className="mr-1 size-3 text-destructive" />} Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{formatUptime(proc.uptime)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Restarts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{proc.restarts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={proc.status === "online" ? "default" : "secondary"}>{proc.status}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monitoring</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Switch
              checked={proc.isMonitored}
              disabled={busy === "monitor"}
              onCheckedChange={() => handleToggleMonitoring(proc.name, proc.isMonitored)}
            />
            <span className="text-sm text-muted-foreground">
              {proc.isMonitored ? "Enabled" : "Disabled"}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Log console */}
      <div className="overflow-hidden rounded-lg border border-border">
        <ProcessLogs
          name={proc.name}
          isMonitored={proc.isMonitored}
          flushProcessId={proc.id}
          scrollClassName="min-h-[500px]"
        />
      </div>

      <AlertDialog open={confirmAction !== null} onOpenChange={(v) => !v && setConfirmAction(null)}>
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
