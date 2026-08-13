import { test, expect, chromium } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

type ColorScheme = "light" | "dark";

function assertNeutralColors(colors: string[]) {
  for (const color of colors) {
    const match = color.match(/rgba?\(([^)]+)\)/);
    if (!match) continue;
    const channels = match[1]
      .split(",")
      .slice(0, 3)
      .map((channel) => Number.parseFloat(channel.trim()));
    expect(channels.every((channel) => channel === channels[0])).toBe(true);
  }
}

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
    await expect(extensionPage.locator("[data-testid=app-eyebrow], .status-pill, .hint, .send-button, .clear-config-button")).toHaveCount(0);

    const layout = await extensionPage.evaluate(() => {
      const shell = document.querySelector<HTMLElement>("[data-testid=sidepanel-shell]");
      const chat = document.querySelector<HTMLElement>("[data-testid=chat-scroll]");
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
    expect(manifest.options_page).toBe("options.html");
    expect(manifest.permissions).toContain("debugger");
    await expect.poll(() => extensionPage.evaluate(() => chrome.sidePanel.getPanelBehavior()))
      .toMatchObject({ openPanelOnActionClick: true });

    await expect(extensionPage.getByTestId("config-card").locator("input")).toHaveCount(0);
    await expect(extensionPage.getByTestId("config-card")).toContainText("尚未配置模型");

    const [optionsPage] = await Promise.all([
      context.waitForEvent("page"),
      extensionPage.getByTestId("open-settings").click(),
    ]);
    await optionsPage.waitForLoadState("domcontentloaded");
    await expect(optionsPage.locator("h1")).toHaveText("模型设置");
    const configInputs = optionsPage.getByTestId("options-card").locator("input");
    await expect(configInputs).toHaveCount(3);
    await configInputs.nth(0).fill("https://provider.test/v1");
    await configInputs.nth(1).fill("test-model");
    await configInputs.nth(2).fill("test-key");
    await expect(extensionPage.getByTestId("config-card")).toContainText("尚未配置模型");
    await optionsPage.getByRole("button", { name: "保存配置" }).click();
    await expect(optionsPage.locator(".save-message.saved")).toBeVisible();
    await expect(extensionPage.getByTestId("config-card")).toContainText("配置已保存");
    await optionsPage.close();

    const composer = extensionPage.getByTestId("composer-input");
    await expect(extensionPage.getByTestId("thread-viewport")).toHaveCSS("overflow-y", "auto");
    await composer.fill("first line");
    await composer.press("Meta+Enter");
    await expect(composer).toHaveValue("first line\n");
    await composer.fill("enter submits");
    await composer.press("Enter");
    await expect(extensionPage.locator('[data-role="user"]')).toContainText("enter submits");
    expect(await composer.getAttribute("maxlength")).toBeNull();
    await extensionPage.close();
    const reopened = await context.newPage();
    await reopened.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(reopened.getByTestId("composer-input")).toHaveValue("");
    await expect(reopened.getByTestId("config-card")).toContainText("配置已保存");
    await expect(reopened.getByTestId("config-card").locator("input")).toHaveCount(0);
    await expect(reopened.locator(".clear-config-button")).toHaveCount(0);

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

test("follows the system color scheme with a grayscale palette", async () => {
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDirectory = await mkdtemp(resolve(tmpdir(), "side-agent-theme-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDirectory, {
    executablePath: chromium.executablePath(),
    headless: true,
    colorScheme: "light",
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
    const sidepanel = await context.newPage();
    const optionsPage = await context.newPage();
    await sidepanel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(sidepanel.getByTestId("config-card")).toBeVisible();
    await expect(optionsPage.getByTestId("options-card")).toBeVisible();

    for (const colorScheme of ["light", "dark"] as const satisfies readonly ColorScheme[]) {
      await sidepanel.emulateMedia({ colorScheme });
      await optionsPage.emulateMedia({ colorScheme });

      await expect.poll(() => sidepanel.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(colorScheme);
      await expect.poll(() => optionsPage.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(colorScheme);

      const sidepanelTheme = await sidepanel.evaluate(() => {
        const elements = [
          document.body,
          document.querySelector<HTMLElement>(".config-card"),
          document.querySelector<HTMLElement>(".open-settings-button"),
          document.querySelector<HTMLElement>(".empty-icon"),
        ].filter((element): element is HTMLElement => Boolean(element));
        const colors = elements.flatMap((element) => {
          const styles = getComputedStyle(element);
          return [styles.backgroundColor, styles.color, styles.borderTopColor, styles.borderBottomColor];
        });
        return {
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          colors,
        };
      });
      const optionsTheme = await optionsPage.evaluate(() => {
        const elements = [
          document.body,
          document.querySelector<HTMLElement>(".options-card"),
          document.querySelector<HTMLElement>(".options-card input"),
          document.querySelector<HTMLElement>(".options-card button"),
        ].filter((element): element is HTMLElement => Boolean(element));
        const colors = elements.flatMap((element) => {
          const styles = getComputedStyle(element);
          return [styles.backgroundColor, styles.color, styles.borderTopColor, styles.borderBottomColor];
        });
        return {
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          colors,
        };
      });

      const expectedBackground = colorScheme === "light" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
      expect(sidepanelTheme.bodyBackground).toBe(expectedBackground);
      expect(optionsTheme.bodyBackground).toBe(expectedBackground);
      assertNeutralColors(sidepanelTheme.colors);
      assertNeutralColors(optionsTheme.colors);
    }
  } finally {
    await context.close();
  }
});
