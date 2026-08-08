import { useServerFn } from "@tanstack/react-start";
import { flushLogsFn, readLogsFn } from "@/server/actions/process-actions";
import { getStoredLogsFn } from "@/server/actions/monitoring-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { apiUrl } from "@/lib/basePath";
import {
  Search,
  Pause,
  Play,
  Copy,
  Download,
  Eraser,
  Loader2,
} from "lucide-react";

interface ProcessLogsProps {
  name: string;
  isMonitored: boolean;
  flushProcessId?: string | number | null;
  scrollClassName?: string;
}

export function ProcessLogs({
  name,
  isMonitored,
  flushProcessId,
  scrollClassName = "min-h-[420px]",
}: ProcessLogsProps) {
  const flushLogs = useServerFn(flushLogsFn);
  const getStoredLogs = useServerFn(getStoredLogsFn);
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
  const [logFilters, setLogFilters] = useState<Set<string>>(
    new Set(["info", "warn", "error"]),
  );
  const [flushing, setFlushing] = useState(false);
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
    a.download = `${name}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLines, name]);

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
          onClick={downloadLogs}
          title="Download"
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
        {filteredLines.map((line, i) => {
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
    </div>
  );
}
