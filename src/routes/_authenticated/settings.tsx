import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configuration and alerting preferences</p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="alerting">Alerting</TabsTrigger>
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
    fetch("/api/settings/general")
      .then((r) => r.json())
      .then((data) => setSettings(data.settings ?? {}))
      .catch(() => toast("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, string> = { ...settings };
      if (newPassword.trim()) body.authPassword = newPassword.trim();
      const res = await fetch("/api/settings/general", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: body }),
      });
      if (!res.ok) throw new Error("Save failed");
      setNewPassword("");
      toast("Settings saved. Restart required for changes to take effect.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="py-4 text-sm text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>General Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Changes are written to the .env file. A restart is required for runtime changes.
          </p>

          {Object.keys(settings).length === 0 && (
            <p className="text-sm text-muted-foreground">No .env file found.</p>
          )}

          {Object.entries(settings).map(([key, value]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`env-${key}`}>{key}</Label>
              <Input
                id={`env-${key}`}
                value={value}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
                autoComplete="off"
              />
            </div>
          ))}

          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="new-password">Change Password</Label>
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
        const res = await fetch("/api/alerting/test", {
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
        toast(r.ok ? `Webhook sent (HTTP ${r.status})` : `Failed: ${r.error}`);
      } catch (e) {
        toast(`Webhook test failed: ${e instanceof Error ? e.message : "error"}`);
      } finally { setWebhookTesting(false); }
    } else {
      setNtfyTesting(true);
      try {
        const res = await fetch("/api/alerting/test", {
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
        toast(r.ok ? `ntfy sent (HTTP ${r.status})` : `Failed: ${r.error}`);
      } catch (e) {
        toast(`ntfy test failed: ${e instanceof Error ? e.message : "error"}`);
      } finally { setNtfyTesting(false); }
    }
  }

  useEffect(() => {
    fetch("/api/alerting/settings")
      .then((r) => r.json())
      .then((data) => setSettings(data.settings ?? {}))
      .catch(() => toast("Failed to load settings"))
      .finally(() => setLoading(true));
  }, []);

  function set(key: string, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/alerting/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast("Alerting settings saved.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const mode = settings["alert.mode"] ?? "every";
  const throttleMin = settings["alert.throttleMinutes"] ?? "60";
  const webhookEnabled = settings["reporter.webhook.enabled"] === "1";
  const webhookUrl = settings["reporter.webhook.url"] ?? "";
  const ntfyEnabled = settings["reporter.ntfy.enabled"] === "1";
  const ntfyServerUrl = settings["reporter.ntfy.serverUrl"] ?? "https://ntfy.sh";
  const ntfyTopic = settings["reporter.ntfy.topic"] ?? "";
  const ntfyPriority = settings["reporter.ntfy.priority"] ?? "default";
  const ntfyToken = settings["reporter.ntfy.token"] ?? "";

  if (!loading) return <p className="py-4 text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>When to alert</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="alert-mode"
                checked={mode === "every"}
                onChange={() => set("alert.mode", "every")}
              />
              Alert on every match
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="alert-mode"
                checked={mode === "throttle"}
                onChange={() => set("alert.mode", "throttle")}
              />
              Alert once, then wait
            </label>
          </div>
          {mode === "throttle" && (
            <div className="flex items-center gap-2">
              <Input
                className="w-20"
                type="number"
                min="1"
                value={throttleMin}
                onChange={(e) => set("alert.throttleMinutes", e.target.value)}
              />
              <span className="text-sm text-muted-foreground">minutes before alerting again</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={webhookEnabled}
              onCheckedChange={(v) => set("reporter.webhook.enabled", v ? "1" : "0")}
            />
            <Label>{webhookEnabled ? "Enabled" : "Disabled"}</Label>
          </div>
          {webhookEnabled && (
            <div className="space-y-1.5">
              <Label htmlFor="wh-url">URL</Label>
              <Input
                id="wh-url"
                value={webhookUrl}
                placeholder="https://hooks.example.com/alert"
                onChange={(e) => set("reporter.webhook.url", e.target.value)}
              />
            </div>
          )}
          {webhookEnabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendTest("webhook")}
              disabled={webhookTesting || !webhookUrl}
            >
              {webhookTesting ? "Sending..." : "Send Test"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ntfy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={ntfyEnabled}
              onCheckedChange={(v) => set("reporter.ntfy.enabled", v ? "1" : "0")}
            />
            <Label>{ntfyEnabled ? "Enabled" : "Disabled"}</Label>
          </div>
          {ntfyEnabled && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ntfy-server">Server URL</Label>
                <Input
                  id="ntfy-server"
                  value={ntfyServerUrl}
                  onChange={(e) => set("reporter.ntfy.serverUrl", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ntfy-topic">Topic</Label>
                <Input
                  id="ntfy-topic"
                  value={ntfyTopic}
                  placeholder="my-alerts"
                  onChange={(e) => set("reporter.ntfy.topic", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ntfy-priority">Priority</Label>
                <Select
                  value={ntfyPriority}
                  onValueChange={(v) => set("reporter.ntfy.priority", v)}
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
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendTest("ntfy")}
                disabled={ntfyTesting || !ntfyTopic}
              >
                {ntfyTesting ? "Sending..." : "Send Test"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Alerting Settings"}
      </Button>
    </div>
  );
}
