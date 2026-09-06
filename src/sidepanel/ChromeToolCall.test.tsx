import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createChromeToolProviderMetadata } from "./chrome-tool-metadata";
import { ChromeToolCall } from "./ChromeToolCall";

function renderChromeTool(providerMetadata?: unknown, result: unknown = { ok: true }): string {
  const part = {
    toolName: "chrome",
    toolCallId: "call-tabs",
    args: { operation: "call", path: "tabs.query", args: [{}] },
    argsText: '{"operation":"call","path":"tabs.query","args":[{}]}',
    providerMetadata,
    status: { type: "complete" },
    isError: false,
    result,
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

  it("renders a resolved Chrome failure envelope as an error", () => {
    const markup = renderChromeTool(undefined, {
      ok: false,
      error: { name: "Error", message: "Chrome API path not found: tabs.noSuchMethod" },
    });

    expect(markup).toContain('class="activity error"');
    expect(markup).toContain('<span class="activity-status">error</span>');
    expect(markup).toContain("Chrome API path not found: tabs.noSuchMethod");
    expect(markup).not.toContain('<span class="activity-status">complete</span>');
  });
});
