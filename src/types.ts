import type { ModelMessage } from "ai";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ChromeOperation = "describe" | "call" | "waitEvent" | "cdp";

export type ChromeToolInput = {
  operation: ChromeOperation;
  path?: string;
  args?: unknown[];
  receiver?: string;
  callbackMode?: "promise" | "callback";
  eventPath?: string;
  match?: unknown;
  action?: "attach" | "send" | "detach";
  tabId?: number;
  command?: string;
  params?: Record<string, unknown>;
  sessionId?: string;
};

export type ChromeToolMeta = Pick<
  ChromeToolInput,
  "operation" | "path" | "eventPath" | "action" | "command"
>;

export type ChromeToolOutput =
  | { ok: true; value: JsonValue }
  | { ok: false; error: { name: string; message: string; details?: JsonValue } };

export type ModelConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
};

export type ToolActivity = {
  id: string;
  toolName: string;
  meta: ChromeToolMeta;
  input: unknown;
  output?: unknown;
  error?: unknown;
  status: "running" | "complete" | "error";
};

export type TimelineItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "thinking"; text: string; status: "running" | "complete" }
  | { id: string; kind: "tool"; activity: ToolActivity };

export type AgentEvent =
  | { type: "run-start"; runId: string }
  | { type: "step-start"; stepNumber: number }
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "tool-call"; activity: ToolActivity }
  | { type: "tool-result"; activity: ToolActivity }
  | { type: "tool-error"; activity: ToolActivity }
  | { type: "step-finish"; stepNumber: number; finishReason: string }
  | { type: "run-finish"; finishReason: string }
  | { type: "run-abort" }
  | { type: "error"; error: unknown };

export type AgentRunResult = {
  messages: ModelMessage[];
  finishReason: string;
};
