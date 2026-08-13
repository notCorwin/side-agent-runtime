import type { ChromeToolMeta } from "../types";

export function formatToolLabel(meta: ChromeToolMeta): string {
  switch (meta.operation) {
    case "call":
      return meta.path?.trim() || "call";
    case "describe": {
      const path = meta.path?.trim();
      return path ? `describe · ${path}` : "describe";
    }
    case "waitEvent": {
      const eventPath = meta.eventPath?.trim();
      return eventPath ? `waitEvent · ${eventPath}` : "waitEvent";
    }
    case "cdp": {
      const command = meta.command?.trim();
      if (command) return `cdp · ${meta.action ?? "send"} · ${command}`;
      return meta.action ? `cdp · ${meta.action}` : "cdp";
    }
  }
}
