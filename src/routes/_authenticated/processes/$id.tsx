import { createFileRoute, Link } from "@tanstack/react-router";
import { useEventSource, useEventSourceConnection } from "@/hooks/useEventSource";
import { useServerFn } from "@tanstack/react-start";
import { restartProcessFn, stopProcessFn, startProcessFn, deleteProcessFn, flushLogsFn } from "@/server/actions/process-actions";
import { toggleMonitoringFn, getStoredLogsFn } from "@/server/actions/monitoring-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { apiUrl } from "@/lib/basePath";
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
import { ArrowLeft, Copy, Download, Pause, Play, Search, RotateCcw, Power, PowerOff, Trash2, Eraser, Loader2 } from "lucide-react";

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
  const flushLogs = useServerFn(flushLogsFn);
  const toggleMonitoring = useServerFn(toggleMonitoringFn);
  const getStoredLogs = useServerFn(getStoredLogsFn);

  const proc = useMemo(
    () => processes.find((p) => String(p.id ?? p.name) === String(id)) ?? null,
    [processes, id]
  );

  const [liveLines, setLiveLines] = useState<{ text: string; level: string }[]>([]);
  const [storedLines, setStoredLines] = useState<{ text: string; level: string }[]>([]);
  const [storedReady, setStoredReady] = useState(false);
  const [logPaused, setLogPaused] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logFilters, setLogFilters] = useState<Set<string>>(new Set(["info", "warn", "error"]));
  const logRef = useRef<HTMLDivElement>(null);
  const autoStickRef = useRef(true);
  const [confirmAction, setConfirmAction] = useState<"restart" | "stop" | "delete" | null>(null);

  useEffect(() => {
    if (!proc) return;
    setStoredReady(false);
    getStoredLogs({ data: { processName: proc.name, limit: 500 } })
      .then((res) => {
        const lines = (res.entries || []).map((e: any) => ({ text: e.raw ?? e.log, level: e.logLevel || e.log_level || "" }));
        setStoredLines(lines);
        setStoredReady(true);
      })
      .catch(() => setStoredReady(true));
  }, [proc?.name]);

  useEffect(() => {
    if (!proc) return;
    const es = new EventSource(apiUrl("/api/events"));
    es.addEventListener("logs", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.processName === proc.name && !logPaused) {
          setLiveLines((prev) => [...prev.slice(-500), { text: data.text, level: data.level }]);
        }
      } catch {}
    });
    return () => es.close();
  }, [proc?.name, logPaused]);

  useEffect(() => {
    const container = logRef.current;
    if (!container) return;
    const onScroll = () => {
      autoStickRef.current =
        container.scrollHeight - (container.scrollTop + container.clientHeight) < 48;
    };
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const container = logRef.current;
    if (container && autoStickRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [liveLines, storedLines]);

  const allLines = useMemo(() => {
    if (proc?.isMonitored && storedReady) return [...storedLines, ...liveLines];
    return liveLines;
  }, [proc?.isMonitored, storedReady, storedLines, liveLines]);

  const filteredLines = useMemo(() => {
    return allLines.filter((l) => {
      if (logFilters.size < 4 && l.level && !logFilters.has(l.level)) return false;
      if (logSearch && !l.text.toLowerCase().includes(logSearch.toLowerCase())) return false;
      return true;
    });
  }, [allLines, logFilters, logSearch]);

  function toggleFilter(level: string) {
    setLogFilters((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  const copyLogs = useCallback(() => {
    const text = filteredLines.map((l) => l.text).join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
  }, [filteredLines]);

  const downloadLogs = useCallback(() => {
    const text = filteredLines.map((l) => l.text).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${proc?.name ?? "process"}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLines, proc?.name]);

  if (!proc) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-muted-foreground">Process not found.</p>
        <Button variant="outline" asChild>
          <Link to="/processes">
            <ArrowLeft className="mr-2 size-4" /> Back to processes
          </Link>
        </Button>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/processes"><ArrowLeft className="size-4" /></Link>
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

  async function handleAction(action: "restart" | "start" | "stop" | "delete" | "flush") {
    try {
      if (action === "restart") await restart({ data: { processId: String(id) } });
      else if (action === "start") await start({ data: { processId: String(id) } });
      else if (action === "stop") await stop({ data: { processId: String(id) } });
      else if (action === "delete") { await deleteProc({ data: { processId: String(id) } }); toast.success("Process deleted"); return; }
      else if (action === "flush") await flushLogs({ data: { processId: String(id) } });
      toast.success(`${action.charAt(0).toUpperCase() + action.slice(1)} successful`);
    } catch (e) {
      toast.error(`${action} failed: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  async function handleToggleMonitoring(name: string, isMonitored: boolean) {
    try {
      await toggleMonitoring({ data: { pm2Name: name, monitored: !isMonitored } });
      toast.success(isMonitored ? `Monitoring disabled for ${name}` : `Monitoring enabled for ${name}`);
    } catch (e) {
      toast.error(`Monitoring toggle failed: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/processes">
            <ArrowLeft className="size-4" />
          </Link>
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
            <Button variant="outline" size="sm" onClick={() => handleAction("start")}>
              <Power className="mr-1 size-3" /> Start
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setConfirmAction("restart")}>
                <RotateCcw className="mr-1 size-3" /> Restart
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmAction("stop")}>
                <PowerOff className="mr-1 size-3" /> Stop
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setConfirmAction("delete")}>
            <Trash2 className="mr-1 size-3 text-destructive" /> Delete
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
              onCheckedChange={() => handleToggleMonitoring(proc.name, proc.isMonitored)}
            />
            <span className="text-sm text-muted-foreground">
              {proc.isMonitored ? "Enabled" : "Disabled"}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Log console */}
      <div className="rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <div className="flex items-center gap-1">
            {["error", "warn", "info", "debug"].map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => toggleFilter(level)}
                className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                  logFilters.has(level)
                    ? level === "error"
                      ? "bg-red-500/20 text-red-400"
                      : level === "warn"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : level === "info"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-gray-500/20 text-gray-400"
                    : "bg-transparent text-muted-foreground opacity-50"
                }`}
              >
                {level.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-7 w-40 pl-7 text-xs"
              placeholder="Search..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setLogPaused(!logPaused)}
            title={logPaused ? "Resume" : "Pause"}
          >
            {logPaused ? <Play className="size-3" /> : <Pause className="size-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={copyLogs} title="Copy">
            <Copy className="size-3" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={downloadLogs} title="Download">
            <Download className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => handleAction("flush")}
            title="Flush logs"
          >
            <Eraser className="size-3" />
          </Button>
        </div>

        <div
          ref={logRef}
          className="h-[500px] overflow-auto font-mono text-xs leading-relaxed"
        >
          {filteredLines.length === 0 && (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No log entries yet.
            </div>
          )}
          {filteredLines.map((line, i) => {
            const timeMatch = line.text.match(
              /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/
            );
            const timeStr = timeMatch ? timeMatch[1].slice(11, 19) : "";
            const levelColor =
              line.level === "error"
                ? "text-red-400"
                : line.level === "warn"
                  ? "text-yellow-400"
                  : line.level === "info"
                    ? "text-blue-400"
                    : "";
            return (
              <div
                key={i}
                className={`flex gap-2 border-b border-border/30 px-4 py-0.5 ${
                  logFilters.has(line.level) || !line.level ? "" : "hidden"
                }`}
              >
                {timeStr && (
                  <span className="shrink-0 text-muted-foreground">
                    {timeStr}
                  </span>
                )}
                <span
                  className={`shrink-0 w-8 text-right ${levelColor} font-semibold`}
                >
                  {line.level ? line.level.toUpperCase().slice(0, 4) : "LOG"}
                </span>
                <span className={`truncate ${levelColor}`}>{line.text}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span
              className={`size-1.5 rounded-full ${logPaused ? "bg-yellow-500" : "bg-green-500"}`}
            />
            {logPaused ? "Paused" : "Live"}
          </span>
          <span>
            {filteredLines.length === allLines.length
              ? `${allLines.length} lines`
              : `${filteredLines.length} / ${allLines.length} lines`}
          </span>
        </div>
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
