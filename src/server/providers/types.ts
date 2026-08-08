export interface ProcessInfo {
  name: string;
  pid: number | null;
  status: string;
  cpu: number;
  memory: number;
  uptime: number | null;
  restarts: number;
  env: Record<string, string>;
  cwd: string | null;
  scriptPath: string | null;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  branch: string;
  author: string;
  message: string;
  date: string;
}

export interface PipelineInfo {
  id: number;
  status: "running" | "pending" | "success" | "failed" | "canceled" | "skipped";
  ref: string;
  sha: string;
  webUrl: string;
  createdAt: string;
  updatedAt: string;
  duration: number | null;
  author: string;
}

export interface ReleaseInfo {
  commit: CommitInfo;
  pipeline: PipelineInfo | null;
  deployedAt: string;
  environment: string;
  healthStatus: "healthy" | "unhealthy" | "unknown";
}

export interface HealthStatus {
  ok: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  checkedAt: number;
  error?: string;
}

export interface Environment {
  name: string;
  color: "blue" | "green";
  active: boolean;
  runtime: ProcessInfo | null;
  commit: CommitInfo | null;
  health: HealthStatus | null;
  port: number | null;
}

export interface RuntimeProvider {
  name: "pm2";
  getProcess(pm2Name: string): Promise<ProcessInfo | null>;
  getEnv(pm2Name: string): Promise<Record<string, string>>;
}

export interface GitLabProvider {
  name: "gitlab";
  getProject(projectId: number): Promise<{ name: string; webUrl: string } | null>;
  getLastPipeline(projectId: number, branch: string): Promise<PipelineInfo | null>;
  getCommit(projectId: number, sha: string): Promise<CommitInfo | null>;
  getBranch(projectId: number, branch: string): Promise<{ name: string } | null>;
}

export interface DeploymentProvider {
  name: "blue-green";
  getEnvironments(config: {
    blueName: string;
    greenName: string;
    currentFile: string;
    appPath: string;
  }): Promise<Environment[]>;
}

export interface HealthProvider {
  name: "http";
  check(url: string): Promise<HealthStatus>;
}
