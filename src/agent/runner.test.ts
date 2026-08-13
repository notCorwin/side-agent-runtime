import { describe, expect, it } from "vitest";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { ChromeBridge } from "../chrome/bridge";
import { runAgent } from "./runner";

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

describe("runAgent", () => {
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
    const events: string[] = [];
    const bridge = new ChromeBridge({ chromeApi: fakeChrome() });

    const result = await runAgent({
      messages: [{ role: "user", content: "run many calls" }],
      model: { baseURL: "https://example.com/v1", apiKey: "key", model: "test" },
      languageModel: model,
      bridge,
      onEvent: (event) => {
        if (event.type === "tool-result") events.push(event.type);
      },
    });

    expect(callCount).toBe(101);
    expect(events).toHaveLength(100);
    expect(result.finishReason).toBe("stop");
    expect(result.messages.length).toBeGreaterThan(1);
  });
});
