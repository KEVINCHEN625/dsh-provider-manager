# dsh-provider-manager

**所有 Provider，一页管理。**

[English](README.md) | 中文

![dsh-provider-manager 引导图](docs/images/banner-zh.png)

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4D6BFE?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

DeepSeek Harness 的理念是*万物皆插件*。本插件把这句话补完在 provider 上：**你在 DSH 里能用到的每一个 provider —— 订阅登录、公有 API、私有网关 —— 从凭据、额度到模型选择器，全部收在一个设置页里。**

两个家族，一本台账：

- **OAuth 登录型** —— Codex、Claude、Kimi、xAI、Copilot、OpenRouter、Muse。登录一次，经验证的模型连同真实参数自动进入模型选择器。
- **LLM Provider（API key）型** —— 内置适配器的 OpenCode Go、Command Code GOAT、16 家预填预设、任意自定义网关。

已验证宿主：**DSH `0.1.5-rc.2`**。当前版本：**v0.4.0**。

## OAuth 登录 —— 登录即见模型

| | |
| --- | --- |
| **覆盖** | Codex、Claude、Kimi、xAI、GitHub Copilot、OpenRouter 及所有带登录方式的 catalog provider（标准安装下 39 条流），外加非官方的 **Muse** 设备码登录（自备订阅；client id 为 Muse CLI 公开值） |
| **流程** | 经宿主授权服务的官方 OAuth / 设备码流 —— 宿主 patch 树从未挂载该服务，由本插件亲自挂载，开箱即可登录 |
| **登录后** | 该 provider **经验证可用**的模型自动注入模型选择器：逐模型的真实上下文窗口、输出上限、官方显示名与 effort 档位（按通道支持 `off / low / medium / high / xhigh / max`）。已下架的模型永不出现 |
| **卡片** | 品牌厂标、已登录账号、有官方端点的家显示实时额度（60 分钟自动 + 手动刷新）、一键登出、"将覆盖现有登录"提示 |
| **筛选** | **ALL \| LLM \| OAuth** 三个页签；凭据写入官方凭据库，token 永不回显 |

### 模型清单如何保持真实

