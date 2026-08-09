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
import {
  toggleMonitoringFn,
  toggleAlertPrefsFn,
  getProcessMetricsFn,
} from "@/server/actions/monitoring-actions";
import { ProcessLogs } from "@/components/process-logs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { StatusDot, StatusPill } from "@/components/status-dot";
import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Power,
  PowerOff,
  RotateCcw,
  Trash2,
  Search,
  ChevronRight,
  Loader2,
  Bell,
  BellOff,
  Activity,
  FileText,
  BarChart3,
  Globe,
  ListFilter,
  ExternalLink,
  Rocket,
  Cpu,
  MemoryStick,
  Timer,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/processes/")({
  component: ProcessListPage,
});

type ProcessItem = ReturnType<typeof useEventSource>[number];

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

type StatusKind =
  "online" | "stopped" | "error" | "warning" | "info" | "violet" | "neutral";

function statusInfo(proc: ProcessItem): { kind: StatusKind; label: string } {
  if (proc.isOrphan) return { kind: "warning", label: "orphan" };
  if (proc.status === "online") return { kind: "online", label: "online" };
  if (proc.status === "stopped") return { kind: "neutral", label: "stopped" };
  if (proc.status === "errored" || proc.status === "error")
    return { kind: "error", label: proc.status };
  return { kind: "info", label: proc.status || "unknown" };
}

function StatusPillInline({ proc }: { proc: ProcessItem }) {
  const info = statusInfo(proc);
  return <StatusPill variant={info.kind}>{info.label}</StatusPill>;
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-pulse-glow rounded-full bg-primary/20 blur-xl" />
        <div className="relative flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm">
          <Icon className="size-6 text-muted-foreground" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  icon: Icon,
  accent = "default",
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
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
    <div className="group/metric relative min-w-0 bg-card px-3 py-2.5 transition-colors hover:bg-accent/30">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="size-2.5" />}
        {label}
      </p>
      <p
        className={cn(
          "truncate text-sm font-semibold tabular-nums",
          accentClass,
        )}
      >
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2.5 text-sm last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  );
}

