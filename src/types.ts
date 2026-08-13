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
