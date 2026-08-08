import { z } from "zod";

export const OpsConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.number().default(1),
  name: z.string().min(1),
  description: z.string().default(""),
  provider: z.enum(["gitlab"]).default("gitlab"),
  git: z.object({
    projectId: z.number(),
    branch: z.string().default("main"),
  }),
  runtime: z.object({
    type: z.enum(["pm2"]).default("pm2"),
    blue: z.string().min(1),
    green: z.string().min(1),
  }),
  deployment: z.object({
    strategy: z.enum(["blue-green"]).default("blue-green"),
    currentFile: z.string().default("./current"),
  }),
  healthcheck: z.object({
    enabled: z.boolean().default(true),
    path: z.string().default("/api/health"),
    port: z.number().optional(),
  }),
  features: z.object({
    gitlab: z.boolean().default(true),
    healthcheck: z.boolean().default(true),
    deployHistory: z.boolean().default(true),
  }),
});

export type OpsConfig = z.infer<typeof OpsConfigSchema>;
