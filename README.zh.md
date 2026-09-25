# dsh-provider-manager

**所有 Provider，一页管理。**

[English](README.md) | 中文

![dsh-provider-manager 引导图](docs/images/banner-zh.png)

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4D6BFE?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

你的模型来自很多地方——Codex 订阅、Claude Pro、OpenCode Go 套餐、OpenRouter 账号，也许还有自己的网关。过去每接一家都要折腾一遍：找个地方贴 key、改 YAML，然后对着模型选择器里一个早就下架的模型发呆。

这个页面把这一切终结掉。**登录一次或贴一次 key——额度一目了然，模型自己出现在选择器里：名字是对的、上下文是真的、effort 档是真的能用的。** 全部收在一个设置页里，凭据存进 DSH 的官方凭据库。

适配 **DSH `0.1.5-rc.2`**。当前版本：**v0.4.0**。

## 需要 OAuth 登录的 provider

用你已经在付费的账号直接登录——Codex、Claude、Kimi、xAI、GitHub Copilot、OpenRouter，以及所有提供登录方式的 provider（标准安装下 39 家），Muse 走设备码。

| | |
| --- | --- |
| **登录** | 页面内完成标准 OAuth / 设备码流程，开箱即用 |
| **登录之后** | 该家的模型自动出现在选择器里，带真实的上下文窗口、输出上限、正式显示名和通道真正支持的 effort 档（`off / low / medium / high / xhigh / max`）。已下架的模型不会出现 |
| **卡片** | 品牌厂标、登录的是哪个账号、额度还剩多少（60 分钟自动刷新 + 手动按钮，凡是 provider 有官方端点的都有）、一键登出 |
| **浏览** | **ALL \| LLM \| OAuth** 三个页签；凭据进 DSH 官方凭据库，永不回显 |

### 为什么可以放心用这个模型列表

