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
        page.getByTestId("open-settings").click(),
      ]);
      await optionsPage.waitForLoadState("domcontentloaded");
      await expect(optionsPage.locator("h1")).toHaveText("模型设置");
      const inputs = optionsPage.locator(".options-card input");
      await inputs.nth(0).fill("https://openrouter.ai/api/v1");
      await inputs.nth(1).fill("nvidia/nemotron-3.5-lightning:free");
      await inputs.nth(2).fill(apiKey!);
      await optionsPage.getByRole("button", { name: "保存配置" }).click();
      await expect(optionsPage.locator(".save-message.saved")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("model-label")).toHaveText("Nemotron 3.5 Lightning");
      await optionsPage.close();

      await page.getByTestId("composer-input").fill(
        "Use the chrome tool now. Call operation=call with path=tabs.query and args=[{}]. Then tell me exactly how many tabs are open. Do not answer before executing the tool call.",
      );
      await page.getByTestId("composer-input").press("Enter");

      const assistantMessage = page.locator('[data-role="assistant"] .markdown-body').last();
      await expect(assistantMessage).not.toHaveText("", { timeout: 180_000 });
      await expect(page.getByTestId("chrome-tool-call")).toHaveCount(1, { timeout: 180_000 });
      const toolSummary = page.getByTestId("chrome-tool-call").locator("summary");
      await expect(toolSummary).toContainText("tabs.query");
      await expect(toolSummary).not.toContainText("chrome");
      expect(await page.getByTestId("reasoning-item").count()).toBeGreaterThan(0);
      expect(await page.getByTestId("reasoning-item").evaluateAll((items) => (
        items.every((item) => !item.hasAttribute("open"))
      ))).toBe(true);
      await expect(assistantMessage).toHaveText(/\d/, { timeout: 180_000 });

      const userMessage = page.locator('[data-role="user"]').last();
      await userMessage.hover();
      await expect(userMessage.getByTestId("edit-message-button")).toBeVisible();
      await userMessage.getByTestId("edit-message-button").click();
      await expect(page.getByTestId("user-edit-input")).toHaveValue(/Use the chrome tool now/);
      await page.getByRole("button", { name: "取消编辑" }).click();

      const renderedText = await page.locator("body").innerText();
      expect(renderedText).toContain("tabs.query");
      expect(renderedText).not.toContain(apiKey!);

      await page.getByTestId("composer-input").fill(
        "Respond with the exact text SECOND_OK and do not call any tools.",
      );
      await page.getByTestId("composer-input").press("Enter");
      await expect(page.locator(".markdown-body").last()).toContainText("SECOND_OK", { timeout: 180_000 });
    } finally {
      await context.close();
      await rm(userDataDirectory, { recursive: true, force: true });
    }
  });
});
