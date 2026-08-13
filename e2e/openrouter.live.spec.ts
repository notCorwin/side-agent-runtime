import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const apiKey = process.env.OPENROUTER_API_KEY;

test.skip(!apiKey, "Set OPENROUTER_API_KEY to run the live OpenRouter E2E");

test.describe("OpenRouter live agent", () => {
  test("streams a model response and executes chrome.tabs.query", async () => {
    test.setTimeout(240_000);
    const extensionPath = resolve(process.cwd(), "dist");
    const userDataDirectory = await mkdtemp(resolve(tmpdir(), "side-agent-openrouter-e2e-"));
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
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      await expect(page.locator("h1")).toHaveText("Side Agent Runtime");

      const [optionsPage] = await Promise.all([
        context.waitForEvent("page"),
        page.locator(".open-settings-button").click(),
      ]);
      await optionsPage.waitForLoadState("domcontentloaded");
      await expect(optionsPage.locator("h1")).toHaveText("模型设置");
      const inputs = optionsPage.locator(".options-card input");
      await inputs.nth(0).fill("https://openrouter.ai/api/v1");
      await inputs.nth(1).fill("nvidia/nemotron-3.5-lightning:free");
      await inputs.nth(2).fill(apiKey!);
      await optionsPage.getByRole("button", { name: "保存配置" }).click();
      await expect(optionsPage.locator(".save-message.saved")).toBeVisible({ timeout: 5_000 });
      await expect(page.locator(".config-card")).toContainText("配置已保存");
      await optionsPage.close();

      await page.locator("textarea").fill(
        "Use the chrome tool now. Call operation=call with path=tabs.query and args=[{}]. Then tell me exactly how many tabs are open. Do not answer before executing the tool call.",
      );
      await page.locator("textarea").press("Enter");

      const assistantMessage = page.locator(".assistant-message .markdown-body").last();
      await expect(assistantMessage).not.toHaveText("", { timeout: 180_000 });
      await expect(page.locator(".activity.complete")).toHaveCount(1, { timeout: 180_000 });
      await expect(page.locator(".activity.complete summary")).toContainText("tabs.query");
      expect(await page.locator(".thinking-item").count()).toBeGreaterThan(0);
      expect(await page.locator(".thinking-item").evaluateAll((items) => (
        items.every((item) => !item.hasAttribute("open"))
      ))).toBe(true);
      await expect(assistantMessage).toHaveText(/\d/, { timeout: 180_000 });

      const renderedText = await page.locator("body").innerText();
      expect(renderedText).toContain("chrome");
      expect(renderedText).not.toContain(apiKey!);
    } finally {
      await context.close();
      await rm(userDataDirectory, { recursive: true, force: true });
    }
  });
});
