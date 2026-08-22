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
import { buildProcessGroups, type ProcessGroup } from "@/lib/processGroups";
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
  Layers,
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

function groupInfo(group: ProcessGroup): { kind: StatusKind; label: string } {
  if (group.kind === "process") return statusInfo(group.proc);
  const st = group.status;
  const kind: StatusKind =
    st === "online"
      ? "online"
      : st === "errored" || st === "error"
        ? "error"
        : st === "stopped"
          ? "neutral"
          : "info";
  return { kind, label: st };
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

function MetricsTab({
  proc,
  sources,
}: {
  proc: ProcessItem;
  sources?: ProcessItem[];
}) {
  const getMetrics = useServerFn(getProcessMetricsFn);
  const members = sources && sources.length > 0 ? sources : [proc];
  const namesKey = members.map((m) => m.name).join(",");
  const anyMonitored = members.some((m) => m.isMonitored);
  const names = useMemo(() => namesKey.split(",").filter(Boolean), [namesKey]);

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
    if (!anyMonitored) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = () => {
      Promise.all(
        names.map((n) => getMetrics({ data: { processName: n } })),
      )
        .then((results) => {
          if (cancelled) return;
          const byT = new Map<number, { cpu: number; memory: number }>();
          for (const res of results) {
            for (const s of res.samples ?? []) {
              const t = s.sampledAt;
              const cpu = Number(s.cpu ?? 0);
              const memory = Number(s.memory ?? 0);
              const cur = byT.get(t);
              if (cur) {
                cur.cpu += cpu;
                cur.memory += memory;
              } else {
                byT.set(t, { cpu, memory });
              }
            }
          }
          setStored(
            Array.from(byT.entries())
              .map(([sampledAt, v]) => ({
                sampledAt,
                cpu: v.cpu,
                memory: v.memory,
              }))
              .sort((a, b) => a.sampledAt - b.sampledAt),
          );
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
    // Key by content (names), not the prop reference, to avoid re-loading on
    // every parent render (SSE updates).
  }, [namesKey, anyMonitored, getMetrics]);

  useEffect(() => {
    setHistory((prev) => {
      const now = Date.now();
      const last = prev[prev.length - 1];
      if (last && now - last.t < 1500) return prev;
      const cpu = members.reduce((s, m) => s + m.cpu, 0);
      const memory = members.reduce((s, m) => s + m.memory, 0);
      const next = [...prev, { t: now, cpu, memory }];
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
  const currentCpu = members.reduce((s, m) => s + m.cpu, 0);
  const currentMem = members.reduce((s, m) => s + m.memory, 0);
  const currentRestarts = members.reduce((s, m) => s + m.restarts, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {combined.length} samples
          {sources &&
            sources.length > 1 &&
            ` · merged across ${sources.length} processes`}
          {!anyMonitored && " · monitoring disabled, live samples only"}
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
              {currentCpu.toFixed(1)}%
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
              {formatBytes(currentMem)}
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
            {currentRestarts}
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
  groups: ProcessGroup[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  connected: boolean;
  onQuickAction: (
    type: "restart" | "stop" | "start" | "delete",
    proc: ProcessItem,
  ) => void;
  busy: Record<string, boolean>;
}

function ProcessSidebar({
  groups,
  selectedKey,
  onSelect,
  connected,
  onQuickAction,
  busy,
}: ProcessSidebarProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, search]);

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
              {groups.length}
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
            {groups.length === 0
              ? "No processes found. Is PM2 running?"
              : "No results match your search."}
          </p>
        )}
        {filtered.map((group) => {
          const info = groupInfo(group);
          const target = group.kind === "app" ? group.active : group.proc;
          const isSelected = selectedKey === group.key;
          return (
            <div
              key={group.key}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(group.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(group.key);
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
                  {group.name}
                </span>
                <span className="block truncate text-xs leading-tight text-muted-foreground">
                  {info.label}
                </span>
              </span>
              {group.kind === "app" ? (
                <Badge variant="outline" className="px-1.5 text-[10px]">
                  <Layers className="mr-1 size-2.5" /> app
                </Badge>
              ) : (
                target.isOrphan && (
                  <Badge variant="outline" className="px-1.5 text-[10px]">
                    orphan
                  </Badge>
                )
              )}
              <span
                data-selected={isSelected ? "" : undefined}
                className="hidden items-center gap-0.5 group-focus-within:flex group-hover:flex data-[selected]:flex"
              >
                {target.id != null && target.status !== "stopped" && (
                  <>
                    <QuickActionButton
                      title="Restart"
                      disabled={busy[`restart:${target.name}`]}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onQuickAction("restart", target);
                      }}
                    >
                      {busy[`restart:${target.name}`] ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3" />
                      )}
                    </QuickActionButton>
                    <QuickActionButton
                      title="Stop"
                      disabled={busy[`stop:${target.name}`]}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onQuickAction("stop", target);
                      }}
                    >
                      {busy[`stop:${target.name}`] ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <PowerOff className="size-3" />
                      )}
                    </QuickActionButton>
                  </>
                )}
                {target.id != null && target.status === "stopped" && (
                  <QuickActionButton
                    title="Start"
                    disabled={busy[`start:${target.name}`]}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onQuickAction("start", target);
                    }}
                  >
                    {busy[`start:${target.name}`] ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Power className="size-3" />
                    )}
                  </QuickActionButton>
                )}
                {target.id != null && (
                  <QuickActionButton
                    title="Delete"
                    disabled={busy[`delete:${target.name}`]}
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onQuickAction("delete", target);
                    }}
                  >
                    {busy[`delete:${target.name}`] ? (
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

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [confirmAction, setConfirmAction] = useState<{
    type: "restart" | "stop" | "delete";
    procId: number | string;
    name: string;
  } | null>(null);

  const groups = useMemo(() => buildProcessGroups(processes), [processes]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.key === selectedKey) ?? groups[0] ?? null,
    [groups, selectedKey],
  );

  function markBusy(key: string, value: boolean) {
    setBusy((prev) => ({ ...prev, [key]: value }));
  }

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
  async function handleToggleMon(
    name: string,
    monitored: boolean,
    members?: ProcessItem[],
  ) {
    const targets =
      members && members.length > 0
        ? members
        : ([{ name }] as unknown as ProcessItem[]);
    const key = `mon:${name}`;
    markBusy(key, true);
    try {
      for (const m of targets) {
        await toggleMonitoring({
          data: { pm2Name: m.name, monitored: !monitored },
        });
      }
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

  return (
    <div className="flex flex-col gap-4 md:h-[calc(100dvh-7.5rem)] md:flex-row">
      {/* Sidebar: processes / apps */}
      <aside className="hidden shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm md:flex md:w-64 lg:w-72 xl:w-80">
        <ProcessSidebar
          groups={groups}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
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
            groups={groups}
            selectedKey={selectedKey}
            onSelect={(key) => {
              setSelectedKey(key);
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

      {/* Right panel: selected app/process detail */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-sm backdrop-blur-sm">
        {!selectedGroup ? (
          <EmptyState
            icon={Rocket}
            title="Select a process"
            description="Select a PM2 process from the sidebar to view its details."
          />
        ) : (
          (() => {
            const view = (() => {
              if (selectedGroup.kind === "app") {
                const a = selectedGroup.active;
                return {
                  isApp: true,
                  name: selectedGroup.name,
                  status: selectedGroup.status,
                  cpu: selectedGroup.cpu,
                  memory: selectedGroup.memory,
                  restarts: selectedGroup.restarts,
                  uptime: selectedGroup.uptime,
                  pid: selectedGroup.pid,
                  id: a.id,
                  isMonitored: selectedGroup.isMonitored,
                  isOrphan: false,
                  alertsEnabled: a.alertsEnabled,
                  active: a,
                  members: selectedGroup.members,
                  linkId: selectedGroup.name,
                };
              }
              const p = selectedGroup.proc;
              return {
                isApp: false,
                name: p.name,
                status: p.status,
                cpu: p.cpu,
                memory: p.memory,
                restarts: p.restarts,
                uptime: p.uptime,
                pid: p.pid,
                id: p.id,
                isMonitored: p.isMonitored,
                isOrphan: p.isOrphan,
                alertsEnabled: p.alertsEnabled,
                active: p,
                members: [p],
                linkId: String(p.id ?? p.name),
              };
            })();
            const info = groupInfo(selectedGroup);
            const activeColor = view.members.find(
              (m) => m.appActive,
            )?.appColor;
            const instanceLabel = view.isApp
              ? activeColor
                ? `${activeColor.toUpperCase()} active`
                : "No active environment"
              : view.id != null
                ? `Instance ${view.id}`
                : "Unmanaged process";

            return (
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
                    <span className="truncate">{view.name}</span>
                    <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                  </Button>
                </div>

                {/* Header */}
                <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-lg font-semibold tracking-tight">
                        {view.name}
                      </h2>
                      {view.isApp ? (
                        <Badge variant="outline" className="text-[10px]">
                          <Layers className="mr-1 size-2.5" /> app
                        </Badge>
                      ) : (
                        view.isOrphan && (
                          <Badge variant="outline" className="text-[10px]">
                            orphan
                          </Badge>
                        )
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusPill variant={info.kind}>{info.label}</StatusPill>
                      <span className="text-xs text-muted-foreground">
                        {instanceLabel}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {view.active.id != null &&
                      view.active.status !== "stopped" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy[`restart:${view.active.name}`]}
                            onClick={() =>
                              setConfirmAction({
                                type: "restart",
                                procId: view.active.id!,
                                name: view.active.name,
                              })
                            }
                          >
                            {busy[`restart:${view.active.name}`] ? (
                              <Loader2 className="mr-1 size-3 animate-spin" />
                            ) : (
                              <RotateCcw className="mr-1 size-3" />
                            )}{" "}
                            Restart
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy[`stop:${view.active.name}`]}
                            onClick={() =>
                              setConfirmAction({
                                type: "stop",
                                procId: view.active.id!,
                                name: view.active.name,
                              })
                            }
                          >
                            {busy[`stop:${view.active.name}`] ? (
                              <Loader2 className="mr-1 size-3 animate-spin" />
                            ) : (
                              <PowerOff className="mr-1 size-3" />
                            )}{" "}
                            Stop
                          </Button>
                        </>
                      )}
                    {view.active.id != null &&
                      view.active.status === "stopped" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy[`start:${view.active.name}`]}
                          onClick={() =>
                            handleStart(view.active.id!, view.active.name)
                          }
                        >
                          {busy[`start:${view.active.name}`] ? (
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
                        <Link to="/processes/$id" params={{ id: view.linkId }} />
                      }
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                    {view.active.id != null && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        disabled={busy[`delete:${view.active.name}`]}
                        onClick={() =>
                          setConfirmAction({
                            type: "delete",
                            procId: view.active.id!,
                            name: view.active.name,
                          })
                        }
                        title="Delete"
                      >
                        {busy[`delete:${view.active.name}`] ? (
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
                    value={`${view.cpu.toFixed(1)}%`}
                    icon={Cpu}
                    accent="warm"
                  />
                  <MetricCell
                    label="Memory"
                    value={formatBytes(view.memory)}
                    icon={MemoryStick}
                    accent="info"
                  />
                  <MetricCell
                    label="Uptime"
                    value={formatUptime(view.uptime)}
                    icon={Timer}
                    accent="brand"
                  />
                  <MetricCell
                    label="Restarts"
                    value={view.restarts}
                    accent="default"
                  />
                  <MetricCell
                    label="PID"
                    value={view.pid ?? "-"}
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
                          <DetailRow label="Process name" value={view.name} />
                          <DetailRow
                            label="Instance ID"
                            value={view.isApp ? "-" : String(view.id ?? "-")}
                          />
                          <DetailRow
                            label="Status"
                            value={
                              <StatusPill variant={info.kind}>
                                {info.label}
                              </StatusPill>
                            }
                          />
                          <DetailRow label="PID" value={view.pid ?? "-"} />
                          <DetailRow
                            label="Uptime"
                            value={formatUptime(view.uptime)}
                          />
                          <DetailRow label="Restarts" value={view.restarts} />
                          <DetailRow
                            label="Orphan"
                            value={view.isOrphan ? "Yes" : "No"}
                          />
                        </div>
                        <div className="mt-2 space-y-3">
                          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3.5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">Monitoring</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {view.isMonitored
                                  ? "Logs and metrics are being recorded."
                                  : "Logs and metrics are not recorded."}
                              </p>
                            </div>
                            <Switch
                              checked={view.isMonitored}
                              disabled={busy[`mon:${view.name}`]}
                              onCheckedChange={() =>
                                handleToggleMon(
                                  view.name,
                                  view.isMonitored,
                                  view.members,
                                )
                              }
                              aria-label={`Toggle monitoring for ${view.name}`}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3.5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">Alerts</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {view.alertsEnabled
                                  ? "Alert notifications are enabled."
                                  : "Alert notifications are muted."}
                              </p>
                            </div>
                            <Button
                              variant={
                                view.alertsEnabled ? "outline" : "secondary"
                              }
                              size="sm"
                              disabled={busy[`alert:${view.active.name}`]}
                              onClick={() =>
                                handleMuteToggle(
                                  view.active.name,
                                  view.alertsEnabled,
                                )
                              }
                            >
                              {busy[`alert:${view.active.name}`] ? (
                                <Loader2 className="mr-1 size-3 animate-spin" />
                              ) : view.alertsEnabled ? (
                                <BellOff className="mr-1 size-3" />
                              ) : (
                                <Bell className="mr-1 size-3" />
                              )}{" "}
                              {view.alertsEnabled ? "Mute" : "Enable"}
                            </Button>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            render={
                              <Link
                                to="/processes/$id"
                                params={{ id: view.linkId }}
                              />
                            }
                          >
                            <ExternalLink className="mr-1 size-3" /> Open full
                            detail view
                          </Button>
                        </div>
                      </div>
                      {view.isApp && (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Processes
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {view.members.map((m) => {
                              const minfo = statusInfo(m);
                              const isActive = m.appActive === true;
                              return (
                                <div
                                  key={m.name}
                                  className="rounded-xl border border-border/60 bg-card/40 p-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span
                                        className={`size-2 shrink-0 rounded-full ${
                                          m.appColor === "blue"
                                            ? "bg-[oklch(0.78_0.16_220)]"
                                            : m.appColor === "green"
                                              ? "bg-[oklch(0.78_0.19_155)]"
                                              : "bg-muted"
                                        }`}
                                      />
                                      <span className="truncate text-sm font-medium">
                                        {m.name}
                                      </span>
                                    </div>
                                    <StatusPill variant={minfo.kind}>
                                      {minfo.label}
                                    </StatusPill>
                                  </div>
                                  {isActive && (
                                    <span className="mt-1 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                                      Active
                                    </span>
                                  )}
                                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                    <span>
                                      CPU{" "}
                                      <span className="font-semibold text-foreground tabular-nums">
                                        {m.cpu.toFixed(1)}%
                                      </span>
                                    </span>
                                    <span>
                                      Memory{" "}
                                      <span className="font-semibold text-foreground tabular-nums">
                                        {formatBytes(m.memory)}
                                      </span>
                                    </span>
                                    <span>
                                      PID{" "}
                                      <span className="font-semibold text-foreground tabular-nums">
                                        {m.pid ?? "-"}
                                      </span>
                                    </span>
                                    <span>
                                      Restarts{" "}
                                      <span className="font-semibold text-foreground tabular-nums">
                                        {m.restarts}
                                      </span>
                                    </span>
                                    <span>
                                      Uptime{" "}
                                      <span className="font-semibold text-foreground">
                                        {formatUptime(m.uptime)}
                                      </span>
                                    </span>
                                    <span>
                                      Monitoring{" "}
                                      <span className="font-semibold text-foreground">
                                        {m.isMonitored ? "On" : "Off"}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </TabsContent>
                    <TabsContent value="logs" className="h-full">
                      <ProcessLogs
                        name={view.name}
                        isMonitored={view.isMonitored}
                        flushProcessId={view.active.id}
                        processes={view.members.map((m) => ({
                          name: m.name,
                          isMonitored: m.isMonitored,
                          flushId: m.id,
                          color: m.appColor ?? undefined,
                        }))}
                      />
                    </TabsContent>
                    <TabsContent value="metrics" className="p-4">
                      <MetricsTab proc={view.active} sources={view.members} />
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
            );
          })()
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