import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { ModelConfig } from "../types";

export function createModel(config: ModelConfig): LanguageModel {
  if (!config.baseURL.trim()) throw new Error("Model base URL is required");
  if (!config.apiKey.trim()) throw new Error("Model API key is required");
  if (!config.model.trim()) throw new Error("Model id is required");

  const provider = createOpenAICompatible({
    name: "side-agent-provider",
    baseURL: config.baseURL.replace(/\/+$/, ""),
    apiKey: config.apiKey,
    headers: config.headers,
  });

  return provider.languageModel(config.model);
}
