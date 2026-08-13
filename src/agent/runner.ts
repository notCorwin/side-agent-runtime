import { isLoopFinished, ToolLoopAgent } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import { createChromeTool, extractChromeToolMeta } from "../chrome/tool";
import type { AgentEvent, AgentRunResult, ModelConfig, ToolActivity } from "../types";
import { ChromeBridge } from "../chrome/bridge";
import { createModel } from "./model";

const DEFAULT_INSTRUCTIONS = [
  "You are a Chrome side-panel agent.",
  "Use the chrome tool for all browser actions and inspect the available API when needed.",
  "You may use raw Chrome APIs and CDP. Do not ask for application-level approval.",
  "This is Manifest V3: chrome.tabs.executeScript is not exposed. For packaged extension files or a real function use chrome.scripting.executeScript; for arbitrary source text in a tab use chrome.debugger CDP Runtime.evaluate instead.",
  "Return concise progress updates after actions and do not claim an action succeeded until its tool result confirms it.",
].join(" ");

export type RunAgentOptions = {
  messages: ModelMessage[];
  model: ModelConfig;
  bridge: ChromeBridge;
  languageModel?: LanguageModel;
  signal?: AbortSignal;
  instructions?: string;
  onEvent?: (event: AgentEvent) => void;
};

function emit(options: RunAgentOptions, event: AgentEvent): void {
  options.onEvent?.(event);
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export async function runAgent(options: RunAgentOptions): Promise<AgentRunResult> {
  const runId = crypto.randomUUID();
  emit(options, { type: "run-start", runId });

  const chromeTool = createChromeTool(options.bridge);
  const agent = new ToolLoopAgent({
    model: options.languageModel ?? createModel(options.model),
    instructions: options.instructions ?? DEFAULT_INSTRUCTIONS,
    tools: { chrome: chromeTool },
    // isLoopFinished() is explicitly a natural-termination condition and does not count steps.
    stopWhen: isLoopFinished(),
    // Avoid hidden retries; the user can stop and retry from the UI when the provider fails.
    maxRetries: 0,
  });

  try {
    const result = await agent.stream({
      messages: options.messages,
      abortSignal: options.signal,
    });
    let stepNumber = 0;

    for await (const part of result.stream) {
      switch (part.type) {
        case "start-step":
          emit(options, { type: "step-start", stepNumber });
          break;
        case "text-delta":
          emit(options, { type: "text-delta", text: part.text });
          break;
        case "reasoning-delta":
          emit(options, { type: "reasoning-delta", text: part.text });
          break;
        case "tool-call": {
          const activity: ToolActivity = {
            id: part.toolCallId,
            toolName: part.toolName,
            meta: extractChromeToolMeta(part.input),
            input: part.input,
            status: "running",
          };
          emit(options, { type: "tool-call", activity });
          break;
        }
        case "tool-result": {
          const activity: ToolActivity = {
            id: part.toolCallId,
            toolName: part.toolName,
            meta: extractChromeToolMeta(part.input),
            input: part.input,
            output: part.output,
            status: "complete",
          };
          emit(options, { type: "tool-result", activity });
          break;
        }
        case "tool-error": {
          const activity: ToolActivity = {
            id: part.toolCallId,
            toolName: part.toolName,
            meta: extractChromeToolMeta(part.input),
            input: part.input,
            error: part.error,
            status: "error",
          };
          emit(options, { type: "tool-error", activity });
          break;
        }
        case "finish-step":
          emit(options, {
            type: "step-finish",
            stepNumber,
            finishReason: part.finishReason,
          });
          stepNumber += 1;
          break;
        case "finish":
          emit(options, { type: "run-finish", finishReason: part.finishReason });
          break;
        case "abort":
          emit(options, { type: "run-abort" });
          break;
        case "error":
          emit(options, { type: "error", error: part.error });
          break;
        default:
          break;
      }
    }

    const [responseMessages, finishReason] = await Promise.all([
      result.responseMessages,
      result.finishReason,
    ]);

    return {
      messages: [...options.messages, ...responseMessages],
      finishReason,
    };
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      emit(options, { type: "run-abort" });
    } else {
      emit(options, { type: "error", error });
    }
    throw asError(error);
  }
}
