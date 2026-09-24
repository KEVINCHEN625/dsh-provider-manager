# R4 —— Muse OAuth、品牌 logo、各家目录对齐

日期：2026-09-24。前置：R3.4（登录自动注入选择器）——尚未执行，须先行。

## 调研结论（已核实）

### Muse OAuth（学 CLIProxyAPI internal/auth/meta/meta.go，153 行，RFC 8628 设备码流）
- 端点：授权 `https://auth.meta.com/oidc/device/authorization/`、令牌 `https://auth.meta.com/oidc/device/token/`；ClientID `1031625952748946`（Meta Muse CLI 官方 id）；grant `urn:ietf:params:oauth:grant-type:device_code`；轮询默认 5s、上限 15min；verification_uri_complete 直达链接。
- **pi-ai catalog 没有 meta/muse**（有 oauth 的仅 8 家：anthropic、github-copilot、kimi-coding、openai-codex、openrouter-images、openrouter、radius、xai）——所以 Muse 不能走官方流，必须自研，且凭据不能落 `llm-pi-ai/` scope（catalog 外 provider 的 record 会 `UNSTORABLE_PROVIDER_ID`）。
- 落地形态：**复刻内置 OpenCode Go 适配器的成熟模式**（GO_ROUTE 先例）——`src/host/muse/` 自带 LlmAdapter（路由 `provider-manager-muse`，openai-responses @ `https://api.meta.ai/v1`），resolveApiKey 从本插件自己的 credential record 读 access token；AuthorizationFlow 自研注册（device_code 事件正好用官方 seam 的 notify{url, code} 词汇）；模型目录走通道注册表（muse 种子：muse-spark-1.3/-contributor 系 + Meta Model API 预设已有参数）。
- 法律提示：client_id 是 Muse CLI 公开值，CLIProxyAPI 同样直接使用（Apache-2.0 社区先例）；README 注明"非官方集成，需自备 Muse 订阅"。

### 品牌 logo
- 方案：**simple-icons**（开源 SVG 品标库）内嵌 SVG path 进 styles/组件——不依赖运行时 CDN（离线可用、零遥测）。覆盖 anthropic、openai、x（xai）、github-copilot、openrouter、kimi/moonshot 等；38 家流里覆盖不了的回落现有首字母圆标。商标用途为功能识别（nominative use），README 加商标归属声明。
- dsh 生态先例：openclaw 的 provider-icons SVG 目录。

### 各家目录对齐 Codex 现状
- 已有：Codex（9 模型通道目录 + 注册表 + 参数 per-model）；oauth-catalog.ts 表驱动架构可复用。
- 缺口：其余 7 家 oauth provider（anthropic/claude、kimi-coding、xai、github-copilot、openrouter、radius、openrouter-images）无通道目录、无自动注入；R3.4（注入逻辑本身）未执行。
- 每家工作 = probe 脚本 + 种子数据（发现源：开源目录仓库/models.dev 交叉 + 登录态实测）+ 注册表 `<providerId>.json` + 复用注入管道。

## 执行顺序

1. **R3.4 先行**（提示词已交付，未执行）：登录自动注入 + displayName 托管标记 + 下架移除 + `{}` 迁移。
2. **R4-A Muse**：src/host/muse/ 适配器 + 自研设备码 flow + record scope `provider-manager/muse` + 卡片（LLM 组还是 OAuth 组：OAuth 组，卡上标"内置适配器"）+ 模型目录种子。
3. **R4-B logos**：simple-icons 内嵌表 + ProviderIcon/OAuthCard 接线 + 回落策略 + 商标声明。
4. **R4-C 各家目录**：7 家逐个 probe + 种子 + 注册表（可分批，claude/kimi/copilot 优先——用户量大）。

## 验收要点（每项）

- R4-A：隔离环境走完设备码流到 token 落 record（或走到 verification_uri 事件即 cancel 的降级验证）；真实登录由用户授权后补；`provider-manager-muse` 路由模型可用（Meta Model API 按量 key 或订阅 token 两种来源都测）；不与现有 Muse Code CLI-only 行冲突（该行文案改为"CLI 检测 + 可 OAuth 登录"）。
- R4-B：38 家卡片图标渲染截图抽查（覆盖家真 logo、未覆盖家回落）；无运行时外联。
- R4-C：每家种子带 verifiedAt；注入后选择器只含 available；通道探测消耗走真实额度需 --confirm。
