import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodeBlockHeader } from "./markdown-text";

describe("CodeBlockHeader", () => {
  it("renders a labeled copy button for a Markdown code block", () => {
    const markup = renderToStaticMarkup(
      <CodeBlockHeader language="typescript" code={'const answer = "ok";'} />,
    );

    expect(markup).toContain("typescript");
    expect(markup).toContain('data-testid="copy-code-button"');
    expect(markup).toContain('aria-label="复制代码"');
  });
});
