import { describe, expect, it } from "vitest";
import {
  MODEL_CONFIG_STORAGE_KEY,
  isCompleteModelConfig,
  clearModelConfig,
  loadModelConfig,
  saveModelConfig,
  type StorageAreaLike,
} from "./config";

function memoryStorage(): StorageAreaLike & { value?: unknown } {
  const storage: StorageAreaLike & { value?: unknown } = {
    value: undefined,
    async get() {
      return { [MODEL_CONFIG_STORAGE_KEY]: storage.value };
    },
    async set(items) {
      storage.value = (items as Record<string, unknown>)[MODEL_CONFIG_STORAGE_KEY];
    },
    async remove() {
      storage.value = undefined;
    },
  };
  return storage;
}

describe("model config persistence", () => {
  it("recognizes complete configuration without trimming the API key", () => {
    expect(isCompleteModelConfig({ baseURL: " https://provider.test/v1 ", model: " model ", apiKey: " key " })).toBe(true);
    expect(isCompleteModelConfig({ baseURL: "", model: "model", apiKey: "key" })).toBe(false);
  });

  it("saves the three fields and loads them back", async () => {
    const storage = memoryStorage();
    const config = {
      baseURL: " https://provider.test/v1 ",
      model: " model-id ",
      apiKey: "secret-key",
    };

    await saveModelConfig(config, storage);
    await expect(loadModelConfig({ baseURL: "fallback", model: "fallback", apiKey: "fallback" }, storage))
      .resolves.toEqual({ baseURL: "https://provider.test/v1", model: "model-id", apiKey: "secret-key" });
  });

  it("clears the persisted configuration", async () => {
    const storage = memoryStorage();
    await saveModelConfig({ baseURL: "https://provider.test/v1", model: "model-id", apiKey: "secret-key" }, storage);
    await clearModelConfig(storage);
    await expect(loadModelConfig({ baseURL: "", model: "", apiKey: "" }, storage))
      .resolves.toEqual({ baseURL: "", model: "", apiKey: "" });
  });
});
