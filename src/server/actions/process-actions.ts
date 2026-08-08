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
    // Detect log levels (same logic as logBus)
    const detectLevel = (text: string): string => {
      if (/"level"\s*:\s*"(?:error|fatal|critical)"/i.test(text)) return "error";
      if (/"level"\s*:\s*"warn(?:ing)?"/i.test(text)) return "warn";
      if (/"level"\s*:\s*"info"/i.test(text)) return "info";
      if (/"level"\s*:\s*"(?:debug|trace|verbose)"/i.test(text)) return "debug";
      if (/\[(?:error|fatal|crit(?:ical)?)\]|\((?:error|fatal|crit(?:ical)?)\)/i.test(text)) return "error";
      if (/\[warn(?:ing)?\]|\(warn(?:ing)?\)/i.test(text)) return "warn";
      if (/\[info\]|\(info\)/i.test(text)) return "info";
      if (/\[(?:debug|trace|verbose)\]|\((?:debug|trace|verbose)\)/i.test(text)) return "debug";
      if (/(?:^|[\s|])(?:ERROR|FATAL|CRITICAL|EXCEPTION|CRIT)(?:[:\s|]|$)/.test(text)) return "error";
      if (/(?:^|[\s|])WARN(?:ING)?(?:[:\s|]|$)/.test(text)) return "warn";
      if (/(?:^|[\s|])INFO(?:[:\s|]|$)/.test(text)) return "info";
      if (/(?:^|[\s|])(?:DEBUG|TRACE|VERBOSE)(?:[:\s|]|$)/.test(text)) return "debug";
      return "";
    };
    return lines.map((l) => ({ text: l.text, level: detectLevel(l.text) }));
  });
