import { createFileRoute } from "@tanstack/react-router";
import {
  useEventSource,
  useEventSourceConnection,
} from "@/hooks/useEventSource";
import { useServerFn } from "@tanstack/react-start";
import { getHistoricalMetricsFn } from "@/server/actions/monitoring-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-dot";
import {
  Cpu,
  HardDrive,
  Power,
  PowerOff,
  RotateCcw,
  Timer,
  Loader2,
  LineChart as LineChartIcon,
  Calendar as CalendarIcon,
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Cpu as CpuIcon,
  MemoryStick,
  Server,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import dayjs from "dayjs";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";

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

const TIME_RANGES = [
  { label: "Last hour", ms: 60 * 60 * 1000 },
  { label: "Last 6 hours", ms: 6 * 60 * 60 * 1000 },
  { label: "Last 12 hours", ms: 12 * 60 * 60 * 1000 },
  { label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
];

function timeLabel(t: number) {
  return dayjs(t).format("HH:mm");
}

function tooltipLabel(t: number, rangeMs: number) {
  const d = dayjs(t);
  return rangeMs >= 7 * 24 * 60 * 60 * 1000
    ? d.format("MMM D, HH:mm")
    : d.format("HH:mm:ss");
}

function ChartTooltip({
  active,
  payload,
  label,
  rangeMs,
  unit,
  formatValue,
}: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-border/60 bg-popover/90 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
      <p className="font-medium tabular-nums">
        {formatValue
          ? formatValue(item.value)
          : `${Number(item.value).toFixed(1)}${unit ?? "%"}`}
      </p>
      <p className="text-muted-foreground tabular-nums">
        {tooltipLabel(Number(label), rangeMs)}
      </p>
    </div>
  );
}

function DashboardPage() {
  const processes = useEventSource();
  const connected = useEventSourceConnection();
  const getHistorical = useServerFn(getHistoricalMetricsFn);

  const [rangeMs, setRangeMs] = useState(24 * 60 * 60 * 1000);
  const [hostData, setHostData] = useState<
    Array<Record<string, number | string>>
  >([]);
  const [processSeries, setProcessSeries] = useState<
    Array<{
      name: string;
      points: Array<{ t: number; cpu: number; memory: number }>;
      restartTimes: number[];
    }>
  >([]);
  const [selectedProc, setSelectedProc] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>({
    from: dayjs().subtract(24, "hour").toDate(),
    to: dayjs().toDate(),
  });
  const [customMode, setCustomMode] = useState(false);
  const [customApplied, setCustomApplied] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [dataBounds, setDataBounds] = useState<{
    min: number;
    max: number;
  } | null>(null);

  const query = useMemo(() => {
    if (customApplied) {
      return { data: { from: customApplied.from, to: customApplied.to } };
    }
    return { data: { since: rangeMs } };
  }, [customApplied, rangeMs]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getHistorical(query)
      .then((res) => {
        if (cancelled) return;
        setHostData(
          res.host.map((h: any) => ({
            t: h.t,
            cpu: Number(h.cpuPercent.toFixed(1)),
            ram: Number(h.ramPercent.toFixed(1)),
            disk: Number(h.diskPercent.toFixed(1)),
            ramUsed: h.ramUsed ?? 0,
            ramTotal: h.ramTotal ?? 0,
            diskUsed: h.diskUsed ?? 0,
            diskTotal: h.diskTotal ?? 0,
          })),
        );
        setProcessSeries(res.processes ?? []);
        setDataBounds(res.dataBounds ?? null);
        setSelectedProc((prev) => {
          if (prev && (res.processes ?? []).some((p: any) => p.name === prev))
            return prev;
          return (res.processes?.[0]?.name as string) ?? "";
        });
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, getHistorical]);

  const stats = useMemo(() => {
    const online = processes.filter(
      (p) => p.status === "online" && !p.isOrphan,
    );
    const stopped = processes.filter(
      (p) => p.status === "stopped" && !p.isOrphan,
    );
    const orphans = processes.filter((p) => p.isOrphan);
    const totalCpu = processes
      .filter((p) => !p.isOrphan)
      .reduce((sum, p) => sum + p.cpu, 0);
    const totalMem = processes
      .filter((p) => !p.isOrphan)
      .reduce((sum, p) => sum + p.memory, 0);
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
    const avg =
      withUptime.reduce((sum, p) => sum + (p.uptime ?? 0), 0) /
      withUptime.length;
    return formatUptime(avg);
  }, [processes]);

  const totalRestarts = useMemo(
    () =>
      processes
        .filter((p) => !p.isOrphan)
        .reduce((sum, p) => sum + p.restarts, 0),
    [processes],
  );

  const selectedProcData = useMemo(
    () => processSeries.find((p) => p.name === selectedProc)?.points ?? [],
    [processSeries, selectedProc],
  );

  const selectedProcRestarts = useMemo(
    () =>
      processSeries.find((p) => p.name === selectedProc)?.restartTimes ?? [],
    [processSeries, selectedProc],
  );

  const chartData = useMemo(
    () =>
      selectedProcData.map((p) => ({
        t: p.t,
        cpu: Number(p.cpu.toFixed(1)),
        memory: p.memory,
      })),
    [selectedProcData],
  );

  const procStats = useMemo(() => {
    if (chartData.length === 0) return null;
    const cpus = chartData.map((d) => d.cpu);
    const mems = chartData.map((d) => d.memory);
    return {
      avgCpu: cpus.reduce((a, b) => a + b, 0) / cpus.length,
      maxCpu: Math.max(...cpus),
      avgMemory: mems.reduce((a, b) => a + b, 0) / mems.length,
      maxMemory: Math.max(...mems),
    };
  }, [chartData]);

  const hostStats = useMemo(() => {
    const num = (v: any) => Number(v) || 0;
    const values = (key: string) => hostData.map((d) => num(d[key]));
    const avg = (key: string) => {
      const arr = values(key);
      return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    };
    const max = (key: string) => Math.max(...values(key));
    return {
      cpu: {
        avg: avg("cpu"),
        max: max("cpu"),
        current: num(hostData[hostData.length - 1]?.cpu),
      },
      ram: {
        avg: avg("ram"),
        max: max("ram"),
        current: num(hostData[hostData.length - 1]?.ram),
      },
      disk: {
        avg: avg("disk"),
        max: max("disk"),
        current: num(hostData[hostData.length - 1]?.disk),
      },
    };
  }, [hostData]);

  if (!connected) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Dashboard"
          description="System overview and process monitoring"
          icon={<LayoutDashboard />}
          actions={<StatusPill variant="warning">Connecting...</StatusPill>}
        />
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border/60 bg-card/40 py-20 backdrop-blur-sm">
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
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="System overview and process monitoring"
        icon={<LayoutDashboard />}
        actions={
          <StatusPill variant={connected ? "online" : "error"}>
            {connected ? "Live" : "Offline"}
          </StatusPill>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="CPU Usage"
          value={`${stats.totalCpu.toFixed(1)}%`}
          icon={Cpu}
          gradient="brand"
          description={`Across ${stats.total} processes`}
        />
        <StatCard
          label="Memory"
          value={formatBytes(stats.totalMem)}
          icon={HardDrive}
          gradient="info"
          description="Combined process memory"
        />
        <StatCard
          label="Avg Uptime"
          value={avgUptime}
          icon={Timer}
          gradient="violet"
          description="Average running time"
        />
        <StatCard
          label="Online"
          value={stats.online}
          icon={Power}
          gradient="success"
          description="Running processes"
        />
        <StatCard
          label="Stopped"
          value={stats.stopped}
          icon={PowerOff}
          gradient="warm"
          description={
            stats.orphans > 0
              ? `${stats.orphans} orphaned`
              : "Inactive processes"
          }
        />
        <StatCard
          label="Restarts"
          value={totalRestarts}
          icon={RotateCcw}
          gradient="brand"
          description="Cumulative restarts"
        />
      </div>

      {/* Historical metrics */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border/60 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-[oklch(0.72_0.18_255)] to-[oklch(0.7_0.18_195)]">
              <LineChartIcon className="size-3.5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">Historical Metrics</CardTitle>
              <p className="text-xs text-muted-foreground">
                Host resource trends over time
              </p>
            </div>
          </div>
          <Select
            value={customMode ? "custom" : String(rangeMs)}
            onValueChange={(v) => {
              if (!v) return;
              if (v === "custom") {
                setCustomMode(true);
                setCustomApplied(null);
                return;
              }
              setCustomMode(false);
              setCustomApplied(null);
              setRangeMs(Number(v));
            }}
          >
            <SelectTrigger size="sm" className="w-40">
              <SelectValue>
                {customMode
                  ? "Custom range"
                  : TIME_RANGES.find((r) => r.ms === rangeMs)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map((r) => (
                <SelectItem key={r.ms} value={String(r.ms)}>
                  {r.label}
                </SelectItem>
              ))}
              <SelectItem value="custom">Custom range...</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>

        {customMode && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
            <Popover>
              <PopoverTrigger
                render={
                  <Button variant="outline" size="sm">
                    <CalendarIcon className="size-3.5" />
                    {dayjs(customRange.from).format("MMM D, YYYY")} →{" "}
                    {dayjs(customRange.to).format("MMM D, YYYY")}
                  </Button>
                }
              />
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={{ from: customRange.from, to: customRange.to }}
                  disabled={
                    dataBounds
                      ? [
                          {
                            before: dayjs(dataBounds.min)
                              .startOf("day")
                              .toDate(),
                          },
                          {
                            after: dayjs(dataBounds.max).endOf("day").toDate(),
                          },
                        ]
                      : undefined
                  }
                  onSelect={(range) => {
                    if (!range?.from) return;
                    setCustomRange({
                      from: range.from,
                      to: range.to ?? range.from,
                    });
                  }}
                />
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">From</span>
              <Input
                type="time"
                className="h-8 w-28"
                value={dayjs(customRange.from).format("HH:mm")}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  setCustomRange((r) => ({
                    ...r,
                    from: dayjs(r.from)
                      .hour(h || 0)
                      .minute(m || 0)
                      .toDate(),
                  }));
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">To</span>
              <Input
                type="time"
                className="h-8 w-28"
                value={dayjs(customRange.to).format("HH:mm")}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  setCustomRange((r) => ({
                    ...r,
                    to: dayjs(r.to)
                      .hour(h || 0)
                      .minute(m || 0)
                      .toDate(),
                  }));
                }}
              />
            </div>
            <Button
              size="sm"
              onClick={() => {
                const from = dayjs(customRange.from);
                const to = dayjs(customRange.to);
                if (!from.isValid() || !to.isValid()) return;
                if (to.isBefore(from)) {
                  toast.error("End time must be after start time");
                  return;
                }
                setCustomApplied({ from: from.valueOf(), to: to.valueOf() });
              }}
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCustomMode(false);
                setCustomApplied(null);
                setRangeMs(24 * 60 * 60 * 1000);
              }}
            >
              Clear
            </Button>
          </div>
        )}

        <CardContent className="pt-5">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-56 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <MetricChart
                title="Host CPU"
                data={hostData}
                dataKey="cpu"
                stroke="oklch(0.78 0.17 75)"
                icon={CpuIcon}
                gradientColor="warm"
                stats={hostStats.cpu}
                rangeMs={rangeMs}
                unit="%"
              />
              <MetricChart
                title="Host RAM"
                data={hostData}
                dataKey="ram"
                stroke="oklch(0.78 0.16 220)"
                icon={MemoryStick}
                gradientColor="info"
                stats={hostStats.ram}
                rangeMs={rangeMs}
                unit="%"
              />
              <MetricChart
                title="Host Disk"
                data={hostData}
                dataKey="disk"
                stroke="oklch(0.78 0.19 155)"
                icon={Server}
                gradientColor="success"
                stats={hostStats.disk}
                rangeMs={rangeMs}
                unit="%"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-process CPU/memory chart */}
      {processSeries.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 pb-4">
            <div>
              <CardTitle className="text-base">Process CPU / Memory</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Per-process resource consumption
              </p>
            </div>
            <Select
              value={selectedProc}
              onValueChange={(v) => v && setSelectedProc(v)}
            >
              <SelectTrigger size="sm" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {processSeries.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="oklch(0.78 0.17 75)"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="95%"
                        stopColor="oklch(0.78 0.17 75)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <linearGradient id="memFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="oklch(0.78 0.16 220)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="oklch(0.78 0.16 220)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="oklch(1 0 0 / 5%)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="t"
                    tickFormatter={timeLabel}
                    stroke="oklch(1 0 0 / 35%)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="cpu"
                    stroke="oklch(1 0 0 / 35%)"
                    fontSize={11}
                    width={36}
                    tickFormatter={(v) => `${v}%`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="mem"
                    orientation="right"
                    stroke="oklch(1 0 0 / 35%)"
                    fontSize={11}
                    width={48}
                    tickFormatter={(v) => formatBytes(v)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ stroke: "oklch(1 0 0 / 20%)", strokeWidth: 1 }}
                    content={({ active, payload, label }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload}
                        label={label}
                        rangeMs={rangeMs}
                      />
                    )}
                  />
                  {selectedProcRestarts.map((t) => (
                    <ReferenceLine
                      key={t}
                      x={t}
                      yAxisId="cpu"
                      stroke="oklch(0.72 0.22 25)"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      opacity={0.7}
                    />
                  ))}
                  <Area
                    yAxisId="cpu"
                    type="monotone"
                    dataKey="cpu"
                    name="cpu"
                    stroke="oklch(0.78 0.17 75)"
                    fill="url(#cpuFill)"
                    strokeWidth={2}
                  />
                  <Area
                    yAxisId="mem"
                    type="monotone"
                    dataKey="memory"
                    name="memory"
                    stroke="oklch(0.78 0.16 220)"
                    fill="url(#memFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {procStats && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Stat
                  label="avg CPU"
                  value={`${procStats.avgCpu.toFixed(1)}%`}
                  accent="warm"
                />
                <Stat
                  label="max CPU"
                  value={`${procStats.maxCpu.toFixed(1)}%`}
                  accent="warm"
                />
                <Stat
                  label="avg mem"
                  value={formatBytes(procStats.avgMemory)}
                  accent="info"
                />
                <Stat
                  label="max mem"
                  value={formatBytes(procStats.maxMemory)}
                  accent="info"
                />
                {selectedProcRestarts.length > 0 && (
                  <Stat
                    label="restarts"
                    value={`${selectedProcRestarts.length}`}
                    accent="error"
                    icon={RotateCcw}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  accent: "warm" | "info" | "success" | "brand" | "error";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const accentClass = {
    warm: "text-[oklch(0.88_0.17_75)]",
    info: "text-[oklch(0.85_0.16_220)]",
    success: "text-[oklch(0.85_0.19_155)]",
    brand: "text-[oklch(0.85_0.18_255)]",
    error: "text-[oklch(0.82_0.18_25)]",
  }[accent];
  const bgClass = {
    warm: "bg-[oklch(0.78_0.17_75/0.08)] border-[oklch(0.78_0.17_75/0.18)]",
    info: "bg-[oklch(0.78_0.16_220/0.08)] border-[oklch(0.78_0.16_220/0.18)]",
    success:
      "bg-[oklch(0.78_0.19_155/0.08)] border-[oklch(0.78_0.19_155/0.18)]",
    brand: "bg-[oklch(0.72_0.18_255/0.08)] border-[oklch(0.72_0.18_255/0.18)]",
    error: "bg-[oklch(0.72_0.22_25/0.08)] border-[oklch(0.72_0.22_25/0.18)]",
  }[accent];

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        bgClass,
      )}
    >
      {Icon && <Icon className={cn("size-3", accentClass)} />}
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", accentClass)}>
        {value}
      </span>
    </div>
  );
}

