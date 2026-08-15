import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  restartProcess,
  stopProcess,
  startStoppedProcess,
  deleteProcess,
  flushLogs,
  loadProcessDetails,
  getProcessActions,
  triggerProcessAction,
  readLogLinesByName,
} from "@/server/pm2";
import { authMiddleware } from "@/server/auth/middleware";
import { detectLogLevel } from "@/server/events/logBus";

const auth = () => [authMiddleware];

export const restartProcessFn = createServerFn({ method: "POST" })
  .middleware(auth())
  .validator(z.object({ processId: z.union([z.string(), z.number()]) }))
  .handler(async ({ data }) => {
    await restartProcess(data.processId);
    return { ok: true };
  });

export const stopProcessFn = createServerFn({ method: "POST" })
  .middleware(auth())
  .validator(z.object({ processId: z.union([z.string(), z.number()]) }))
  .handler(async ({ data }) => {
    await stopProcess(data.processId);
    return { ok: true };
  });

export const startProcessFn = createServerFn({ method: "POST" })
  .middleware(auth())
  .validator(z.object({ processId: z.union([z.string(), z.number()]) }))
  .handler(async ({ data }) => {
    await startStoppedProcess(data.processId);
    return { ok: true };
  });

export const deleteProcessFn = createServerFn({ method: "POST" })
  .middleware(auth())
  .validator(
    z.object({
      processId: z.union([z.string(), z.number()]),
      withDeploy: z.boolean().optional().default(false),
    })
  )
  .handler(async ({ data }) => {
    await deleteProcess(data.processId);
    return { ok: true };
  });

export const flushLogsFn = createServerFn({ method: "POST" })
  .middleware(auth())
  .validator(z.object({ processId: z.union([z.string(), z.number()]) }))
  .handler(async ({ data }) => {
    await flushLogs(data.processId);
    return { ok: true };
  });

export const getProcessDetailsFn = createServerFn({ method: "GET" })
  .middleware(auth())
  .validator(z.object({ processId: z.union([z.string(), z.number()]) }))
  .handler(async ({ data }) => {
    return await loadProcessDetails(data.processId);
  });

export const getProcessActionsFn = createServerFn({ method: "GET" })
  .middleware(auth())
  .validator(z.object({ processId: z.union([z.string(), z.number()]) }))
  .handler(async ({ data }) => {
    return await getProcessActions(data.processId);
  });

export const triggerActionFn = createServerFn({ method: "POST" })
  .middleware(auth())
  .validator(
    z.object({
      processId: z.union([z.string(), z.number()]),
      actionName: z.string(),
      params: z.any().optional(),
    })
  )
  .handler(async ({ data }) => {
    await triggerProcessAction(data.processId, data.actionName, data.params);
    return { ok: true };
  });

export const readLogsFn = createServerFn({ method: "GET" })
  .middleware(auth())
  .validator(z.object({ pm2Name: z.string() }))
  .handler(async ({ data }) => {
    const lines = await readLogLinesByName(data.pm2Name);
    return lines.map((l) => ({ text: l.text, level: detectLogLevel(l.text) }));
  });
