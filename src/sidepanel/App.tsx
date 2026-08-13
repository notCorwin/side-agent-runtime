import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import { marked } from "marked";
import type { ModelMessage } from "ai";
import { ChromeBridge } from "../chrome/bridge";
import { runAgent } from "../agent/runner";
import type {
  AgentEvent,
  ModelConfig,
  TimelineItem,
  ToolActivity,
} from "../types";
import {
  clearModelConfig,
  isCompleteModelConfig,
  loadModelConfig,
  saveModelConfig,
} from "./config";
import "./styles.css";

const initialConfig: ModelConfig = {
  baseURL: "",
  apiKey: "",
  model: "",
};

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatValue(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Markdown({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text, { breaks: true, gfm: true }), [text]);
  return (
    <div
      className="markdown-body"
      // The model's Markdown is intentionally rendered as HTML inside the extension page.
      dangerouslySetInnerHTML={{ __html: typeof html === "string" ? html : "" }}
    />
  );
}

function ToolDetails({ activity }: { activity: ToolActivity }) {
  return (
    <details className={`activity ${activity.status}`} open={activity.status === "running" ? true : undefined}>
      <summary>
        <span className="activity-dot" />
        <span>{activity.toolName}</span>
        <span className="activity-status">{activity.status}</span>
      </summary>
      <div className="activity-content">
        <strong>输入</strong>
        <pre>{formatValue(activity.input)}</pre>
        {activity.status === "complete" && (
          <>
            <strong>输出</strong>
            <pre>{formatValue(activity.output)}</pre>
          </>
        )}
        {activity.status === "error" && (
          <>
            <strong>错误</strong>
            <pre>{formatValue(activity.error)}</pre>
          </>
        )}
      </div>
    </details>
  );
}

function TimelineEntry({ item, running }: { item: TimelineItem; running: boolean }) {
  switch (item.kind) {
    case "user":
      return (
        <article className="message user">
          <div className="message-label">你</div>
          <div className="message-body">{item.text}</div>
        </article>
      );
    case "assistant":
      return (
        <article className="assistant-message">
          <div className="message-label">Agent</div>
          <Markdown text={item.text} />
          {!item.text && running && <span className="stream-placeholder">…</span>}
        </article>
      );
    case "thinking":
      return (
        <details className="thinking-item" open={item.status === "running" ? true : undefined}>
          <summary>
            <span className="thinking-mark">✦</span>
            <span>Thinking</span>
            <span className="thinking-status">{item.status}</span>
          </summary>
          <div className="thinking-body">
            {item.text ? <Markdown text={item.text} /> : (
              <span>{item.status === "running" ? "思考中…" : "模型未返回可见思考文本"}</span>
            )}
          </div>
        </details>
      );
    case "tool":
      return <ToolDetails activity={item.activity} />;
    default:
      return null;
  }
}

