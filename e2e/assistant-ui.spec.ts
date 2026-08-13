import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

function chunk(content: string, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    id: "chatcmpl-side-agent-e2e",
    object: "chat.completion.chunk",
    created: 1,
    model: "test-model",
    choices: [{ index: 0, delta: content ? { role: "assistant", content } : {}, finish_reason: finishReason }],
  })}\n\n`;
}

function codeResponse(): string {
  return [
    chunk("Here is the requested code:\n\n"),
    chunk("```javascript\n"),
    chunk("document.title\n"),
    chunk("```\n", "stop"),
    "data: [DONE]\n\n",
  ].join("");
}

async function openExtension(): Promise<{ context: BrowserContext; page: Page; userDataDirectory: string }> {
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDirectory = await mkdtemp(resolve(tmpdir(), "side-agent-assistant-ui-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDirectory, {
    executablePath: chromium.executablePath(),
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox",
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker");
  const extensionId = new URL(serviceWorker.url()).hostname;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  return { context, page, userDataDirectory };
}

async function configureProvider(context: BrowserContext, page: Page): Promise<void> {
  const [optionsPage] = await Promise.all([
    context.waitForEvent("page"),
    page.getByTestId("open-settings").click(),
  ]);
  await optionsPage.waitForLoadState("domcontentloaded");
  const inputs = optionsPage.getByTestId("options-card").locator("input");
  await inputs.nth(0).fill("https://provider.test/v1");
  await inputs.nth(1).fill("test-model");
  await inputs.nth(2).fill("test-key");
  await optionsPage.getByRole("button", { name: "保存配置" }).click();
  await expect(optionsPage.locator(".save-message.saved")).toBeVisible();
  await optionsPage.close();
  await expect(page.getByTestId("composer-input")).toBeVisible();
}

test("renders copyable assistant code and supports editing user messages", async () => {
  const { context, page, userDataDirectory } = await openExtension();

  try {
    await context.route("https://provider.test/v1/chat/completions", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "cache-control": "no-cache",
          "content-type": "text/event-stream",
        },
        body: codeResponse(),
      });
    });

    await configureProvider(context, page);
    const composer = page.getByTestId("composer-input");
    await composer.fill("show me a code block");
    await composer.press("Enter");

    await expect(page.locator(".markdown-code-header")).toBeVisible();
    await expect(page.locator(".markdown-body pre code")).toContainText("document.title");
    const copyButton = page.getByTestId("copy-code-button");
    await expect(copyButton).toHaveAttribute("aria-label", "复制代码");
    await copyButton.click();
    await expect(copyButton).toHaveAttribute("aria-label", "已复制代码");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("document.title\n");

    const userMessage = page.locator('[data-role="user"]').last();
    await userMessage.hover();
    await userMessage.getByTestId("edit-message-button").click();
    await expect(page.getByTestId("user-edit-input")).toHaveValue("show me a code block");
    await page.getByTestId("user-edit-input").fill("edited request");
    await page.getByRole("button", { name: "提交编辑" }).click();
    await expect(page.locator('[data-role="user"]').last()).toContainText("edited request");
  } finally {
    await context.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
