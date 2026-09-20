# DSH Provider Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan with batch checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking. 执行者按已分配角色实施，不递归委派；主控组织独立审核。

**Goal:** 在独立 bundle 中交付可恢复的 Web provider 管理页面，优化 OpenCode Go 与 Command Code GOAT 的配置体验，明确展示 Muse Code CLI 订阅边界，同时保持现有 Web/headless 推理路由。

**Architecture:** Host 只消费公开 settings、credentials、llm、connection、webServer；独立 Web settings.section 使用现有连接鉴权。模型执行仍由原 provider 与 llm-pi-ai 承担；Muse Code 首批仅 CLI 检测/使用说明，不新增推理适配器、不接 Meta API。

**Tech Stack:** TypeScript、Node >=22.19、Cordis 4、React 18、tsdown、Vitest、Testing Library、Playwright；pnpm lockfile 固定实际可安装依赖。

日期：2026-09-21。状态：独立 Astra Medium 审核允许批次 A 实施；下列修订同时约束批次 B。不是实施完成或真实环境验收报告。用户已批准 docs/design.md；现有 docs/installation-baseline.json 是不含 secret 的包版本/产物 hash 基线，执行时保留并引用。

---

## 1. 工作范围、证据与 API 基线

所有新文件位于 `/Users/kevinchen/Dev/dsh-provider-manager`，下文路径相对此目录。**禁止修改** `/Users/kevinchen/Dev/deepseek-harness`，包括 node_modules、构建产物、锁文件与 logs。不修复已安装 OpenCode Go 的绝对 import 补丁，不升级其他插件。保护真实凭据与现有默认模型、会话、其他设置。

已只读核对的接口（源码基线 fb2c4b9e69 / 0.1.5-rc.2；执行时确认是否发生变化）：

| 公开接口/参考 | 实际契约及使用方式 |
| --- | --- |
| `packages/settings/settings/src/index.ts` | `settings.describe({redactSecrets:true})` 得 namespace `revision`；`settings.mutate(ns, [{op:'set',path:[...],value}], expectedRevision)` 做局部写入，不能从脱敏快照 reconstruct/replace 整个 section |
| `packages/credentials/credentials/src/index.ts` | `credentialRef`、`describe`、`resolve`、`set`、`unset`；set 遇只读来源覆盖会拒绝，不能承诺文件保存即生效；不访问 grant/record 值 |
| `packages/llm/llm/src/index.ts` | `listProviders()`、`listConfigurableProviders()`、`listModels(provider)`、`discoverModels(settingsNs,request,signal)`；管理器不调用 registerAdapter |
| `packages/client/connection/src/rpc.ts` | `rpc.handle(channel,(endpoint,payload,signal)=>Promise<ConnectionRpcResult>)`，返回异步 disposer；客户端使用公开 `connection.rpc` 对应 request 方法，以实际声明为准 |
| `packages/client/connection/src/index.ts` / `rpc-host.ts` | `connection.requestRejection(req)` 返回 401/403/undefined，仅鉴权和 authority 检查，不能替代真实 socket 检查 |
| `packages/host/webserver/src/index.ts` | `webServer.register({kind:'exact',path,handler(req,res)})`；disposer 纳入 ctx.effect |
| `packages/client/ui-agent-preset/src/client/index.ts` | `slots.inject('settings.section', ()=>slots.register({...},Component))`；locale 注入及字典注册 |
| `packages/client/tsdown.client.ts` / `packages/client/web/src/platform.ts` | 浏览器 CJS factory，`window.__ModuleLoader__.load({id,factory:(require)=>{...return module.exports}})`；React/Cordis 等平台共享模块 external，不能重复 bundle |
| `apps/cli/src/plugin.ts` | `dsh plugin --profile web add <绝对tgz>` 通过公开 dsh.bundle.patch 自动 reconcile；不手工改真实 profile 的安装目录 |
| 原 OpenCode Go 0.1.28 types | namespace `llm-opencode-go`，route `opencode-go`，默认引用 `OPENCODE_API_KEY`，baseURL `https://opencode.ai/zen/go/v1`；models 中 `api` 可逐模型不同 |
| 原 Command Code 0.11.6 types | namespace `llm-commandcode`，route `commandcode`，默认引用 `COMMANDCODE_API_KEY`；`apiKey` 字面 override 优先，auth.json fallback、多账户与 routing 均由原插件持有 |