你登录时，插件会用极小的请求（一次最多 8 个、每个模型每天最多一次）逐个向 provider 验证，并读取**实际应答的是哪个模型**。provider 悄悄下架或偷换模型，验证能抓到；没验证过的一律不进你的选择器。参数与 [models.dev](https://models.dev) 交叉核对；可用性数据来自社区注册表（[dsh-provider-models](https://github.com/KEVINCHEN625/dsh-provider-models)），更新不需要发插件新版本。OpenRouter 的几百个模型用精选短清单 + 搜索添加来保持好用。

## 使用 API key 的 provider

- **OpenCode Go，内置。** 不用再装任何插件。连接直接承载官方 Go 目录——41 个模型，每个说自己该说的协议，含 `max` 档的 Muse Spark 1.3。[配置、限制与回滚](docs/opencode-integrated.md) · [目录证据](docs/opencode-all-models-evidence.md)
- **Command Code GOAT** —— 管 key、看官方额度；聊天走 [Command Code provider 插件](https://github.com/Mars-Sea/dsh-commandcode-provider)。
- **只显示真数字。** OpenCode Go 和 Command Code 直读 provider 官方的用量接口；自定义端点就老实显示**不支持**，不编进度条。
- **16 家预设，一卡一家。** **ZCode**（GLM 编程套餐）、**MiMo**（小米 Token Plan）、**MiniMax**——中国 / 海外端点同卡切换——另有 **OpenRouter、SiliconFlow、Moonshot、DeepSeek、OpenAI、Anthropic、Groq、Together、Fireworks、DashScope、Google Gemini、Mistral**，以及一键 **Meta Model API**。OpenRouter 在这页两边都有：这里是 API key，上面是登录。
- **其他一切都能变成自定义路由。** 任何 OpenAI-Completions、OpenAI-Responses 或 Anthropic-Messages 端点，命名和管理方式与内置的一模一样——且永远不会与保留名冲突。
- **按模型勾 1M 上下文。** 每个模型一个复选框，按官方容量预填，保存前随你改。

## 截图

登录一次——模型已经在选择器里等你：

![登录 Codex 后的模型选择器：规范名，以及 GPT-6 Sol 从 Off 到 Max 的档位](docs/images/provider-manager-picker.png)

页面本身——**设置 → Provider 管理**，所有 provider 一张列表：

![Provider 管理列表：ALL、LLM、OAuth 三个分页，品牌卡片，以及 OpenCode Go 的剩余额度](docs/images/provider-manager-list.png)

OAuth 页——Codex 已登录，其余各家在自己的厂标后面等你：

![OAuth 页：Codex 已登录，其余 provider 未登录](docs/images/provider-manager-oauth-tab.png)

登录后的详情长这样——真实的名字、真实的窗口、effort 档，下架的明确标出不可用：

![Codex 模型表：规范名、上下文窗口、含 off 的档位](docs/images/provider-manager-codex-models.png)

OpenCode Go——key 全程掩码；额度窗口直接来自官方：

![OpenCode Go 账户卡片，key 掩码](docs/images/provider-manager-opencode.png)

![OpenCode Go 5 小时 / 周 / 月剩余额度](docs/images/provider-manager-quota.png)

Muse——想用的时候设备码登录即可：

![Muse 卡片未登录态，显示登录入口](docs/images/provider-manager-muse.png)

一键 Meta Model API 预填（`openai-responses`，`https://api.meta.ai/v1`）：

![为 Meta Model API 预填的新增 provider 表单](docs/images/provider-manager-meta.png)

## 安装

本包声明 `dsh.bundle`，`dsh plugin add` 即激活一个设置层。官方说明：[Package and install a plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)。

请安装 **release tarball**（已含 `lib/`）。本包不携带 `prepare` 脚本，`github:KEVINCHEN625/dsh-provider-manager` 安装时不会编译——本插件经手凭据，不应要求 `allowBuilds`。

```sh
dsh plugin --profile web add --ignore-scripts --force \
  https://github.com/KEVINCHEN625/dsh-provider-manager/releases/download/v0.4.0/dsh-provider-manager-0.4.0-664a895a3f1b.tgz
dsh --profile web --dump-config   # 应出现 "# == dsh-provider-manager"
dsh web
```

装完打开 **设置 → Provider 管理**。最新 tarball 见 [Releases](https://github.com/KEVINCHEN625/dsh-provider-manager/releases)。

如果 web profile 本身是 pnpm workspace（`packages: [.]`），把 pnpm 的布尔参数 `--workspace-root` 放在 tarball **之前**：

```sh
dsh plugin --profile web add --workspace-root --ignore-scripts --force \
  ./dsh-provider-manager-0.4.0-664a895a3f1b.tgz
```

装完重启 Web，设置页就在那里。

### DSH Desktop

[DSH Desktop](https://github.com/anywhere-labs/dsh-desktop)（v2.0.14+，内置 dsh 0.1.7-rc.1）从 0.4.1 起与本插件兼容。托盘打开 **Open DSH Terminal**，执行同样的 `dsh plugin add` 命令，然后重启应用即可。Desktop 使用独立的 dsh home，凭据与路由按安装各自管理。完整走查清单：[docs/desktop-walkthrough.md](docs/desktop-walkthrough.md)。注意：Desktop 首次启动会把 `~/.dsh/settings.yaml` 导入自己的 profile 并把原文件改名为 `.imported`——CLI/Web 用户请复制回来（一条命令，见走查清单）。

### 聊天由哪个适配器承载

| Provider | 聊天运行在 |
| --- | --- |
| OpenCode Go / Spark | **内置** —— `provider-manager-opencode-go`，无需第三方插件 |
| Muse | **内置** —— 设备码登录后的 `provider-manager-muse`（5 个模型；仅 Spark 1.3 带 `max`） |
| Command Code GOAT | [Command Code provider 插件](https://github.com/Mars-Sea/dsh-commandcode-provider) |
| 登录型（Codex、Claude…） | 宿主 `llm-pi-ai` 的同名路由 |
| 自定义网关 | 你创建的 `llm-pi-ai` 自定义路由 |

## 使用

列表显示品牌厂标、名称、LLM/Agent 标记、key 状态、剩余额度，每张卡片点进详情。

**OpenCode Go** —— key 引用 `OPENCODE_API_KEY`。额度来自官方 usage 端点。

**Command Code GOAT** —— key 引用 `COMMANDCODE_API_KEY`。如果你的环境里有字面 key、多账户或 `auth.json` 优先生效，卡片会标 **source-unverified**，绝不瞎猜。

**自定义 API** —— 选预设或从零开始。ZCode、MiMo、MiniMax、SiliconFlow、Moonshot 中国 / 海外同卡；key 必须与签发它的控制台对应。

| 预设 | 说明 |
| --- | --- |
| **ZCode** | GLM 编程套餐（`glm-5.3-flash`、`glm-5.3`）。中国 `https://open.bigmodel.cn/api/coding/paas/v4`，海外 `https://api.z.ai/api/coding/paas/v4`。Anthropic Messages 用 `/api/anthropic`。**不要**用 `/api/paas/v4`。 |
| **MiMo** | 小米 Token Plan（`tp-` key，不是按量 `sk-`）。中国 `https://token-plan-cn.xiaomimimo.com/v1`，海外新加坡 `https://token-plan-sgp.xiaomimimo.com/v1`。欧洲集群是 `token-plan-ams`——以 Token Plan 页面显示为准。 |
| **MiniMax** | 中国 `https://api.minimax.cn/v1`，海外 `https://api.minimax.io/v1`。Anthropic 在同一张卡上用 `/anthropic`。 |
| **OpenRouter** | `https://openrouter.ai/api/v1` |
| SiliconFlow / Moonshot | 中国与海外 URL 同卡切换 |
| DeepSeek、OpenAI、Anthropic、Groq、Together、Fireworks、DashScope、Google Gemini、Mistral、Meta Model API | 官方 baseURL 预填 |

先保存配置，再保存 key。每个模型行有 **1M 上下文** 复选框；环境变量名由路由派生（`DSH_PROVIDER_MANAGER_<hex(route)>_API_KEY`）。保留路由：`opencode-go`、`commandcode`、`deepseek-official`、`cliproxy`、`muse-code`、`provider-manager-opencode-go`、`provider-manager-muse`。

## 安全

- key 与 token 永不出宿主进程；快照和日志里永远没有。
- 显示 key 需要来自**真实 loopback socket** 的已鉴权请求——代理、隧道、`Origin: null` 一律拒绝——数值在隐藏、失焦、连接变化或 30 秒后自动清空。
- 额度查询与模型验证只访问 provider 官方端点、绝不带输出上限参数、每模型每 24 小时至多一次。

用远程浏览器？SSH 转发到 `127.0.0.1` 再保存设置或显示 key。

## 接下来

1. **更多通道数据** —— 每家的已验证模型清单随用户登录不断充实。
2. **保存即验 key** —— 新 key 先测过再让你信任这张卡。
3. **多账户** —— 允许的套餐做 key 池与轮换。
4. **更多额度适配** —— 登录型家族的同款官方额度待遇。

## 卸载

```sh
dsh plugin --profile web remove dsh-provider-manager
dsh web
```

移除本插件会移除内置的 `provider-manager-opencode-go` 与 `provider-manager-muse` 连接。你的凭据、自定义路由和其他 provider 插件全部保留。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm test:client
pnpm build && pnpm check:pack
```

设计文档、部署证据与评审记录在 [`docs/`](docs/)。

## 商标

卡片上的品牌厂标来自 [simple-icons](https://simpleicons.org)（有收录的厂商）；OpenAI、Groq、Amazon Bedrock、Azure、Cerebras、Fireworks、Together、Baseten、Z.ai、蚂蚁集团、Pi 为各厂商公开发布的标识，以同样方式内嵌。每个标识是其所有者的商标，仅用于识别对应 provider。无标识的 provider 保持首字母徽章。

## 许可

[MIT](LICENSE)