通道现实靠**探测**而不是假设：登录触发一次轻量验证（每批 8 个、每模型 24 小时冷却、绝不携带输出上限参数），从每次响应中读取**实际服务模型**——对上游静默替换免疫。结果按模型记录为 `available`（可用）、`unavailable`（已探并被拒）或 `unverified`（未验证，永不进选择器），参数与 [models.dev](https://models.dev) 交叉核对。可用性数据由独立版本化的注册表分发——[dsh-provider-models](https://github.com/KEVINCHEN625/dsh-provider-models)（双镜像、TTL 刷新、内置快照兜底）；探测结果本地持久并按模型覆盖注册表。宿主的 `off` 档映射为通道 wire 值 `none`（仅探测确认过的模型）。OpenRouter 用精选 top-N 种子保持可驾驭（免费组 + 最新 + 白名单，上限 50），另有**从目录添加**且不被托管覆写。

## LLM Provider —— 每 key 一卡

- **OpenCode Go，内置。** `provider-manager-opencode-go` 连接承载官方 Go 目录（41 个模型——31 个可调用、9 个协议未核实暂列、正式版 Muse Spark 1.3 走 Zen 带 `max` 档），按模型自动选协议、发送粘性 `x-opencode-session` 头、目录可从实时端点表刷新。无需第三方 Go 插件。[配置、限制与回滚](docs/opencode-integrated.md) · [目录证据](docs/opencode-all-models-evidence.md)
- **Command Code GOAT** —— 默认 key 编辑 + 官方额度 `GET https://api.commandcode.ai/alpha/billing/credits`（仅当默认凭据可确认时；聊天走 [Command Code provider 插件](https://github.com/Mars-Sea/dsh-commandcode-provider)）。
- **真实额度：只在 Host 查、只查官方接口。** OpenCode Go 请求 `GET https://opencode.ai/zen/go/v1/usage`。自定义端点显示**不支持**，绝不编造 100% 进度条。账户之间不合并。
- **16 家预填预设，一卡一家。** **ZCode**（GLM 编程套餐，中国 / 海外，Anthropic 同卡切换）、**MiMo**（小米 Token Plan `tp-` key，中国 / 新加坡 / 欧洲）、**MiniMax**（中国 / 海外，Anthropic 同卡切换），另有 **OpenRouter、SiliconFlow、Moonshot、DeepSeek、OpenAI、Anthropic、Groq、Together、Fireworks、DashScope、Google Gemini、Mistral** —— 以及一键 **Meta Model API**（按量计费，不是 Muse 订阅）。OpenRouter 两侧都在：这里是 API-key 卡，上方是 OAuth 卡。
- **其余一切走自定义路由。** 任何 OpenAI-Completions、OpenAI-Responses 或 Anthropic-Messages 端点都能成为一等路由（`^[a-z][a-z0-9-]*$`），带保留名保护——永远不会遮蔽 `opencode-go`、`commandcode`、`deepseek-official`、`cliproxy`。
- **按模型勾选 1M 上下文。** 每个可添加的模型带一个 **1M 上下文** 复选框，按官方容量预填（GLM-5.3 / Flash / 5.2、MiMo V2.5、MiniMax-M3、Gemini 2.5 Flash、GPT-4.1 mini、Muse Spark 为 1M；GLM-5-Turbo 为 200K；MiniMax-M2.7 为 204,800）。保存前自行勾选或取消。

## 截图

设置 → **Provider 管理** —— 列表上就能看到剩余额度，点一下进详情：

![Provider 管理列表](docs/images/provider-manager-list.png)

OpenCode Go 详情 —— 写默认 key；Host 读取 5 小时 / 周 / 月剩余：

![OpenCode Go 账户卡片](docs/images/provider-manager-opencode.png)

![OpenCode Go 剩余额度窗口](docs/images/provider-manager-quota.png)

Muse —— 设备码登录 + Meta Model API 回退入口：

![Muse 详情](docs/images/provider-manager-muse.png)

一键 Meta Model API 预填草稿（`openai-responses`，`https://api.meta.ai/v1`）：

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

然后打开 **设置 → Provider 管理**。最新 tarball 见 [Releases](https://github.com/KEVINCHEN625/dsh-provider-manager/releases)，替换 URL 即可。

如果 web profile 本身是 pnpm workspace（`packages: [.]`），把 pnpm 的布尔参数 `--workspace-root` 放在 tarball **之前**：

```sh
dsh plugin --profile web add --workspace-root --ignore-scripts --force \
  ./dsh-provider-manager-0.4.0-664a895a3f1b.tgz
```

命令成功和页面真实可用是两回事。装完请重启 Web。

### 聊天由哪个适配器承载

| Provider | 聊天运行在 |
| --- | --- |
| OpenCode Go / Spark | **内置** —— `provider-manager-opencode-go`，无需第三方插件 |
| Muse | **内置** —— 设备码登录后的 `provider-manager-muse`（5 个模型；仅 Spark 1.3 带 `max`） |
| Command Code GOAT | [Command Code provider 插件](https://github.com/Mars-Sea/dsh-commandcode-provider) |
| OAuth 登录型（Codex、Claude…） | 宿主 `llm-pi-ai` 的同名路由 |
| 自定义网关 | 你创建的 `llm-pi-ai` 自定义路由 |

## 使用

列表显示品牌厂标、名称、LLM/Agent 标记、key 状态、主剩余窗口、详情。

**OpenCode Go** —— 默认引用 `OPENCODE_API_KEY`。额度来自官方 usage 端点。非官方 baseURL：额度不支持。

**Command Code GOAT** —— 仅默认引用 `COMMANDCODE_API_KEY`。字面 key、额外账户、`auth.json` 可能优先生效；本页面不读登录文件。来源不明确时显示 **source-unverified**，而不是假进度条。

**自定义 API** —— `llm-pi-ai` 路由。**添加 provider** 时若有匹配的已知 API 会预填。ZCode、MiMo、MiniMax、SiliconFlow、Moonshot 保持在**同一张卡**上：选**中国**或**海外**再保存。key 必须与签发它的控制台对应。

| 预设 | 说明 |
| --- | --- |
| **ZCode** | GLM 编程套餐（`glm-5.3-flash`、`glm-5.3`）。中国 `https://open.bigmodel.cn/api/coding/paas/v4`，海外 `https://api.z.ai/api/coding/paas/v4`。Anthropic Messages 用 `/api/anthropic`。**不要**用 `/api/paas/v4`。 |
| **MiMo** | 小米 Token Plan（`tp-` key，不是按量 `sk-`）。中国 `https://token-plan-cn.xiaomimimo.com/v1`，海外新加坡 `https://token-plan-sgp.xiaomimimo.com/v1`。欧洲集群是 `token-plan-ams`——以 Token Plan 页面显示为准。 |
| **MiniMax** | 中国 `https://api.minimax.cn/v1`，海外 `https://api.minimax.io/v1`。Anthropic 在同一张卡上用 `/anthropic`。 |
| **OpenRouter** | `https://openrouter.ai/api/v1` |
| SiliconFlow / Moonshot | 中国与海外 URL 同卡切换 |
| DeepSeek、OpenAI、Anthropic、Groq、Together、Fireworks、DashScope、Google Gemini、Mistral、Meta Model API | 官方 baseURL 预填 |

先保存配置，再保存 key。每个模型行可勾选 **1M 上下文**；写入 `llm-pi-ai` 的 `models[].contextWindow`（勾选为 1,048,576，不勾为该模型标注容量）。环境变量名由路由派生（`DSH_PROVIDER_MANAGER_<hex(route)>_API_KEY`）。这些端点的额度查询**不支持**。保留路由：`opencode-go`、`commandcode`、`deepseek-official`、`cliproxy`、`muse-code`、`provider-manager-opencode-go`、`provider-manager-muse`。

## 安全

- RPC 与快照永不回显 key 内容。
- 显示 key 需要来自**真实 loopback socket** 的已鉴权同源 POST——代理、隧道、`Origin: null` 一律拒绝。
- 显示出的数值在隐藏、返回、失焦、连接变化和 TTL（最长 30 秒）后清空。
- 额度查询与通道探测只向各 provider 官方端点携带凭据；探测绝不带输出上限参数，每模型每 24 小时至多一次。

远程浏览器需要 SSH 转发到 `127.0.0.1` 才能保存设置或显示 key。

## 路线图 —— 补全 "everything" 的最后几步

1. **每家的通道数据沉淀** —— 各 provider 的种子随用户登录与探测落地，注册表逐通道积累经验证的事实。
2. **保存即验 key** —— 粘贴新 key 时先向 provider 验证有效性。
3. **多账户** —— 对允许的套餐做每 provider 的 key 池与轮换。
4. **更多额度适配器** —— 登录型家族的同款官方端点台账。

## 卸载

```sh
dsh plugin --profile web remove dsh-provider-manager
dsh web
```

移除本 bundle 会移除内置的 `provider-manager-opencode-go` 与 `provider-manager-muse` 连接。凭据、自定义 `llm-pi-ai` 路由、单独安装的 provider 插件全部保留。使用内置路由的会话请先选择其他 provider 再继续。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm test:client
pnpm build && pnpm check:pack
```

设计、部署证据与评审记录在 [`docs/`](docs/)。插件只调用 dsh 公开服务——`settings`、`credentials`、`llm`——不 patch 宿主，也不 patch 其他插件。

## 商标

卡片上的品牌厂标来自 [simple-icons](https://simpleicons.org)（有收录的厂商）；OpenAI、Groq、Amazon Bedrock、Azure、Cerebras、Fireworks、Together、Baseten、Z.ai、蚂蚁集团、Pi 为各厂商公开发布的标识，以同样方式内嵌。每个标识是其所有者的商标，仅用于识别对应 provider。无标识的 provider 保持首字母徽章。

## 许可

[MIT](LICENSE)
