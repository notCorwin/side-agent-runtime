import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import type { PersistedModelConfig } from "../sidepanel/config";
import {
  isCompleteModelConfig,
  loadModelConfig,
  saveModelConfig,
} from "../sidepanel/config";
import "../styles.css";
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

  const updateField = (field: keyof PersistedModelConfig, value: string) => {
    setConfig((current) => ({ ...current, [field]: value }));
    setSaveState("idle");
    setMessage("");
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
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
      setMessage("配置已保存，Side Panel 会立即使用新配置");
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

      <Card className="options-card" data-testid="options-card">
        <form onSubmit={(event) => void save(event)}>
          <CardHeader className="options-card-header">
            <CardTitle>Provider 配置</CardTitle>
            <CardDescription>配置只保存在当前浏览器扩展的 chrome.storage.local 中。</CardDescription>
          </CardHeader>
          <CardContent className="options-card-content">
            <div className="options-field">
              <Label htmlFor="base-url">Base URL</Label>
              <Input
                id="base-url"
                value={config.baseURL}
                onChange={(event) => updateField("baseURL", event.target.value)}
                disabled={!ready || saveState === "saving"}
              />
            </div>
            <div className="options-field">
              <Label htmlFor="model-id">Model ID</Label>
              <Input
                id="model-id"
                value={config.model}
                onChange={(event) => updateField("model", event.target.value)}
                disabled={!ready || saveState === "saving"}
              />
            </div>
            <div className="options-field">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                value={config.apiKey}
                onChange={(event) => updateField("apiKey", event.target.value)}
                disabled={!ready || saveState === "saving"}
              />
            </div>
          </CardContent>
          <CardFooter className="options-actions">
            <Button type="submit" className="save-button" disabled={!ready || saveState === "saving"}>
              {saveState === "saving" ? "保存中…" : "保存配置"}
            </Button>
          </CardFooter>
          {message && <p className={`save-message ${saveState}`} role="status">{message}</p>}
        </form>
      </Card>
    </main>
  );
}
