import { isLoopFinished, ToolLoopAgent } from "ai";
import type { LanguageModel } from "ai";
import { createChromeTool } from "../chrome/tool";
import type { ModelConfig } from "../types";
import { ChromeBridge } from "../chrome/bridge";
import { createModel } from "./model";

export const DEFAULT_INSTRUCTIONS = [
  "You are a Chrome side-panel agent.",
  "Use the chrome tool for all browser actions and inspect the available API when needed.",
  "You may use raw Chrome APIs and CDP. Do not ask for application-level approval.",
  "This is Manifest V3: chrome.tabs.executeScript is not exposed. For packaged extension files or a real function use chrome.scripting.executeScript; for arbitrary source text in a tab use chrome.debugger CDP Runtime.evaluate instead.",
  "Return concise progress updates after actions and do not claim an action succeeded until its tool result confirms it.",
].join(" ");

export type CreateAgentOptions = {
  model: ModelConfig;
  bridge: ChromeBridge;
  languageModel?: LanguageModel;
  instructions?: string;
};

export function createAgent(options: CreateAgentOptions) {
  return new ToolLoopAgent({
    model: options.languageModel ?? createModel(options.model),
    instructions: options.instructions ?? DEFAULT_INSTRUCTIONS,
    tools: { chrome: createChromeTool(options.bridge) },
    // isLoopFinished() is explicitly a natural-termination condition and does not count steps.
    stopWhen: isLoopFinished(),
    // Avoid hidden retries; the user can stop and retry from the UI when the provider fails.
    maxRetries: 0,
  });
}
