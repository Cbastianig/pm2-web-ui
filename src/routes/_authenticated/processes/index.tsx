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
  flushLogsFn,
} from "@/server/actions/process-actions";
import { toggleMonitoringFn, toggleAlertPrefsFn } from "@/server/actions/monitoring-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useMemo } from "react";
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
  Power,
  PowerOff,
  RotateCcw,
  Trash2,
  Search,
  ChevronRight,
  Loader2,
  Eraser,
  Bell,
  BellOff,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/processes/")({
  component: ProcessListPage,
});

function formatBytes(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatUptime(uptime: number | null) {
  if (!uptime) return "-";
  const totalSeconds = Math.floor(uptime / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "online"
      ? "default"
      : status === "stopped"
        ? "secondary"
        : "destructive";
  return <Badge variant={variant as any}>{status}</Badge>;
}

function ProcessListPage() {
  const processes = useEventSource();
  const connected = useEventSourceConnection();
  const restart = useServerFn(restartProcessFn);
  const stop = useServerFn(stopProcessFn);
  const start = useServerFn(startProcessFn);
  const deleteProc = useServerFn(deleteProcessFn);
  const flushLogs = useServerFn(flushLogsFn);
  const toggleMonitoring = useServerFn(toggleMonitoringFn);
  const toggleAlertPrefs = useServerFn(toggleAlertPrefsFn);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<{
    type: "restart" | "stop" | "delete";
    procId: number | string;
    name: string;
  } | null>(null);

  const filtered = useMemo(() => {
    if (!search) return processes;
    const q = search.toLowerCase();
    return processes.filter((p) => p.name.toLowerCase().includes(q));
  }, [processes, search]);

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0 && selected.size < filtered.length;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.name)));
  }

  function toggleOne(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleRestart(processId: number | string, name?: string) {
    try {
      await restart({ data: { processId: String(processId) } });
      toast.success(`${name || "Process"} restarted`);
    } catch (e) {
      toast.error(
        `${name || "Restart"} failed: ${e instanceof Error ? e.message : "error"}`,
      );
    }
  }
  async function handleStart(processId: number | string, name?: string) {
    try {
      await start({ data: { processId: String(processId) } });
      toast.success(`${name || "Process"} started`);
    } catch (e) {
      toast.error(
        `${name || "Start"} failed: ${e instanceof Error ? e.message : "error"}`,
      );
    }
  }
  async function handleStop(processId: number | string, name?: string) {
    try {
      await stop({ data: { processId: String(processId) } });
      toast.success(`${name || "Process"} stopped`);
    } catch (e) {
      toast.error(
        `${name || "Stop"} failed: ${e instanceof Error ? e.message : "error"}`,
      );
    }
  }
  async function handleDelete(processId: number | string, name?: string) {
    try {
      await deleteProc({ data: { processId: String(processId) } });
      toast.success(`${name || "Process"} deleted`);
    } catch (e) {
      toast.error(
        `${name || "Delete"} failed: ${e instanceof Error ? e.message : "error"}`,
      );
    }
  }
  async function handleToggleMon(name: string, monitored: boolean) {
    try {
      await toggleMonitoring({
        data: { pm2Name: name, monitored: !monitored },
      });
      toast.success(
        monitored
          ? `Monitoring disabled for ${name}`
          : `Monitoring enabled for ${name}`,
      );
    } catch (e) {
      toast.error(
        `Monitoring toggle failed: ${e instanceof Error ? e.message : "error"}`,
      );
    }
  }

  async function handleFlush(processId: number | string, name?: string) {
    try {
      await flushLogs({ data: { processId: String(processId) } });
      toast.success(`Logs flushed for ${name || "process"}`);
    } catch (e) {
      toast.error(`Flush failed: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  async function handleMuteToggle(name: string, enabled: boolean) {
    try {
      await toggleAlertPrefs({
        data: { pm2Name: name, alertsEnabled: !enabled },
      });
      toast.success(
        enabled ? `Alerts muted for ${name}` : `Alerts enabled for ${name}`,
      );
    } catch (e) {
      toast.error(
        `Alert toggle failed: ${e instanceof Error ? e.message : "error"}`,
      );
    }
  }

  if (!connected) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Processes</h1>
          <p className="text-muted-foreground">
            Manage and monitor PM2 processes 
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border py-20">
          <Loader2 className="size-10 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Connecting to PM2...</p>
          <div className="w-full max-w-2xl space-y-2 px-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Processes</h1>
          <p className="text-muted-foreground">
            {processes.length} process{processes.length !== 1 ? "es" : ""}
          </p>
        </div>
        <Badge variant={connected ? "default" : "destructive"}>
          {connected ? "Live" : "Disconnected"}
        </Badge>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search processes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setConfirmAction({
                  type: "restart",
                  procId: 0,
                  name: `${selected.size} process${selected.size > 1 ? "es" : ""}`,
                })
              }
            >
              <RotateCcw className="mr-1 size-3" /> Restart ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setConfirmAction({
                  type: "stop",
                  procId: 0,
                  name: `${selected.size} process${selected.size > 1 ? "es" : ""}`,
                })
              }
            >
              <PowerOff className="mr-1 size-3" /> Stop ({selected.size})
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">CPU</TableHead>
              <TableHead className="text-right">Memory</TableHead>
              <TableHead className="text-right">Uptime</TableHead>
              <TableHead className="text-right">Restarts</TableHead>
              <TableHead className="text-right">PID</TableHead>
              <TableHead className="w-24">Monitor</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-8 text-center text-muted-foreground"
                >
                  {processes.length === 0
                    ? "No processes found. Is PM2 running?"
                    : "No results match your search."}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((proc) => (
              <TableRow key={proc.name}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(proc.name)}
                    onCheckedChange={() => toggleOne(proc.name)}
                    aria-label={`Select ${proc.name}`}
                  />
                </TableCell>
                <TableCell>
                  <Link
                    to="/processes/$id"
                    params={{ id: String(proc.id ?? proc.name) }}
                    className="flex items-center gap-1 font-medium hover:underline"
                  >
                    {proc.name}
                    <ChevronRight className="size-3 text-muted-foreground" />
                  </Link>
                    {proc.isOrphan && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        orphan
                      </Badge>
                    )}
                    <button
                      type="button"
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMuteToggle(proc.name, proc.alertsEnabled);
                      }}
                      title={proc.alertsEnabled ? "Mute alerts" : "Enable alerts"}
                    >
                      {proc.alertsEnabled ? (
                        <Bell className="size-3" />
                      ) : (
                        <BellOff className="size-3" />
                      )}
                    </button>
                </TableCell>
                <TableCell>
                  <StatusBadge status={proc.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {proc.cpu.toFixed(1)}%
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatBytes(proc.memory)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUptime(proc.uptime)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {proc.restarts}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {proc.pid ?? "-"}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={proc.isMonitored}
                    onCheckedChange={() =>
                      handleToggleMon(proc.name, proc.isMonitored)
                    }
                    aria-label={`Toggle monitoring for ${proc.name}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {proc.id != null && proc.status !== "stopped" && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => setConfirmAction({ type: "restart", procId: proc.id!, name: proc.name })}
                          title="Restart"
                        >
                          <RotateCcw className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => setConfirmAction({ type: "stop", procId: proc.id!, name: proc.name })}
                          title="Stop"
                        >
                          <PowerOff className="size-3" />
                        </Button>
                      </>
                    )}
                    {proc.id != null && proc.status === "stopped" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => handleStart(proc.id!, proc.name)}
                        title="Start"
                      >
                        <Power className="size-3" />
                      </Button>
                    )}
                    {proc.id != null && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => handleFlush(proc.id!, proc.name)}
                        title="Flush logs"
                      >
                        <Eraser className="size-3" />
                      </Button>
                    )}
                    {proc.id != null && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => setConfirmAction({ type: "delete", procId: proc.id!, name: proc.name })}
                        title="Delete"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={confirmAction !== null} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirm {confirmAction?.type}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {confirmAction?.type}{" "}
              <span className="font-medium text-foreground">{confirmAction?.name}</span>?
              {confirmAction?.type === "delete" && " This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmAction) return;
                const { type, procId, name } = confirmAction;
                if (procId === 0) {
                  // Bulk action
                  const fn = type === "restart" ? handleRestart : type === "stop" ? handleStop : handleDelete;
                  selected.forEach((selName) => {
                    const p = processes.find((x) => x.name === selName);
                    if (p?.id != null && (type !== "stop" || p.status !== "stopped")) {
                      fn(p.id, p.name);
                    }
                  });
                } else {
                  if (type === "restart") handleRestart(procId, name);
                  else if (type === "stop") handleStop(procId, name);
                  else if (type === "delete") handleDelete(procId, name);
                }
                setConfirmAction(null);
              }}
            >
              {confirmAction?.type === "delete" ? "Delete" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
