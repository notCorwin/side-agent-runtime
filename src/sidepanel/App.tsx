import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { SettingsIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ModelConfig } from "../types";
import {
  MODEL_CONFIG_STORAGE_KEY,
  isCompleteModelConfig,
  loadModelConfig,
} from "./config";
import { ChromeToolCall } from "./ChromeToolCall";
import { formatModelDisplayName } from "./model-label";
import { useSidePanelRuntime } from "./useSidePanelRuntime";
import { Thread } from "../components/assistant-ui/thread";
import "../styles.css";
import "./styles.css";

const initialConfig: ModelConfig = {
  baseURL: "",
  apiKey: "",
  model: "",
};

const welcomeSuggestions = [
  { prompt: "移除页面广告" },
  { prompt: "添加深色模式" },
  { prompt: "做最酷的事情" },
] as const;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function openSettings(): void {
  void chrome.runtime.openOptionsPage();
}

export function App() {
  const [config, setConfig] = useState<ModelConfig>(initialConfig);
  const [configReady, setConfigReady] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    const refreshConfig = async () => {
      try {
        const stored = await loadModelConfig(initialConfig);
        if (!active) return;
        setConfig(stored);
        setStatus("");
      } catch (error) {
        if (!active) return;
        setStatus(`配置读取失败：${errorText(error)}`);
      } finally {
        if (active) setConfigReady(true);
      }
    };
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === "local" && changes[MODEL_CONFIG_STORAGE_KEY]) {
        void refreshConfig();
      }
    };

    void refreshConfig();
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const configured = configReady && isCompleteModelConfig(config);
  const key = `${config.baseURL}\u0000${config.model}`;
  const modelLabel = formatModelDisplayName(config.model);

  return (
    <SidePanelLayout modelLabel={modelLabel}>
      {configured ? (
        <ConfiguredChat key={key} config={config} />
      ) : (
        <div className="empty-state" data-testid="config-required-state">
          <div className="empty-icon">⌘</div>
          <h2>{configReady ? "先完成模型配置" : "正在读取配置…"}</h2>
          <p>
            {configReady
              ? "打开设置页填写 Provider、Model ID 和 API Key，保存后即可开始对话。"
              : "正在检查本地保存的模型配置。"}
          </p>
          {status && <p className="config-status" role="status">{status}</p>}
        </div>
      )}
    </SidePanelLayout>
  );
}

function SidePanelLayout({
  modelLabel,
  children,
}: {
  modelLabel: string;
  children: ReactNode;
}) {
  return (
    <main className="app-shell" data-testid="sidepanel-shell">
      <header className="app-header">
        <div className="app-title">
          <h1>Side Agent Runtime</h1>
          {modelLabel && <p className="app-model" data-testid="model-label">{modelLabel}</p>}
        </div>
        <button
          type="button"
          className="open-settings-button"
          data-testid="open-settings"
          aria-label="打开设置"
          title="打开设置"
          onClick={openSettings}
        >
          <SettingsIcon className="size-4" aria-hidden="true" />
        </button>
      </header>

      <section className="chat-scroll" data-testid="chat-scroll" aria-live="polite">
        {children}
      </section>
    </main>
  );
}

function ConfiguredChat({ config }: { config: ModelConfig }) {
  const runtime = useSidePanelRuntime(config, welcomeSuggestions);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread components={THREAD_COMPONENTS} />
    </AssistantRuntimeProvider>
  );
}

const THREAD_COMPONENTS = { ToolFallback: ChromeToolCall };
