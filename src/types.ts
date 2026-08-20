export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ChromeOperation = "describe" | "call" | "waitEvent" | "cdp";

export type ChromeToolMeta = {
  operation: ChromeOperation;
  path?: string;
  eventPath?: string;
  action?: "attach" | "send" | "detach";
  command?: string;
};

type ChromeDescribeInput = {
  operation: "describe";
  path?: string;
};

type ChromeCallInput = {
  operation: "call";
  path: string;
  args: unknown[];
  receiver?: string;
  callbackMode?: "promise" | "callback";
};

type ChromeWaitEventInput = {
  operation: "waitEvent";
  eventPath: string;
  match?: unknown;
};

type ChromeCdpBase = {
  operation: "cdp";
  tabId: number;
  sessionId?: string;
};

type ChromeCdpInput =
  | (ChromeCdpBase & { action: "attach" })
  | (ChromeCdpBase & { action: "detach" })
  | (ChromeCdpBase & {
    action: "send";
    command: string;
    params?: Record<string, unknown>;
  });

export type ChromeToolInput =
  | ChromeDescribeInput
  | ChromeCallInput
  | ChromeWaitEventInput
  | ChromeCdpInput;

export type ChromeToolOutput =
  | { ok: true; value: JsonValue }
  | { ok: false; error: { name: string; message: string; details?: JsonValue } };

export type ModelConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
};
