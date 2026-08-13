"use client";

import type { PropsWithChildren } from "react";
import { LoaderCircle, WrenchIcon } from "lucide-react";
import { useAuiState } from "@assistant-ui/react";

export type ToolGroupProps = PropsWithChildren<{
  startIndex: number;
  endIndex: number;
}>;

export function ToolGroup({ children, startIndex, endIndex }: ToolGroupProps) {
  const running = useAuiState((state) =>
    state.message.parts
      .slice(startIndex, endIndex + 1)
      .some((part) => part.type === "tool-call" && part.status.type === "running"),
  );
  const count = endIndex - startIndex + 1;

  return (
    <details className="tool-group" data-slot="aui_tool-group" open={running}>
      <summary>
        {running ? (
          <LoaderCircle className="tool-group-icon animate-spin" aria-hidden="true" />
        ) : (
          <WrenchIcon className="tool-group-icon" aria-hidden="true" />
        )}
        <span>{count === 1 ? "Tool call" : `${count} tool calls`}</span>
        <span className="thinking-status">{running ? "running" : "complete"}</span>
      </summary>
      <div className="tool-group-content">{children}</div>
    </details>
  );
}
