# OAuth 强化 R3 —— 根因修复 + CLIProxyAPI 式卡片

日期：2026-09-23。状态：控制器已批准方向，待执行。前置：docs/oauth-plan.md（R1/R2 已交付）。

## 根因诊断（已核实）

图1 OAuth tab "不可用" = 快照 `oauthUnavailable: true` = `ctx.get("authorization")` 返回 undefined。证据链：

1. `@deepseek-ai/dsh-authorization` 是 Cordis Service（`super(ctx,'authorization')`），**没有任何 cordis.patch.yml 直接 mount 它**（全仓库 grep 无）；它在 dsh-base realm 内经 llm-pi-ai 的 peer 链激活（llm-pi-ai `ctx.inject(['authorization'])` 为必需注入且 llm-pi-ai 工作正常 → 服务在 base realm 内存活）。
2. dsh-provider-manager 是 profile 的**外部 bundle row**，mount 在 loader 的隔离 realm/fiber 上（app-boot README：group row 给 provider 与 consumers 一个 isolate realm）；其 `ctx.get("authorization")` 跨 realm 取不到 base realm 的服务实例。
3. 测试全绿是因为 fixture 直接注入 AuthorizationSurface，绕过了 realm；真实环境必然复现。

## 修复方案（首选：可选子插件，把取服务交回 loader）

**A. 子插件 row**（推荐，正面解决）：新增子路径 export `dsh-provider-manager/oauth`，该入口插件声明 `inject: ['authorization']`（与 credentials/settings 等一并）。cordis.patch.yml 加第二条 row 指向子路径。效果：loader 在服务可用的 realm 解析注入；服务缺席时**只有该 row INACTIVE**，主插件（台账/配额/自定义 API/内置 Go）不受影响——替代现在 oauthUnavailable 的整个降级逻辑成为天然降级。web-all 的 `@linxin666/dsh-web-all/<family>` 子路径多 row 是同构先例。

**B. 执行前必做的验证步骤**：先在真实 web profile 上以子插件形态实测 `inject` 能否跨 bundle row 解析到服务（临时 probe 插件打印 `ctx.authorization` 是否 undefined、能否 `list()` 出 llm-pi-ai flows）。若 A 不成立（realm 边界比预期更硬），退路是**经 connection RPC 桥**：llm-pi-ai 所在 realm 已把 flows 注册进服务，探查 dsh 是否暴露跨 realm 服务代理（registry/Loader API）；仍无则把 OAuth host 半边拆成与 llm-pi-ai 同 realm 的伴生微型 bundle（name 仍属本包，mount 由本包 patch 声明）。禁止的方向：改 dsh 源码、运行时猴子补丁。

## CLIProxyAPI 参考结论（已读源码/文档）

- 形态：每 provider 一张登录卡（Gemini/Claude/Codex/Qwen/...），统一契约 `auth-url → 浏览器授权 → (远端可手贴回调 URL) → 轮询 state → 取消`；凭据 per-provider 落盘；卡片显示已登录账号与状态。
- 我们的对应差距：卡片信息弱（无账号标识、无登出、无重登覆盖提示）；交互骨架（事件时间线/取消/BUSY 接管）已达标甚至更细。

## 强化清单

1. **OAuthCard 升级**：provider 首字母圆形图标 + 内置 id→商标色映射（claude 橙、codex 绿黑、kimi 蓝紫、xai 黑、copilot 蓝、openrouter 深蓝；不引外部图标库）；状态徽章三态（未登录/已登录·账号标识/登录中）。
2. **账号标识（Host 白名单提取）**：登录成功后读 grant record（`credentials.readRecord('llm-pi-ai/<id>')`），从 payload 提取**仅**白名单字段（`email` / `displayName` / `account` / `name`，取第一个命中，字符串截断 64），进快照 `OAuthEntry.account?`；token/refresh/secret 永不提取。提取失败 → 无 account 字段，不报错。
3. **登出**：详情页 Logout 按钮 → host 调 `credentials` 的 record 删除（`modifyRecord(key, () => undefined)` 语义，见 dsh-credentials readRecord/modifyRecord 契约）→ 二次确认（中英文案）→ 成功后刷新快照。确认框说明"仅删除本机凭据，不影响上游账号"。
4. **重新登录覆盖提示**：record 已存在时 Sign in 按钮旁提示"将覆盖现有登录"。
5. 空态文案更新：服务真正缺席（子插件 INACTIVE）时 OAuth tab 显示"当前 profile 未提供授权服务"（不再显示为错误）。

