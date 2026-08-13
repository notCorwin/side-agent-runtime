import { describe, expect, it } from "vitest";
import { formatToolLabel } from "./tool-label";

describe("formatToolLabel", () => {
  it("keeps call labels concise by showing path", () => {
    expect(formatToolLabel({ operation: "call", path: "tabs.query" })).toBe("tabs.query");
    expect(formatToolLabel({ operation: "call" })).toBe("call");
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

  it("shows the CDP action and command context", () => {
    expect(formatToolLabel({ operation: "cdp", command: "Runtime.evaluate", action: "send" }))
      .toBe("cdp · send · Runtime.evaluate");
    expect(formatToolLabel({ operation: "cdp", command: "Runtime.evaluate" }))
      .toBe("cdp · send · Runtime.evaluate");
    expect(formatToolLabel({ operation: "cdp", action: "attach" })).toBe("cdp · attach");
    expect(formatToolLabel({ operation: "cdp" })).toBe("cdp");
  });
});
