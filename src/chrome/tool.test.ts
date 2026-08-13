import { describe, expect, it } from "vitest";
import { parseChromeToolInput } from "./tool";

describe("Chrome tool input", () => {
  it("normalizes a single options object into one API argument", () => {
    expect(parseChromeToolInput({
      operation: "call",
      path: "sidePanel.open",
      args: { tabId: 7 },
    })).toMatchObject({
      operation: "call",
      path: "sidePanel.open",
      args: [{ tabId: 7 }],
    });
  });

  it("preserves explicit positional argument arrays", () => {
    expect(parseChromeToolInput({
      operation: "call",
      path: "tabs.query",
      args: [{ active: true }, "extra"],
    }).args).toEqual([{ active: true }, "extra"]);
  });
});
