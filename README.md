# Side Agent Runtime

一个纯 Manifest V3 Chrome 扩展：在 Chrome Side Panel 中运行 Vercel AI SDK Agent，并通过一个动态 `chrome` 工具调用 Chrome 扩展 API 和 Chrome DevTools Protocol。

## 开发

```bash
npm install
npm run dev
```

构建并加载扩展：

```bash
npm run build
```

在 `chrome://extensions` 打开“开发者模式”，选择“加载已解压的扩展程序”，然后选择 `dist/`。点击扩展 Action 图标即可打开 Side Panel。

## 模型配置

Side Panel 中填写：

- OpenAI-compatible API 的 Base URL，例如 `https://api.openai.com/v1`。
- 模型 ID。
- API Key。

三项配置会自动保存到 `chrome.storage.local`；保存完成后配置区自动折叠隐藏，点击“编辑”可重新显示。关闭 Side Panel 会停止当前 Agent、清理 Chrome handles 和 Debugger sessions，并丢弃聊天状态与当前运行消息；模型配置会保留。

Agent 的 Thinking、Assistant 流式 Markdown、工具调用和工具结果按事件到达顺序显示。Thinking 和工具调用运行时展开，完成后自动折叠；消息区固定在侧栏内部滚动，并在用户没有上滑时自动跟随底部。Assistant 文本不使用气泡样式。

## 动态 Chrome 工具

Agent 只看到一个工具：`chrome`。

```json
{
  "operation": "call",
  "path": "tabs.query",
  "args": [{ "active": true, "currentWindow": true }]
}
```

`args` 也可以直接写成单个 options 对象，运行时会自动包装成一个参数。Manifest V3 不再暴露 `chrome.tabs.executeScript`：扩展文件或函数注入使用 `chrome.scripting.executeScript`，任意字符串脚本使用 `cdp` 的 `Runtime.evaluate`。

支持的操作：

- `describe`：查看当前 namespace、方法、事件和权限。
- `call`：调用任意已暴露且已授权的 `chrome.*` 方法。
- `waitEvent`：等待 Chrome Event，可通过 `match` 对事件参数做结构匹配。
- `cdp`：attach/send/detach 原始 CDP 命令；页面 JavaScript 使用 `Runtime.evaluate`。

扩展不设置 Agent 步数、工具次数、消息长度、工具输出大小或任务时长上限。Agent 使用 AI SDK 的自然结束条件；用户停止或 Side Panel 关闭时通过 `AbortController` 取消。

## 验证

```bash
npm run check
npm test
npm run test:e2e
```

E2E 测试会加载 `dist/`，打开 Side Panel，并从扩展页面 attach 到测试 tab 执行 CDP `Runtime.evaluate`。

真实 OpenRouter E2E 使用运行时环境变量，不把 API Key 写入仓库：

```bash
OPENROUTER_API_KEY='your-key' npm run test:e2e -- e2e/openrouter.live.spec.ts
```

它会使用 OpenRouter 的 OpenAI-compatible endpoint、指定模型，验证流式回答以及一次真实的 `chrome.tabs.query` 工具调用。

## 平台边界

Manifest V3 的权限、Chrome 安装确认、受保护页面、Chrome 策略、Debugger 支持的 CDP domain、Provider 上下文窗口/限流和浏览器资源限制仍由平台控制。新增 Chrome API 方法通常不需要新增工具代码；如果新 API 引入新的 manifest permission，仍需更新 `public/manifest.json`。
