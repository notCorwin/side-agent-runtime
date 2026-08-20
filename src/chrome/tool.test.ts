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
    const parsed = parseChromeToolInput({
      operation: "call",
      path: "tabs.query",
      args: [{ active: true }, "extra"],
    });
    if (parsed.operation !== "call") throw new Error("Expected a call command");
    expect(parsed.args).toEqual([{ active: true }, "extra"]);
  });

  it("normalizes operation-specific fields and drops unknown fields", () => {
    expect(parseChromeToolInput({
      operation: "call",
      path: "tabs.query",
      args: { active: true },
      unknownField: "ignored",
    })).toEqual({
      operation: "call",
      path: "tabs.query",
      args: [{ active: true }],
    });

    expect(parseChromeToolInput({
      operation: "cdp",
      tabId: 7,
      command: "Runtime.evaluate",
    })).toEqual({
      operation: "cdp",
      action: "send",
      tabId: 7,
      command: "Runtime.evaluate",
    });
  });

  it("normalizes each operation shape", () => {
    expect(parseChromeToolInput({ operation: "describe", path: "tabs" })).toEqual({
      operation: "describe",
      path: "tabs",
    });
    expect(parseChromeToolInput(JSON.stringify({
      operation: "call",
      path: "tabs.query",
      args: { active: true },
    }))).toEqual({
      operation: "call",
      path: "tabs.query",
      args: [{ active: true }],
    });
    expect(parseChromeToolInput({
      operation: "waitEvent",
      eventPath: "tabs.onUpdated",
      match: { tabId: 7 },
    })).toEqual({
      operation: "waitEvent",
      eventPath: "tabs.onUpdated",
      match: { tabId: 7 },
    });
    expect(parseChromeToolInput({
      operation: "cdp",
      action: "attach",
      tabId: 7,
    })).toEqual({
      operation: "cdp",
      action: "attach",
      tabId: 7,
    });
  });

  it.each([
    [{ operation: "call" }, "call requires path"],
    [{ operation: "waitEvent" }, "waitEvent requires eventPath"],
    [{ operation: "cdp", action: "send", tabId: 7 }, "cdp send requires command"],
    [{ operation: "cdp", action: "attach" }, "cdp requires tabId"],
  ])("rejects incomplete command shapes: %o", (input, message) => {
    expect(() => parseChromeToolInput(input)).toThrow(message);
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

  it("preserves an omitted CDP action in display metadata", () => {
    expect(extractChromeToolMeta({
      operation: "cdp",
      tabId: 7,
      command: "Runtime.evaluate",
    })).toMatchObject({
      operation: "cdp",
      action: undefined,
      command: "Runtime.evaluate",
    });
  });
});
