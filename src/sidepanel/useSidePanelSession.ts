import { useEffect, useState } from "react";
import type { ModelConfig } from "../types";
import {
  MODEL_CONFIG_STORAGE_KEY,
  isCompleteModelConfig,
  loadModelConfig,
} from "./config";
import { formatModelDisplayName } from "./model-label";

const EMPTY_CONFIG: ModelConfig = { baseURL: "", apiKey: "", model: "" };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type SidePanelSession = {
  config: ModelConfig;
  configReady: boolean;
  status: string;
  configured: boolean;
  // Run lifetime invariant: one config => one chat mount => one ChromeBridge.
  // A config change changes chatKey, which remounts the keyed chat;
  // useSidePanelRuntime disposes the old bridge/agent on unmount or pagehide.
  chatKey: string;
  modelLabel: string;
};

export function useSidePanelSession(): SidePanelSession {
  const [config, setConfig] = useState<ModelConfig>(EMPTY_CONFIG);
  const [configReady, setConfigReady] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    const refreshConfig = async () => {
      try {
        const stored = await loadModelConfig(EMPTY_CONFIG);
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

  return {
    config,
    configReady,
    status,
    configured: configReady && isCompleteModelConfig(config),
    chatKey: `${config.baseURL}\u0000${config.model}`,
    modelLabel: formatModelDisplayName(config.model),
  };
}
