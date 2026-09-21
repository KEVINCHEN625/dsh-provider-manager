# OAuth 登录型 Provider 接入 —— 执行计划（R2，已按交叉审核修订）

日期：2026-09-21。状态：交叉审核通过（审核报告要点已并入正文，标注 [B*]/[S*]）。范围：dsh-provider-manager 0.2.x 增量，不修改 dsh 源码仓库。

## 目标

1. 列表页顶部新增筛选栏（分段控件）：**ALL | LLM | OAuth**（样式内联规格见 D4，不参照外部包 [S11]）。
   - ALL = 全部卡片（现有卡片 + OAuth 卡片）；LLM = 仅 API-key 型（OpenCode Go / Command Code / 自定义 API / Muse）；OAuth = 仅 OAuth 登录型卡片。
2. OAuth 卡片数据来自 `ctx.authorization`（`list()` 中 key scope 为 `llm-pi-ai` 的流），登录桥接官方 **`begin()`** [B1]，凭据写官方 credentials store（grant record `llm-pi-ai/<providerId>`）。
3. 登录 UI 覆盖官方交互词汇表全部事件：notify（message/url/code）、prompt（**text / secret / select** 三种 kind [B3]）、进行中、撤回、取消、成功/失败终态。

## 非目标（R2 不做）

自研 pi-ai 未覆盖的 OAuth 流；OAuth 额度读取；多账户；Muse 归类不变（仍在 LLM 组）。

## 关键技术事实（已逐条源码核实）

- **`ctx.authorization`（@deepseek-ai/dsh-authorization）**：
  - `registerFlow(flow)` / `list(): AuthorizationEntry[]`（`{key,label,methods,inFlight}`）/ `describe(key)` / `cancel(key)`。
  - **`begin(request): Promise<AuthorizationOutcome>`** 启动一次 attempt（没有 `request()` 方法 [B1]）。一次一个 attempt per key；**第二个调用者被拒绝而不是加入**（接管见 D6 [B7]）。
  - `AuthorizationRequest = { key, method?, interaction: {notify, prompt}, signal? }`；prompt 返回 `Promise<string>`（typed text 或 chosen option id）。
  - `AuthorizationPrompt.kind = 'text' | 'secret' | 'select'`，select 带 `options: {id,label,description?}[]`；**prompt 自带 withdrawal `signal`**，撤回时 surface 必须以非 DECLINED 错误 reject（见 D5 [B4]）。
  - decline 以 `AuthorizationDeclinedError` reject 表达；decline 与 caller withdraw 的 outcome **均为 `{status:'cancelled'}`**；成功 `{status:'authorized'}`；失败是 throw（含 `NOT_COMMITTED`）[S3]。
  - flow `run()` resolve 即记录已提交（seam 观察 `credentials/record-updated` 后 `describeRecord` 双重确认）。
- **状态读取**：`llm-pi-ai/<id>` 是 **record（CredentialKey）**，读 `credentials.describeRecord(key)` → `{configured, kind?, writable}`（**无 source 字段**；带 source 的 `describe(ref)` 查的是 refs 键空间，不要用 [B2]）。
- llm-pi-ai 为每个带 login 的 catalog provider 动态注册流（`RECORD_SCOPE='llm-pi-ai'`）；**methods 含非 OAuth 的 `api-key`**（每个已装 provider 都有）——OAuth 卡片的 method 下拉会列出它，UI 文案用"登录方式"不统称"OAuth 登录"。
- **可选服务的正确消费方式 [S1]**：cordis 4.0.2 的 `inject` 全是必需依赖——把 `authorization` 加进 inject 会让插件在无该服务的 profile 整个不加载。正确做法：不进 inject，**每次快照/RPC 时运行时 `ctx.get('authorization')`**（dsh 先例：llm-pi-ai/src/auth.ts），TS 侧自行类型收窄；晚挂载可见。
- 现有 transport：已鉴权请求-响应 `connection.rpc.handle`，endpoint 为任意 string，四个新 RPC 无需改 transport.ts。**client Controller 默认 15s 超时 + 断连 abort 全部在途请求**（见 D2 解耦 [B5]）。

## 设计决策

### D1：登录事件用轮询增量，loginStart 即答

四个 RPC：`loginStart` / `loginEvents` / `loginAnswer` / `loginCancel`，事件按序号增量拉取。**轮询在 running 与 awaiting-prompt 两态均开启**（撤回事件依赖它 [B4/S7]），仅会话进行中开（前端 1s）。

