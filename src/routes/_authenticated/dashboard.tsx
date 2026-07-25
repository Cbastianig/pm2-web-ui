import { createFileRoute } from "@tanstack/react-router";
import { useEventSource, useEventSourceConnection } from "@/hooks/useEventSource";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Activity, Cpu, HardDrive, Power, PowerOff, RotateCcw, Timer, Loader2 } from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function formatBytes(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatUptime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function DashboardPage() {
  const processes = useEventSource();
  const connected = useEventSourceConnection();

  const stats = useMemo(() => {
    const online = processes.filter((p) => p.status === "online" && !p.isOrphan);
    const stopped = processes.filter((p) => p.status === "stopped" && !p.isOrphan);
    const orphans = processes.filter((p) => p.isOrphan);
    const totalCpu = processes.filter((p) => !p.isOrphan).reduce((sum, p) => sum + p.cpu, 0);
    const totalMem = processes.filter((p) => !p.isOrphan).reduce((sum, p) => sum + p.memory, 0);
    return {
      online: online.length,
      stopped: stopped.length,
      orphans: orphans.length,
      totalCpu,
      totalMem,
      total: processes.length,
    };
  }, [processes]);

  const avgUptime = useMemo(() => {
    const withUptime = processes.filter((p) => p.uptime && !p.isOrphan);
    if (withUptime.length === 0) return "N/A";
    const avg = withUptime.reduce((sum, p) => sum + (p.uptime ?? 0), 0) / withUptime.length;
    return formatUptime(avg);
  }, [processes]);

  const totalRestarts = useMemo(
    () => processes.filter((p) => !p.isOrphan).reduce((sum, p) => sum + p.restarts, 0),
    [processes]
  );

  if (!connected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">System overview and process monitoring</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border py-20">
          <Loader2 className="size-10 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Connecting to PM2...</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 w-full max-w-3xl px-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="size-4 rounded" />
                </CardHeader>
                <CardContent className="space-y-1.5">
                  <Skeleton className="h-7 w-16" />
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">System overview and process monitoring</p>
        </div>
        <Badge variant={connected ? "default" : "destructive"}>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-green-500" /> Live
          </span>
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
            <Cpu className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCpu.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Total across {stats.total} processes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory</CardTitle>
            <HardDrive className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(stats.totalMem)}</div>
            <p className="text-xs text-muted-foreground">Combined process memory</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Uptime</CardTitle>
            <Timer className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgUptime}</div>
            <p className="text-xs text-muted-foreground">Average running time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
            <Power className="size-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.online}</div>
            <p className="text-xs text-muted-foreground">Running processes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stopped</CardTitle>
            <PowerOff className="size-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{stats.stopped}</div>
            <p className="text-xs text-muted-foreground">
              {stats.orphans > 0 ? `${stats.orphans} orphaned` : "Inactive processes"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Restarts</CardTitle>
            <RotateCcw className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRestarts}</div>
            <p className="text-xs text-muted-foreground">Cumulative restarts</p>
          </CardContent>
        </Card>
      </div>

      {processes.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-medium">Process Overview</h3>
          </div>
          <div className="divide-y divide-border">
            {processes.slice(0, 10).map((proc) => (
              <div key={proc.name} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2 rounded-full ${
                      proc.status === "online" ? "bg-green-500" : proc.status === "stopped" ? "bg-yellow-500" : "bg-red-500"
                    }`}
                  />
                  <span className="font-medium">{proc.name}</span>
                  {proc.isOrphan && (
                    <Badge variant="outline" className="text-xs">orphan</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-muted-foreground">
                  <span>{proc.cpu.toFixed(1)}%</span>
                  <span>{formatBytes(proc.memory)}</span>
                  <span className="w-16 text-right">{proc.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
