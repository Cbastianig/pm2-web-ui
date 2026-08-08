import type { ApplicationSnapshot } from "../types";

export interface OpsApplicationsEvent {
  type: "ops:applications";
  data: ApplicationSnapshot[];
}

export interface OpsApplicationDetailEvent {
  type: "ops:application-detail";
  data: ApplicationSnapshot;
}

export interface OpsLogEvent {
  type: "ops:logs";
  data: {
    appName: string;
    text: string;
    level: string;
    source: "runtime" | "health" | "deployment" | "gitlab";
  };
}

export type OpsEvent =
  | OpsApplicationsEvent
  | OpsApplicationDetailEvent
  | OpsLogEvent;
