import { describe, expect, it } from "vitest";
import { extractChromeToolMeta, parseChromeToolInput } from "./tool";

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

  it("extracts only the title metadata from a complete tool input", () => {
    expect(extractChromeToolMeta({
      operation: "cdp",
      action: "send",
      command: "Runtime.evaluate",
      tabId: 7,
      params: { expression: "document.title" },
    })).toMatchObject({
      operation: "cdp",
      action: "send",
      command: "Runtime.evaluate",
    });
  });

  it("extracts metadata from JSON-encoded tool input", () => {
    expect(extractChromeToolMeta(JSON.stringify({
      operation: "waitEvent",
      eventPath: "tabs.onUpdated",
    }))).toMatchObject({
      operation: "waitEvent",
      eventPath: "tabs.onUpdated",
    });
  });
});
