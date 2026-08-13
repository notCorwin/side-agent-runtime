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

function toolCallResponse(): string {
  const inputs = [
    { operation: "call", path: "tabs.query", args: [{}] },
    { operation: "call", path: "windows.getCurrent", args: [{}] },
  ];
  const toolCalls = inputs.map((input, index) => ({
    index,
    id: `call-tool-${index + 1}`,
    type: "function",
    function: {
      name: "chrome",
      arguments: JSON.stringify(input),
    },
  }));
  return [
    chunk("", null).replace('"delta":{}', `"delta":{"role":"assistant","tool_calls":${JSON.stringify(toolCalls)}}`),
    chunk("", "tool_calls"),
    "data: [DONE]\n\n",
  ].join("");
}

function textResponse(text: string): string {
  return [chunk(text), chunk("", "stop"), "data: [DONE]\n\n"].join("");
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
    const editButton = userMessage.getByTestId("edit-message-button");
    const bubble = userMessage.locator(".user-message-bubble");
    const [editBox, bubbleBox] = await Promise.all([editButton.boundingBox(), bubble.boundingBox()]);
    expect(editBox).not.toBeNull();
    expect(bubbleBox).not.toBeNull();
    expect(editBox!.y).toBeGreaterThanOrEqual(bubbleBox!.y + bubbleBox!.height);
    await editButton.click();
    await expect(page.getByTestId("user-edit-input")).toHaveValue("show me a code block");
    await page.getByTestId("user-edit-input").fill("edited request");
    await page.getByRole("button", { name: "提交编辑" }).click();
    await expect(page.locator('[data-role="user"]').last()).toContainText("edited request");
  } finally {
    await context.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});

test("renders each Chrome tool path without a generic tool group overlay", async () => {
  const { context, page, userDataDirectory } = await openExtension();
  let requestCount = 0;

  try {
    await context.route("https://provider.test/v1/chat/completions", async (route) => {
      requestCount += 1;
      await route.fulfill({
        status: 200,
        headers: {
          "cache-control": "no-cache",
          "content-type": "text/event-stream",
        },
        body: requestCount === 1 ? toolCallResponse() : textResponse("The tab query completed."),
      });
    });

    await configureProvider(context, page);
    await page.getByTestId("composer-input").fill("Inspect the active tabs.");
    await page.getByTestId("composer-input").press("Enter");

    await expect(page.getByTestId("chrome-tool-call")).toHaveCount(2);
    const summaries = page.getByTestId("chrome-tool-call").locator("summary");
    await expect(summaries.nth(0)).toContainText("tabs.query");
    await expect(summaries.nth(1)).toContainText("windows.getCurrent");
    expect((await summaries.allTextContents()).some((text) => text.includes("Tool call"))).toBe(false);
    await expect(page.locator(".tool-group")).toHaveCount(0);
    await expect(page.locator(".markdown-body").last()).toContainText("The tab query completed.");

    const toolBoxes = await page.getByTestId("chrome-tool-call").evaluateAll((items) => items.map((item) => {
      const box = item.getBoundingClientRect();
      const styles = getComputedStyle(item);
      return { top: box.top, bottom: box.bottom, borderWidth: styles.borderWidth };
    }));
    expect(toolBoxes[1].top - toolBoxes[0].bottom).toBeGreaterThanOrEqual(8);
    expect(toolBoxes.every((box) => box.borderWidth === "0px")).toBe(true);

    const layout = await page.evaluate(() => {
      const message = document.querySelector<HTMLElement>('[data-role="assistant"]:last-of-type');
      const footer = document.querySelector<HTMLElement>(".aui-thread-viewport-footer");
      if (!message || !footer) throw new Error("Assistant message layout was not rendered");
      return {
        messageBottom: message.getBoundingClientRect().bottom,
        footerTop: footer.getBoundingClientRect().top,
      };
    });
    expect(layout.messageBottom).toBeLessThanOrEqual(layout.footerTop + 1);
  } finally {
    await context.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
