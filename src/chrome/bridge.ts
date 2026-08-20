import type { ChromeToolInput, ChromeToolOutput, JsonValue } from "../types";
import { HandleStore, resolveHandles, serializeError, serializeValue } from "./serializer";

type ChromeEvent = {
  addListener(listener: (...args: unknown[]) => void): void;
  removeListener(listener: (...args: unknown[]) => void): void;
};

type DebuggerSession = {
  tabId: number;
  sessionId?: string;
};

type ChromeRuntime = typeof chrome & {
  runtime?: typeof chrome.runtime;
};

export type ChromeBridgeOptions = {
  chromeApi?: ChromeRuntime;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Operation aborted", "AbortError");
}

function resolvePath(root: unknown, path: string): { owner: any; key: string; value: any } {
  const segments = path.split(".").filter(Boolean);
  if (!segments.length) throw new Error("Chrome API path cannot be empty");

  let owner: any = root;
  for (const segment of segments.slice(0, -1)) {
    if (owner == null || !(segment in owner)) {
      throw new Error(`Chrome API path not found: ${path}`);
    }
    owner = owner[segment];
  }

  const key = segments.at(-1)!;
  if (owner == null || !(key in owner)) throw new Error(`Chrome API path not found: ${path}`);
  return { owner, key, value: owner[key] };
}

function isPartialMatch(actual: unknown, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && expected.length <= actual.length
      && expected.every((item, index) => isPartialMatch(actual[index], item));
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") return false;
    return Object.entries(expected).every(([key, value]) =>
      isPartialMatch((actual as Record<string, unknown>)[key], value),
    );
  }
  return false;
}

function normalizeArguments(args: unknown[], handles: HandleStore): unknown[] {
  return (args ?? []).map((arg) => resolveHandles(arg, handles));
}

export class ChromeBridge {
  readonly handles = new HandleStore();

  private readonly chromeApi: ChromeRuntime;
  private readonly debuggerSessions = new Map<number, DebuggerSession>();
  private readonly pendingWaits = new Set<() => void>();
  private disposed = false;

  constructor(options: ChromeBridgeOptions = {}) {
    this.chromeApi = options.chromeApi ?? (globalThis.chrome as ChromeRuntime);
    if (!this.chromeApi) throw new Error("Chrome extension APIs are unavailable");
  }

  async execute(input: ChromeToolInput, signal?: AbortSignal): Promise<ChromeToolOutput> {
    if (this.disposed) return this.failure("BridgeDisposedError", "Chrome bridge has been disposed");
    try {
      throwIfAborted(signal);
      let value: unknown;
      switch (input.operation) {
        case "describe":
          value = await this.describe(input.path);
          break;
        case "call":
          value = await this.call(input, signal);
          break;
        case "waitEvent":
          value = await this.waitEvent(input, signal);
          break;
        case "cdp":
          value = await this.cdp(input, signal);
          break;
        default:
          throw new Error("Unsupported Chrome operation");
      }
      return { ok: true, value: serializeValue(value, this.handles) };
    } catch (error) {
      if (isAbortError(error)) throw error;
      return this.failure(
        error instanceof Error ? error.name : "ChromeBridgeError",
        error instanceof Error ? error.message : String(error),
        serializeError(error, this.handles),
      );
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const cancel of this.pendingWaits) cancel();
    this.pendingWaits.clear();

    const debuggerApi = (this.chromeApi as any).debugger;
    if (debuggerApi?.detach) {
      for (const session of this.debuggerSessions.values()) {
        void Promise.resolve(debuggerApi.detach(session)).catch(() => undefined);
      }
    }
    this.debuggerSessions.clear();
    this.handles.clear();
  }

  private failure(name: string, message: string, details?: JsonValue): ChromeToolOutput {
    return { ok: false, error: { name, message, details } };
  }

  private async describe(path?: string): Promise<unknown> {
    const root = path ? resolvePath(this.chromeApi, path).value : this.chromeApi;
    const value = asObject(root);
    const properties = Object.getOwnPropertyNames(value).map((name) => {
      const item = value[name];
      const kind = typeof item === "function"
        ? "method"
        : item && typeof item === "object" && typeof (item as ChromeEvent).addListener === "function"
          ? "event"
          : item && typeof item === "object"
            ? "namespace"
            : typeof item;
      return { name, kind };
    });

    let permissions: unknown = undefined;
    const permissionsApi = (this.chromeApi as any).permissions;
    if (permissionsApi?.getAll) permissions = await permissionsApi.getAll();

    return { path: path ?? "chrome", properties, permissions, handles: this.handles.describe() };
  }

