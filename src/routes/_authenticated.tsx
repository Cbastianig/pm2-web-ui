import { createFileRoute, Outlet, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { logoutFn } from "@/server/auth/functions";
import { checkSessionFn } from "@/server/auth/functions";
import { useEventSourceHost, useEventSourceConnection } from "@/hooks/useEventSource";
import { Activity, Settings, Rocket, Menu, X, Cpu, HardDrive, Disc } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const session = await checkSessionFn();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { username: session.username };
  },
  component: AuthLayout,
});

function formatBytes(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function HostMetricsBar() {
  const host = useEventSourceHost();

  if (!host) return null;

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Cpu className="size-3" />
        {host.cpuPercent.toFixed(0)}%
      </span>
      <span className="flex items-center gap-1">
        <HardDrive className="size-3" />
        {formatBytes(host.ramUsed)} / {formatBytes(host.ramTotal)}
      </span>
      {host.diskTotal > 0 && (
        <span className="flex items-center gap-1">
          <Disc className="size-3" />
          {formatBytes(host.diskUsed)} / {formatBytes(host.diskTotal)}
        </span>
      )}
    </div>
  );
}

function AuthLayout() {
  const logout = useServerFn(logoutFn);
  const navigate = useNavigate();
  const connected = useEventSourceConnection();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    try {
      await logout({ data: undefined });
    } catch {}
    navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-dvh">
      {/* Mobile trigger */}
      <button
        className="fixed left-4 top-4 z-50 rounded-md border border-border bg-background p-2 lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-background transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Activity className="size-5 text-accent" />
          <span className="text-sm font-semibold">pm2-process-web-ui</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <Activity className="size-4" /> Dashboard
          </Link>
          <Link
            to="/processes"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <Rocket className="size-4" /> Processes
          </Link>
          <Link
            to="/settings"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <Settings className="size-4" /> Settings
          </Link>
        </nav>

        <div className="border-t border-border p-3">
          <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-background/80 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-background px-6 py-2.5">
          <HostMetricsBar />
          <div className="ml-auto flex items-center gap-3">
            <Badge variant={connected ? "default" : "destructive"} className="text-xs">
              {connected ? "Live" : "Offline"}
            </Badge>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