Muse 官方证据由主控核实：[订阅说明](https://dev.meta.ai/docs/muse-code/subscriptions)、[官方 SDK/MSP](https://meta-models.github.io/muse-code-sdk/next/)。Muse Code 订阅只通过 Muse Code CLI，onboarding 凭据不同于 Meta API 按量 key；本机初检未发现 `muse`。官方/第三方套餐身份由用户后续确认，不虚构 API URL、协议、模型目录或订阅额度。SDK bridge 超出此批次。

## 2. 文件图与内部契约

| 文件 | 单一职责 |
| --- | --- |
| `package.json`, `pnpm-lock.yaml`, `.gitignore`, `tsconfig.json`, `tsconfig.client.json`, `tsdown.config.ts`, `vitest.config.ts` | 可重现独立构建、类型检查、测试与发布文件范围 |
| `cordis.patch.yml` | insert 唯一 `provider-manager` 插件；不改原 provider 节点 |
| `src/shared/protocol.ts` | 无秘密初始化 DTO、请求边界 decoder、安全错误码、三种 protocol 常量 |
| `src/host/index.ts` | 服务注入、RPC dispatch、HTTP 注册与卸载 ownership |
| `src/host/providers.ts` | 三套餐卡片、原 route 共存、自定义 route 验证、namespace 局部写入 |
| `src/host/credentials.ts` | 固定 ref 授权、受管 route binding、describe/set/reveal、来源与覆盖范围 |
| `src/host/http.ts` | reveal HTTP POST、鉴权/socket/Host/Origin、体积/no-store/abort |
| `src/host/models.ts` | catalog 读取、explicit 刷新、协议保留、发现结果预览 |
| `src/host/muse.ts` | PATH 可执行文件存在性检测（不启动 CLI），CLI-only 状态与官方链接 |
| `src/client/index.tsx`, `src/client/locales.ts` | settings.section/locale 注册与销毁 |
| `src/client/ProviderManager.tsx`, `src/client/ProviderCard.tsx`, `src/client/CustomProviderForm.tsx` | 卡片、独立 key/config 状态、模型差异预览、无猜测套餐状态 |
| `src/client/controller.ts`, `src/client/transport.ts`, `src/client/styles.css` | 可测试状态机、RPC/fetch 接口、样式生命周期 |
| `tests/{contracts,providers,credentials,http,models,lifecycle,pack}.spec.ts` | Host 关键行为与产物边界 |
| `tests/{controller,components}.client.spec.tsx` | 客户端恢复与秘密生命周期 |
| `tests/fixtures/{services.ts,mock-api.ts}` | 内存公开服务 doubles、本机确定性模型流/工具服务 |
| `tests/e2e/provider-manager.spec.ts`, `playwright.config.ts` | 从实际 tarball 装载的 Web 验收 |
| `scripts/{check-pack,prepare-isolated,run-isolated,verify-headless,capture-baseline}.mjs` | 无真实 secret 的打包门禁、隔离启动、headless 流和工具验证、只读基线 |
| `README.md`, `docs/{upgrade,acceptance,status}.md` | 用法、升级恢复、逐项证据、进度和明确未执行范围 |

必要 wire 约束：

```ts
type ManagedProviderId = 'opencode-go' | 'commandcode' | 'muse-code' | `custom:${string}`
type Protocol = 'openai-completions' | 'openai-responses' | 'anthropic-messages'
type FailureCode = 'INVALID_INPUT' | 'UNAUTHORIZED' | 'REF_NOT_ALLOWED' | 'BINDING_CHANGED'
  | 'CONFLICT' | 'READ_ONLY' | 'UNSUPPORTED' | 'UNAVAILABLE' | 'TIMEOUT'
// snapshot DTO 明确白名单字段，不传播整个 settings descriptor/value 或 Error/cause。
// set/reveal 输入是 providerId + bindingToken，禁止传 ref、envName、文件路径。
// credential set 额外传 value；成功响应仅 CredentialInfo，不 echo key。
// bindingToken 对授权 ref + 当前设置 revision 作 Host 可验证绑定，不携带 secret。
```

RPC channel `/provider-manager`：`snapshot`、`credential/set`、`provider/save`、`models/refresh`、`models/apply`。reveal **只在**独立 HTTP `/provider-manager/reveal`，不在 RPC 注册同义端点。MVP 不需要 unset/delete key 控件；自定义 route 删除仅改该 route，凭据保留并提示，不误删共享引用。

Host config（composition config，不能通过管理器自己的 RPC 修改）：`authorizedExistingRefs` 显式 provider/ref 对；`revealTimeoutMs` 默认 30000。新自定义 route 引用由 Host 通过规范化 route 的 UTF-8 hex 编码确定性生成 `DSH_PROVIDER_MANAGER_<HEX>_API_KEY`，避免随机分配另建持久化跨服务事务。仅当当前 `llm-pi-ai.providers[route].apiKeyEnv` 精确等于该 route 的规范引用，且确为自定义受管记录时允许；不能采用用户输入 ref 或只检查 prefix。维护受管 route 时重复核对 owner/namespace/protocol。任意既有外部引用只有显式 host allowlist 才允许读写。

独立审核补充：受管身份谓词必须同时满足 pi-ai namespace 所属、非 builtin catalog/保留路由、精确匹配该 route 的规范 credential ref；不信任配置中自行宣称的 owner 字段。HTTP 取消监听 `req.aborted` 与 `res.close`（仅 `!res.writableEnded`），不可将正常读取请求体后的 `req.close` 当作客户端断开。候选可使用 npm 已存在的同版本 `0.1.5-rc.2` 公开包构建与运行，最终仍需验证真实源码 profile，不能把两者混作一个证据。

独立审核最终约束：原 pi-ai 的公开 discovery 内部使用默认 fetch，不能保证跨 origin 重定向不携带自定义鉴权 header。首版关闭 manager 带凭据远程模型发现，提供已有插件目录重新读取与手工模型录入，不新增携 key 代理；用两 origin 的重定向反例验证 manager 不产生该请求。下文任何发现功能均受此限制。snapshot 必须返回 settings.writable，配置只读与凭据只读分别处理；保存提交成功但后续刷新失败时提示“已提交，状态刷新失败”，不能误报未保存。

## 3. 批次 A：可安装核心、凭据边界与 Web 页面

执行者在以下检查点间连续推进；常规红测可范围内修复，无需每个文件交接。先读相关技能、当前 diff 和 docs，不重启设计流程。完成 A 后主控独立审核关键安全/生命周期差分；A 未通过不安装真实 profile。

### A1. 独立 package 与完整 host/client 构建

- [ ] 创建 package/tooling 文件；包名 `dsh-provider-manager`，初始 0.1.0。明确 `main:lib/index.js`、`./client:lib/client.js`、types、files、`dsh.bundle.patch:./cordis.patch.yml` 与 `dsh.client.platform:web`。`dsh.client.inject` 至少声明 connection、locale、ui-settings、ui-slots、ui-renderer 所在包，客户端 `inject` 声明实际服务名。
- [ ] `cordis.patch.yml` 只 insert `{id:provider-manager,name:dsh-provider-manager}`。Host 顶层依赖 settings、credentials、llm；嵌套 `ctx.inject(['connection','webServer'],...)` 同时挂 RPC/reveal。没有 Web 时管理 bundle 不应创建服务器；headless 不需要装管理 bundle，也必须能使用共享保存的配置。
- [ ] 先写 `tests/pack.spec.ts`：断言 tarball 包含两个入口/patch/types；浏览器通过假的 ModuleLoader 捕获 exports.apply，而不是仅正则证明存在文件；拒绝 absolute home/source imports、node:*、未声明 browser require、重复 React/Cordis。
- [ ] 实现本目录 `tsdown.config.ts`，不要从 dsh 源仓库 import 私有构建 preset。Node ESM 输出 lib/index.js，peer dependencies external；浏览器 CJS 输出 lib/client.js，独立 factory banner/footer，`clean:false` 防止后一次 build 清掉 Host；production defines，无 Node secret/env 注入。使用简单插件内 CSS 文本并在 effect 中加/删 style；不依赖完整 CSS Modules pipeline。
- [ ] 类型编译 host/client 分开验证 Cordis 服务声明，client 导入 Host 包只能 type-only。peer 用已确认版本范围，devDependencies 固定可获取版本；记录 registry 版本与当前源码兼容差异，禁止 `workspace:*`、回指用户源码的 file/link runtime 依赖。若 rc.2 尚未公开，使用能安装的固定包做编译，并在隔离当前 commit runtime 执行契约测试；无法兼容则停止，不伪造适配。
- [ ] 定义脚本：`build`（类型 emit + tsdown）、`typecheck`、`test`、`test:client`、`check:pack`（pnpm pack 到 artifacts 后新进程验证）、`test:isolated`、`test:headless`。运行 `pnpm install` 后保留 lockfile；以后用 `pnpm install --frozen-lockfile`。

检查点 A1：`pnpm run build`、`pnpm run typecheck`、`pnpm exec vitest run tests/pack.spec.ts` 真通过；不存在只做 Host、漏 browser factory 或源码路径依赖的“成功”。

### A2. Host 数据、局部保存与安全 HTTP

- [ ] 在 fixtures/services.ts 用公开签名提供 settings revisions、credentials 来源覆盖、llm routes；先写红测再实施 providers/credentials/http/index。不要靠复制真实 settings/credentials 做 fixture。
- [ ] snapshot 为固定套餐卡片+自定义列表，只按字段选取 namespace 配置和 describe；不发送 raw descriptor、literal apiKey、accounts 内容、headers 或错误 cause。缺插件分别显示 unavailable，不让一张卡读失败卡住整页。
- [ ] credential allowlist 默认仅 `opencode-go -> OPENCODE_API_KEY` 与 `commandcode -> COMMANDCODE_API_KEY`；当前设置指定其他引用时展示不受管，直到 composition 明确授权。set/reveal 重新解析 binding；revision/ref 变化返回 BINDING_CHANGED，不静默写另一个引用。对自定义 route 强制上述规范 ref 规则。
- [ ] set 使用 credentials.set，成功后 describe；只读来源返回 READ_ONLY，不能将其吞掉当成功。value 非空且有长度上限（16KiB），错误映射成固定安全字符串，不能 stringify 传入 payload。配置保存与 key 保存分别操作/分别返回，部分成功界面明确保留。
- [ ] custom route 规范 `^[a-z][a-z0-9-]*$`，拒绝 prototype 特殊键与保留套餐 route；冲突集合包含 listProviders、listConfigurableProviders、当前 pi-ai providers、保留 route。编辑已有受管 route 例外只接受已核对 owner 的同一路由。保存使用 path `['providers',route,field]`，只设置实际输入字段，不批量重建 providers；不更改默认模型/reasoning。删除前明确用户动作，只 unset 该受管 route。
- [ ] HTTP 在任何返回前设置 `Cache-Control:no-store`、`Pragma:no-cache`、`Content-Type:application/json; charset=utf-8`；先 `connection.requestRejection(req)`，再要求真实 socket remoteAddress 为 127/8、::1 或 IPv4-mapped loopback，拒绝缺 socket/tunnel。Host 必须规范 loopback authority（localhost/127.x/[::1] + 实际端口）；Origin 必须非 null/非缺失且 origin 与实际协议及 Host 完全匹配；不采信 Forwarded/X-Forwarded-*。
- [ ] reveal 仅 POST、application/json，body 上限 4KiB，未知字段拒绝，禁止 URL query token/key。超大 body 413、method 405、类型415、invalid400、auth401/403；全部 no-store。请求 close/aborted、超时、插件销毁终止后续写回；凭据 resolve 返回前后检查 binding 和取消状态。安全 JSON 只返回 value/source/revealTTL，不缓存。
- [ ] 所有公开 disposer 纳入 ctx.effect；插件销毁 abort 在途 discovery/reveal，注销 RPC/HTTP，重复装卸无 duplicate channel/route。对持久化中的 set 不承诺 abort 回滚，响应丢失后通过 describe/refresh 恢复状态。

必须覆盖的反例（测试名/断言写进指定 spec，先运行看到对应失败再实现）：

| spec | 最低有效断言 |
| --- | --- |
| credentials | snapshot 不含 sentinel secret；SSH_AUTH_SOCK/任意 ref 与伪造 manager prefix 被拒；ref 改动旧 token set/reveal 均失败；env 来源不可写；允许引用 resolve 的 source 与值成对返回 |
| http | 无 cookie/恶意 Origin/缺 Origin/null Origin/远程 socket/伪造 forwarded/缺 socket/非 JSON/超大 body 均拒；成功与每种失败均 no-store；合法 IPv4、IPv6、mapped 地址；GET 不 reveal |
| providers | route 冲突无写入；同 namespace stale revision 返回 CONFLICT；其他 provider、未知字段、literal secret、default model 不变；secret 保存成功/config 冲突分别报告 |
| lifecycle | unmount 中请求不能写 response 或重挂 handler；重新挂载仅一个管理 channel；服务稍晚出现时公开 DI 自动挂载 |

### A3. Web 页面与恢复状态机

- [ ] controller 提供独立的 load/refresh/save/key/reveal 状态及 request generation；每个请求 finally 离开 loading。用户草稿与已加载 snapshot 分开保存；恢复连接自动读取 metadata，不覆盖 dirty drafts。
- [ ] 初始失败、重试中、就绪、保存冲突、权限拒绝均有可操作文案；点击 retry 后恢复，不要求整页 reload。每卡边界防止 Muse/某 provider 缺失阻塞其他卡。
- [ ] reveal 使用同源 fetch POST、`credentials:'same-origin'`、`cache:'no-store'`、AbortSignal；value 只在当前 key 控件 state。隐藏、离开、unmount、document hidden、window blur、connection 状态变化、30秒到期均立即清空并递增 generation；延迟响应必须先比对 generation 才可写 state。替换 key 成功后也清空输入和旧 reveal。
- [ ] OpenCode 卡显示来源、可写性、已配置模型数/当前目录（现有基线 37 个，运行时读取，不能硬编码此数量）、保存/显示/隐藏与模型刷新；Command Code 标为 GOAT 使用场景，但计划资格以原插件/官方确认信息为准，不把所有 catalog 标成套餐免费。
- [ ] 原有额度、登录、多账户、高级页保留入口；只用实际验证的 settings section/route 导航。无法定位公开导航 API 时提供原页面名字和操作路径，不伪造链接。Command Code 清楚标“默认引用；literal override、多账户、官方登录文件可能优先或 fallback”，不宣称每次请求的实际 key。
- [ ] 自定义 API 表单要求 protocol，advanced 字段空白则不写；列表/model 输入、错误与密码控件均有 label；不把 key 放 URL/DOM attribute/localStorage/console。Muse 独立 CLI 卡展示安装检测、登录/使用官方文档和“未接通 DSH 订阅执行”，没有 API preset、购买、额外收费 fallback。
- [ ] components/controller tests 覆盖首次 RPC reject 后 retry 成功、读取超时、断线重连、dirty draft 保留、旧响应不能覆盖新结果、hide后迟到 reveal、blur/visibility/unmount/timeout 清理、保存部分成功、source 展示和 keyboard 操作。

检查点 A：运行 `pnpm run typecheck`、`pnpm run build`、`pnpm run test`、`pnpm run test:client`、`pnpm run check:pack`；保存原始输出（仅 synthetic secret）至 artifacts/。主控审核安全测试是否真覆盖，而不只看 PASS 数量。

## 4. 批次 B：套餐模型策略与隔离 Web/headless 集成

### B1. 模型刷新与套餐边界

- [ ] models.ts 区分“重新读取原插件目录”与“向服务发现模型”。普通 snapshot 不主动网络发现、不生成请求；用户主动刷新才执行读取/发现并显示更新时间与来源。
- [ ] OpenCode Go 先读 `llm.listModels('opencode-go')` 和本 namespace 当前 rich models；远程刷新优先通过原插件已声明的 `llm.discoverModels('llm-opencode-go',...)` 能力，执行前核实返回字段是否保留 api/capability。若公开 LLM seam 只返回通用目录，不能用其覆盖 rich models/api；可仅预览通用 IDs，并保留所有既有模型协议/高级值，未知新模型不猜 protocol。不要 import patched installed host main 以获取 helper。
- [ ] OpenCode “应用选中模型”携带 revision，仅更改用户确认目录；同 id 保留明确 api/effort/capability，新 id 未知 protocol 必须用户选择或有已核实官方映射才写；不能统一改成 openai-completions。移除默认模型必须提示而不自动切换默认。刷新绝不自动保存。
- [ ] Command Code 复用原插件 `listModels('commandcode')` 输出，显示 plan visibility 的事实范围；如原插件无公开强制 reload 能力，按钮标“重新读取目录”，不称为远端强制刷新。不改 filterModelsByPlan/accounts/activeAccount/apiBase，不为 GOAT 注册第二条自建 OpenAI route。
- [ ] 通用 custom 调用 `llm.discoverModels('llm-pi-ai',{provider,baseURL,api},signal)` 时必须显式 protocol；OpenAI 用 Bearer，Anthropic 用 x-api-key + anthropic-version，由原 discovery 完成。禁止生成接口探测、自动协议轮询、自动付费 fallback。缺模型列表则手工输入，不发送最小生成试探。
- [ ] 已保存凭据只发往该 route 当前保存且核对的 baseURL；更改 URL 的草稿先保存并明确显示目标，再允许 authenticated discovery。新草稿无已有 key 可匿名 discover。禁止 arbitrary ref 借 discovery 取 key；限制 http/https，URL userinfo 拒绝。调用前后检查 revision/binding，不用过期草稿覆盖结果。
- [ ] 测试 fixtures 精确断言三协议 method/path/auth header、GET-only 模型刷新、取消/超时、未知 protocol 不自动写、existing model api 不丢失；模拟 provider 失败时没有生成调用、第二 host 或 Meta API 网络调用。

### B2. 可重现隔离环境与真实 bundle 装载

- [ ] prepare-isolated.mjs 建新 artifacts/isolation/<run-id>，独立 OS HOME、DSH_HOME、cwd、缓存，子进程环境只传所需 PATH/TMPDIR/locale 和合成测试变量；绝不继承整个 process.env，不复制 `.env`、credentials、会话、auth.json 或真实 profile。
- [ ] 使用冻结基线独立 git clone（不要 git worktree add 改用户仓库 metadata），从只读源路径 clone 到 artifacts 后 detach 指定 commit，单独依赖安装/build；依赖 realpath 门禁拒绝指回真实源码与真实 HOME。若构建成本高可使用已构建不可变官方包，但必须说明版本区别，不能冒称当前 commit 验证。
- [ ] 所有应用启动均经隔离 checkout 的 `dsh --profile ...` 公共入口；禁止包内部 bin/SDK argv 启动。脚本执行时先读该基线 CLI help，把实际 Web 端口参数与 headless JSON/stream 参数记录在 docs/acceptance.md；使用参数数组 spawn，不 shell 拼接 key。
- [ ] `pnpm pack --pack-destination artifacts` 后安装真实 tarball：隔离 CLI `plugin --profile web add <绝对tgz>`，验证 profile bundles 包含管理器、管理器 browser entry 被实际 `/plugins/` 装载、settings.section 出现。第三方 provider 用干净发布包固定版本安装，不复制 OpenCode patched node_modules；包不兼容时报告独立发现，不私改安装产物。
- [ ] mock-api.ts 仅监听 loopback 随机端口，固定 synthetic key，提供三个协议 models、普通 SSE 以及 tool-call→tool-result→最终文本序列。只记录合成请求。集成脚本拒绝任何未批准外网模型 origin；tarball/npm 获取与真实推理权限分开。
- [ ] Playwright 经真实鉴权流程进入临时 Web，验证刷新/加载故障恢复、三张套餐卡、添加 custom、保存/替换/显示/隐藏 key、reveal headers、重新进入、dirty drafts、revision 冲突。截图屏蔽所有密码/reveal 控件，禁用对 secret 页的 trace/HAR/request body 录制。
- [ ] 相同隔离 DSH_HOME 的 headless profile，已有 llm-pi-ai 读共享配置；选 mock route 显式模型，完成普通流式与工具往返。保证输出断言覆盖实际走到对应 mock endpoint、带正确合成 key、工具结果被后续请求消费；只跑 listModels 不算 headless 推理验证。
- [ ] 套餐 provider 的 headless 验证分别记录包能否无 manager UI 挂载及 mock 协议适配覆盖；第三方若没有安全可控 mock 路由则写“未执行真实请求”，不能以 generic pi-ai smoke 代替套餐验证。

运行命令（在 manager 目录）：

```sh
pnpm run typecheck
pnpm run build
pnpm run test
pnpm run test:client
pnpm run check:pack
pnpm run test:isolated
pnpm run test:headless
```

各命令失败非 0；集成缺依赖/未执行不能 exit0 伪装通过。artifacts 每次新目录，保留失败输出。通过 B 后交独立审核检查真实加载、socket/auth 反例、跨服务部分成功及 key race。当前尚无以上测试结果。

## 5. 批次 C：真实 profile 安装与验收

这是隔离验证后的独立部署检查点，由主控确认本轮用户安装/重启授权后执行；不把批准设计自动扩成付费推理、CLI 登录或安装 Muse 授权。

- [ ] capture-baseline.mjs 只读记录 dsh commit/version/launcher、dirty 文件名、profile 依赖版本/realpath、bundle 次序、lockfile 和产物 hashes/补丁存在性。原始配置如需恢复快照存到用户本机权限 0700/0600 的私有备份，报告不包含其正文、凭据、浏览器 token。不能把只保存 npm 版本当现有 OpenCode 补丁可恢复备份。
- [ ] 先确定真实 Web PID/端口/工作目录及是否需重启；不得 pkill 全部 dsh/Node，不影响其他 profile。安装只执行 `dsh plugin --profile web add <已审核绝对tgz>`，不带 update，不修改源码链接。保留原 provider 包与页面。
- [ ] 真实 Web 验证入口、卡片、模型目录、错误恢复、原页面仍可用、default route/model/reasoning 未变化。真实 key 输入/显示由用户操作或仅在隐藏工具响应中验证，绝不截图/日志/agent 输出 key。真实 API 生成另列是否授权与是否执行；没有执行不标通过。
- [ ] headless 不需安装 Web 管理器；检查同 HOME 的 provider/plugin 差异，缺少套餐依赖只能报告并在获准安装范围内补齐，不能默认与 Web 一致。确认共享 custom 配置在 profile 有对应 adapter 才能使用。
- [ ] docs/upgrade.md 给出仅移除 manager bundle/package 的退出步骤与恢复 profile 备份说明，不删除 credentials 或会话、不承诺旧版本会话可降级。不覆盖历史 patched 包。
- [ ] docs/status.md/acceptance.md 明确完成/失败/跳过/未授权/未执行；列安装实际版本、测试命令与原始输出路径、Muse CLI-only 限制、Command 默认 ref 范围、未做真实计费请求的事实。

## 6. 停止条件与交付

遇以下情况停止受影响批次并给主控事实：必须改 dsh 核心或第三方 node_modules；公开 DI/slot/打包契约不兼容；需要扩大任意 secret 授权；实际凭据优先级无法说明；发现非 mock 外网生成/收费请求；需要新增 Muse SDK bridge；需要恢复/删除用户数据；测试假绿或依赖指回可变真实源码。Muse 的受限卡片不阻塞其余受验收范围，也不能把 Muse 订阅执行标为完成。

最终交付：独立可构建源码、lockfile、经过检查的 tgz、raw synthetic 测试输出、Web 实际装载证据、headless 流/工具证据、安装/退出文档与真实环境逐项状态。主控审核通过才批准后续批次；执行者不自批，不主动扩大产品范围。
