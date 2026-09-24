# dsh-provider-manager

**所有 Provider，一页管理。**

[English](README.md) | 中文

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4D6BFE?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

DeepSeek Harness 的理念是*万物皆插件*。这个插件把它再往前推一步：**你在 DSH 里能用到的每一个 provider —— 编程订阅、公有 API、私有网关 —— 都在同一个设置页里管理。**

无论你带来的是什么 —— OpenCode Go 订阅、Command Code GOAT 套餐、ZCode GLM 编程套餐的 key、一个 OpenRouter 账号，还是你自己跑在 `127.0.0.1` 的网关 —— 流程完全一样：**一张卡片，粘贴 key，看到真实剩余额度，保存路由。** 不用编辑 YAML，不用来回敲命令行，不用猜模型选择器到底读的是哪份凭据。

已验证宿主：**DSH `0.1.5-rc.2`**。

## 理念：Provider 才是稀缺资源，所以要像资源一样管理它

今天模型质量只是及格线；真正决定你每天体验的，是**你能连上哪些 provider、用哪份凭据、还剩多少额度**。dsh-provider-manager 把这件事做成一等公民：

| 你带来什么 | 这一页给你什么 |
| --- | --- |
| **编程订阅** —— OpenCode Go、Command Code GOAT | 默认 key 编辑、官方实时额度（5 小时 / 周 / 月）、凭据来源核对 —— 并自带**内置 OpenCode Go 适配器**，无需第三方 Go 插件 |
| **公有 API key** —— 从 ZCode 到 OpenRouter 到 Meta 共 16 家预填 | 官方端点预填、中国/海外线路选择、按模型勾选 1M 上下文 |
| **登录型账户** —— Claude、Codex、Kimi、xAI、Copilot、OpenRouter | 经宿主授权服务的官方 OAuth / 设备码登录流；凭据写入官方凭据库，绝不回显 token |
| **你自己的网关** —— 本地代理、公司网关、中转 | 一个干净的自定义路由，选对协议，像内置 provider 一样命名管理 |
| **只有 CLI 的套餐** —— Muse Code | 一行如实的说明，而不是假装能接 |

0.2.9 把内置 **OpenCode Go (Provider Manager)** 连接扩到当前官方 Go 目录（31 个可调用模型；9 个仍列在详情表但协议未核实，暂不启用）。请手动选择新连接；安装不会修改默认模型或旧会话。两张 OpenCode 卡片仍共用 `OPENCODE_API_KEY`。[配置、限制与回滚](docs/opencode-integrated.md)。[目录证据](docs/opencode-all-models-evidence.md)。

## 页面上有什么

