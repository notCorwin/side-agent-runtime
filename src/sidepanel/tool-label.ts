function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
}

export function formatToolLabel(input: unknown): string {
  const record = asRecord(input);
  const operation = nonEmptyString(record?.operation);
  if (!operation) return "chrome";

  switch (operation) {
    case "call":
      return nonEmptyString(record?.path) ?? operation;
    case "describe": {
      const path = nonEmptyString(record?.path);
      return path ? `${operation} · ${path}` : operation;
    }
    case "waitEvent": {
      const eventPath = nonEmptyString(record?.eventPath);
      return eventPath ? `${operation} · ${eventPath}` : operation;
    }
    case "cdp": {
      const target = nonEmptyString(record?.command) ?? nonEmptyString(record?.action);
      return target ? `${operation} · ${target}` : operation;
    }
    default:
      return operation;
  }
}
