import type {
  CommitInfo,
  PipelineInfo,
  HealthStatus,
  Environment,
} from "../providers/types";

export interface Application {
  name: string;
  description: string;
  appPath: string;
  provider: "gitlab";
  projectId: number;
  branch: string;
  runtimeType: "pm2";
  blueName: string;
  greenName: string;
  strategy: "blue-green";
  currentFile: string;
  healthEnabled: boolean;
  healthPath: string;
  healthPort?: number;
  features: {
    gitlab: boolean;
    healthcheck: boolean;
    deployHistory: boolean;
  };
}

export interface ApplicationSnapshot {
  app: Application;
  blue: Environment;
  green: Environment;
  current: "blue" | "green" | "unknown";
  gitlabPipeline: PipelineInfo | null;
  lastRelease: {
    commit: CommitInfo;
    deployedAt: number;
    environment: string;
  } | null;
  health: HealthStatus | null;
  collectedAt: number;
}

export interface ReleaseRecord {
  id?: number;
  appName: string;
  commit: string;
  branch: string;
  pipelineId: number | null;
  pipelineStatus: string | null;
  pipelineDuration: number | null;
  author: string;
  date: string;
  environment: string;
  deployedAt: number;
}