### D2：`loginStart` 即答，attempt 生命周期与会话 RPC 解耦 [B5]

`loginStart(providerId, method?)`：校验 → 生成 sessionId → **立即返回**；`authorization.begin()` 在后台运行，其 outcome 写入会话终态。RPC 的 abort signal（15s 超时/断连）**只取消这次 RPC，绝不传入 attempt 的 signal**。attempt 只被两件事终止：`loginCancel` 或插件 dispose。

### D3：Host 登录会话管理（新 `src/host/login.ts`）

- `start`：`providerId` 先过 `isCredentialKeySegment` 再 `credentialKey()`（后者对非法段 throw [S5-4]）；flow 不存在 → `NO_FLOW`；method 未知 → `UNKNOWN_METHOD`。
- 事件环形缓冲上限 100 条；**白名单**透传：
  - notice：`{kind:'notice', message, url?, code?}`；**url 必须过 http/https scheme 校验**（项目先例 providers.ts baseURL 校验；React 不清洗 href，`javascript:` 会在已鉴权页面执行 [S5-1]）；message/url/code 长度上限（沿用 protocol.ts 的量级）[S5-2]。
  - prompt：`{kind:'prompt', seq, promptKind:'text'|'secret'|'select', message?, options?}`（options 透传 `{id,label}`）；select 的 answer 校验属于 options 内 id [S5-3]。
- `answer(sessionId, seq, {decline?: true, value?: string})` [S2]：decline → 以 `AuthorizationDeclinedError` reject 挂起 promise；正常 → resolve(value)。
- **prompt 撤回 [B4]**：interaction.prompt 监听 `prompt.signal`；`abort` 时以普通 Error（非 DECLINED）reject 挂起 answer、推一条"prompt 已撤回"notice、状态回 running。
- `cancel(sessionId)` → `authorization.cancel(key)`。
- 终态映射 [S3]：`{status:'authorized'}` → done(ok)；`{status:'cancelled'}` → done(cancelled)（若插件自身 throw 过 decline 则标记 declined）；throw（含 NOT_COMMITTED）→ done(failed)。
- **BUSY 接管 [B7]**：`loginStart` 遇 key 已 inFlight 且存在本插件会话时，BUSY 响应**携带现存 sessionId**，新页面用 `loginEvents`/`loginAnswer`/`loginCancel` 接管同一会话。
- 轮询协议未定义行为 [S4]：`sinceIndex` 落后于缓冲起点 → 返回 `RESET` + 全量；answer 目标 prompt 已不挂起 → 幂等 `STALE`；sessionId 不存在/已回收 → `NOT_FOUND`（前端停止轮询、回退快照刷新）。
- 会话终态后保留 60s 回收；dispose 时撤销全部 attempt。

### D4：快照与 UI

- `Snapshot` 增加 `oauth: readonly OAuthEntry[]` 与 `oauthUnavailable: true?`；`OAuthEntry = { providerId, label, methods: readonly {id,label}[], configured, kind?, inFlight }`（**无 source** [B2]）。不含 token / grant payload。
- **快照兼容 [S8/B6]**：`validateSnapshot` 对**缺省的 `oauth` 字段默认 `[]`**（不得学 muse 的硬校验抛错——否则三个既有 fixture 无 oauth 字段的 client 测试全挂）；`oauthUnavailable` 缺省视为 false。同步更新 `src/client/validation.ts`（文件清单必含 [B6]）。
- 筛选栏：新 `FilterTabs` 组件（role=tablist/tab、aria-selected、键盘可达）；内联规格 [S11]：高度 28px、圆角 6px 分段底、选中态填充 `--dsw-alias-accent`（回退 #4D6BFE）、未选中透明、字号 12-13px、组间距 8px。
- `OAuthCard`（新）：首字母圆形图标、label、"登录方式"入口、状态徽章（未登录 / 已登录 / 登录中）、LLM 徽章沿用。
- `OAuthDetails`（新）：method 选择（下拉或唯一时直按钮）→ 事件时间线（notice：message + 可点 url（新窗口、rel=noopener）+ 可复制 code；prompt：text/secret 输入（secret 掩码、不落日志 [B3]）/ select 选项按钮；decline 按钮）→ 终态横幅（成功提示记录已入官方凭据库并刷新快照；失败/取消可重试）。
- controller：登录会话状态机 `idle → starting → running(events[], pendingPrompt?) → done(result)`；接管态从 BUSY 的 sessionId 进入 running。

