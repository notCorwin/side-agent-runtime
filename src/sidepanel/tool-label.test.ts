import { describe, expect, it } from "vitest";
import { formatToolLabel } from "./tool-label";

describe("formatToolLabel", () => {
  it("keeps call labels concise by showing path", () => {
    expect(formatToolLabel({ operation: "call", path: "tabs.query" })).toBe("tabs.query");
  });

  it("adds the namespace path to describe labels", () => {
    expect(formatToolLabel({ operation: "describe", path: "tabs" })).toBe("describe · tabs");
    expect(formatToolLabel({ operation: "describe" })).toBe("describe");
  });

  it("uses eventPath for event waits", () => {
    expect(formatToolLabel({ operation: "waitEvent", eventPath: "tabs.onUpdated" }))
      .toBe("waitEvent · tabs.onUpdated");
    expect(formatToolLabel({ operation: "waitEvent" })).toBe("waitEvent");
  });

  it("uses the CDP command before the action fallback", () => {
    expect(formatToolLabel({ operation: "cdp", command: "Runtime.evaluate", action: "send" }))
      .toBe("cdp · Runtime.evaluate");
    expect(formatToolLabel({ operation: "cdp", action: "attach" })).toBe("cdp · attach");
    expect(formatToolLabel({ operation: "cdp" })).toBe("cdp");
  });

  it("falls back to the operation and then chrome", () => {
    expect(formatToolLabel({ operation: "call" })).toBe("call");
    expect(formatToolLabel({})).toBe("chrome");
    expect(formatToolLabel(null)).toBe("chrome");
  });
});
