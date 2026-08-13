import type { JsonValue } from "../types";

const HANDLE_KEY = "$sideAgentHandle";

export type HandleRecord = {
  id: string;
  label: string;
  value: unknown;
};

export class HandleStore {
  private readonly records = new Map<string, HandleRecord>();
  private nextId = 1;

  save(value: unknown, label = "object"): string {
    const id = `h${this.nextId++}`;
    this.records.set(id, { id, label, value });
    return id;
  }

  resolve(id: string): unknown {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown Chrome handle: ${id}`);
    return record.value;
  }

  describe(): Array<{ id: string; label: string }> {
    return [...this.records.values()].map(({ id, label }) => ({ id, label }));
  }

  clear(): void {
    this.records.clear();
  }
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function typeTag(type: string, value: JsonValue): JsonValue {
  return { $type: type, value };
}

export function resolveHandles(value: unknown, handles: HandleStore): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveHandles(item, handles));
  if (!value || typeof value !== "object") return value;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate[HANDLE_KEY] === "string") {
    return handles.resolve(candidate[HANDLE_KEY]);
  }

  return Object.fromEntries(
    Object.entries(candidate).map(([key, item]) => [key, resolveHandles(item, handles)]),
  );
}

export function serializeValue(
  value: unknown,
  handles: HandleStore,
  seen = new WeakSet<object>(),
  path = "$",
): JsonValue {
  if (value === null) return null;
  if (value === undefined) return typeTag("undefined", null);
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    return typeTag("number", String(value));
  }
  if (typeof value === "bigint") return typeTag("bigint", value.toString());
  if (typeof value === "symbol") return typeTag("symbol", String(value));

  if (typeof value === "function") {
    return { [HANDLE_KEY]: handles.save(value, `function:${value.name || "anonymous"}`) };
  }

  if (seen.has(value)) return typeTag("circular-reference", path);
  seen.add(value);

  if (value instanceof Error) {
    return {
      $type: "error",
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };
  }

  if (value instanceof Date) return typeTag("date", value.toISOString());

  if (value instanceof ArrayBuffer) {
    return {
      $type: "array-buffer",
      byteLength: value.byteLength,
      base64: bytesToBase64(new Uint8Array(value)),
    };
  }

  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return {
      $type: "typed-array",
      name: value.constructor.name,
      byteLength: value.byteLength,
      base64: bytesToBase64(bytes),
    };
  }

  if (value instanceof Map) {
    return {
      $type: "map",
      entries: [...value.entries()].map(([key, item], index) => [
        serializeValue(key, handles, seen, `${path}.<key:${index}>`),
        serializeValue(item, handles, seen, `${path}.<value:${index}>`),
      ]),
    };
  }

  if (value instanceof Set) {
    return {
      $type: "set",
      values: [...value.values()].map((item, index) =>
        serializeValue(item, handles, seen, `${path}[${index}]`),
      ),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => serializeValue(item, handles, seen, `${path}[${index}]`));
  }

  if (!isPlainObject(value)) {
    return {
      [HANDLE_KEY]: handles.save(value, value.constructor?.name || "object"),
    };
  }

  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    try {
      result[key] = serializeValue(item, handles, seen, `${path}.${key}`);
    } catch (error) {
      result[key] = {
        $type: "serialization-error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return result;
}

export function serializeError(error: unknown, handles: HandleStore): JsonValue {
  return serializeValue(error, handles);
}