function formatSampleTime(t: number) {
  return new Date(t).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Sparkline({
  data,
  color,
  hoverIdx,
  onHover,
  showTooltip,
  tooltip,
}: {
  data: Array<{ t: number; value: number }>;
  color: string;
  hoverIdx: number | null;
  onHover: (idx: number | null) => void;
  showTooltip?: boolean;
  tooltip: (idx: number) => React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  if (data.length < 2) {
    return <div className="h-10 w-full" />;
  }

  const w = 300;
  const h = 40;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - 3 - ((d.value - min) / range) * (h - 6);
    return { x, y };
  });

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const frac = Math.min(1, Math.max(0, x / rect.width));
    const idx = Math.round(frac * (data.length - 1));
    onHover(idx);
  }

  const hoverPoint = hoverIdx != null ? points[hoverIdx] : null;

  return (
    <div
      ref={wrapRef}
      className="relative h-10 w-full"
      onMouseMove={handleMove}
      onMouseLeave={() => onHover(null)}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        style={{ color }}
      >
        <defs>
          <linearGradient
            id={`spark-${color.replace(/\s/g, "")}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {hoverPoint && (
          <line
            x1={hoverPoint.x}
            y1={0}
            x2={hoverPoint.x}
            y2={h}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.3}
          />
        )}
        <polyline
          points={points
            .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
            .join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hoverPoint && (
          <circle
            cx={hoverPoint.x}
            cy={hoverPoint.y}
            r={2.5}
            fill={color}
            stroke="oklch(0.16 0.018 270)"
            strokeWidth={1}
          />
        )}
      </svg>
      {hoverPoint && hoverIdx != null && showTooltip && (
        <div
          className="pointer-events-none absolute bottom-full z-10 mb-1.5 w-max -translate-x-1/2 rounded-md border border-border/60 bg-popover/95 px-2 py-1 text-xs shadow-lg backdrop-blur-md"
          style={{
            left: `${Math.min(90, Math.max(10, (hoverPoint.x / w) * 100))}%`,
          }}
        >
          {tooltip(hoverIdx)}
        </div>
      )}
    </div>
  );
}

function MetricsTab({ proc }: { proc: ProcessItem }) {
  const getMetrics = useServerFn(getProcessMetricsFn);
  const [stored, setStored] = useState<
    Array<{
      sampledAt: number;
      cpu: number | null;
      memory: number | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<
    Array<{ t: number; cpu: number; memory: number }>
  >([]);
  const [hover, setHover] = useState<{
    idx: number;
    source: "cpu" | "memory";
  } | null>(null);

  useEffect(() => {
    setHistory([]);
    setStored([]);
    setLoading(true);
    if (!proc.isMonitored) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = () => {
      getMetrics({ data: { processName: proc.name } })
        .then((res) => {
          if (!cancelled) setStored(res.samples ?? []);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [proc.name, proc.isMonitored, getMetrics]);

  useEffect(() => {
    setHistory((prev) => {
      const now = Date.now();
      const last = prev[prev.length - 1];
      if (last && now - last.t < 1500) return prev;
      const next = [...prev, { t: now, cpu: proc.cpu, memory: proc.memory }];
      return next.length > 90 ? next.slice(-90) : next;
    });
  }, [proc]);

  const combined = useMemo(() => {
    const storedPoints = stored.map((s) => ({
      t: s.sampledAt,
      cpu: Number(s.cpu ?? 0),
      memory: Number(s.memory ?? 0),
    }));
    return [...storedPoints, ...history];
  }, [stored, history]);

  if (loading && combined.length === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }
  if (combined.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Collecting metric samples"
        description="CPU and memory samples will appear here as live data is collected."
      />
    );
  }

  const latest = combined[combined.length - 1]!;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {combined.length} samples
          {!proc.isMonitored && " · monitoring disabled, live samples only"}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <StatusDot variant="online" size="sm" pulse />
          Live
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-gradient-to-br from-[oklch(0.78_0.17_75/0.06)] to-transparent p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Cpu className="size-3" /> CPU
            </span>
            <span className="text-sm font-semibold tabular-nums text-[oklch(0.88_0.17_75)]">
              {proc.cpu.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2">
            <Sparkline
              data={combined.map((s) => ({ t: s.t, value: s.cpu }))}
              color="oklch(0.78 0.17 75)"
              hoverIdx={hover?.idx ?? null}
              onHover={(idx) =>
                setHover(idx == null ? null : { idx, source: "cpu" })
              }
              showTooltip={hover?.source === "cpu"}
              tooltip={(i) => {
                const s = combined[i]!;
                return (
                  <>
                    <div className="font-semibold tabular-nums">
                      CPU {s.cpu.toFixed(1)}%
                    </div>
                    <div className="tabular-nums">
                      Memory {formatBytes(s.memory)}
                    </div>
                    <div className="text-muted-foreground tabular-nums">
                      {formatSampleTime(s.t)}
                    </div>
                  </>
                );
              }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-gradient-to-br from-[oklch(0.78_0.16_220/0.06)] to-transparent p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <MemoryStick className="size-3" /> Memory
            </span>
            <span className="text-sm font-semibold tabular-nums text-[oklch(0.85_0.16_220)]">
              {formatBytes(proc.memory)}
            </span>
          </div>
          <div className="mt-2">
            <Sparkline
              data={combined.map((s) => ({ t: s.t, value: s.memory }))}
              color="oklch(0.78 0.16 220)"
              hoverIdx={hover?.idx ?? null}
              onHover={(idx) =>
                setHover(idx == null ? null : { idx, source: "memory" })
              }
              showTooltip={hover?.source === "memory"}
              tooltip={(i) => {
                const s = combined[i]!;
                return (
                  <>
                    <div className="font-semibold tabular-nums">
                      CPU {s.cpu.toFixed(1)}%
                    </div>
                    <div className="tabular-nums">
                      Memory {formatBytes(s.memory)}
                    </div>
                    <div className="text-muted-foreground tabular-nums">
                      {formatSampleTime(s.t)}
                    </div>
                  </>
                );
              }}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        <span>
          Latest CPU{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {latest.cpu.toFixed(1)}%
          </span>
        </span>
        <span>
          Latest memory{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {formatBytes(latest.memory)}
          </span>
        </span>
        <span>
          Restarts{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {proc.restarts}
          </span>
        </span>
        <span>
          Uptime{" "}
          <span className="font-semibold text-foreground">
            {formatUptime(proc.uptime)}
          </span>
        </span>
        <span>
          PID{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {proc.pid ?? "-"}
          </span>
        </span>
      </div>
    </div>
  );
}

interface ProcessSidebarProps {
  processes: ProcessItem[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  connected: boolean;
  onQuickAction: (
    type: "restart" | "stop" | "start" | "delete",
    proc: ProcessItem,
  ) => void;
  busy: Record<string, boolean>;
}

function ProcessSidebar({
  processes,
  selectedName,
  onSelect,
  connected,
  onQuickAction,
  busy,
}: ProcessSidebarProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return processes;
    const q = search.toLowerCase();
    return processes.filter((p) => p.name.toLowerCase().includes(q));
  }, [processes, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2.5 border-b border-border/60 px-3 pb-3 pt-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Processes
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusDot
              variant={connected ? "online" : "error"}
              size="sm"
              pulse={connected}
            />
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {processes.length}
            </span>
          </div>
        </div>
        <div className="group relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder="Search processes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {processes.length === 0
              ? "No processes found. Is PM2 running?"
              : "No results match your search."}
          </p>
        )}
        {filtered.map((proc) => {
          const info = statusInfo(proc);
          const isSelected = selectedName === proc.name;
          return (
            <div
              key={proc.name}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(proc.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(proc.name);
                }
              }}
              className={cn(
                "group relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-all",
                "focus-visible:ring-1 focus-visible:ring-ring",
                isSelected
                  ? "border border-[oklch(0.72_0.18_255/0.4)] bg-gradient-to-r from-[oklch(0.6_0.22_264/0.2)] to-[oklch(0.6_0.22_264/0.05)] shadow-[0_4px_12px_-4px_oklch(0.6_0.22_264/0.3)]"
                  : "border border-transparent hover:border-border/60 hover:bg-accent/40",
              )}
            >
              <StatusDot
                variant={info.kind}
                size="default"
                pulse={info.kind === "online" || info.kind === "error"}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium leading-tight">
                  {proc.name}
                </span>
                <span className="block truncate text-xs leading-tight text-muted-foreground">
                  {info.label}
                </span>
              </span>
              {proc.isOrphan && (
                <Badge variant="outline" className="px-1.5 text-[10px]">
                  orphan
                </Badge>
              )}
              <span
                data-selected={isSelected ? "" : undefined}
                className="hidden items-center gap-0.5 group-focus-within:flex group-hover:flex data-[selected]:flex"
              >
                {proc.id != null && proc.status !== "stopped" && (
                  <>
                    <QuickActionButton
                      title="Restart"
                      disabled={busy[`restart:${proc.name}`]}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onQuickAction("restart", proc);
                      }}
                    >
                      {busy[`restart:${proc.name}`] ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3" />
                      )}
                    </QuickActionButton>
                    <QuickActionButton
                      title="Stop"
                      disabled={busy[`stop:${proc.name}`]}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onQuickAction("stop", proc);
                      }}
                    >
                      {busy[`stop:${proc.name}`] ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <PowerOff className="size-3" />
                      )}
                    </QuickActionButton>
                  </>
                )}
                {proc.id != null && proc.status === "stopped" && (
                  <QuickActionButton
                    title="Start"
                    disabled={busy[`start:${proc.name}`]}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onQuickAction("start", proc);
                    }}
                  >
                    {busy[`start:${proc.name}`] ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Power className="size-3" />
                    )}
                  </QuickActionButton>
                )}
                {proc.id != null && (
                  <QuickActionButton
                    title="Delete"
                    disabled={busy[`delete:${proc.name}`]}
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onQuickAction("delete", proc);
                    }}
                  >
                    {busy[`delete:${proc.name}`] ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                  </QuickActionButton>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuickActionButton({
  title,
  onClick,
  className,
  disabled,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ProcessListPage() {
  const processes = useEventSource();
  const connected = useEventSourceConnection();
  const restart = useServerFn(restartProcessFn);
  const stop = useServerFn(stopProcessFn);
  const start = useServerFn(startProcessFn);
  const deleteProc = useServerFn(deleteProcessFn);
  const toggleMonitoring = useServerFn(toggleMonitoringFn);
  const toggleAlertPrefs = useServerFn(toggleAlertPrefsFn);

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [confirmAction, setConfirmAction] = useState<{
    type: "restart" | "stop" | "delete";
    procId: number | string;
    name: string;
  } | null>(null);

  function markBusy(key: string, value: boolean) {
    setBusy((prev) => ({ ...prev, [key]: value }));
  }

  const selectedProc = useMemo(() => {
    if (!selectedName) return processes[0] ?? null;
    return (
      processes.find((p) => p.name === selectedName) ?? processes[0] ?? null
    );
  }, [processes, selectedName]);

  async function handleRestart(processId: number | string, name?: string) {
    const key = `restart:${name || String(processId)}`;
    markBusy(key, true);
    try {
      await restart({ data: { processId: String(processId) } });
      toast.success(`${name || "Process"} restarted`);
    } catch (e) {
      toast.error(
        `${name || "Restart"} failed: ${e instanceof Error ? e.message : "error"}`,
      );
    } finally {
      markBusy(key, false);
    }
  }
  async function handleStart(processId: number | string, name?: string) {
    const key = `start:${name || String(processId)}`;
    markBusy(key, true);
    try {
      await start({ data: { processId: String(processId) } });
      toast.success(`${name || "Process"} started`);
    } catch (e) {
      toast.error(
        `${name || "Start"} failed: ${e instanceof Error ? e.message : "error"}`,
      );
    } finally {
      markBusy(key, false);
    }
  }
  async function handleStop(processId: number | string, name?: string) {
    const key = `stop:${name || String(processId)}`;
    markBusy(key, true);
    try {
      await stop({ data: { processId: String(processId) } });
      toast.success(`${name || "Process"} stopped`);
    } catch (e) {
      toast.error(
        `${name || "Stop"} failed: ${e instanceof Error ? e.message : "error"}`,
      );
    } finally {
      markBusy(key, false);
    }
  }
  async function handleDelete(processId: number | string, name?: string) {
    const key = `delete:${name || String(processId)}`;
    markBusy(key, true);
    try {
      await deleteProc({ data: { processId: String(processId) } });
      toast.success(`${name || "Process"} deleted`);
    } catch (e) {
      toast.error(
        `${name || "Delete"} failed: ${e instanceof Error ? e.message : "error"}`,
      );
    } finally {
      markBusy(key, false);
    }
  }
  async function handleToggleMon(name: string, monitored: boolean) {
    const key = `mon:${name}`;
    markBusy(key, true);
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
    } finally {
      markBusy(key, false);
    }
  }
  async function handleMuteToggle(name: string, enabled: boolean) {
    const key = `alert:${name}`;
    markBusy(key, true);
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
    } finally {
      markBusy(key, false);
    }
  }

  function handleQuickAction(
    type: "restart" | "stop" | "start" | "delete",
    proc: ProcessItem,
  ) {
    if (type === "start") {
      if (proc.id != null) handleStart(proc.id, proc.name);
      return;
    }
    if (proc.id != null) {
      setConfirmAction({ type, procId: proc.id, name: proc.name });
    }
  }

  if (!connected) {
    return (
      <div className="flex flex-col gap-4 md:h-[calc(100dvh-7.5rem)] md:flex-row">
        <aside className="hidden shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm md:flex md:w-64 lg:w-72 xl:w-80">
          <div className="space-y-2.5 border-b border-border/60 p-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="flex-1 space-y-2 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse-glow rounded-full bg-primary/30 blur-xl" />
            <Loader2 className="relative size-10 animate-spin text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Connecting to PM2...</p>
        </div>
      </div>
    );
  }

  const proc = selectedProc;

  return (
    <div className="flex flex-col gap-4 md:h-[calc(100dvh-7.5rem)] md:flex-row">
      {/* Sidebar: processes */}
      <aside className="hidden shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm md:flex md:w-64 lg:w-72 xl:w-80">
        <ProcessSidebar
          processes={processes}
          selectedName={selectedName}
          onSelect={setSelectedName}
          connected={connected}
          onQuickAction={handleQuickAction}
          busy={busy}
        />
      </aside>

      {/* Mobile processes drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-[320px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Processes</SheetTitle>
          </SheetHeader>
          <ProcessSidebar
            processes={processes}
            selectedName={selectedName}
            onSelect={(name) => {
              setSelectedName(name);
              setMobileOpen(false);
            }}
            connected={connected}
            onQuickAction={(type, p) => {
              handleQuickAction(type, p);
              setMobileOpen(false);
            }}
            busy={busy}
          />
        </SheetContent>
      </Sheet>

      {/* Right panel: selected process detail */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-sm backdrop-blur-sm">
        {!proc ? (
          <EmptyState
            icon={Rocket}
            title="Select a process"
            description="Select a PM2 process from the sidebar to view its details."
          />
        ) : (
          <>
            {/* Mobile process selector */}
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 md:hidden">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 justify-start truncate"
                onClick={() => setMobileOpen(true)}
              >
                <ListFilter className="size-3.5 shrink-0" />
                <span className="truncate">{proc.name}</span>
                <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
              </Button>
            </div>

            {/* Header */}
            <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-lg font-semibold tracking-tight">
                    {proc.name}
                  </h2>
                  {proc.isOrphan && (
                    <Badge variant="outline" className="text-[10px]">
                      orphan
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <StatusPillInline proc={proc} />
                  <span className="text-xs text-muted-foreground">
                    {proc.id != null
                      ? `Instance ${proc.id}`
                      : "Unmanaged process"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {proc.id != null && proc.status !== "stopped" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy[`restart:${proc.name}`]}
                      onClick={() =>
                        setConfirmAction({
                          type: "restart",
                          procId: proc.id!,
                          name: proc.name,
                        })
                      }
                    >
                      {busy[`restart:${proc.name}`] ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-1 size-3" />
                      )}{" "}
                      Restart
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy[`stop:${proc.name}`]}
                      onClick={() =>
                        setConfirmAction({
                          type: "stop",
                          procId: proc.id!,
                          name: proc.name,
                        })
                      }
                    >
                      {busy[`stop:${proc.name}`] ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : (
                        <PowerOff className="mr-1 size-3" />
                      )}{" "}
                      Stop
                    </Button>
                  </>
                )}
                {proc.id != null && proc.status === "stopped" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy[`start:${proc.name}`]}
                    onClick={() => handleStart(proc.id!, proc.name)}
                  >
                    {busy[`start:${proc.name}`] ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : (
                      <Power className="mr-1 size-3" />
                    )}{" "}
                    Start
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Open full detail view"
                  nativeButton={false}
                  render={
                    <Link
                      to="/processes/$id"
                      params={{ id: String(proc.id ?? proc.name) }}
                    />
                  }
                >
                  <ExternalLink className="size-3.5" />
                </Button>
                {proc.id != null && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    disabled={busy[`delete:${proc.name}`]}
                    onClick={() =>
                      setConfirmAction({
                        type: "delete",
                        procId: proc.id!,
                        name: proc.name,
                      })
                    }
                    title="Delete"
                  >
                    {busy[`delete:${proc.name}`] ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-px border-b border-border/60 bg-border/40 sm:grid-cols-3 lg:grid-cols-5">
              <MetricCell
                label="CPU"
                value={`${proc.cpu.toFixed(1)}%`}
                icon={Cpu}
                accent="warm"
              />
              <MetricCell
                label="Memory"
                value={formatBytes(proc.memory)}
                icon={MemoryStick}
                accent="info"
              />
              <MetricCell
                label="Uptime"
                value={formatUptime(proc.uptime)}
                icon={Timer}
                accent="brand"
              />
              <MetricCell
                label="Restarts"
                value={proc.restarts}
                accent="default"
              />
              <MetricCell
                label="PID"
                value={proc.pid ?? "-"}
                accent="default"
              />
            </div>

            {/* Tabs */}
            <Tabs
              defaultValue="overview"
              className="flex min-h-0 flex-1 flex-col"
            >
              <TabsList variant="line" className="w-full px-3 pt-1">
                <TabsTrigger value="overview">
                  <Activity /> Overview
                </TabsTrigger>
                <TabsTrigger value="logs">
                  <FileText /> Logs
                </TabsTrigger>
                <TabsTrigger value="metrics">
                  <BarChart3 /> Metrics
                </TabsTrigger>
                <TabsTrigger value="environment">
                  <Globe /> Environment
                </TabsTrigger>
              </TabsList>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <TabsContent value="overview" className="p-4">
                  <div className="grid gap-x-10 sm:grid-cols-2">
                    <div className="max-w-md">
                      <DetailRow label="Process name" value={proc.name} />
                      <DetailRow
                        label="Instance ID"
                        value={proc.id != null ? String(proc.id) : "-"}
                      />
                      <DetailRow
                        label="Status"
                        value={<StatusPillInline proc={proc} />}
                      />
                      <DetailRow label="PID" value={proc.pid ?? "-"} />
                      <DetailRow
                        label="Uptime"
                        value={formatUptime(proc.uptime)}
                      />
                      <DetailRow label="Restarts" value={proc.restarts} />
                      <DetailRow
                        label="Orphan"
                        value={proc.isOrphan ? "Yes" : "No"}
                      />
                    </div>
                    <div className="mt-2 space-y-3">
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Monitoring</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {proc.isMonitored
                              ? "Logs and metrics are being recorded."
                              : "Logs and metrics are not recorded."}
                          </p>
                        </div>
                        <Switch
                          checked={proc.isMonitored}
                          disabled={busy[`mon:${proc.name}`]}
                          onCheckedChange={() =>
                            handleToggleMon(proc.name, proc.isMonitored)
                          }
                          aria-label={`Toggle monitoring for ${proc.name}`}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Alerts</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {proc.alertsEnabled
                              ? "Alert notifications are enabled."
                              : "Alert notifications are muted."}
                          </p>
                        </div>
                        <Button
                          variant={proc.alertsEnabled ? "outline" : "secondary"}
                          size="sm"
                          disabled={busy[`alert:${proc.name}`]}
                          onClick={() =>
                            handleMuteToggle(proc.name, proc.alertsEnabled)
                          }
                        >
                          {busy[`alert:${proc.name}`] ? (
                            <Loader2 className="mr-1 size-3 animate-spin" />
                          ) : proc.alertsEnabled ? (
                            <BellOff className="mr-1 size-3" />
                          ) : (
                            <Bell className="mr-1 size-3" />
                          )}{" "}
                          {proc.alertsEnabled ? "Mute" : "Enable"}
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={
                          <Link
                            to="/processes/$id"
                            params={{ id: String(proc.id ?? proc.name) }}
                          />
                        }
                      >
                        <ExternalLink className="mr-1 size-3" /> Open full
                        detail view
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="logs" className="h-full">
                  <ProcessLogs
                    name={proc.name}
                    isMonitored={proc.isMonitored}
                    flushProcessId={proc.id}
                  />
                </TabsContent>
                <TabsContent value="metrics" className="p-4">
                  <MetricsTab proc={proc} />
                </TabsContent>
                <TabsContent value="environment" className="p-4">
                  <EmptyState
                    icon={Globe}
                    title="No environment information"
                    description="Environment variables and deployment information will appear here."
                  />
                </TabsContent>
              </div>
            </Tabs>
          </>
        )}
      </div>

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(v) => !v && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm {confirmAction?.type}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {confirmAction?.type}{" "}
              <span className="font-medium text-foreground">
                {confirmAction?.name}
              </span>
              ?{confirmAction?.type === "delete" && " This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmAction) return;
                const { type, procId, name } = confirmAction;
                if (type === "restart") handleRestart(procId, name);
                else if (type === "stop") handleStop(procId, name);
                else if (type === "delete") handleDelete(procId, name);
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