- **内置 OpenCode Go 适配器。** 路由 `provider-manager-opencode-go` 承载官方 Go 目录（41 个模型：31 个可调用、9 个协议未核实暂列、正式版 **Muse Spark 1.3** 走 Zen 端点并支持 `max` 档），按模型自动选协议、发送粘性 `x-opencode-session` 头，目录可从实时端点表刷新。配置、限制与回滚见 [docs/opencode-integrated.md](docs/opencode-integrated.md)。
- **长得像 LLM Providers 的台账。** 商标风格图标、LLM / Agent 标记、三列列表（连接 · 剩余窗口 · 详情）。配额留在列表上，key 和目录点一下进详情。
- **真实额度：只在 Host 查、只查官方接口。** OpenCode Go 请求 `GET https://opencode.ai/zen/go/v1/usage`；Command Code 请求 `GET https://api.commandcode.ai/alpha/billing/credits` —— 且仅当默认凭据可确认时。自定义端点显示**不支持**，绝不编造 100% 进度条。账户之间不合并。
- **16 家 API 预设，一卡一家。** **ZCode**（GLM 编程套餐，中国 / 海外，Anthropic 同卡切换）、**MiMo**（小米 Token Plan `tp-` key，中国 / 新加坡 / 欧洲）、**MiniMax**（中国 / 海外，Anthropic 同卡切换），另有 **OpenRouter、SiliconFlow、Moonshot、DeepSeek、OpenAI、Anthropic、Groq、Together、Fireworks、DashScope、Google Gemini、Mistral** —— 以及一键 **Meta Model API**（按量计费，不是 Muse Code 订阅）。
- **其余一切走自定义路由。** 任何 OpenAI-Completions、OpenAI-Responses 或 Anthropic-Messages 端点都能成为一等路由（`^[a-z][a-z0-9-]*$`），带保留名保护 —— 永远不会遮蔽 `opencode-go`、`commandcode`、`deepseek-official`、`cliproxy`。
- **按模型勾选 1M 上下文。** 每个可添加的模型带一个 **1M 上下文** 复选框，按官方容量预填（GLM-5.3 / Flash / 5.2、MiMo V2.5、MiniMax-M3、Gemini 2.5 Flash、GPT-4.1 mini、Muse Spark 为 1M；GLM-5-Turbo 为 200K；MiniMax-M2.7 为 204,800）。保存前自行勾选或取消；写入的是 `llm-pi-ai` 的 `models[].contextWindow`。
- **登录型 provider，端到端。** 经官方授权服务接入 Claude、Codex、Kimi、xAI、Copilot、OpenRouter 及所有带登录方式的 catalog provider（标准安装下 39 条流）——本插件亲自挂载宿主授权服务（官方 patch 树从未挂载过它），开箱即可登录。筛选 **ALL | LLM | OAuth**；凭据写入官方凭据库、本页不回显 token；卡片显示已登录账号、实时额度（有官方端点的家，60 分钟自动 + 手动刷新）与一键登出。
- **每个登录 provider 一份活的模型目录。** 通道可用性经真实探测验证（流式探测 + 实际服务模型核对，防上游静默替换），参数逐模型取自 models.dev，两者由独立版本化的目录仓库（[dsh-provider-models](https://github.com/KEVINCHEN625/dsh-provider-models)，双镜像、TTL 刷新 + 内置快照兜底）分发。登录后该 provider **经验证可用**的模型连同真实参数自动进入模型选择器——已下架的模型永不出现。
- **Muse Code 说清楚。** Everyday / High / Power **接不进 DSH**。这一行只报告 CLI 是否在 `PATH` 上，并给出 Meta Model API 的入口。要在 DSH 里跑 Spark，用 OpenCode Go —— 或另购 Meta Model API。
- **Key 不离开 Host。** 快照永不含密钥。显示 key 是仅限 loopback 的 `POST /provider-manager/reveal`，带真实 socket 校验；数值在隐藏、失焦、连接变化或 30 秒 TTL 后清空。见[安全](#安全)。

## 截图

设置 → **Provider 管理** —— 列表上就能看到剩余额度，点一下进详情：

![Provider 管理列表：OpenCode Go 剩余额度、Command Code、自定义 API、Muse Code](docs/images/provider-manager-list.png)

OpenCode Go 详情 —— 写默认 key；Host 读取 5 小时 / 周 / 月剩余：

![OpenCode Go 账户卡片](docs/images/provider-manager-opencode.png)

![OpenCode Go 剩余额度窗口](docs/images/provider-manager-quota.png)

Muse Code —— 仅 CLI，附一键添加 Meta Model API：

![Muse Code 详情：DSH 不把 Muse Code CLI 当原生适配器运行](docs/images/provider-manager-muse.png)

一键 Meta Model API 预填草稿（`openai-responses`，`https://api.meta.ai/v1`）：

![为 Meta Model API 预填的新增 provider 表单](docs/images/provider-manager-meta.png)

## 安装

本包声明 `dsh.bundle`，`dsh plugin add` 即激活一个设置层。官方说明：[Package and install a plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)。

请安装 **release tarball**（已含 `lib/`）。本包不携带 `prepare` 脚本，`github:KEVINCHEN625/dsh-provider-manager` 安装时不会编译 —— 这个插件经手凭据，不应要求 `allowBuilds`。

```sh
dsh plugin --profile web add --ignore-scripts --force \
  https://github.com/KEVINCHEN625/dsh-provider-manager/releases/download/v0.2.9/dsh-provider-manager-0.2.9.tgz
dsh --profile web --dump-config   # 应出现 "# == dsh-provider-manager"
dsh web
```

然后打开 **设置 → Provider 管理**。最新 tarball 见 [Releases](https://github.com/KEVINCHEN625/dsh-provider-manager/releases)，替换 URL 即可。

如果 web profile 本身是 pnpm workspace（`packages: [.]`），把 pnpm 的布尔参数 `--workspace-root` 放在 tarball **之前**：

```sh
dsh plugin --profile web add --workspace-root --ignore-scripts --force \
  ./dsh-provider-manager-0.2.9.tgz
```

命令成功和页面真实可用是两回事。装完请重启 Web。

### 内置 Go 与其他适配器

| 你想…… | 另需安装 |
| --- | --- |
| 在 DSH 里用 OpenCode Go / Spark 聊天 | Built in / 已内置：OpenCode Go (Provider Manager), no third-party Go plugin required |
| 用 Command Code GOAT 聊天 | [Command Code provider 插件](https://github.com/Mars-Sea/dsh-commandcode-provider) |
| Muse Code CLI 套餐 | 仅官方 Muse CLI —— **不是本插件，也不是 DSH** |

## 使用

列表显示图标、名称、LLM/Agent 标记、key 状态、主剩余窗口、详情。

**OpenCode Go** —— 默认引用 `OPENCODE_API_KEY`。额度来自官方 usage 端点。非官方 baseURL：额度不支持。

**Command Code GOAT** —— 仅默认引用 `COMMANDCODE_API_KEY`。字面 key、额外账户、`auth.json` 可能优先生效；本页面不读登录文件。来源不明确时显示 **source-unverified**，而不是假进度条。

**自定义 API** —— `llm-pi-ai` 路由。**添加 provider** 时若有匹配的已知 API 会预填。ZCode、MiMo、MiniMax、SiliconFlow、Moonshot 保持在**同一张卡**上：选**中国**或**海外**再保存。key 必须与签发它的控制台对应。

| 预设 | 说明 |
| --- | --- |
| **ZCode** | GLM 编程套餐（`glm-5.3-flash`、`glm-5.3`）。中国 `https://open.bigmodel.cn/api/coding/paas/v4`，海外 `https://api.z.ai/api/coding/paas/v4`。Anthropic Messages 用 `/api/anthropic`。**不要**用 `/api/paas/v4`。 |
| **MiMo** | 小米 Token Plan（`tp-` key，不是按量 `sk-`）。中国 `https://token-plan-cn.xiaomimimo.com/v1`，海外新加坡 `https://token-plan-sgp.xiaomimimo.com/v1`。欧洲集群是 `token-plan-ams` —— 以 Token Plan 页面显示为准。 |
| **MiniMax** | 中国 `https://api.minimax.cn/v1`，海外 `https://api.minimax.io/v1`。Anthropic 在同一张卡上用 `/anthropic`。 |
| **OpenRouter** | `https://openrouter.ai/api/v1` |
| SiliconFlow / Moonshot | 中国与海外 URL 同卡切换 |
| DeepSeek、OpenAI、Anthropic、Groq、Together、Fireworks、DashScope、Google Gemini、Mistral、Meta Model API | 官方 baseURL 预填 |

先保存配置，再保存 key。每个模型行可勾选 **1M 上下文**；写入 `llm-pi-ai` 的 `models[].contextWindow`（勾选为 1,048,576，不勾为该模型标注容量）。可选的兜底 context 字段只对未标注容量的 id 生效。环境变量名由路由派生（`DSH_PROVIDER_MANAGER_<hex(route)>_API_KEY`）。这些端点的额度查询**不支持**。保留路由：`opencode-go`、`commandcode`、`deepseek-official`、`cliproxy`、`muse-code`。

**Muse Code** —— 永远 `CLI_ONLY`。文档：[订阅说明](https://dev.meta.ai/docs/muse-code/subscriptions)、[Meta Model API for coding agents](https://dev.meta.ai/docs/guides/coding-agents)。

## 安全

- RPC 与快照永不回显 key 内容。
- 显示 key 需要来自**真实 loopback socket** 的已鉴权同源 POST —— 代理、隧道、`Origin: null` 一律拒绝。
- 显示出的数值在隐藏、返回、失焦、连接变化和 TTL（最长 30 秒）后清空。
- 额度请求只向上述 OpenCode / Command 官方 URL 携带 `Authorization: Bearer`。

远程浏览器需要 SSH 转发到 `127.0.0.1` 才能保存设置或显示 key。

## 路线图 —— 补全"everything"的最后几步

目标是每一个 provider 都能在 DSH 里用。按优先级：

1. **更多订阅额度适配器** —— Kimi for Coding、GLM 编程套餐、MiniMax Coding、Codex / ChatGPT、Claude Pro/Max、Grok Build：给它们与 OpenCode Go、Command Code 同等的官方端点台账待遇（含 OAuth 账户的额度读取）。
2. **保存即验 key** —— 粘贴新 key 时先向 provider 验证有效性，再让你信任这张卡。
3. **模型发现** —— 在手动录入之外，一键拉取 provider 的实时模型目录。
4. **多账户** —— 对允许的套餐做每 provider 的 key 池与轮换。

## 卸载

```sh
dsh plugin --profile web remove dsh-provider-manager
dsh web
```

卸载本 bundle 会移除其内置 `provider-manager-opencode-go` 连接。凭据、自定义 `llm-pi-ai` 路由、单独安装的旧 `opencode-go` 插件与 Command Code 保留。继续使用内置路由的会话前，请先切换至仍可用的 provider。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm test:client
pnpm build && pnpm check:pack
```

设计、部署证据与评审记录在 [`docs/`](docs/)。插件只调用 dsh 公开服务 —— `settings`、`credentials`、`llm` —— 不 patch 宿主，也不 patch 其他插件。

## 许可

[MIT](LICENSE)
