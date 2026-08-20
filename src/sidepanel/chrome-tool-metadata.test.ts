import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";
import {
  CHROME_TOOL_METADATA_KEY,
  CHROME_TOOL_METADATA_PROVIDER,
  createChromeToolProviderMetadata,
  enrichChromeToolStream,
  readChromeToolMeta,
} from "./chrome-tool-metadata";

async function readChunks(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const reader = stream.getReader();
  const chunks: UIMessageChunk[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) return chunks;
    chunks.push(next.value);
  }
}

function inputChunk(
  toolCallId: string,
  input: unknown,
  toolName = "chrome",
): UIMessageChunk {
  return {
    type: "tool-input-available",
    toolCallId,
    toolName,
    dynamic: true,
    input,
  };
}

function providerMetadataOf(chunk: UIMessageChunk): unknown {
  return (chunk as { providerMetadata?: unknown }).providerMetadata;
}

describe("Chrome tool stream metadata", () => {
  it.each([
    [{ operation: "call", path: "tabs.query", args: [{}], tabId: 7 }, { operation: "call", path: "tabs.query" }],
    [{ operation: "describe", path: "tabs", args: [{ includePermissions: true }] }, { operation: "describe", path: "tabs" }],
    [{ operation: "waitEvent", eventPath: "tabs.onUpdated", match: { tabId: 7 } }, { operation: "waitEvent", eventPath: "tabs.onUpdated" }],
    [{ operation: "cdp", action: "send", command: "Runtime.evaluate", tabId: 7, params: { expression: "document.title" } }, { operation: "cdp", action: "send", command: "Runtime.evaluate" }],
  ])("keeps only fixed metadata fields for %o", (input, expected) => {
    const providerMetadata = createChromeToolProviderMetadata(input);
    expect(readChromeToolMeta(providerMetadata)).toEqual(expected);

    const serialized = providerMetadata?.[CHROME_TOOL_METADATA_PROVIDER]?.[CHROME_TOOL_METADATA_KEY];
    expect(serialized).toEqual(expected);
    expect(serialized).not.toHaveProperty("args");
    expect(serialized).not.toHaveProperty("tabId");
    expect(serialized).not.toHaveProperty("params");
    expect(serialized).not.toHaveProperty("match");
  });

  it("does not create metadata for incomplete or invalid input", () => {
    expect(createChromeToolProviderMetadata({ path: "tabs.query" })).toBeUndefined();
    expect(createChromeToolProviderMetadata({ operation: "call" })).toBeUndefined();
    expect(createChromeToolProviderMetadata({ operation: "cdp", command: "Runtime.evaluate" })).toBeUndefined();
    expect(readChromeToolMeta({
      [CHROME_TOOL_METADATA_PROVIDER]: {
        [CHROME_TOOL_METADATA_KEY]: { operation: "not-an-operation" },
      },
    })).toBeNull();
    expect(readChromeToolMeta({
      [CHROME_TOOL_METADATA_PROVIDER]: {
        [CHROME_TOOL_METADATA_KEY]: { operation: "call" },
      },
    })).toBeNull();
    expect(readChromeToolMeta({
      [CHROME_TOOL_METADATA_PROVIDER]: {
        [CHROME_TOOL_METADATA_KEY]: { operation: "cdp", action: "send" },
      },
    })).toBeNull();
  });

  it("passes metadata from a tool input event to its result and error events", async () => {
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue(inputChunk("success", { operation: "call", path: "tabs.query" }));
        controller.enqueue({
          type: "tool-output-available",
          toolCallId: "success",
          output: { ok: true },
          preliminary: true,
        });
        controller.enqueue({
          type: "tool-output-available",
          toolCallId: "success",
          output: { ok: true },
        });
        controller.enqueue(inputChunk("failure", {
          operation: "cdp",
          action: "send",
          tabId: 7,
          command: "Runtime.evaluate",
        }));
        controller.enqueue({
          type: "tool-output-error",
          toolCallId: "failure",
          errorText: "failed",
        });
        controller.enqueue(inputChunk("other", { operation: "call", path: "tabs.query" }, "other"));
        controller.close();
      },
    });

    const chunks = await readChunks(enrichChromeToolStream(stream));
    const successResults = chunks.filter(
      (chunk) => chunk.type === "tool-output-available" && chunk.toolCallId === "success",
    );
    const failureResult = chunks.find(
      (chunk) => chunk.type === "tool-output-error" && chunk.toolCallId === "failure",
    );
    const otherInput = chunks.find(
      (chunk) => chunk.type === "tool-input-available" && chunk.toolCallId === "other",
    );

    expect(successResults).toHaveLength(2);
    expect(successResults.every((chunk) => readChromeToolMeta(providerMetadataOf(chunk))?.path === "tabs.query")).toBe(true);
    expect(failureResult && readChromeToolMeta(providerMetadataOf(failureResult))).toEqual({
      operation: "cdp",
      action: "send",
      command: "Runtime.evaluate",
    });
    expect(otherInput && providerMetadataOf(otherInput)).toBeUndefined();
  });

  it("merges canonical metadata without discarding existing provider metadata", async () => {
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({
          ...inputChunk("merge", { operation: "call", path: "tabs.query" }),
          providerMetadata: { existing: { keep: true } },
        } as UIMessageChunk);
        controller.close();
      },
    });

    const [chunk] = await readChunks(enrichChromeToolStream(stream));
    expect(providerMetadataOf(chunk)).toMatchObject({
      existing: { keep: true },
      [CHROME_TOOL_METADATA_PROVIDER]: {
        [CHROME_TOOL_METADATA_KEY]: { operation: "call", path: "tabs.query" },
      },
    });
  });
});