### D5：错误码与文案 [S6]

`AuthorizationError` 的 `NO_FLOW` / `UNKNOWN_METHOD` / `ALREADY_IN_FLIGHT` / `NOT_COMMITTED` 显式映射为 SafeError 码（不折叠 UNAVAILABLE）；client `controller.ts` 的 `codes` 集合同步加 `NO_FLOW` / `UNKNOWN_METHOD` / `BUSY` / `NOT_FOUND` / `STALE` / `RESET`。locales 中英文案成对；tab 标签中文侧保留英文词（ALL | LLM | OAuth）。

### D6：`authorization` 缺席降级 [S1]

不进 inject；快照与每个 RPC 运行时 `ctx.get('authorization')`；缺席 → `oauthUnavailable: true`，OAuth tab 显示空态说明（含 client 用例），不崩溃。

### D7（可选增强 [S10]）：订阅 `authorization/settled` 事件，任何来源的 attempt 结束后刷新快照 inFlight（实现代价小则做，大则记遗留）。

## 文件清单

| 文件 | 动作 |
| --- | --- |
| `package.json` | 改：peerDependencies + devDependencies 加 `@deepseek-ai/dsh-authorization`（`*` / `0.1.5-rc.2`）[B6] |
| `src/shared/protocol.ts` | 改：OAuthEntry / LoginEvent / 终态 / 四 RPC 类型与校验（长度上限、url scheme） |
| `src/host/login.ts` | 新：LoginSessionManager（D2/D3 全部） |
| `src/host/index.ts` | 改：运行时取 authorization、注册四 RPC、快照拼装、dispose、错误映射 |
| `src/host/providers.ts` | 改：`oauthEntries()`（list() 过滤 scope `llm-pi-ai` + **describeRecord** join [B2]） |
| `src/client/FilterTabs.tsx` | 新 |
| `src/client/OAuthCard.tsx` | 新 |
| `src/client/OAuthDetails.tsx` | 新 |
| `src/client/ProviderManager.tsx` | 改：filter state、过滤、OAuth 卡片区 |
| `src/client/controller.ts` | 改：登录动作/状态、接管、新错误码 |
| `src/client/validation.ts` | 改：oauth 缺省默认 []、oauthUnavailable 缺省 false [B6/S8] |
| `src/client/locales.ts` | 改 |
| `src/client/styles.ts` | 改 |
| `tests/login.spec.ts` | 新：start/events/answer/cancel/终态映射/缓冲溢出 RESET/STALE/NOT_FOUND/**prompt 撤回**/BUSY 接管/decline→cancelled/白名单（secret/select/恶意 url）/即答回收/并发/dispose |
| `tests/oauth.spec.ts` | 新：oauthEntries 过滤与 describeRecord join/authorization 缺席降级/快照脱敏 |
| `tests/components.client.spec.tsx` | 改/新：FilterTabs 过滤/OAuthCard 状态/OAuthDetails（text/secret/select/decline/撤回事件/终态）/**oauthUnavailable 空态** |
| `tests/controller.client.spec.tsx` / `tests/quota.client.spec.tsx` | 改（仅当 fixture 需要）：确认旧 fixture 在 oauth 缺省默认策略下通过 [S8] |

## 执行顺序与验收门

1. 协议 + host（login.ts、providers 扩展、index 接线、package.json）→ host 测试绿。
2. client（validation → FilterTabs → 卡片 → 详情 → controller）→ client 测试绿。
3. `pnpm typecheck && pnpm test && pnpm test:client && pnpm build && pnpm check:pack` 全绿；**既有 143 个测试零回归**（基数以 `vitest list` 实测为准 [S9]）。
4. 隔离验证（独立 `DSH_HOME`，方法沿用 docs/deployment.md）：三 tab 出现；OAuth tab 列出流；任选一个流 `loginStart` 走到**出现 url 或设备码事件即 cancel**（不完成登录、不触碰真实账户）；（模拟）authorization 缺席 → OAuth tab 空态不崩溃。
5. 真实 profile 部署与真实登录**不在本轮**，交用户另行授权。

## 风险与对策（已并入上文）

- 15s RPC 超时 → D2 即答解耦 [B5]；双开页面 → BUSY 接管 [B7]；prompt 挂死 → 撤回处理 [B4]；secret 词表 [B3]；describe/describeRecord 键空间 [B2]；inject 陷阱 [S1]；旧 fixture 回归 [S8]。
