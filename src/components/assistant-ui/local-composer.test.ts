import { describe, expect, it } from "vitest";
import { insertNewlineAtSelection } from "./composer-utils";

describe("insertNewlineAtSelection", () => {
  it("inserts a newline at the cursor", () => {
    expect(insertNewlineAtSelection("hello world", 5, 5)).toBe("hello\n world");
  });

  it("replaces the selection with a newline", () => {
    expect(insertNewlineAtSelection("hello world", 5, 11)).toBe("hello\n");
  });
});
