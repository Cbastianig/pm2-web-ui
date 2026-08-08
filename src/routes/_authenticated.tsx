import {
  createFileRoute,
  Outlet,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { logoutFn } from "@/server/auth/functions";
import { checkSessionFn } from "@/server/auth/functions";
import {
  useEventSourceHost,
  useEventSourceConnection,
} from "@/hooks/useEventSource";
import {
  Activity,
  Settings,
  Rocket,
  Menu,
  X,
  Cpu,
  HardDrive,
  Disc,
  LayoutDashboard,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLogo } from "@/components/app-logo";
import { StatusDot } from "@/components/status-dot";
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

function MetricChip({
  icon: Icon,
  value,
  color = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  color?: "default" | "brand" | "success" | "warning";
}) {
  const colorClass = {
    default: "text-muted-foreground",
    brand: "text-[oklch(0.85_0.18_255)]",
    success: "text-[oklch(0.85_0.19_155)]",
    warning: "text-[oklch(0.88_0.17_75)]",
  }[color];

  return (
    <div className="group flex items-center gap-1.5 rounded-md border border-border/40 bg-card/30 px-2 py-1 text-xs transition-colors hover:border-border hover:bg-card/60">
      <Icon className={cn("size-3", colorClass)} />
      <span className="font-medium tabular-nums text-foreground/90">
        {value}
      </span>
    </div>
  );
}

function HostMetricsBar() {
  const host = useEventSourceHost();

  if (!host) return null;

  const cpuColor =
    host.cpuPercent > 80
      ? "warning"
      : host.cpuPercent > 50
        ? "brand"
        : "success";

  return (
    <div className="flex items-center gap-1.5">
      <MetricChip
        icon={Cpu}
        value={`${host.cpuPercent.toFixed(0)}%`}
        color={cpuColor}
      />
      <MetricChip
        icon={HardDrive}
        value={`${formatBytes(host.ramUsed)} / ${formatBytes(host.ramTotal)}`}
        color="brand"
      />
      {host.diskTotal > 0 && (
        <MetricChip
          icon={Disc}
          value={`${formatBytes(host.diskUsed)} / ${formatBytes(host.diskTotal)}`}
          color="default"
        />
      )}
    </div>
  );
}

function SidebarLink({
  to,
  icon: Icon,
  label,
  badge,
  collapsed,
  onNavigate,
}: {
  to: string;
  icon: typeof Activity;
  label: string;
  badge?: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium text-muted-foreground transition-all duration-200",
        "hover:bg-accent/60 hover:text-foreground",
        collapsed ? "justify-center px-0" : "px-2.5",
        "[&.active]:bg-gradient-to-r [&.active]:from-[oklch(0.6_0.22_264/0.18)] [&.active]:to-[oklch(0.6_0.22_264/0.04)]",
        "[&.active]:text-foreground [&.active]:shadow-[inset_1px_0_0_0_oklch(0.72_0.18_255/0.6)]",
      )}
    >
      <Icon className="size-4 shrink-0 transition-transform group-hover:scale-110 [&.active]:text-[oklch(0.78_0.18_255)]" />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && badge && (
        <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
          {badge}
        </span>
      )}
    </Link>
  );
}

function SidebarSection({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  if (collapsed) {
    return <div className="mt-3 space-y-1 first:mt-0">{children}</div>;
  }
  return (
    <div className="mt-3 space-y-1 first:mt-0">
      <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
        {label}
      </p>
      {children}
    </div>
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
        className="fixed left-4 top-4 z-50 rounded-lg border border-border/60 bg-card/80 p-2 shadow-lg backdrop-blur-md lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar/95 transition-all duration-300 ease-out lg:static lg:translate-x-0",
          "backdrop-blur-xl",
          collapsed ? "w-[68px]" : "w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-sidebar-border/60 px-3 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <AppLogo size={collapsed ? "sm" : "default"} />
            {!collapsed && (
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold tracking-tight">
                  pm2-process-web-ui
                </span>
                <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                  <Sparkles className="size-2.5" />
                  v6 dashboard
                </span>
              </div>
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
            {collapsed ? (
              <ChevronsRight className="size-4" />
            ) : (
              <ChevronsLeft className="size-4" />
            )}
          </Button>
        </div>

        <nav className="flex flex-1 flex-col overflow-y-auto p-3">
          <SidebarSection label="Processes" collapsed={collapsed}>
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
          </SidebarSection>

          <SidebarSection label="Operations" collapsed={collapsed}>
            <SidebarLink
              to="/ops"
              icon={LayoutDashboard}
              label="Applications"
              collapsed={collapsed}
              onNavigate={() => setSidebarOpen(false)}
            />
          </SidebarSection>

          <div className="mt-auto" />

          <SidebarSection label="System" collapsed={collapsed}>
            <SidebarLink
              to="/settings"
              icon={Settings}
              label="Settings"
              collapsed={collapsed}
              onNavigate={() => setSidebarOpen(false)}
            />
          </SidebarSection>
        </nav>

        <div className="border-t border-sidebar-border/60 p-3">
          <Button
            variant="ghost"
            className={cn(
              "w-full text-muted-foreground hover:text-foreground",
              collapsed ? "justify-center px-0" : "justify-start",
            )}
            onClick={handleLogout}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut className="size-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </Button>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border/60 bg-background/70 px-4 py-2.5 backdrop-blur-xl sm:px-6">
          <HostMetricsBar />
          <div className="ml-auto flex items-center gap-3">
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                connected
                  ? "border-[oklch(0.78_0.19_155/0.4)] bg-[oklch(0.78_0.19_155/0.08)] text-[oklch(0.85_0.19_155)]"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              <StatusDot
                variant={connected ? "online" : "error"}
                size="sm"
                pulse={connected}
              />
              <span>{connected ? "Live" : "Offline"}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
