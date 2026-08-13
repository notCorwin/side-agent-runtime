import { useEffect, useState } from "react";
import type { PersistedModelConfig } from "../sidepanel/config";
import {
  isCompleteModelConfig,
  loadModelConfig,
  saveModelConfig,
} from "../sidepanel/config";
import "./styles.css";

const emptyConfig: PersistedModelConfig = {
  baseURL: "",
  apiKey: "",
  model: "",
};

type SaveState = "idle" | "saving" | "saved" | "error";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function OptionsApp() {
  const [config, setConfig] = useState<PersistedModelConfig>(emptyConfig);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void loadModelConfig(emptyConfig)
      .then((stored) => {
        if (!active) return;
        setConfig(stored);
        setReady(true);
      })
      .catch((error) => {
        if (!active) return;
        setReady(true);
        setSaveState("error");
        setMessage(`配置读取失败：${errorText(error)}`);
      });

    return () => {
      active = false;
    };
  }, []);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isCompleteModelConfig(config)) {
      setSaveState("error");
      setMessage("请完整填写 Base URL、Model ID 和 API Key");
      return;
    }

    setSaveState("saving");
    setMessage("");
    try {
      await saveModelConfig(config);
      setSaveState("saved");
      setMessage("配置已保存，Side Panel 下次运行时会使用新配置");
    } catch (error) {
      setSaveState("error");
      setMessage(`配置保存失败：${errorText(error)}`);
    }
  };

  return (
    <main className="options-shell">
      <header className="options-header">
        <p className="options-eyebrow">SIDE AGENT RUNTIME</p>
        <h1>模型设置</h1>
        <p>在这里管理 Side Agent 使用的 OpenAI-compatible Provider 配置。</p>
      </header>

      <form className="options-card" onSubmit={(event) => void save(event)}>
        <label>
          <span>Base URL</span>
          <input
            value={config.baseURL}
            onChange={(event) => {
              setConfig((current) => ({ ...current, baseURL: event.target.value }));
              setSaveState("idle");
              setMessage("");
            }}
            disabled={!ready || saveState === "saving"}
          />
        </label>
        <label>
          <span>Model ID</span>
          <input
            value={config.model}
            onChange={(event) => {
              setConfig((current) => ({ ...current, model: event.target.value }));
              setSaveState("idle");
              setMessage("");
            }}
            disabled={!ready || saveState === "saving"}
          />
        </label>
        <label>
          <span>API Key</span>
          <input
            type="password"
            value={config.apiKey}
            onChange={(event) => {
              setConfig((current) => ({ ...current, apiKey: event.target.value }));
              setSaveState("idle");
              setMessage("");
            }}
            disabled={!ready || saveState === "saving"}
          />
        </label>
        <div className="options-actions">
          <button
            type="submit"
            className="save-button"
            disabled={!ready || saveState === "saving"}
          >
            {saveState === "saving" ? "保存中…" : "保存配置"}
          </button>
        </div>
        {message && (
          <p className={`save-message ${saveState}`} role="status">{message}</p>
        )}
      </form>
    </main>
  );
}
