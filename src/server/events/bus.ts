import { EventEmitter } from "node:events";

export interface ProcessEvent {
  type: "processes";
  data: {
    items: any[];
    host: { cpu: number; ram: { used: number; total: number } } | null;
    generatedAt: number;
  };
}

export interface LogEvent {
  type: "logs";
  data: { text: string; level: string; processName: string };
}

export type AppEvent = ProcessEvent | LogEvent;

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(200);