## 文件清单（预估）

| 文件 | 动作 |
| --- | --- |
| `src/host/oauth-entry.ts`（新，即子路径入口） | inject 声明 + mount OAuth host 半边（login session manager、oauthEntries、RPC 四件套） |
| `package.json` | exports 加 `./oauth` 子路径；peerDependencies 加 dsh-authorization（已有）核对版本 |
| `cordis.patch.yml` | 加第二条 row（id `provider-manager-oauth`，name 子路径） |
| `src/host/index.ts` | OAuth 相关逻辑迁出主入口（主入口不再 ctx.get 授权服务） |
| `src/host/login.ts` | account 白名单提取、logout、（保留全部既有会话管理） |
| `src/shared/protocol.ts` | OAuthEntry.account?、logout RPC |
| `src/client/OAuthCard.tsx` / `OAuthDetails.tsx` / `locales.ts` / `styles.ts` | 图标映射、账号徽章、Logout、覆盖提示、空态文案 |
| `tests/login.spec.ts` / `tests/oauth.spec.ts` / `tests/lifecycle.spec.ts` / client specs | account 提取白名单（含"payload 含 token 时不外泄"用例）、logout、子插件 lifecycle（服务缺席 row INACTIVE 不影响主插件） |
| `docs/deployment.md` | 补：装后验证 OAuth tab 列出卡片而非"不可用" |

## 验收门（全过才算完成）

1. `pnpm typecheck && test && test:client && build && check:pack` 全绿、零回归（基线 389）。
2. **真实 web profile 安装后：OAuth tab 显示卡片列表**（不再是"不可用"），且 llm-pi-ai 的 flows 全部列出（动态）。
3. 任选一个 flow：Sign in 走到出现 URL/设备码事件 → Cancel；不完成登录。
4. 服务缺席模拟：临时禁用子插件 row → 主页面其余功能不受影响，OAuth tab 显示新空态文案。
5. account 提取：对 fixture grant（含 email 与伪造 token 字段）验证快照只含 email。
6. 部署一致性：按 R2 返修后的 tarball 命名规范打包，Web 与 headless 同产物安装，跑 consistency 脚本。

## 红线

不改 dsh 源码；不猴子补丁 realm；token/secret 永不入快照/日志；真实登录不自动完成（走到 URL 事件即取消）；真实 profile 变更仅限安装本插件新版本 + kickstart 重启，不动 settings.yaml 其他段。

## OAuth 额度显示（R3.1）

目标：已登录的 OAuth 卡与 LLM 卡一样显示剩余窗口，默认 60 分钟惰性过期，用户可手动刷新。不另建配额系统，扩展现有 `QuotaReader`（`ttlMs`、自定义 headers、`identityKey`、`parse`）。

适配器见 `src/host/oauth-usage.ts`。调研结论见 `docs/oauth-quota-evidence.md`。V1 只接已确认端点：Codex `wham/usage`、OpenRouter `/api/v1/credits`。没有确认端点的家显示「配额不受支持」，不编造百分比。

Token 只从 `access_token` / `apiKey` / pi-ai 的 `access` 字段，以及 api-key record 的 `key` 取出，仅留在 Host 内存里发额度请求。401/403 显示「登录已过期，请重新登录」，不自动刷新 token。绑定 token 是 record 内容的 SHA-256。定时刷新靠 TTL 过期和现有快照轮询，没有后台 timer。

快照 `OAuthEntry.quota` / `quotaFetchedAt`。卡片主窗口与详情页完整窗口、刷新按钮共用 LLM 卡的额度样式。
