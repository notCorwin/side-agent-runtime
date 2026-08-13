import { dynamicTool } from "ai";
import { z } from "zod";
import type { ChromeToolInput, ChromeToolMeta } from "../types";
import { ChromeBridge } from "./bridge";

const chromeCallArgsSchema = z.union([
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const chromeToolInputSchema = z.object({
  operation: z.enum(["describe", "call", "waitEvent", "cdp"]),
  path: z.string().optional(),
  // Most Chrome methods take one options object. Accept that natural model
  // shape as well as the explicit positional-argument array.
  args: chromeCallArgsSchema.optional(),
  receiver: z.string().optional(),
  callbackMode: z.enum(["promise", "callback"]).optional(),
  eventPath: z.string().optional(),
  match: z.unknown().optional(),
  action: z.enum(["attach", "send", "detach"]).optional(),
  tabId: z.number().optional(),
  command: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  sessionId: z.string().optional(),
}).passthrough();

export function parseChromeToolInput(input: unknown): ChromeToolInput {
  const candidate = typeof input === "string" ? JSON.parse(input) : input;
  const parsed = chromeToolInputSchema.parse(candidate);
  return {
    ...parsed,
    args: parsed.args === undefined || Array.isArray(parsed.args) ? parsed.args : [parsed.args],
  } as ChromeToolInput;
}

export function extractChromeToolMeta(input: unknown): ChromeToolMeta {
  const parsed = parseChromeToolInput(input);
  return {
    operation: parsed.operation,
    path: parsed.path,
    eventPath: parsed.eventPath,
    action: parsed.action,
    command: parsed.command,
  };
}

export function createChromeTool(bridge: ChromeBridge) {
  return dynamicTool({
    description: [
      "Use this single tool for all Chrome extension actions.",
      "Use operation=describe to discover APIs, call for chrome.* methods, waitEvent for Chrome events, and cdp for raw Chrome DevTools Protocol commands.",
      "For call, args may be one options object or an array of positional arguments; the bridge normalizes a single value into one argument.",
      "The bridge has no application allowlist, approval step, timeout, or output truncation.",
      "For arbitrary JavaScript in a tab, attach/send Runtime.evaluate through cdp.",
    ].join(" "),
    inputSchema: chromeToolInputSchema,
    needsApproval: false,
    execute: async (input, { abortSignal }) => bridge.execute(parseChromeToolInput(input), abortSignal),
  });
}