function MetricChart({
  title,
  data,
  dataKey,
  stroke,
  icon: Icon,
  gradientColor,
  stats,
  rangeMs,
  unit = "%",
}: {
  title: string;
  data: Array<Record<string, number | string>>;
  dataKey: string;
  stroke: string;
  icon: React.ComponentType<{ className?: string }>;
  gradientColor: "warm" | "info" | "success" | "brand" | "violet";
  stats: { avg: number; max: number; current: number };
  rangeMs: number;
  unit?: string;
}) {
  const gradientId = `grad-${dataKey}`;
  const accentClass = {
    warm: "text-[oklch(0.88_0.17_75)]",
    info: "text-[oklch(0.85_0.16_220)]",
    success: "text-[oklch(0.85_0.19_155)]",
    brand: "text-[oklch(0.85_0.18_255)]",
    violet: "text-[oklch(0.82_0.18_295)]",
  }[gradientColor];
  const bgClass = {
    warm: "from-[oklch(0.78_0.17_75/0.12)] to-transparent",
    info: "from-[oklch(0.78_0.16_220/0.12)] to-transparent",
    success: "from-[oklch(0.78_0.19_155/0.12)] to-transparent",
    brand: "from-[oklch(0.72_0.18_255/0.12)] to-transparent",
    violet: "from-[oklch(0.72_0.2_295/0.12)] to-transparent",
  }[gradientColor];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br p-4",
        bgClass,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("size-3.5", accentClass)} />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
        </div>
        <span className={cn("text-sm font-semibold tabular-nums", accentClass)}>
          {stats.current.toFixed(1)}
          {unit}
        </span>
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={stroke} stopOpacity={0.4} />
                <stop offset="95%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="oklch(1 0 0 / 5%)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis dataKey="t" hide />
            <YAxis hide domain={[0, 100]} />
            <Tooltip
              cursor={{ stroke: "oklch(1 0 0 / 20%)", strokeWidth: 1 }}
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  payload={payload}
                  label={label}
                  rangeMs={rangeMs}
                  unit={unit}
                />
              )}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px]">
        <span className="flex items-center gap-1 text-muted-foreground">
          <TrendingDown className="size-3" /> avg {stats.avg.toFixed(1)}
          {unit}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <TrendingUp className="size-3" /> max {stats.max.toFixed(1)}
          {unit}
        </span>
      </div>
    </div>
  );
}
