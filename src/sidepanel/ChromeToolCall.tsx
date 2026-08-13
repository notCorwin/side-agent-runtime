import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import { readChromeToolMeta } from "./chrome-tool-metadata";
import { formatToolLabel } from "./tool-label";
import { ToolFallback } from "../components/assistant-ui/tool-fallback";

function formatJson(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

function statusLabel(status: "running" | "complete" | "error"): string {
  if (status === "running") return "running";
  if (status === "error") return "error";
  return "complete";
}

export const ChromeToolCall: ToolCallMessagePartComponent = (part) => {
  if (part.toolName !== "chrome") return <ToolFallback {...part} />;

  const meta = readChromeToolMeta(part.providerMetadata);
  const label = meta ? formatToolLabel(meta) : "";

  const running = part.status.type === "running";
  const isError = part.isError === true || part.status.type === "incomplete";
  const status = running ? "running" : isError ? "error" : "complete";
  const result = part.result;
  const error = isError
    ? part.status.type === "incomplete"
      ? part.status.error ?? result
      : result
    : undefined;

  return (
    <details
      className={`activity ${status}`}
      data-testid="chrome-tool-call"
      open={running}
    >
      <summary>
        {running ? (
          <LoaderCircle className="activity-icon animate-spin" aria-hidden="true" />
        ) : isError ? (
          <CircleAlert className="activity-icon" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="activity-icon" aria-hidden="true" />
        )}
        <span>{label}</span>
        <span className="activity-status">{statusLabel(status)}</span>
      </summary>
      <div className="activity-content">
        <strong>输入</strong>
        <pre>{part.argsText || formatJson(part.args)}</pre>
        {status === "complete" && (
          <>
            <strong>输出</strong>
            <pre>{formatJson(result)}</pre>
          </>
        )}
        {status === "error" && (
          <>
            <strong>错误</strong>
            <pre>{formatJson(error)}</pre>
          </>
        )}
      </div>
    </details>
  );
};

export default ChromeToolCall;
