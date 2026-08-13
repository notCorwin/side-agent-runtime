import { describe, expect, it } from "vitest";
import { formatModelDisplayName } from "./model-label";

describe("formatModelDisplayName", () => {
  it("removes provider and variant suffixes and title-cases hyphenated names", () => {
    expect(formatModelDisplayName("deepseek/deepseek-v4-flash-0731:free")).toBe("Deepseek V4 Flash 0731");
  });

  it("handles model IDs without a provider or variant", () => {
    expect(formatModelDisplayName("qwen3-32b")).toBe("Qwen3 32b");
  });

  it("returns an empty label for blank model IDs", () => {
    expect(formatModelDisplayName("   ")).toBe("");
  });
});