export function App() {
  const bridge = useMemo(() => new ChromeBridge(), []);
  const [config, setConfig] = useState<ModelConfig>(initialConfig);
  const [configReady, setConfigReady] = useState(false);
  const [configHidden, setConfigHidden] = useState(false);
  const [configSaveState, setConfigSaveState] = useState<"dirty" | "saving" | "saved">("dirty");
  const [draft, setDraft] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [modelMessages, setModelMessages] = useState<ModelMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("就绪");
  const abortRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLElement | null>(null);
  const followChatRef = useRef(true);

  useEffect(() => {
    let active = true;
    void loadModelConfig(initialConfig)
      .then((stored) => {
        if (!active) return;
        setConfig(stored);
        setConfigReady(true);
        if (isCompleteModelConfig(stored)) {
          setConfigHidden(true);
          setConfigSaveState("saved");
        }
      })
      .catch((error) => {
        if (!active) return;
        setConfigReady(true);
        setStatus(`配置读取失败: ${errorText(error)}`);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!configReady) return;

    if (!isCompleteModelConfig(config)) {
      setConfigSaveState("dirty");
      return;
    }

    setConfigSaveState("saving");
    const timer = window.setTimeout(() => {
      void saveModelConfig(config)
        .then(() => {
          setConfigSaveState("saved");
          setConfigHidden(true);
        })
        .catch((error) => {
          setConfigSaveState("dirty");
          setStatus(`配置保存失败: ${errorText(error)}`);
        });
    }, 650);

    return () => window.clearTimeout(timer);
  }, [config, configReady]);

  useEffect(() => {
    const stopAndDispose = () => {
      abortRef.current?.abort();
      bridge.dispose();
    };
    window.addEventListener("pagehide", stopAndDispose);
    return () => {
      window.removeEventListener("pagehide", stopAndDispose);
      stopAndDispose();
    };
  }, [bridge]);

  useLayoutEffect(() => {
    if (!followChatRef.current) return;
    const element = chatScrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [timeline, configHidden]);

  const handleChatScroll = (event: UIEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const distanceFromBottom = element.scrollHeight - element.clientHeight - element.scrollTop;
    followChatRef.current = distanceFromBottom <= 48;
  };

  const appendText = (kind: "assistant" | "thinking", text: string) => {
    if (!text) return;
    setTimeline((current) => {
      const last = current[current.length - 1];
      if (kind === "assistant" && last?.kind === "assistant") {
        return [
          ...current.slice(0, -1),
          { ...last, text: last.text + text },
        ];
      }
      if (kind === "thinking" && last?.kind === "thinking" && last.status === "running") {
        return [
          ...current.slice(0, -1),
          { ...last, text: last.text + text },
        ];
      }
      return [
        ...current,
        kind === "thinking"
          ? { id: id(kind), kind, text, status: "running" as const }
          : { id: id(kind), kind, text },
      ];
    });
  };

  const completeThinking = () => {
    setTimeline((current) => {
      const next = [...current];
      for (let index = next.length - 1; index >= 0; index -= 1) {
        const item = next[index];
        if (item.kind === "thinking" && item.status === "running") {
          next[index] = { ...item, status: "complete" };
          break;
        }
      }
      return next;
    });
  };

  const appendTool = (activity: ToolActivity) => {
    setTimeline((current) => [...current, { id: activity.id, kind: "tool", activity }]);
  };

  const updateTool = (activity: ToolActivity) => {
    setTimeline((current) => current.map((item) => (
      item.kind === "tool" && item.activity.id === activity.id
        ? { ...item, activity }
        : item
    )));
  };

  const handleEvent = (event: AgentEvent) => {
    switch (event.type) {
      case "run-start":
        setStatus("思考中");
        setTimeline((current) => [
          ...current,
          { id: id("thinking"), kind: "thinking", text: "", status: "running" },
        ]);
        break;
      case "text-delta":
        setStatus("输出中");
        completeThinking();
        appendText("assistant", event.text);
        break;
      case "reasoning-delta":
        setStatus("思考中");
        appendText("thinking", event.text);
        break;
      case "tool-call":
        setStatus(`调用 ${event.activity.toolName}`);
        completeThinking();
        appendTool(event.activity);
        break;
      case "tool-result":
        setStatus("处理工具结果");
        updateTool(event.activity);
        break;
      case "tool-error":
        setStatus(`工具错误: ${event.activity.toolName}`);
        updateTool(event.activity);
        break;
      case "step-finish":
        completeThinking();
        break;
      case "run-finish":
        completeThinking();
        setStatus(`完成: ${event.finishReason}`);
        break;
      case "run-abort":
        completeThinking();
        setStatus("已停止");
        break;
      case "error":
        completeThinking();
        setStatus(`错误: ${errorText(event.error)}`);
        break;
      default:
        break;
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || running) return;
    if (!isCompleteModelConfig(config)) {
      setConfigHidden(false);
      setStatus("请先填写 Base URL、API Key 和模型 ID");
      return;
    }

    const userMessage: ModelMessage = { role: "user", content: text };
    const nextModelMessages = [...modelMessages, userMessage];

    setModelMessages(nextModelMessages);
    setTimeline((current) => [...current, { id: id("user"), kind: "user", text }]);
    setDraft("");
    setRunning(true);
    setStatus("启动 Agent");

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await runAgent({
        messages: nextModelMessages,
        model: config,
        bridge,
        signal: controller.signal,
        onEvent: handleEvent,
      });
      setModelMessages(result.messages);
    } catch (error) {
      if (!controller.signal.aborted) setStatus(`错误: ${errorText(error)}`);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setStatus("正在停止");
  };

  const clearConfig = async () => {
    if (running) return;
    try {
      await clearModelConfig();
      setConfig(initialConfig);
      setConfigHidden(false);
      setConfigSaveState("dirty");
      setStatus("配置已清空");
    } catch (error) {
      setStatus(`配置清空失败: ${errorText(error)}`);
    }
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">MV3 SIDE PANEL</div>
          <h1>Side Agent Runtime</h1>
        </div>
        <span className={running ? "status-pill active" : "status-pill"}>{status}</span>
      </header>

      <section className="config-card" aria-label="模型配置">
        {configHidden ? (
          <div className="config-saved">
            <div>
              <strong>配置已保存</strong>
              <span>Base URL、Model ID 和 API Key 已持久化并隐藏</span>
            </div>
            <div className="config-actions">
              <button
                type="button"
                className="edit-config-button"
                onClick={() => {
                  setConfigHidden(false);
                  setConfigSaveState("dirty");
                }}
                disabled={running}
              >
                编辑
              </button>
              <button
                type="button"
                className="clear-config-button"
                onClick={() => void clearConfig()}
                disabled={running}
              >
                清空
              </button>
            </div>
          </div>
        ) : (
          <>
            <label>
              <span>Base URL</span>
              <input
                value={config.baseURL}
                onChange={(event) => setConfig((current) => ({ ...current, baseURL: event.target.value }))}
                disabled={running || !configReady}
              />
            </label>
            <label>
              <span>Model ID</span>
              <input
                value={config.model}
                onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}
                disabled={running || !configReady}
              />
            </label>
            <label>
              <span>API Key</span>
              <input
                type="password"
                value={config.apiKey}
                onChange={(event) => setConfig((current) => ({ ...current, apiKey: event.target.value }))}
                disabled={running || !configReady}
              />
            </label>
            <div className="config-save-hint">
              {configSaveState === "saving" ? "正在自动保存…" : "填写完成后自动保存并隐藏"}
            </div>
          </>
        )}
      </section>

      <section
        ref={chatScrollRef}
        className="chat-scroll"
        aria-live="polite"
        onScroll={handleChatScroll}
      >
        {timeline.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">⌘</div>
            <h2>可以开始了</h2>
            <p>告诉 Agent 要完成什么，它可以通过一个通用工具调用 Chrome API 或 CDP。</p>
          </div>
        )}
        {timeline.map((item) => {
          const stateKey = item.kind === "thinking"
            ? item.status
            : item.kind === "tool"
              ? item.activity.status
              : "stable";
          return (
            <TimelineEntry key={`${item.id}-${stateKey}`} item={item} running={running} />
          );
        })}
      </section>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.metaKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void send();
          }}
          placeholder="描述要执行的浏览器任务…"
          rows={3}
          disabled={running}
        />
        <div className="composer-actions">
          <span className="hint">Enter 发送 · ⌘Enter 换行 · 无步数、长度或工具次数上限</span>
          {running ? (
            <button type="button" className="stop-button" onClick={stop}>停止</button>
          ) : (
            <button type="submit" className="send-button" disabled={!draft.trim()}>发送</button>
          )}
        </div>
      </form>
    </main>
  );
}
