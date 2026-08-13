export function formatModelDisplayName(modelId: string): string {
  const modelName = modelId.trim().split("/").at(-1)?.split(":", 1)[0] ?? "";
  return modelName
    .replaceAll("-", " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
