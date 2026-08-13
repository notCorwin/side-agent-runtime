import {
  DirectChatTransport,
  type Agent,
  type ProviderMetadata,
  type UIMessageChunk,
} from "ai";
import { extractChromeToolMeta } from "../chrome/tool";
import type { ChromeToolMeta, JsonValue } from "../types";

export const CHROME_TOOL_METADATA_PROVIDER = "side-agent-runtime";
export const CHROME_TOOL_METADATA_KEY = "chromeToolMeta";

type ChromeToolMetadataObject = Record<string, JsonValue>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChromeOperation(value: unknown): value is ChromeToolMeta["operation"] {
  return value === "describe" || value === "call" || value === "waitEvent" || value === "cdp";
}

function isChromeAction(value: unknown): value is NonNullable<ChromeToolMeta["action"]> {
  return value === "attach" || value === "send" || value === "detach";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function createChromeToolProviderMetadata(input: unknown): ProviderMetadata | undefined {
  try {
    const meta = extractChromeToolMeta(input);
    const serialized: ChromeToolMetadataObject = { operation: meta.operation };

    if (meta.path !== undefined) serialized.path = meta.path;
    if (meta.eventPath !== undefined) serialized.eventPath = meta.eventPath;
    if (meta.action !== undefined) serialized.action = meta.action;
    if (meta.command !== undefined) serialized.command = meta.command;

    return {
      [CHROME_TOOL_METADATA_PROVIDER]: {
        [CHROME_TOOL_METADATA_KEY]: serialized,
      },
    };
  } catch {
    return undefined;
  }
}

export function readChromeToolMeta(providerMetadata: unknown): ChromeToolMeta | null {
  if (!isRecord(providerMetadata)) return null;

  const provider = providerMetadata[CHROME_TOOL_METADATA_PROVIDER];
  if (!isRecord(provider)) return null;

  const value = provider[CHROME_TOOL_METADATA_KEY];
  if (!isRecord(value) || !isChromeOperation(value.operation)) return null;

  const meta: ChromeToolMeta = { operation: value.operation };
  const path = optionalString(value.path);
  const eventPath = optionalString(value.eventPath);
  const action = isChromeAction(value.action) ? value.action : undefined;
  const command = optionalString(value.command);

  if (path !== undefined) meta.path = path;
  if (eventPath !== undefined) meta.eventPath = eventPath;
  if (action !== undefined) meta.action = action;
  if (command !== undefined) meta.command = command;

  return meta;
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
