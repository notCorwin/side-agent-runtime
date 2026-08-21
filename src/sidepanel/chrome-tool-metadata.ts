import {
  DirectChatTransport,
  type Agent,
  type ProviderMetadata,
  type UIMessageChunk,
} from "ai";
import { parseChromeToolInput } from "../chrome/tool";
import type { ChromeToolMeta, ChromeToolInput, JsonValue } from "../types";

export const CHROME_TOOL_METADATA_PROVIDER = "side-agent-runtime";
export const CHROME_TOOL_METADATA_KEY = "chromeToolMeta";

type ChromeToolMetadataObject = Record<string, JsonValue>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Display title of a Chrome command: the four identifying fields of the parsed
// command, nothing else. Derived by projection — never re-parsed.
function chromeCommandMeta(command: ChromeToolInput): ChromeToolMeta {
  return {
    operation: command.operation,
    path: command.operation === "describe" || command.operation === "call" ? command.path : undefined,
    eventPath: command.operation === "waitEvent" ? command.eventPath : undefined,
    action: command.operation === "cdp" ? command.action : undefined,
    command: command.operation === "cdp" && command.action === "send" ? command.command : undefined,
  };
}

export function createChromeToolProviderMetadata(input: unknown): ProviderMetadata | undefined {
  let meta: ChromeToolMeta;
  try {
    meta = chromeCommandMeta(parseChromeToolInput(input));
  } catch {
    return undefined;
  }

  const serialized = Object.fromEntries(
    Object.entries(meta).filter(([, value]) => value !== undefined),
  ) as ChromeToolMetadataObject;

  return {
    [CHROME_TOOL_METADATA_PROVIDER]: {
      [CHROME_TOOL_METADATA_KEY]: serialized,
    },
  };
}

const OPERATIONS = new Set(["describe", "call", "waitEvent", "cdp"]);
const CDP_ACTIONS = new Set(["attach", "send", "detach"]);

export function readChromeToolMeta(providerMetadata: unknown): ChromeToolMeta | null {
  if (!isRecord(providerMetadata)) return null;

  const provider = providerMetadata[CHROME_TOOL_METADATA_PROVIDER];
  const value = isRecord(provider) ? provider[CHROME_TOOL_METADATA_KEY] : undefined;
  if (!isRecord(value) || typeof value.operation !== "string" || !OPERATIONS.has(value.operation)) return null;
  for (const key of ["path", "eventPath", "action", "command"]) {
    if (value[key] !== undefined && typeof value[key] !== "string") return null;
  }

  const meta = value as unknown as ChromeToolMeta;
  if (meta.action !== undefined && !CDP_ACTIONS.has(meta.action)) return null;
  if (meta.operation === "call" && !meta.path) return null;
  if (meta.operation === "waitEvent" && !meta.eventPath) return null;
  if (meta.operation === "cdp" && meta.action !== "attach" && meta.action !== "detach" && !meta.command) return null;
  // ponytail: guards metadata we serialized ourselves this session; round-trip
  // through parseChromeToolInput instead if it ever crosses a persistence boundary.
  return meta;
}

export function formatToolLabel(meta: ChromeToolMeta): string {
  switch (meta.operation) {
    case "call":
      return meta.path?.trim() || "call";
    case "describe": {
      const path = meta.path?.trim();
      return path ? `describe · ${path}` : "describe";
    }
    case "waitEvent": {
      const eventPath = meta.eventPath?.trim();
      return eventPath ? `waitEvent · ${eventPath}` : "waitEvent";
    }
    case "cdp": {
      const command = meta.command?.trim();
      if (command) return `cdp · ${meta.action ?? "send"} · ${command}`;
      return meta.action ? `cdp · ${meta.action}` : "cdp";
    }
  }
}

function attachProviderMetadata(
  chunk: UIMessageChunk,
  providerMetadata: ProviderMetadata,
): UIMessageChunk {
  const existing = (chunk as { providerMetadata?: ProviderMetadata }).providerMetadata;
  return {
    ...chunk,
    providerMetadata: {
      ...existing,
      ...providerMetadata,
    },
  } as UIMessageChunk;
}

export function enrichChromeToolStream(
  stream: ReadableStream<UIMessageChunk>,
): ReadableStream<UIMessageChunk> {
  const metadataByToolCall = new Map<string, ProviderMetadata>();

  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (
          (chunk.type === "tool-input-available" || chunk.type === "tool-input-error") &&
          chunk.toolName === "chrome"
        ) {
          const providerMetadata = createChromeToolProviderMetadata(chunk.input);
          if (providerMetadata) {
            if (chunk.type === "tool-input-available") {
              metadataByToolCall.set(chunk.toolCallId, providerMetadata);
            }
            controller.enqueue(attachProviderMetadata(chunk, providerMetadata));
            return;
          }
        }

        if (chunk.type === "tool-output-available" || chunk.type === "tool-output-error") {
          const providerMetadata = metadataByToolCall.get(chunk.toolCallId);
          if (providerMetadata) {
            controller.enqueue(attachProviderMetadata(chunk, providerMetadata));
            if (chunk.type === "tool-output-error" || !chunk.preliminary) {
              metadataByToolCall.delete(chunk.toolCallId);
            }
            return;
          }
        }

        controller.enqueue(chunk);
      },
      flush() {
        metadataByToolCall.clear();
      },
    }),
  );
}

export function createChromeChatTransport(agent: Agent<any, any, any, any>) {
  const direct = new DirectChatTransport({
    agent,
    onError: (error) => error instanceof Error ? error.message : String(error),
  });

  return {
    sendMessages: async (options: Parameters<typeof direct.sendMessages>[0]) => (
      enrichChromeToolStream(await direct.sendMessages(options))
    ),
    reconnectToStream: async (options: Parameters<typeof direct.reconnectToStream>[0]) => {
      const stream = await direct.reconnectToStream(options);
      return stream ? enrichChromeToolStream(stream) : null;
    },
  };
}
