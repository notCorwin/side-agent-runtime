"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import { CheckIcon, CopyIcon } from "lucide-react";
import { MarkdownTextPrimitive, type CodeHeaderProps } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { memo, useEffect, useState, type FC } from "react";

export const CodeBlockHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="markdown-code-header">
      <span className="markdown-code-language">{language || "code"}</span>
      <button
        type="button"
        className="markdown-code-copy"
        data-testid="copy-code-button"
        aria-label={copied ? "已复制代码" : "复制代码"}
        title={copied ? "已复制代码" : "复制代码"}
        onClick={() => void copyCode()}
      >
        {copied ? (
          <CheckIcon className="size-3.5" aria-hidden="true" />
        ) : (
          <CopyIcon className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
};

const MarkdownTextImpl = () => (
  <MarkdownTextPrimitive
    remarkPlugins={[remarkGfm]}
    className="aui-md markdown-body"
    components={{ CodeHeader: CodeBlockHeader }}
    defer
  />
);

export const MarkdownText = memo(MarkdownTextImpl);
