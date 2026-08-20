import type { AssistantRuntime } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { useEffect, useMemo } from "react";
import { createAgent } from "../agent/runner";
import { ChromeBridge } from "../chrome/bridge";
import type { ModelConfig } from "../types";
import { createChromeChatTransport } from "./chrome-tool-metadata";

type SidePanelRuntime = {
  thread: Pick<AssistantRuntime["thread"], "cancelRun">;
};
type SidePanelBridge = Pick<ChromeBridge, "dispose">;

export function createSidePanelCloser(
  runtime: SidePanelRuntime,
  bridge: SidePanelBridge,
): () => void {
  let closed = false;

  return () => {
    if (closed) return;
    closed = true;
    runtime.thread.cancelRun();
    bridge.dispose();
  };
}

export function useSidePanelRuntime(
  config: ModelConfig,
  suggestions: readonly { prompt: string }[],
): AssistantRuntime {
  const bridge = useMemo(() => new ChromeBridge(), []);
  const agent = useMemo(() => createAgent({ model: config, bridge }), [config, bridge]);
  const transport = useMemo(() => createChromeChatTransport(agent), [agent]);
  const runtime = useChatRuntime({ transport, suggestions });

  useEffect(() => {
    const close = createSidePanelCloser(runtime, bridge);
    window.addEventListener("pagehide", close);
    return () => {
      window.removeEventListener("pagehide", close);
      close();
    };
  }, [bridge, runtime]);

  return runtime;
}
