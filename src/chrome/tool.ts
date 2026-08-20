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

type ChromeToolCandidate = z.infer<typeof chromeToolInputSchema>;

function parseCandidate(input: unknown): ChromeToolCandidate {
  const candidate = typeof input === "string" ? JSON.parse(input) : input;
  return chromeToolInputSchema.parse(candidate);
}

function validateChromeToolCandidate(input: ChromeToolCandidate): void {
  if (input.operation === "call" && !input.path) {
    throw new Error("call requires path");
  }
  if (input.operation === "waitEvent" && !input.eventPath) {
    throw new Error("waitEvent requires eventPath");
  }
  if (input.operation === "cdp") {
    if (typeof input.tabId !== "number") {
      throw new Error("cdp requires tabId");
    }
    if (input.action !== "attach" && input.action !== "detach" && !input.command) {
      throw new Error("cdp send requires command");
    }
  }
}

function normalizeArgs(args: ChromeToolCandidate["args"]): unknown[] {
  return args === undefined || Array.isArray(args) ? args ?? [] : [args];
}

export function parseChromeToolInput(input: unknown): ChromeToolInput {
  const parsed = parseCandidate(input);
  validateChromeToolCandidate(parsed);

  switch (parsed.operation) {
    case "describe":
      return {
        operation: "describe",
        ...(parsed.path === undefined ? {} : { path: parsed.path }),
      };
    case "call":
      return {
        operation: "call",
        path: parsed.path!,
        args: normalizeArgs(parsed.args),
        ...(parsed.receiver === undefined ? {} : { receiver: parsed.receiver }),
        ...(parsed.callbackMode === undefined ? {} : { callbackMode: parsed.callbackMode }),
      };
    case "waitEvent":
      return {
        operation: "waitEvent",
        eventPath: parsed.eventPath!,
        ...(parsed.match === undefined ? {} : { match: parsed.match }),
      };
    case "cdp":
      if (parsed.action === "attach") {
        return {
          operation: "cdp",
          action: "attach",
          tabId: parsed.tabId!,
          ...(parsed.sessionId === undefined ? {} : { sessionId: parsed.sessionId }),
        };
      }
      if (parsed.action === "detach") {
        return {
          operation: "cdp",
          action: "detach",
          tabId: parsed.tabId!,
          ...(parsed.sessionId === undefined ? {} : { sessionId: parsed.sessionId }),
        };
      }
      return {
        operation: "cdp",
        action: "send",
        tabId: parsed.tabId!,
        command: parsed.command!,
        ...(parsed.sessionId === undefined ? {} : { sessionId: parsed.sessionId }),
        ...(parsed.params === undefined ? {} : { params: parsed.params }),
      };
  }
}

export function extractChromeToolMeta(input: unknown): ChromeToolMeta {
  const parsed = parseCandidate(input);
  validateChromeToolCandidate(parsed);
  return {
    operation: parsed.operation,
    path: parsed.path,
    eventPath: parsed.eventPath,
    action: parsed.action,
    command: parsed.command,
  };
}

export function parseChromeToolMeta(value: unknown): ChromeToolMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  if (
    candidate.operation !== "describe" &&
    candidate.operation !== "call" &&
    candidate.operation !== "waitEvent" &&
    candidate.operation !== "cdp"
  ) {
    return null;
  }
  if (candidate.action !== undefined && !["attach", "send", "detach"].includes(String(candidate.action))) {
    return null;
  }
  if (candidate.path !== undefined && typeof candidate.path !== "string") return null;
  if (candidate.eventPath !== undefined && typeof candidate.eventPath !== "string") return null;
  if (candidate.command !== undefined && typeof candidate.command !== "string") return null;
  if (candidate.operation === "call" && !candidate.path) return null;
  if (candidate.operation === "waitEvent" && !candidate.eventPath) return null;
  if (candidate.operation === "cdp" && candidate.action !== "attach" && candidate.action !== "detach" && !candidate.command) {
    return null;
  }

  return {
    operation: candidate.operation,
    ...(candidate.path === undefined ? {} : { path: candidate.path }),
    ...(candidate.eventPath === undefined ? {} : { eventPath: candidate.eventPath }),
    ...(candidate.action === undefined ? {} : { action: candidate.action as ChromeToolMeta["action"] }),
    ...(candidate.command === undefined ? {} : { command: candidate.command }),
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
