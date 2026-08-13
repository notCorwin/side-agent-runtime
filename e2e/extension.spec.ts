import { test, expect, chromium } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

test("loads the MV3 side panel and can use Chrome debugger from an extension page", async () => {
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDirectory = await mkdtemp(resolve(tmpdir(), "side-agent-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDirectory, {
    executablePath: chromium.executablePath(),
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox",
    ],
  });

  try {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker");
    const extensionId = new URL(serviceWorker.url()).hostname;
    const extensionPage = await context.newPage();
    await extensionPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(extensionPage.locator("h1")).toHaveText("Side Agent Runtime");

    const layout = await extensionPage.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      const chat = document.querySelector<HTMLElement>(".chat-scroll");
      if (!shell || !chat) throw new Error("Side panel layout was not rendered");
      return {
        bodyHeight: document.body.clientHeight,
        bodyScrollHeight: document.body.scrollHeight,
        shellHeight: shell.clientHeight,
        shellScrollHeight: shell.scrollHeight,
        shellOverflowY: getComputedStyle(shell).overflowY,
        chatOverflowY: getComputedStyle(chat).overflowY,
      };
    });
    expect(layout.bodyScrollHeight).toBe(layout.bodyHeight);
    expect(layout.shellScrollHeight).toBe(layout.shellHeight);
    expect(layout.shellOverflowY).toBe("hidden");
    expect(layout.chatOverflowY).toBe("auto");

    const mv3ScriptApis = await extensionPage.evaluate(() => ({
      legacyTabsExecuteScript: typeof chrome.tabs.executeScript,
      scriptingExecuteScript: typeof chrome.scripting.executeScript,
    }));
    expect(mv3ScriptApis.legacyTabsExecuteScript).toBe("undefined");
    expect(mv3ScriptApis.scriptingExecuteScript).toBe("function");

    const manifest = await extensionPage.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe("125");
    expect(manifest.permissions).toContain("debugger");
    await expect.poll(() => extensionPage.evaluate(() => chrome.sidePanel.getPanelBehavior()))
      .toMatchObject({ openPanelOnActionClick: true });

    const configInputs = extensionPage.locator(".config-card input");
    await configInputs.nth(0).fill("https://provider.test/v1");
    await configInputs.nth(1).fill("test-model");
    await configInputs.nth(2).fill("test-key");
    await expect(extensionPage.locator(".config-saved")).toBeVisible();
    await expect(extensionPage.locator(".config-card input")).toHaveCount(0);

    const composer = extensionPage.locator("textarea");
    await composer.fill("this state must not persist");
    expect(await composer.getAttribute("maxlength")).toBeNull();
    await extensionPage.close();
    const reopened = await context.newPage();
    await reopened.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(reopened.locator("textarea")).toHaveValue("");
    await expect(reopened.locator(".config-saved")).toBeVisible();
    await reopened.locator(".clear-config-button").click();
    await expect(reopened.locator(".config-saved")).toHaveCount(0);
    await expect(reopened.locator(".config-card input")).toHaveCount(3);
    await expect(reopened.locator(".config-card input").nth(0)).toHaveValue("");
    await expect(reopened.locator(".config-card input").nth(1)).toHaveValue("");
    await expect(reopened.locator(".config-card input").nth(2)).toHaveValue("");

    const target = await context.newPage();
    await target.goto("data:text/html,<title>Side Agent E2E</title><main>ready</main>");
    const debuggerResult = await reopened.evaluate(async (targetUrl) => {
      const tabs = await chrome.tabs.query({ url: targetUrl });
      const tab = tabs[0];
      if (!tab?.id) throw new Error("Target tab was not found");

      await chrome.debugger.attach({ tabId: tab.id }, "1.3");
      try {
        return await chrome.debugger.sendCommand({ tabId: tab.id }, "Runtime.evaluate", {
          expression: "document.title",
          returnByValue: true,
        });
      } finally {
        await chrome.debugger.detach({ tabId: tab.id });
      }
    }, target.url());

    expect(debuggerResult).toMatchObject({ result: { value: "Side Agent E2E" } });
  } finally {
    await context.close();
  }
});
