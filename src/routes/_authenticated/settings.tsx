import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import {
  Settings as SettingsIcon,
  FileCog,
  Bell,
  KeyRound,
  Loader2,
  Save,
  Send,
  Webhook,
  Hash,
} from "lucide-react";
import { toast } from "sonner";
import { apiUrl } from "@/lib/basePath";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configuration and alerting preferences"
        icon={<SettingsIcon />}
      />
      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="general">
            <FileCog /> General
          </TabsTrigger>
          <TabsTrigger value="alerting">
            <Bell /> Alerting
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralSettingsTab />
        </TabsContent>
        <TabsContent value="alerting">
          <AlertingSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    fetch(apiUrl("/api/settings/general"))
      .then((r) => r.json())
      .then((data) => setSettings(data.settings ?? {}))
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, string> = { ...settings };
      if (newPassword.trim()) body.authPassword = newPassword.trim();
      const res = await fetch(apiUrl("/api/settings/general"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: body }),
      });
      if (!res.ok) throw new Error("Save failed");
      setNewPassword("");
      toast.success(
        "Settings saved. Restart required for changes to take effect.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading settings...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>General Settings</CardTitle>
        <CardDescription>
          Changes are written to the{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
            .env
          </code>{" "}
          file. A restart is required for runtime changes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-5">
          {Object.keys(settings).length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              No .env file found.
            </div>
          )}
          {Object.entries(settings).map(([key, value]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`env-${key}`} className="font-mono text-xs">
                {key}
              </Label>
              <Input
                id={`env-${key}`}
                value={value}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, [key]: e.target.value }))
                }
                autoComplete="off"
                className="font-mono"
              />
            </div>
          ))}
          {Object.keys(settings).length > 0 && <Separator />}
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="flex items-center gap-1.5">
              <KeyRound className="size-3.5" /> Change Password
            </Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              placeholder="Leave blank to keep current"
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              A new salt and hash will be derived automatically.
            </p>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Save className="size-3" />
            )}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AlertingSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [ntfyTesting, setNtfyTesting] = useState(false);

  async function sendTest(type: "webhook" | "ntfy") {
    if (type === "webhook") {
      setWebhookTesting(true);
      try {
        const res = await fetch(apiUrl("/api/alerting/test"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "webhook",
            url: settings["reporter.webhook.url"] || "",
            headers: JSON.parse(settings["reporter.webhook.headers"] || "[]"),
            bodyParams: JSON.parse(settings["reporter.webhook.body"] || "[]"),
          }),
        });
        const r = await res.json();
        if (r.ok) toast.success(`Webhook sent (HTTP ${r.status})`);
        else toast.error(`Failed: ${r.error}`);
      } catch (e) {
        toast.error(
          `Webhook test failed: ${e instanceof Error ? e.message : "error"}`,
        );
      } finally {
        setWebhookTesting(false);
      }
    } else {
      setNtfyTesting(true);
      try {
        const res = await fetch(apiUrl("/api/alerting/test"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ntfy",
            serverUrl: settings["reporter.ntfy.serverUrl"] || "https://ntfy.sh",
            topic: settings["reporter.ntfy.topic"] || "",
            priority: settings["reporter.ntfy.priority"] || "default",
            token: settings["reporter.ntfy.token"] || "",
          }),
        });
        const r = await res.json();
        if (r.ok) toast.success(`ntfy sent (HTTP ${r.status})`);
        else toast.error(`Failed: ${r.error}`);
      } catch (e) {
        toast.error(
          `ntfy test failed: ${e instanceof Error ? e.message : "error"}`,
        );
      } finally {
        setNtfyTesting(false);
      }
    }
  }

  useEffect(() => {
    fetch(apiUrl("/api/alerting/settings"))
      .then((r) => r.json())
      .then((data) => setSettings(data.settings ?? {}))
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(true));
  }, []);

  function set(key: string, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/alerting/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Alerting settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const mode = settings["alert.mode"] ?? "every";
  const throttleMin = settings["alert.throttleMinutes"] ?? "60";
  const webhookEnabled = settings["reporter.webhook.enabled"] === "1";
  const webhookUrl = settings["reporter.webhook.url"] ?? "";
  const ntfyEnabled = settings["reporter.ntfy.enabled"] === "1";
  const ntfyServerUrl =
    settings["reporter.ntfy.serverUrl"] ?? "https://ntfy.sh";
  const ntfyTopic = settings["reporter.ntfy.topic"] ?? "";
  const ntfyPriority = settings["reporter.ntfy.priority"] ?? "default";
  const ntfyToken = settings["reporter.ntfy.token"] ?? "";

  if (loading && Object.keys(settings).length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading settings...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>When to alert</CardTitle>
          <CardDescription>
            Control how often alerts are dispatched.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <ModeOption
              active={mode === "every"}
              title="Alert on every match"
              description="Send a notification each time a matching event fires."
              onClick={() => set("alert.mode", "every")}
            />
            <ModeOption
              active={mode === "throttle"}
              title="Alert once, then wait"
              description="Throttle notifications to avoid alert fatigue."
              onClick={() => set("alert.mode", "throttle")}
            />
          </div>
          {mode === "throttle" && (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <Input
                className="w-20"
                type="number"
                min="1"
                value={throttleMin}
                onChange={(e) => set("alert.throttleMinutes", e.target.value)}
              />
              <span className="text-sm text-muted-foreground">
                minutes before alerting again
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Webhook className="size-4 text-[oklch(0.85_0.18_255)]" />
              Webhook
            </CardTitle>
            <CardDescription>Send alerts to any HTTP endpoint.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">
              {webhookEnabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              checked={webhookEnabled}
              onCheckedChange={(v) =>
                set("reporter.webhook.enabled", v ? "1" : "0")
              }
            />
          </div>
        </CardHeader>
        {webhookEnabled && (
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wh-url">URL</Label>
              <Input
                id="wh-url"
                value={webhookUrl}
                placeholder="https://hooks.example.com/alert"
                onChange={(e) => set("reporter.webhook.url", e.target.value)}
                className="font-mono"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendTest("webhook")}
              disabled={webhookTesting || !webhookUrl}
            >
              {webhookTesting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Send className="size-3" />
              )}
              {webhookTesting ? "Sending..." : "Send Test"}
            </Button>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Hash className="size-4 text-[oklch(0.82_0.2_295)]" />
              ntfy
            </CardTitle>
            <CardDescription>
              Push alerts via the ntfy.sh service.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">
              {ntfyEnabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              checked={ntfyEnabled}
              onCheckedChange={(v) =>
                set("reporter.ntfy.enabled", v ? "1" : "0")
              }
            />
          </div>
        </CardHeader>
        {ntfyEnabled && (
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ntfy-server">Server URL</Label>
              <Input
                id="ntfy-server"
                value={ntfyServerUrl}
                onChange={(e) => set("reporter.ntfy.serverUrl", e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ntfy-topic">Topic</Label>
              <Input
                id="ntfy-topic"
                value={ntfyTopic}
                placeholder="my-alerts"
                onChange={(e) => set("reporter.ntfy.topic", e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ntfy-priority">Priority</Label>
              <Select
                value={ntfyPriority}
                onValueChange={(v) => set("reporter.ntfy.priority", v ?? "")}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="min">min</SelectItem>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="default">default</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                  <SelectItem value="urgent">urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ntfy-token">Auth token (optional)</Label>
              <Input
                id="ntfy-token"
                type="password"
                value={ntfyToken}
                placeholder="tk_..."
                onChange={(e) => set("reporter.ntfy.token", e.target.value)}
                autoComplete="off"
                className="font-mono"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendTest("ntfy")}
              disabled={ntfyTesting || !ntfyTopic}
            >
              {ntfyTesting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Send className="size-3" />
              )}
              {ntfyTesting ? "Sending..." : "Send Test"}
            </Button>
          </CardContent>
        )}
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Save className="size-3" />
          )}
          {saving ? "Saving..." : "Save Alerting Settings"}
        </Button>
      </div>
    </div>
  );
}

function ModeOption({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-all",
        active
          ? "border-[oklch(0.72_0.18_255/0.5)] bg-gradient-to-br from-[oklch(0.6_0.22_264/0.12)] to-transparent shadow-[0_4px_14px_-6px_oklch(0.6_0.22_264/0.4)]"
          : "border-border/60 bg-card/40 hover:border-border hover:bg-accent/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-4 items-center justify-center rounded-full border-2 transition-colors",
            active
              ? "border-[oklch(0.72_0.18_255)] bg-[oklch(0.72_0.18_255)]"
              : "border-border",
          )}
        >
          {active && <span className="size-1.5 rounded-full bg-white" />}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="pl-6 text-xs text-muted-foreground">{description}</p>
    </button>
  );
}
