export function insertNewlineAtSelection(value: string, start: number, end: number): string {
  return `${value.slice(0, start)}\n${value.slice(end)}`;
}