  private async call(input: Extract<ChromeToolInput, { operation: "call" }>, signal?: AbortSignal): Promise<unknown> {
    if (!input.path) throw new Error("call requires path");
    const receiver = input.receiver ? this.handles.resolve(input.receiver) : this.chromeApi;
    const { owner, value } = resolvePath(receiver, input.path);
    if (typeof value !== "function") throw new Error(`Chrome API path is not callable: ${input.path}`);
    const args = normalizeArguments(input.args, this.handles);
    throwIfAborted(signal);

    if (input.callbackMode === "callback") {
      return this.callWithCallback(owner, value, args, signal);
    }

    const result = value.apply(owner, args);
    return result && typeof result.then === "function" ? await result : result;
  }

  private callWithCallback(
    owner: unknown,
    method: (...args: unknown[]) => unknown,
    args: unknown[],
    signal?: AbortSignal,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (!settled) {
          settled = true;
          reject(new DOMException("Operation aborted", "AbortError"));
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const callback = (...values: unknown[]) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        const lastError = (this.chromeApi as any).runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message || "Chrome API callback failed"));
          return;
        }
        resolve(values.length <= 1 ? values[0] : values);
      };

      try {
        method.apply(owner, [...args, callback]);
      } catch (error) {
        if (!settled) {
          settled = true;
          signal?.removeEventListener("abort", onAbort);
          reject(error);
        }
      }
    });
  }

  private waitEvent(input: Extract<ChromeToolInput, { operation: "waitEvent" }>, signal?: AbortSignal): Promise<unknown> {
    if (!input.eventPath) throw new Error("waitEvent requires eventPath");
    const event = resolvePath(this.chromeApi, input.eventPath).value as ChromeEvent;
    if (!event || typeof event.addListener !== "function" || typeof event.removeListener !== "function") {
      throw new Error(`Path is not a Chrome Event: ${input.eventPath}`);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        event.removeListener(listener);
        this.pendingWaits.delete(cancel);
        signal?.removeEventListener("abort", onAbort);
      };
      const cancel = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new DOMException("Operation aborted", "AbortError"));
      };
      const onAbort = () => {
        cancel();
      };
      const listener = (...args: unknown[]) => {
        if (settled || !isPartialMatch(args, input.match)) return;
        settled = true;
        cleanup();
        resolve(args.length <= 1 ? args[0] : args);
      };

      this.pendingWaits.add(cancel);
      event.addListener(listener);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  }

  private async cdp(input: Extract<ChromeToolInput, { operation: "cdp" }>, signal?: AbortSignal): Promise<unknown> {
    if (typeof input.tabId !== "number") throw new Error("cdp requires tabId");
    const debuggerApi = (this.chromeApi as any).debugger;
    if (!debuggerApi) throw new Error("chrome.debugger is unavailable or not permitted");
    const session: DebuggerSession = { tabId: input.tabId, ...(input.sessionId ? { sessionId: input.sessionId } : {}) };

    if (input.action === "attach") {
      await debuggerApi.attach({ tabId: input.tabId }, "1.3");
      this.debuggerSessions.set(input.tabId, session);
      return { attached: true, ...session };
    }

    if (input.action === "detach") {
      await debuggerApi.detach(session);
      this.debuggerSessions.delete(input.tabId);
      return { detached: true, ...session };
    }

    if (!input.command) throw new Error("cdp send requires command");
    throwIfAborted(signal);
    if (!this.debuggerSessions.has(input.tabId)) {
      await debuggerApi.attach({ tabId: input.tabId }, "1.3");
      this.debuggerSessions.set(input.tabId, {
        tabId: input.tabId,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      });
    }
    const activeSession: DebuggerSession = {
      ...this.debuggerSessions.get(input.tabId)!,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    };
    if (input.params === undefined) {
      return debuggerApi.sendCommand(activeSession, input.command);
    }

    const params = resolveHandles(input.params, this.handles);
    return debuggerApi.sendCommand(activeSession, input.command, params);
  }
}
