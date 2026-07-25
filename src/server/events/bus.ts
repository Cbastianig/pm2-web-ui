import { EventEmitter } from "node:events";

export interface ProcessEvent {
  type: "processes";
  data: {
    items: any[];
    host: { cpu: number; ram: { used: number; total: number } } | null;
    generatedAt: number;
  };
}

export interface ProcessUpdateEvent {
  type: "process-update";
  data: any;
}

export interface LogEvent {
  type: "logs";
  data: { text: string; level: string; processName: string };
}

export interface DeployEvent {
  type: "deploy";
  data: { deploymentId: string; stage: string; line: string; status: string };
}

export type AppEvent =
  | ProcessEvent
  | ProcessUpdateEvent
  | LogEvent
  | DeployEvent;

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(200);
