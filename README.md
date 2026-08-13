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

### GitHub Autobuild Release

每次分支提交都会触发 GitHub Actions 构建，并替换 GitHub Release 中固定的 `Autobuild` 版本。Release 提供 `side-agent-runtime-autobuild.zip`，解压后选择包含 `manifest.json` 的目录即可在 `chrome://extensions` 中加载。

Chrome 不允许未经过 Chrome Web Store 或企业策略签名的扩展绕过开发者模式直接安装，因此 Autobuild 使用标准的可加载扩展 ZIP，并同时提供 SHA-256 校验文件。

### 安装渠道与自动更新

当前 Autobuild 是开发版安装包：通过“加载已解压的扩展程序”安装后，Chrome 不会从 GitHub Release 自动更新它。更新开发版需要下载新的 ZIP、替换 `dist/` 内容并在 `chrome://extensions` 点击“重新加载”。`update_url` 也不能把一个已加载的 unpacked 扩展变成自动更新扩展。

如果以后需要面向普通 Chrome 用户自动更新，优先使用 Chrome Web Store：

- **Unlisted**：不出现在商店搜索中，但持有链接的用户可以安装，适合本项目的公开测试和个人分发。
- **Private**：只允许指定测试账号或组织用户安装。
- **Public**：面向所有用户公开发布。

这三种可见性都需要经过 Chrome Web Store 审核。每次上传的新版本都必须比上一版本的 `manifest.version` 更高；还需要准备扩展图标、截图、商店描述、单一用途说明、权限理由、数据使用声明和隐私政策。当前项目暂未接入 Web Store 发布流程，也没有配置商店图标、商店资料或发布凭据。

后续可以通过 Chrome Web Store Publish API 接入 GitHub Actions：在 Chrome Developer Dashboard 创建扩展条目，在 Google Cloud 启用 API 并创建 Service Account，然后把发布凭据存入 GitHub Actions Secrets。建议只在 `main` 或版本 tag 上提交商店版本；每个 commit 继续使用本节上方的 Autobuild Release，因为商店更新可能进入审核队列。

完全脱离 Chrome Web Store 的自托管更新需要固定私钥签名的 `.crx`、HTTPS 更新 XML、`update_url` 和 Chrome 企业策略；Windows/macOS 普通用户不能通过普通 ZIP 或 CRX 安装这类公开自托管扩展。因此它只适合受控设备或企业环境。

参考：[Chrome 扩展分发](https://developer.chrome.com/docs/extensions/how-to/distribute)、[更新生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle)、[Web Store 发布](https://developer.chrome.com/docs/webstore/publish/)、[Web Store API](https://developer.chrome.com/docs/webstore/using-api?authuser=2)。

## 模型配置

点击 Side Panel 的“打开设置”，或在扩展详情页打开“扩展程序选项”，进入独立设置页填写：

- OpenAI-compatible API 的 Base URL，例如 `https://api.openai.com/v1`。
- 模型 ID。
- API Key。

点击“保存配置”后，三项配置才会写入 `chrome.storage.local`；编辑过程不会自动保存。关闭 Side Panel 会停止当前 Agent、清理 Chrome handles 和 Debugger sessions，并丢弃聊天状态与当前运行消息；模型配置会保留。

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
