import { createFileRoute } from "@tanstack/react-router";
import { useEventSource, useEventSourceConnection } from "@/hooks/useEventSource";
import { useServerFn } from "@tanstack/react-start";
import { getHistoricalMetricsFn } from "@/server/actions/monitoring-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cpu, HardDrive, Power, PowerOff, RotateCcw, Timer, Loader2, LineChart as LineChartIcon, Calendar as CalendarIcon } from "lucide-react";
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
  return rangeMs >= 7 * 24 * 60 * 60 * 1000 ? d.format("MMM D, HH:mm") : d.format("HH:mm:ss");
}

function DashboardPage() {
  const processes = useEventSource();
  const connected = useEventSourceConnection();
  const getHistorical = useServerFn(getHistoricalMetricsFn);

  const [rangeMs, setRangeMs] = useState(24 * 60 * 60 * 1000);
  const [hostData, setHostData] = useState<Array<Record<string, number | string>>>([]);
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
  const [customApplied, setCustomApplied] = useState<{ from: number; to: number } | null>(null);
  const [dataBounds, setDataBounds] = useState<{ min: number; max: number } | null>(null);

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
          }))
        );
        setProcessSeries(res.processes ?? []);
        setDataBounds(res.dataBounds ?? null);
        setSelectedProc((prev) => {
          if (prev && (res.processes ?? []).some((p: any) => p.name === prev)) return prev;
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

  const selectedProcData = useMemo(
    () => processSeries.find((p) => p.name === selectedProc)?.points ?? [],
    [processSeries, selectedProc]
  );

  const selectedProcRestarts = useMemo(
    () => processSeries.find((p) => p.name === selectedProc)?.restartTimes ?? [],
    [processSeries, selectedProc]
  );

  const chartData = useMemo(
    () =>
      selectedProcData.map((p) => ({
        t: p.t,
        cpu: Number(p.cpu.toFixed(1)),
        memory: p.memory,
      })),
    [selectedProcData]
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
      cpu: { avg: avg("cpu"), max: max("cpu") },
      ram: { avg: avg("ram"), max: max("ram") },
      disk: { avg: avg("disk"), max: max("disk") },
    };
  }, [hostData]);

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

      {/* Historical metrics */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LineChartIcon className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold tracking-tight">Historical Metrics</h2>
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
            <SelectTrigger size="sm" className="w-36">
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
        </div>

        {customMode && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
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
                          { before: dayjs(dataBounds.min).startOf("day").toDate() },
                          { after: dayjs(dataBounds.max).endOf("day").toDate() },
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
                    from: dayjs(r.from).hour(h || 0).minute(m || 0).toDate(),
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
                    to: dayjs(r.to).hour(h || 0).minute(m || 0).toDate(),
                  }));
                }}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
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
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-6">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-4 h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Host CPU</CardTitle>
            </CardHeader>
            <CardContent className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hostData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="t" tickFormatter={timeLabel} stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} width={32} tickFormatter={(v) => `${v}%`} />
                  <Tooltip labelFormatter={(l) => tooltipLabel(Number(l), rangeMs)} formatter={(v) => [`${Number(v).toFixed(1)}%`, "CPU"]} />
                  <Area type="monotone" dataKey="cpu" stroke="var(--amber-500, #f59e0b)" fill="var(--amber-500, #f59e0b)" fillOpacity={0.15} strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                <span>avg {hostStats.cpu.avg.toFixed(1)}%</span>
                <span>max {hostStats.cpu.max.toFixed(1)}%</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Host RAM</CardTitle>
            </CardHeader>
            <CardContent className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hostData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="t" tickFormatter={timeLabel} stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} width={32} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    labelFormatter={(l) => tooltipLabel(Number(l), rangeMs)}
                    formatter={(v, name) => {
                      const idx = hostData.findIndex((d) => d.t === Number((v as any).payload?.t));
                      const d = hostData[idx];
                      if (name === "ram" && d) {
                        return [`${Number(v).toFixed(1)}% (${formatBytes(Number(d.ramUsed))} / ${formatBytes(Number(d.ramTotal))})`, "RAM"];
                      }
                      return [`${Number(v).toFixed(1)}%`, "RAM"];
                    }}
                  />
                  <Area type="monotone" dataKey="ram" stroke="var(--sky-500, #0ea5e9)" fill="var(--sky-500, #0ea5e9)" fillOpacity={0.15} strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                <span>avg {hostStats.ram.avg.toFixed(1)}%</span>
                <span>max {hostStats.ram.max.toFixed(1)}%</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Host Disk</CardTitle>
            </CardHeader>
            <CardContent className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hostData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="t" tickFormatter={timeLabel} stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} width={32} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    labelFormatter={(l) => tooltipLabel(Number(l), rangeMs)}
                    formatter={(v, name) => {
                      const idx = hostData.findIndex((d) => d.t === Number((v as any).payload?.t));
                      const d = hostData[idx];
                      if (name === "disk" && d) {
                        return [`${Number(v).toFixed(1)}% (${formatBytes(Number(d.diskUsed))} / ${formatBytes(Number(d.diskTotal))})`, "Disk"];
                      }
                      return [`${Number(v).toFixed(1)}%`, "Disk"];
                    }}
                  />
                  <Area type="monotone" dataKey="disk" stroke="var(--emerald-500, #10b981)" fill="var(--emerald-500, #10b981)" fillOpacity={0.15} strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                <span>avg {hostStats.disk.avg.toFixed(1)}%</span>
                <span>max {hostStats.disk.max.toFixed(1)}%</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-process CPU/memory chart */}
      {processSeries.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Process CPU / Memory</CardTitle>
            <Select value={selectedProc} onValueChange={(v) => v && setSelectedProc(v)}>
              <SelectTrigger size="sm" className="w-52">
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
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="t" tickFormatter={timeLabel} stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis yAxisId="cpu" stroke="var(--muted-foreground)" fontSize={11} width={32} tickFormatter={(v) => `${v}%`} />
                <YAxis yAxisId="mem" orientation="right" stroke="var(--muted-foreground)" fontSize={11} width={44} tickFormatter={(v) => formatBytes(v)} />
                <Tooltip
                  labelFormatter={(l) => tooltipLabel(Number(l), rangeMs)}
                  formatter={(v, name) =>
                    name === "memory"
                      ? [`${(Number(v) / 1048576).toFixed(1)} MB`, "memory"]
                      : [`${Number(v).toFixed(1)}%`, "cpu"]
                  }
                />
                {selectedProcRestarts.map((t) => (
                  <ReferenceLine
                    key={t}
                    x={t}
                    yAxisId="cpu"
                    stroke="var(--red-500, #ef4444)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                ))}
                <Area yAxisId="cpu" type="monotone" dataKey="cpu" name="cpu" stroke="var(--amber-500, #f59e0b)" fill="var(--amber-500, #f59e0b)" fillOpacity={0.15} strokeWidth={1.5} />
                <Area yAxisId="mem" type="monotone" dataKey="memory" name="memory" stroke="var(--sky-500, #0ea5e9)" fill="var(--sky-500, #0ea5e9)" fillOpacity={0.1} strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
            {procStats && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                <span>avg CPU {procStats.avgCpu.toFixed(1)}%</span>
                <span>max CPU {procStats.maxCpu.toFixed(1)}%</span>
                <span>avg mem {formatBytes(procStats.avgMemory)}</span>
                <span>max mem {formatBytes(procStats.maxMemory)}</span>
                {selectedProcRestarts.length > 0 && (
                  <span className="flex items-center gap-1 text-red-500">
                    <RotateCcw className="size-3" /> {selectedProcRestarts.length} restart
                    {selectedProcRestarts.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
