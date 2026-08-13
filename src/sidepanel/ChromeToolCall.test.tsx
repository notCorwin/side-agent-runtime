import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createChromeToolProviderMetadata } from "./chrome-tool-metadata";
import { ChromeToolCall } from "./ChromeToolCall";

function renderChromeTool(providerMetadata?: unknown): string {
  const part = {
    toolName: "chrome",
    toolCallId: "call-tabs",
    args: { operation: "call", path: "tabs.query", args: [{}] },
    argsText: '{"operation":"call","path":"tabs.query","args":[{}]}',
    providerMetadata,
    status: { type: "complete" },
    isError: false,
    result: { ok: true },
    addResult: () => undefined,
    resume: () => undefined,
    respondToApproval: () => undefined,
  } as unknown as ToolCallMessagePartProps;

  return renderToStaticMarkup(<ChromeToolCall {...part} />);
}

function summaryFromMarkup(markup: string): string {
  const start = markup.indexOf("<summary>");
  const end = markup.indexOf("</summary>");
  return start >= 0 && end >= 0 ? markup.slice(start, end) : "";
}

describe("ChromeToolCall", () => {
  it("renders the structured path and never uses chrome as the title", () => {
    const markup = renderChromeTool(createChromeToolProviderMetadata({
      operation: "call",
      path: "tabs.query",
    }));
    const summary = summaryFromMarkup(markup);

    expect(summary).toContain("tabs.query");
    expect(summary).not.toContain("chrome");
    expect(summary).not.toContain("Chrome API");
  });

  it("leaves the title empty when structured metadata is unavailable", () => {
    const summary = summaryFromMarkup(renderChromeTool());

    expect(summary).not.toContain("chrome");
    expect(summary).not.toContain("Chrome API");
    expect(summary).not.toContain("未知");
  });
});
