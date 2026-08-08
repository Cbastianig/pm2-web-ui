import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowRight, Loader2, Lock, User, ShieldCheck, Activity, Sparkles } from "lucide-react";
import { loginFn } from "@/server/auth/functions";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function FeatureItem({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm">
        <Icon className="size-4 text-white/90" />
      </div>
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-white/60">{description}</p>
      </div>
    </div>
  );
}

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const login = useServerFn(loginFn);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await login({ data: { username, password } });
      if (result.ok) {
        navigate({ to: "/dashboard" });
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-mesh opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,oklch(0.6_0.22_264/0.25),transparent_60%)]" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.1fr_1fr]">
        {/* Branding panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[oklch(0.32_0.18_270)] via-[oklch(0.24_0.14_260)] to-[oklch(0.18_0.12_250)] p-10 lg:flex">
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, oklch(0.7 0.2 195 / 0.5) 0px, transparent 50%), radial-gradient(circle at 80% 70%, oklch(0.7 0.22 295 / 0.45) 0px, transparent 50%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(oklch(1 0 0) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />

          <div className="relative flex items-center gap-2.5">
            <AppLogo size="lg" withGlow={false} />
            <div>
              <p className="text-base font-semibold tracking-tight text-white">
                PM2 Process Web UI
              </p>
              <p className="text-xs text-white/60">Operations console</p>
            </div>
          </div>

          <div className="relative space-y-6">
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/80 backdrop-blur-sm">
                <Sparkles className="size-3" />
                Modern stack
              </div>
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
                Monitor and control your{" "}
                <span className="bg-gradient-to-r from-[oklch(0.85_0.18_255)] via-[oklch(0.82_0.18_195)] to-[oklch(0.78_0.2_295)] bg-clip-text text-transparent">
                  PM2 fleet
                </span>{" "}
                in real time.
              </h2>
              <p className="mt-3 text-sm text-white/70">
                Live metrics, structured logs, alerting and one-click actions across every node
                you manage.
              </p>
            </div>
            <div className="space-y-4">
              <FeatureItem
                icon={Activity}
                title="Real-time metrics"
                description="CPU, memory, restarts and uptime — streamed live."
              />
              <FeatureItem
                icon={ShieldCheck}
                title="Secure by default"
                description="Session-based auth, salted credentials, audit-friendly logs."
              />
              <FeatureItem
                icon={Sparkles}
                title="Zero-config setup"
                description="Drop-in for any PM2 process, ready in seconds."
              />
            </div>
          </div>

          <div className="relative flex items-center justify-between text-[11px] text-white/50">
            <span>v6.0.0</span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 animate-pulse rounded-full bg-[oklch(0.78_0.19_155)]" />
              All systems operational
            </span>
          </div>
        </div>

        {/* Form panel */}
        <div className="relative flex items-center justify-center p-8 sm:p-12">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
              <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-brand shadow-[0_8px_24px_-8px_oklch(0.6_0.22_264/0.6)] lg:hidden">
                <Activity className="size-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sign in to manage your processes
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="animate-slide-up rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm">
                  Username
                </Label>
                <div className="group relative">
                  <User
                    className={cn(
                      "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors",
                      "group-focus-within:text-primary",
                    )}
                  />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                    placeholder="admin"
                    className="h-10 pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm">
                  Password
                </Label>
                <div className="group relative">
                  <Lock
                    className={cn(
                      "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors",
                      "group-focus-within:text-primary",
                    )}
                  />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className="h-10 pl-9"
                  />
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="group/button w-full bg-gradient-brand text-primary-foreground shadow-[0_8px_24px_-8px_oklch(0.6_0.22_264/0.6)] hover:brightness-110"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="size-4 transition-transform group-hover/button:translate-x-0.5" />
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground lg:text-left">
              Credentials are configured in your <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">.env</code> file.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
