import { describe, expect, it } from "vitest";
import { createSidePanelCloser } from "./useSidePanelRuntime";

describe("createSidePanelCloser", () => {
  it("cancels before disposing and closes only once", () => {
    const calls: string[] = [];
    const close = createSidePanelCloser(
      { thread: { cancelRun: () => calls.push("cancel") } },
      { dispose: () => calls.push("dispose") },
    );

    close();
    close();

    expect(calls).toEqual(["cancel", "dispose"]);
  });
});
