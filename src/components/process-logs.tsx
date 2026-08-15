import { useServerFn } from "@tanstack/react-start";
import { useVirtualizer } from "@tanstack/react-virtual";
import { flushLogsFn, readLogsFn } from "@/server/actions/process-actions";
import {
  getStoredLogsFn,
  getStoredLogsRangeFn,
  getStoredLogsBoundsFn,
} from "@/server/actions/monitoring-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { apiUrl } from "@/lib/basePath";
import {
  Search,
  Pause,
  Play,
  Copy,
  Download,
  Eraser,
  Loader2,
  WrapText,
  Check,
  CalendarDays,
} from "lucide-react";

interface ProcessLogsProps {
  name: string;
  isMonitored: boolean;
  flushProcessId?: string | number | null;
  scrollClassName?: string;
}

type LogBounds = { min: number | null; max: number | null } | null;

function RangePicker({
  from,
  to,
  bounds,
  onFrom,
  onTo,
}: {
  from: Date;
  to: Date;
  bounds: LogBounds;
  onFrom: (d: Date) => void;
  onTo: (d: Date) => void;
}) {
  const disabledMatchers = useMemo(() => {
    const matchers: Array<
      | { before: Date }
      | { after: Date }
      | { before: Date; after: Date }
    > = [];
    if (bounds?.min)
      matchers.push({ before: dayjs(bounds.min).startOf("day").toDate() });
    if (bounds?.max)
      matchers.push({ after: dayjs(bounds.max).endOf("day").toDate() });
    return matchers;
  }, [bounds]);

  const picker = (
    label: string,
    value: Date,
    onChange: (d: Date) => void,
  ) => (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm">
              <CalendarDays className="size-3.5" />
              {dayjs(value).format("MMM D, YYYY")}
            </Button>
          }
        />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            disabled={disabledMatchers}
            onSelect={(d) => d && onChange(d)}
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        className="h-8 w-28"
        aria-label={`${label} time`}
        value={dayjs(value).format("HH:mm")}
        onChange={(e) => {
          const [h, m] = e.target.value.split(":").map(Number);
          onChange(
            dayjs(value)
              .hour(h || 0)
              .minute(m || 0)
              .toDate(),
          );
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">From</Label>
        {picker("From", from, onFrom)}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">To</Label>
        {picker("To", to, onTo)}
      </div>
    </div>
  );
}

function DownloadOption({
  active,
  disabled,
  onClick,
  title,
  description,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-[oklch(0.72_0.18_255/0.4)] bg-accent/50"
          : "border-border/60 hover:bg-accent/30"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      {active && <Check className="size-4 shrink-0 text-primary" />}
    </button>
  );
}

export function ProcessLogs({
  name,
  isMonitored,
  flushProcessId,
  scrollClassName = "min-h-[420px]",
}: ProcessLogsProps) {
  const flushLogs = useServerFn(flushLogsFn);
  const getStoredLogs = useServerFn(getStoredLogsFn);
  const getStoredLogsRange = useServerFn(getStoredLogsRangeFn);
  const getStoredLogsBounds = useServerFn(getStoredLogsBoundsFn);
  const readLogs = useServerFn(readLogsFn);

  const [liveLines, setLiveLines] = useState<{ text: string; level: string }[]>(
    [],
  );
  const [storedLines, setStoredLines] = useState<
    { text: string; level: string }[]
  >([]);
  const [storedReady, setStoredReady] = useState(false);
  const [logPaused, setLogPaused] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logWrap, setLogWrap] = useState(false);
  const [logFilters, setLogFilters] = useState<Set<string>>(
    new Set(["info", "warn", "error"]),
  );
  const [flushing, setFlushing] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadMode, setDownloadMode] = useState<
    "visible" | "all" | "range"
  >("visible");
  const [downloading, setDownloading] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(() =>
    dayjs().startOf("day").toDate(),
  );
  const [rangeTo, setRangeTo] = useState(() => dayjs().toDate());
  const [logBounds, setLogBounds] = useState<{
    min: number | null;
    max: number | null;
  } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const autoStickRef = useRef(true);

  useEffect(() => {
    setStoredReady(false);
    setLiveLines([]);

    if (isMonitored) {
      getStoredLogs({ data: { processName: name, limit: 1000 } })
        .then((res) => {
          const lines = (res.entries || []).map((e: any) => ({
            text: e.raw ?? e.log,
            level: e.logLevel || e.log_level || "",
          }));
          setStoredLines(lines);
          setStoredReady(true);
        })
        .catch(() => setStoredReady(true));
    } else {
      readLogs({ data: { pm2Name: name } })
        .then((lines) => {
          const snapshot = (lines || []).map((l: any) => ({
            text: l.text,
            level: l.level || "",
          }));
          setLiveLines(snapshot);
          setStoredReady(true);
        })
        .catch(() => setStoredReady(true));
    }
  }, [name, isMonitored, getStoredLogs, readLogs]);

  useEffect(() => {
    if (!isMonitored) {
      setLogBounds(null);
      return;
    }
    let cancelled = false;
    getStoredLogsBounds({ data: { processName: name } })
      .then((res) => {
        if (!cancelled) setLogBounds(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [name, isMonitored, getStoredLogsBounds]);

  useEffect(() => {
    if (!logBounds?.min || !logBounds?.max) return;
    const min = dayjs(logBounds.min).startOf("day").toDate();
    const max = dayjs(logBounds.max).endOf("day").toDate();
    setRangeFrom((prev) => (dayjs(prev).isBefore(min) ? min : prev));
    setRangeTo((prev) => (dayjs(prev).isAfter(max) ? max : prev));
  }, [logBounds]);

  useEffect(() => {
    const es = new EventSource(apiUrl("/api/events"));
    es.addEventListener("logs", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.processName === name && !logPaused) {
          setLiveLines((prev) => [
            ...prev.slice(-1000),
            { text: data.text, level: data.level },
          ]);
        }
      } catch {}
    });
    return () => es.close();
  }, [name, logPaused]);

  useEffect(() => {
    const container = logRef.current;
    if (!container) return;
    const onScroll = () => {
      autoStickRef.current =
        container.scrollHeight -
          (container.scrollTop + container.clientHeight) <
        48;
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
    if (isMonitored && storedReady) return [...storedLines, ...liveLines];
    return liveLines;
  }, [isMonitored, storedReady, storedLines, liveLines]);

  const filteredLines = useMemo(() => {
    return allLines.filter((l) => {
      if (logFilters.size < 4 && l.level && !logFilters.has(l.level))
        return false;
      if (logSearch && !l.text.toLowerCase().includes(logSearch.toLowerCase()))
        return false;
      return true;
    });
  }, [allLines, logFilters, logSearch]);

  const rowVirtualizer = useVirtualizer({
    count: filteredLines.length,
    getScrollElement: () => logRef.current,
    estimateSize: () => 22,
    overscan: 15,
  });

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

  const downloadText = useCallback(
    (text: string) => {
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.log`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [name],
  );

  async function handleDownload() {
    if (downloadMode === "visible") {
      downloadText(filteredLines.map((l) => l.text).join("\n"));
      setDownloadOpen(false);
      return;
    }

    setDownloading(true);
    try {
      const res = await getStoredLogsRange({
        data: {
          processName: name,
          ...(downloadMode === "range"
            ? {
                from: dayjs(rangeFrom).startOf("day").valueOf(),
                to: dayjs(rangeTo).endOf("day").valueOf(),
              }
            : {}),
        },
      });
      const entries = res.entries ?? [];
      const text = entries
        .map((e: any) => e.raw ?? e.log ?? "")
        .join("\n");
      downloadText(text);
      toast.success(`Downloaded ${entries.length} log entries`);
      setDownloadOpen(false);
    } catch (e) {
      toast.error(
        `Download failed: ${e instanceof Error ? e.message : "error"}`,
      );
    } finally {
      setDownloading(false);
    }
  }

  async function handleFlush() {
    if (flushProcessId == null) return;
    setFlushing(true);
    try {
      await flushLogs({ data: { processId: String(flushProcessId) } });
      toast.success(`Logs flushed for ${name}`);
    } catch (e) {
      toast.error(`Flush failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setFlushing(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
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
          className={`size-7 ${logWrap ? "bg-accent text-foreground" : ""}`}
          onClick={() => setLogWrap(!logWrap)}
          title={logWrap ? "Disable line wrapping" : "Wrap long lines"}
        >
          <WrapText className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setLogPaused(!logPaused)}
          title={logPaused ? "Resume" : "Pause"}
        >
          {logPaused ? (
            <Play className="size-3" />
          ) : (
            <Pause className="size-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={copyLogs}
          title="Copy"
        >
          <Copy className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setDownloadOpen(true)}
          title="Download logs"
        >
          <Download className="size-3" />
        </Button>
        {flushProcessId != null && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleFlush}
            disabled={flushing}
            title="Flush logs"
          >
            {flushing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Eraser className="size-3" />
            )}
          </Button>
        )}
      </div>

      <div
        ref={logRef}
        className={`${scrollClassName} min-h-0 flex-1 overflow-auto font-mono text-xs leading-relaxed`}
      >
        {filteredLines.length === 0 && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No log entries yet.
          </div>
        )}
        <div
          className="relative w-full"
          style={{ height: rowVirtualizer.getTotalSize() }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const line = filteredLines[virtualRow.index]!;
            const timeMatch = line.text.match(
              /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/,
            );
            const timeStr = timeMatch?.[1]?.slice(11, 19) ?? "";
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
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                className="absolute left-0 top-0 flex w-full gap-2 border-b border-border/30 px-4 py-0.5"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
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
                <span
                  className={`min-w-0 flex-1 ${levelColor} ${
                    logWrap
                      ? "whitespace-pre-wrap [overflow-wrap:anywhere]"
                      : "truncate"
                  }`}
                >
                  {line.text}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span
            className={`size-1.5 rounded-full ${
              logPaused ? "bg-yellow-500" : "bg-green-500"
            }`}
          />
          {logPaused ? "Paused" : "Live"}
        </span>
        <span>
          {filteredLines.length === allLines.length
            ? `${allLines.length} lines`
            : `${filteredLines.length} / ${allLines.length} lines`}
        </span>
      </div>

      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download logs</DialogTitle>
            <DialogDescription>
              Choose what to include for{" "}
              <span className="font-medium text-foreground">{name}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <DownloadOption
              active={downloadMode === "visible"}
              onClick={() => setDownloadMode("visible")}
              title="Visible logs"
              description={`${filteredLines.length} lines currently shown (respects search and level filters)`}
            />
            <DownloadOption
              active={downloadMode === "all"}
              disabled={!isMonitored}
              onClick={() => setDownloadMode("all")}
              title="All stored logs"
              description={
                isMonitored
                  ? "Full history saved in the database"
                  : "Requires monitoring to be enabled"
              }
            />
            <DownloadOption
              active={downloadMode === "range"}
              disabled={!isMonitored}
              onClick={() => setDownloadMode("range")}
              title="By date range"
              description={
                isMonitored
                  ? "Stored logs between two dates"
                  : "Requires monitoring to be enabled"
              }
            />
          </div>
          {downloadMode === "range" && (
            <RangePicker
              from={rangeFrom}
              to={rangeTo}
              bounds={logBounds}
              onFrom={setRangeFrom}
              onTo={setRangeTo}
            />
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : (
                <Download className="mr-1 size-3" />
              )}
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
