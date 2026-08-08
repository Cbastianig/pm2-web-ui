import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiUrl } from "@/lib/basePath";

interface OpsConfigDialogProps {
  dirName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface ConfigForm {
  name: string;
  description: string;
  projectId: string;
  branch: string;
  blue: string;
  green: string;
  currentFile: string;
  healthEnabled: boolean;
  healthPath: string;
  healthPort: string;
  featuresGitlab: boolean;
  featuresHealthcheck: boolean;
  featuresDeployHistory: boolean;
}

function emptyForm(dirName: string): ConfigForm {
  return {
    name: dirName,
    description: "",
    projectId: "",
    branch: "main",
    blue: `${dirName}-blue`,
    green: `${dirName}-green`,
    currentFile: "./current",
    healthEnabled: true,
    healthPath: "/api/health",
    healthPort: "",
    featuresGitlab: true,
    featuresHealthcheck: true,
    featuresDeployHistory: true,
  };
}

function configToForm(config: any, dirName: string): ConfigForm {
  return {
    name: config.name ?? dirName,
    description: config.description ?? "",
    projectId:
      config.git?.projectId != null ? String(config.git.projectId) : "",
    branch: config.git?.branch ?? "main",
    blue: config.runtime?.blue ?? "",
    green: config.runtime?.green ?? "",
    currentFile: config.deployment?.currentFile ?? "./current",
    healthEnabled: config.healthcheck?.enabled ?? true,
    healthPath: config.healthcheck?.path ?? "/api/health",
    healthPort:
      config.healthcheck?.port != null ? String(config.healthcheck.port) : "",
    featuresGitlab: config.features?.gitlab ?? true,
    featuresHealthcheck: config.features?.healthcheck ?? true,
    featuresDeployHistory: config.features?.deployHistory ?? true,
  };
}

function formToConfig(form: ConfigForm) {
  return {
    name: form.name,
    description: form.description,
    provider: "gitlab",
    git: {
      projectId: Number(form.projectId),
      branch: form.branch,
    },
    runtime: {
      type: "pm2",
      blue: form.blue,
      green: form.green,
    },
    deployment: {
      strategy: "blue-green",
      currentFile: form.currentFile,
    },
    healthcheck: {
      enabled: form.healthEnabled,
      path: form.healthPath,
      ...(form.healthPort ? { port: Number(form.healthPort) } : {}),
    },
    features: {
      gitlab: form.featuresGitlab,
      healthcheck: form.featuresHealthcheck,
      deployHistory: form.featuresDeployHistory,
    },
  };
}

export function OpsConfigDialog({
  dirName,
  open,
  onOpenChange,
  onSaved,
}: OpsConfigDialogProps) {
  const [form, setForm] = useState<ConfigForm>(emptyForm(dirName));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setForm(emptyForm(dirName));
    fetch(apiUrl(`/api/ops/config?dirName=${encodeURIComponent(dirName)}`))
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && data.config)
          setForm(configToForm(data.config, dirName));
      })
      .catch(() => toast("Failed to load config"))
      .finally(() => setLoading(false));
  }, [open, dirName]);

  function set<K extends keyof ConfigForm>(key: K, value: ConfigForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/ops/config"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dirName, config: formToConfig(form) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      toast(`Config saved for ${form.name}`);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>ops.config.json · {dirName}</DialogTitle>
          <DialogDescription>
            Configure how this project is discovered and deployed. Changes are
            written to {dirName}/ops.config.json.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-accent" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-name">Name</Label>
              <Input
                id="cfg-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-desc">Description</Label>
              <Input
                id="cfg-desc"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>

            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Git
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cfg-project-id">GitLab project ID</Label>
                <Input
                  id="cfg-project-id"
                  type="number"
                  value={form.projectId}
                  onChange={(e) => set("projectId", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-branch">Branch</Label>
                <Input
                  id="cfg-branch"
                  value={form.branch}
                  onChange={(e) => set("branch", e.target.value)}
                />
              </div>
            </div>

            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Runtime
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cfg-blue">Blue PM2 name</Label>
                <Input
                  id="cfg-blue"
                  value={form.blue}
                  onChange={(e) => set("blue", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-green">Green PM2 name</Label>
                <Input
                  id="cfg-green"
                  value={form.green}
                  onChange={(e) => set("green", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-current">Current marker file</Label>
              <Input
                id="cfg-current"
                value={form.currentFile}
                onChange={(e) => set("currentFile", e.target.value)}
              />
            </div>

            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Healthcheck
            </p>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.healthEnabled}
                onCheckedChange={(v) => set("healthEnabled", v)}
                aria-label="Toggle healthcheck"
              />
              <Label>{form.healthEnabled ? "Enabled" : "Disabled"}</Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cfg-health-path">Path</Label>
                <Input
                  id="cfg-health-path"
                  value={form.healthPath}
                  onChange={(e) => set("healthPath", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-health-port">Port (optional)</Label>
                <Input
                  id="cfg-health-port"
                  type="number"
                  value={form.healthPort}
                  placeholder="auto"
                  onChange={(e) => set("healthPort", e.target.value)}
                />
              </div>
            </div>

            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Features
            </p>
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.featuresGitlab}
                  onCheckedChange={(v) => set("featuresGitlab", v)}
                  aria-label="GitLab integration"
                />
                <Label>GitLab integration</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.featuresHealthcheck}
                  onCheckedChange={(v) => set("featuresHealthcheck", v)}
                  aria-label="Healthcheck"
                />
                <Label>Healthcheck</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.featuresDeployHistory}
                  onCheckedChange={(v) => set("featuresDeployHistory", v)}
                  aria-label="Deploy history"
                />
                <Label>Deploy history</Label>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Saving..." : "Save Config"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
