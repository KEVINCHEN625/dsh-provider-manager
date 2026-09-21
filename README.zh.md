# dsh-provider-manager

[English](README.md) | 中文

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4D6BFE?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 **Provider** 设置插件：一张紧凑台账，同时看 OpenCode Go 配额、Command Code 配额、自定义 API，以及如实说明的 Muse Code。

它 **不替代** [LLM Providers](https://github.com/NOirBRight/dsh-llm-providers-ui)、[OpenCode Go](https://github.com/NOirBRight/dsh-llm-opencode-go) 或 Command Code。聊天仍走那些适配器。这个页面用来 **看剩余配额、写默认 key、加自定义 API**，不用离开设置。

已验证宿主：**DSH `0.1.5-rc.2`**。

## 为什么用这个插件

- **长得像 LLM Providers。** 商标风格图标、LLM / Agent 标记、三列台账（连接 · 剩余窗口 · 详情）。配额留在列表，key 和目录在独立详情页。
- **配额只在 Host 查官方接口。** OpenCode Go：`GET https://opencode.ai/zen/go/v1/usage`。Command Code：仅在默认凭据可确认时请求 `GET https://api.commandcode.ai/alpha/billing/credits`。自定义接口显示 **不支持**，绝不编造 100% 进度条。账户之间不合并。
- **不抢原生编辑器。** 套餐过滤、模型目录、GOAT 资格仍在 **设置 → LLM Providers** 和 **设置 → Models / Command Code**。
- **自定义 API 预填。** **ZCode、MiMo、MiniMax** 各一张卡片，可选 **中国 / 海外** URL。另有 OpenRouter、SiliconFlow、Moonshot、DeepSeek、OpenAI、Anthropic、Groq、Together、Fireworks、DashScope、Gemini、Mistral，以及一键 **Meta Model API**。Meta 是 **按量计费**，不是 Muse Code CLI 套餐。
- **Muse Code 说清楚。** Everyday / High / Power **接不进 DSH**。这一行只报告 CLI 是否在 `PATH` 上。要在 DSH 里跑 Spark，用 OpenCode Go（或另购 Meta Model API）。
- **Key 不离开 Host。** 快照不含密钥。显示 key 仅限 loopback 的 `POST /provider-manager/reveal`。

## 截图

设置 → **Provider 管理** — 列表上就能看到剩余配额，点一下进详情：

![Provider 管理列表：OpenCode Go 剩余配额、Command Code、自定义 API、Muse Code](docs/images/provider-manager-list.png)

OpenCode Go 详情 — 写默认 key；Host 读取 5 小时 / 周 / 月剩余：

![OpenCode Go 账户卡片](docs/images/provider-manager-opencode.png)

![OpenCode Go 剩余配额窗口](docs/images/provider-manager-quota.png)

Muse Code — 仅 CLI，可一键添加 Meta Model API：

![Muse Code 详情：DSH 没有把 Muse Code CLI 做成原生适配器](docs/images/provider-manager-muse.png)

一键预填 Meta Model API（`openai-responses`，`https://api.meta.ai/v1`）：

![添加 provider 表单，已预填 Meta Model API](docs/images/provider-manager-meta.png)

## 安装

本包声明了 `dsh.bundle`，`dsh plugin add` 会激活一层配置。官方说明：[打包与安装插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)。

请安装 **已经包含 `lib/` 的 release tarball**。我们不提供 `prepare` 脚本，因此 `github:KEVINCHEN625/dsh-provider-manager` 在安装时不会编译——本插件处理凭据，不应要求用户 `allowBuilds`。

```sh
dsh plugin --profile web add --ignore-scripts --force \
  https://github.com/KEVINCHEN625/dsh-provider-manager/releases/download/v0.2.3/dsh-provider-manager-0.2.3.tgz
dsh --profile web --dump-config   # 寻找 "# == dsh-provider-manager"
dsh web
```

然后打开 **设置 → Provider 管理**。

若 web profile **本身**是 pnpm workspace（该目录有 `packages: [.]`），在 tarball 前加上布尔标志 `--workspace-root`：

```sh
dsh plugin --profile web add --workspace-root --ignore-scripts --force \
  ./dsh-provider-manager-0.2.3.tgz
```

CLI 显示安装成功，和正在运行的进程已经加载新入口，是两件事情。加完请重启 Web。

### 聊天仍要装对应的适配器

| 你想…                                | 还需要                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 在 DSH 里用 OpenCode Go / Spark 聊天 | [`dsh-llm-opencode-go`](https://github.com/NOirBRight/dsh-llm-opencode-go) + [`dsh-llm-providers-ui`](https://github.com/NOirBRight/dsh-llm-providers-ui) |
| 用 Command Code GOAT 聊天            | Command Code 插件                                                                                                                                         |
| 使用 Muse Code CLI 套餐              | 只用官方 Muse CLI — **不是本插件，也不是 DSH**                                                                                                            |

## 使用

列表显示图标、名称、LLM/Agent 标记、key 状态、主窗口剩余、详情。

**OpenCode Go** — 默认引用 `OPENCODE_API_KEY`。配额来自官方 usage 接口。非官方 base URL：不查询配额。

**Command Code GOAT** — 只管理默认引用 `COMMANDCODE_API_KEY`。字面 key、多账户和 `auth.json` 可能优先；本页不读登录文件。来源不明确时显示 **source-unverified**，而不是假进度条。

**自定义 API** — `llm-pi-ai` 路由 `^[a-z][a-z0-9-]*$`。**添加 provider** 可以从常用 API 开始。ZCode、MiMo、MiniMax、SiliconFlow、Moonshot 都是 **一张卡片**：选 **中国** 或 **海外** 再保存。key 必须和签发它的控制台一致。

| 预填                                                                                                      | 说明                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ZCode**                                                                                                 | GLM 编程套餐（`glm-5.3-flash`、`glm-5.3`）。中国 `https://open.bigmodel.cn/api/coding/paas/v4`，海外 `https://api.z.ai/api/coding/paas/v4`。同一张卡片上 Anthropic Messages 用 `/api/anthropic`。不要用 `/api/paas/v4`。 |
| **MiMo**                                                                                                  | 小米 Token Plan（`tp-` key，不要用按量 `sk-`）。中国 `https://token-plan-cn.xiaomimimo.com/v1`，海外新加坡 `https://token-plan-sgp.xiaomimimo.com/v1`。欧洲集群是 `token-plan-ams`，若控制台显示这个地址请自行粘贴。     |
| **MiniMax**                                                                                               | 中国 `https://api.minimax.cn/v1`，海外 `https://api.minimax.io/v1`。同一张卡片上 Anthropic 用 `/anthropic`。                                                                                                             |
| **OpenRouter**                                                                                            | `https://openrouter.ai/api/v1`                                                                                                                                                                                           |
| SiliconFlow / Moonshot                                                                                    | 同一张卡片上切换中国 / 海外 URL                                                                                                                                                                                          |
| DeepSeek、OpenAI、Anthropic、Groq、Together、Fireworks、DashScope、Google Gemini、Mistral、Meta Model API | 预填官方 Base URL                                                                                                                                                                                                        |

先保存配置，再保存 key。环境变量由路由派生（`DSH_PROVIDER_MANAGER_<hex(route)>_API_KEY`）。这些接口 **不支持** 配额查询。保留名：`opencode-go`、`commandcode`、`deepseek-official`、`cliproxy`、`muse-code`。

**Muse Code** — 始终 `CLI_ONLY`。文档：[套餐](https://dev.meta.ai/docs/muse-code/subscriptions)、[Meta Model API](https://dev.meta.ai/docs/guides/coding-agents)。

## 安全

- RPC 和快照从不回显 key
- 显示 key 必须是已认证、同源、来自 **真实 loopback socket** 的 POST（反向代理、隧道、`Origin: null` 会被拒绝）
- 显示后的 key 会在隐藏、返回、失焦、连接变化和 TTL（最长 30 秒）时清除
- 查询配额时，只对上文官方 OpenCode / Command URL 发送 `Authorization: Bearer`

远程浏览器若要写入设置或显示 key，请 SSH 转发到 `127.0.0.1`。

## 卸载

```sh
dsh plugin --profile web remove dsh-provider-manager
dsh web
```

只移除本插件。凭据、自定义 `llm-pi-ai` 路由、OpenCode Go、Command Code 都保留。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm test
pnpm run test:client
pnpm run format:check
pnpm run check:pack
```

Host、client 和 Cordis patch 都只在本仓库。不要为了「让 Muse 变成本地适配器」去改 DSH 核心。发到 GitHub 时请加上 `dsh-plugin` topic。

## 许可证

[MIT](LICENSE)
