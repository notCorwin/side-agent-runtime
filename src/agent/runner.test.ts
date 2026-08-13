import { describe, expect, it } from "vitest";
import { DirectChatTransport, type UIMessage } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { ChromeBridge } from "../chrome/bridge";
import { createAgent } from "./runner";

function usage() {
  return {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
}

function fakeChrome() {
  return {
    runtime: {},
    permissions: { getAll: async () => ({ permissions: ["tabs"], origins: [] }) },
    tabs: { query: async () => [{ id: 1, title: "test" }] },
  } as never;
}

type ChromeUIMessage = UIMessage<unknown, never, { chrome: { input: unknown; output: unknown } }>;

function inputMessage(text = "run many calls"): ChromeUIMessage {
  return {
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

async function readChunks(stream: ReadableStream<unknown>): Promise<Array<{ type: string; [key: string]: unknown }>> {
  const reader = stream.getReader();
  const chunks: Array<{ type: string; [key: string]: unknown }> = [];
  while (true) {
    const next = await reader.read();
    if (next.done) return chunks;
    chunks.push(next.value as { type: string; [key: string]: unknown });
  }
}

const agentOptions = {
  model: { baseURL: "https://example.com/v1", apiKey: "key", model: "test" },
};

describe("createAgent", () => {
  it("continues beyond the SDK's default 20-step limit until natural completion", async () => {
    let callCount = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        callCount += 1;
        const isFinal = callCount > 100;
        const chunks = isFinal
          ? [
              { type: "stream-start" as const, warnings: [] },
              { type: "text-start" as const, id: "text" },
              { type: "text-delta" as const, id: "text", delta: "finished" },
              { type: "text-end" as const, id: "text" },
              { type: "finish" as const, finishReason: { unified: "stop" as const, raw: "stop" }, usage: usage() },
            ]
          : [
              { type: "stream-start" as const, warnings: [] },
              {
                type: "tool-call" as const,
                toolCallId: `call-${callCount}`,
                toolName: "chrome",
                dynamic: true,
                input: JSON.stringify({ operation: "call", path: "tabs.query", args: [] }),
              },
              { type: "finish" as const, finishReason: { unified: "tool-calls" as const, raw: "tool_calls" }, usage: usage() },
            ];
        return { stream: simulateReadableStream({ chunks: chunks as any[] }) };
      },
    });
    const bridge = new ChromeBridge({ chromeApi: fakeChrome() });
    const agent = createAgent({ ...agentOptions, languageModel: model, bridge });
    const result = await agent.stream({
      prompt: [{ role: "user", content: "run many calls" }],
    });
    let toolResultCount = 0;
    for await (const part of result.stream) {
      if (part.type === "tool-result") toolResultCount += 1;
    }

    expect(callCount).toBe(101);
    expect(toolResultCount).toBe(100);
    expect(await result.finishReason).toBe("stop");
  });
});

describe("DirectChatTransport", () => {
  it("converts text, reasoning, tool calls, and tool results into UIMessage chunks", async () => {
    let callCount = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        callCount += 1;
        const chunks = callCount === 1
          ? [
              { type: "stream-start" as const, warnings: [] },
              { type: "reasoning-start" as const, id: "reasoning" },
              { type: "reasoning-delta" as const, id: "reasoning", delta: "先查看标签页。" },
              { type: "reasoning-end" as const, id: "reasoning" },
              {
                type: "tool-call" as const,
                toolCallId: "call-tabs",
                toolName: "chrome",
                dynamic: true,
                input: JSON.stringify({ operation: "call", path: "tabs.query", args: [] }),
              },
              { type: "finish" as const, finishReason: { unified: "tool-calls" as const, raw: "tool_calls" }, usage: usage() },
            ]
          : [
              { type: "stream-start" as const, warnings: [] },
              { type: "text-start" as const, id: "text" },
              { type: "text-delta" as const, id: "text", delta: "## 已完成\n\n找到了标签页。" },
              { type: "text-end" as const, id: "text" },
              { type: "finish" as const, finishReason: { unified: "stop" as const, raw: "stop" }, usage: usage() },
            ];
        return { stream: simulateReadableStream({ chunks: chunks as any[] }) };
      },
    });
    const bridge = new ChromeBridge({ chromeApi: fakeChrome() });
    const agent = createAgent({ ...agentOptions, languageModel: model, bridge });
    const transport = new DirectChatTransport({ agent });
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [inputMessage("inspect tabs")],
      abortSignal: undefined,
    });
    const chunks = await readChunks(stream);
    const types = chunks.map((chunk) => chunk.type);

    expect(types).toContain("reasoning-delta");
    expect(types.some((type) => type === "tool-input-available" || type === "tool-input-start")).toBe(true);
    expect(types.some((type) => type === "tool-output-available" || type === "tool-output-error")).toBe(true);
    expect(types).toContain("text-delta");
    expect(chunks.some((chunk) => chunk.type === "text-delta" && String(chunk.delta).includes("## 已完成"))).toBe(true);
  });

  it("passes cancellation to the in-process agent and does not support reconnect", async () => {
    const model = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => {
        await new Promise<void>((resolve, reject) => {
          if (abortSignal?.aborted) {
            reject(new DOMException("Operation aborted", "AbortError"));
            return;
          }
          abortSignal?.addEventListener("abort", () => reject(new DOMException("Operation aborted", "AbortError")), { once: true });
          setTimeout(resolve, 5000);
        });
        return { stream: simulateReadableStream({ chunks: [] }) };
      },
    });
    const bridge = new ChromeBridge({ chromeApi: fakeChrome() });
    const agent = createAgent({ ...agentOptions, languageModel: model, bridge });
    const transport = new DirectChatTransport({ agent });
    const controller = new AbortController();
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [inputMessage("cancel")],
      abortSignal: controller.signal,
    });
    controller.abort();

    let cancelled = false;
    try {
      const chunks = await readChunks(stream);
      cancelled = chunks.some((chunk) => chunk.type === "abort" || chunk.type === "error");
    } catch {
      cancelled = true;
    }
    expect(cancelled).toBe(true);
    await expect(transport.reconnectToStream({ chatId: "chat-1" })).resolves.toBeNull();
  });
});
