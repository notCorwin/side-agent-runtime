"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { WrenchIcon } from "lucide-react";

function formatJson(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

export const ToolFallback: ToolCallMessagePartComponent = (part) => {
  const running = part.status.type === "running";
  return (
    <details className={`activity ${running ? "running" : "complete"}`} open={running}>
      <summary>
        <WrenchIcon className="activity-icon" aria-hidden="true" />
        <span>{part.toolName}</span>
        <span className="activity-status">{running ? "running" : "complete"}</span>
      </summary>
      <div className="activity-content">
        <strong>输入</strong>
        <pre>{part.argsText || formatJson(part.args)}</pre>
        {part.result !== undefined && (
          <>
            <strong>输出</strong>
            <pre>{formatJson(part.result)}</pre>
          </>
        )}
      </div>
    </details>
  );
};
