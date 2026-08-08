import { createFileRoute, Outlet, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { logoutFn } from "@/server/auth/functions";
import { checkSessionFn } from "@/server/auth/functions";
import { useEventSourceHost, useEventSourceConnection } from "@/hooks/useEventSource";
import { Activity, Settings, Rocket, Menu, X, Cpu, HardDrive, Disc, LayoutDashboard, ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

const SIDEBAR_STORAGE_KEY = "pm2-webui-sidebar-collapsed";

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

function SidebarLink({
  to,
  icon: Icon,
  label,
  collapsed,
  onNavigate,
}: {
  to: string;
  icon: typeof Activity;
  label: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-md py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground",
        collapsed ? "justify-center px-0" : "px-3",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

function AuthLayout() {
  const logout = useServerFn(logoutFn);
  const navigate = useNavigate();
  const connected = useEventSourceConnection();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

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
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-background transition-all duration-200 lg:static lg:translate-x-0",
          collapsed ? "w-16" : "w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Activity className="size-5 shrink-0 text-accent" />
            {!collapsed && (
              <span className="truncate text-sm font-semibold whitespace-nowrap">
                pm2-process-web-ui
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden shrink-0 lg:inline-flex"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {!collapsed && (
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Processes
            </p>
          )}
          <SidebarLink
            to="/dashboard"
            icon={Activity}
            label="Dashboard"
            collapsed={collapsed}
            onNavigate={() => setSidebarOpen(false)}
          />
          <SidebarLink
            to="/processes"
            icon={Rocket}
            label="Process List"
            collapsed={collapsed}
            onNavigate={() => setSidebarOpen(false)}
          />

          {!collapsed && (
            <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Operations
            </p>
          )}
          <SidebarLink
            to="/ops"
            icon={LayoutDashboard}
            label="Applications"
            collapsed={collapsed}
            onNavigate={() => setSidebarOpen(false)}
          />

          <div className="mt-auto" />
          <SidebarLink
            to="/settings"
            icon={Settings}
            label="Settings"
            collapsed={collapsed}
            onNavigate={() => setSidebarOpen(false)}
          />
        </nav>

        <div className="border-t border-border p-3">
          <Button
            variant="ghost"
            className={cn(
              "w-full text-muted-foreground",
              collapsed ? "justify-center px-0" : "justify-start",
            )}
            onClick={handleLogout}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut className="size-4 shrink-0" />
            {!collapsed && "Sign out"}
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
