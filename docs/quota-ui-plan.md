# Provider 配额与紧凑管理页实施计划

> 交接给用户另行指定的 EXECUTOR。使用 executing-plans 按检查点连续执行，默认由同一执行者按 H → U → 合流验证顺序完成；只履行执行角色，不递归委派。H/U 的文件边界也允许主控在另行授权时并行分配，不要求执行者自行开启多代理。

**目标：** 将 0.1.1 的展开表单网格改成 dsh LLM Providers / CC Switch 风格紧凑行卡，真实显示受支持 provider 的只读配额。
**架构：** 保留独立插件与既有管理协议；新增 host 配额 reader 和独立的逐卡客户端读取状态。配额不阻塞 snapshot，不注册推理路由。
**技术：** 现有 TypeScript、React 18、Cordis RPC、credentials、Node fetch、Vitest/jsdom；不增加运行时依赖。
**基线：** 2026-09-21，master `b8898b4`，检查时工作树干净；已读 design/status/provider-retirement 与实际 host/client。
**计划状态：** 独立 GPT-6 Astra / Medium 只读审核已完成，下文已纳入外部 key 轮换时不得由客户端回填旧额度的修订。用户要求本轮仅出完整执行方案，本轮未修改产品或部署。拟发布版本 `0.2.0`，真实部署前仍须提交实施证据供主控验收。

## 执行前读取顺序与完成定义

1. 读取本文件，然后 `docs/design.md`、`docs/deployment.md`、`docs/provider-retirement.md`、`docs/status.md`；以本文件定义的配额/UI 增量为当前批次，不重新实施旧版本。
2. 执行 `git status --short`、`git log -3 --oneline`，核对 `package.json`。若已有用户修改，保留并报告；不能清树或覆盖。本目录独立 Git 仓库，不得在 dsh 源码仓库开分支或写文件。
3. 原始命令输出保存到 `artifacts/quota-ui/<run-id>/`，红测、失败和修复证据均保留；只使用合成凭据作为 fixture，日志不记录真实 key、授权 header、浏览器 token 或账户原始对象。
4. 完成定义：紧凑总览/详情可用、受支持服务可读取真实配额、所有非成功状态正确、旧管理功能不回归、打包产物可实际装载，交付独立审核所需证据。真实账号缺凭据属于明确未验证项，不算“全部通过”。

## 界面与支持矩阵

总览每行按“本地图标｜名称、key 状态、模型数｜配额与重置时间｜刷新、详情”排列。顶部为标题、最后更新时间、添加 provider；不默认展开 37/71 个模型及 key 表单。详情以返回总览/展开收起保留上下文，包含完整额度窗口、最后抓取时间、凭据来源、密钥操作、模型目录和高级编辑。新建表单保存后进入新卡详情，方便填写 key；未知 API 立即明确显示配额不支持。

| 类型 | 初次总览状态 | 查询来源 | 本批明确不做 |
| --- | --- | --- | --- |
| OpenCode Go | 按真实 key/读取结果呈现 | 官方 usage：5h/周/月 | 不改模型路由或套餐，不自动转 API 计费 |
| Command Code GOAT | 缺 key / 来源待确认 / 有效窗口 | 官方 credits：fiveHour/weekly | 不猜实际多账户、不读取 auth.json、不把积分当美元 |
| Muse Code | CLI 检测事实＋订阅未接通 | 尚无已验证订阅查询接入 | 不展示假额度，不把普通 Meta API 当订阅 |
| 自定义 API、现有 Local | 模型与凭据状态＋暂不支持配额 | 只有未来显式注册的 adapter 才能查询 | 不猜任意地址的 /usage，不执行用户查询脚本 |

进度文案统一写“剩余”，同时保留原始已用事实供详情读取。5h 为主窗口，周/月在总览保持可见的副窗口；周额度耗尽不能被 5h 满额遮蔽。不要加跨账户或跨时间窗口的“总剩余”。图标与 provider 名称同时显示，颜色不承担唯一含义。

## 范围、证据与不可变约束

- 仅修改 `/Users/kevinchen/Dev/dsh-provider-manager`；不改 dsh 源码、第三方安装产物、真实 settings 或凭据。
- 不卸载旧插件、不替换推理适配器、不调用生成接口、不安装 Muse CLI、不抓取登录网页或 auth.json。
- 复用已安装公开 dsh credentials/settings/connection 接口、现有 Transport、Result、CustomProviderForm 和揭示保护。
- 旧插件 MIT 许可可供参考，但本批自己实现短 reader/parser，不 runtime import 旧包；许可证声明不自动等于品牌图标权利证明。
- 图标采用自绘本地 SVG symbol（OpenCode 几何 O、Command 终端符号、Muse M、通用连接符号），无远程图片 URL；不声称官方商标。
- 新增任意 API 没有统一配额规范：立即显示“暂不支持配额查询”，不尝试 `/usage` 或猜测余额；扩展 registry 必须显式绑定 adapter。
- Muse 显示“订阅未接通 / CLI 未检测到（按检测事实）”；不把可执行文件存在当作登录或配额成功。
- 保留既有 key 来源、默认模型、route、模型配置、局部 revision 冲突与未保存草稿；配置保存和 key 保存仍分别反馈。

## 已核对的真实 endpoint shape

- OpenCode 参考 `~/.dsh/profiles/web/node_modules/dsh-llm-opencode-go/lib/index.js:1743–1835`，0.1.28。
- GET `https://opencode.ai/zen/go/v1/usage`，Bearer 当前授权 OPENCODE_API_KEY；只读，无生成。
- 根可为对象或 `{usage:{...}}`；窗口 `rolling|rollingUsage|session`、`weekly|weeklyUsage`、`monthly|monthlyUsage`。
- 窗口 `percent` / `usagePercent` 是已用百分比；`usage` 为 ≤1 的已用 fraction 或 >1 的已用百分比；仅有限非负数，禁止字符串强转。
- `status` 缺省、`ok`、`rate-limited` 可识别；其他窗口状态不可画有效进度；reset 为 `resetsAt|resets_at|resetAt`，ISO 或 Unix 秒/毫秒。
- Command 参考 `~/.dsh/profiles/web/node_modules/@mars-sea/dsh-commandcode-provider/lib/index.js:3459–3524,4092–4138`，0.11.6。
- GET `https://api.commandcode.ai/alpha/billing/credits`，Bearer 明确受管默认引用；不复制 getUsage 的其他三次账户请求。
- 返回 `{windowLimits:{fiveHour:{used,cap,exceeded,resetAt},weekly:{...}},credits:{monthlyCredits,purchasedCredits,freeCredits}}`。
- Command `resetAt` 是毫秒（旧 client `formatResetAt(ms)` / `resetText(ms)`）；不套用 OpenCode 的秒转换规则。
- 仅有效 `used>=0,cap>0` 可推导比例；缺字段不补零，cap=0 显示“上限未明确”，不猜无限或耗尽；credits 字段未确认含义前不展示余额。
- 旧 OpenCode rolling 对应 5h 套餐窗口；列表标注“5h”，周/月独立列出；不合并三个窗口为总剩余。

## 检查点 0：冻结共享契约（host 执行者先完成；UI 可按此契约写 fixture）

- [ ] 修改 `src/shared/protocol.ts`，只添加下列类型；host 独占该文件，UI 不并行编辑。
```ts
export type QuotaStatus = 'ready'|'unsupported'|'missing-credential'|'source-unverified'|'error';
export interface QuotaWindow { id:'five-hour'|'weekly'|'monthly'; usedPercent?:number; remainingPercent?:number; resetsAt?:string }
export interface QuotaSnapshot { providerId:string; status:QuotaStatus; windows:QuotaWindow[]; fetchedAt?:string; stale:boolean; source?:'opencode-official'|'command-default-reference'; error?:'TIMEOUT'|'UNAUTHORIZED'|'UNAVAILABLE'|'INVALID_RESPONSE' }
export interface QuotaRequest { providerId:string; bindingToken?:string; refresh?:boolean }
```
- [ ] RPC endpoint 为 `quota/read`；返回沿用 `{ok,value}` / safe error 包装。未知 provider 拒绝；存在的 custom provider 可无 token 返回 unsupported、无网络。
- [ ] 未绑定/未配置的内置 provider 返回 missing-credential 或 source-unverified，不要求客户端虚构 token、不访问网络；ready 必须已核对现有绑定。
- [ ] `usedPercent` 保留真实有效非负值（可超额 >100），`remainingPercent=max(0,100-usedPercent)`；UI 只裁剪条宽，不裁剪原始已用事实。
- [ ] `fetchedAt` 为成功抓取时间，ISO；error 可附同绑定旧 windows 并 stale=true；无成功记录没有时间、没有条。

## 执行线 H：Host 配额（允许写以下文件与对应测试）

- [ ] 新建 `src/host/quota.ts`：纯 parser、固定 adapter registry、受控 fetch、进程内缓存；注入 fetch/clock 供测试，不暴露自定义 endpoint 参数。
- [ ] 请求固定上述 URL，GET、Accept JSON、Bearer（不猜 x-command-code-version、不冒充 CLI；服务拒绝按实际鉴权/不支持状态呈现）；`redirect:'error'`、`cache:'no-store'`，10 秒总期限；逐块读取最多 1 MiB，超限即取消 reader。
- [ ] 请求、stream 读取及 credentials resolve 均受 caller/lifetime/timeout 取消；取消释放等待，迟到 completion 不提交缓存；只返回白名单错误、不返回原 body/exception URL/header。
- [ ] 缓存成功值 60 秒，每 provider 至多一个当前条目；手动 refresh 绕过成功缓存，失败不自动重试；同卡进行中拒绝重复触发即可，不做跨 caller 共享取消。
- [ ] 修改 `src/host/providers.ts`：增加 quota(input,signal) 与配额 credential seam，复用 binding/check/credentialRef；不借用 reveal 返回秘密给 client。
- [ ] 在查缓存前解析当前有效 credential；缓存身份包含 provider、绑定 token、source、进程随机盐 HMAC(key)，秘密不进 RPC/日志/持久缓存。
- [ ] 发送前/返回后重查绑定及有效 credential 身份；更换 key、引用、来源或 revision 时旧缓存立即不可见，迟到旧请求不得覆盖新缓存。
- [ ] `set()` 成功后失效该 provider 缓存并中止旧请求；外部 key 更新在下次 resolve 时同样失效；env 优先时按实际 resolve 值读额度。
- [ ] Command 始终标注“默认引用配额，未确认当前活动账户”；遇 literal apiKey、accounts、activeAccount、modelAccountRules 或无法判断优先来源时返回 source-unverified。
- [ ] 上述歧义判定按有效值处理：空默认字段、空账户/规则数组和经源码确认等价默认的 activeAccount 值不应仅因字段存在就被拒；非空字面 key、实际额外账户/规则、非默认选择仍拒绝。无法从脱敏结构可靠判断时返回 source-unverified，不探测凭据文件。
- [ ] 上述检测只用脱敏 descriptor 中的字段存在性/结构，不扩大真实 secret 读取；默认引用缺失即 missing-credential，绝不 fallback auth.json。
- [ ] 已配置非官方 apiBase/baseURL 返回 unsupported/source-unverified，不把该凭据发送到另一来源；缺省按已核对官方默认。
- [ ] 修改 `src/host/index.ts`：加入 quota/read，传组合 signal；挂载与卸载使用现有 scope effect，卸载时取消 fetch、清缓存。
- [ ] 新建 `tests/quota.spec.ts`：table fixtures 覆盖 used=0→remaining100、used=100→0、超额、unknown、NaN/Infinity/负值、字符串、zero cap、缺字段、多窗口。
- [ ] 同文件覆盖 ISO/Unix 秒/毫秒、无效/越界时间、Command 毫秒；reset 过期不假刷新额度，坏 reset 仅省略时间。
- [ ] 同文件覆盖 auth missing/source ambiguity 无 fetch、固定 URL、redirect:error、401/403、500、坏 JSON、body 上限、超时/取消、60s TTL/manual refresh、key/source/revision 变化、迟到旧请求。
- [ ] 扩展 `tests/credentials.spec.ts`、`tests/lifecycle.spec.ts`、`tests/connection.integration.spec.ts`：set 失效、真实 RPC carrier 调用与卸载取消；既有 reveal 安全测试原样保留。
- [ ] 先运行新测试确认红，再实现；检查点 H：`pnpm test` 与 host TypeScript 通过，向 UI 交付契约与合成 fixture，不部署。

## 执行线 U：紧凑列表与逐卡读取（与 H 独立，禁止编辑 host/shared）

- [ ] 新建 `src/client/QuotaSummary.tsx`、`src/client/ProviderIcon.tsx`；修改 `ProviderCard.tsx` 为横向行卡，默认仅图标、名称、配置/挂载状态、模型数、额度和详情按钮。
- [ ] 不把 llm route available 渲染成“API 已连接”；日常文案写“Key 已配置 / 未配置”“连接未验证”，模型数单独显示，避免未经请求的连接成功声明。
- [ ] 主条显示“5h 剩余 100%”等真实值与 reset 倒计时；周/月为次级独立小条；没有主窗口则显示已有窗口，不伪造 5h。
- [ ] 每条标明剩余方向、更新时间、stale、刷新中/失败/重试；倒计时到零显示“等待额度更新”，不将旧比例设回 100%。
- [ ] 新建 `src/client/ProviderDetails.tsx` 承接现有 key 表单、来源、reveal、模型清单/刷新及自定义编辑；详情用原生 details/summary，可键盘操作且保持挂载保存普通草稿。
- [ ] 关闭详情必须 hide 清除已揭示 key 与秘密输入；隐藏/失焦/连接变化/超时规则保持，详情开关不能绕过保护。
- [ ] 修改 `ProviderManager.tsx`：单列行卡；顶部添加 provider 按钮展开独立表单区；初始不展示新增表单，保存成功打开新卡详情方便设置 key。
- [ ] 修改 `CustomProviderForm.tsx`：添加完成回调/关闭入口；不改 save payload 与 revision 逻辑；关闭可保留普通草稿，再次打开不无条件清空。
- [ ] 修改 `controller.ts`：State 新增逐 provider quota 状态及独立 generation/AbortController；提供 refreshQuota(provider,refresh=false)，不复用全局 load loading。
- [ ] snapshot ready 后逐卡异步读 quota；一张卡慢/失败不影响其他卡；unsupported/missing/source-unverified 不显示无限 loading。
- [ ] 每页可见且连接在线时首次读；5 分钟轮询，隐藏/离页/断线停止 timer 并取消；恢复可见/重连只读过期卡；不重复创建 interval。
- [ ] 刷新/保存 key 成功只使该卡 quota 失效重读；配置新增成功后 unsupported 明确出现；独立失败不把保存成功改成失败。
- [ ] 每卡旧请求在 key 变化、snapshot 代次、离页、断线后不得写回；失败保留同身份旧结果与 stale，不保留换 key 前额度。
- [ ] **独立审核必改条款：旧额度只能由 Host 决定是否保留。** 客户端只展示 Host 本次明确返回的 windows/stale；RPC 失败、响应校验失败或无 windows 时不自行补入本地旧值。外部 key 轮换可能不改变 bindingToken，必须新增“token 不变、新 key 请求失败、旧账户额度不可见”的回归测试。自动发起新读取时旧值不可冒充本次已确认结果。
- [ ] 修改 `validation.ts` 添加严格 validateQuota，校验枚举/providerId、有限范围数值、ISO 时间、windows 长度≤3及唯一窗口；禁止任意响应内容进入 UI。
- [ ] 修改 `locales.ts` 中英配额/状态/详情文案；修改 `styles.ts` 用继承主题色与局部 CSS variables，进度条不用仅颜色传达状态。
- [ ] 宽屏列对齐，窄屏 375px 分两行无水平溢出；focus-visible、按钮名称、aria-expanded、progressbar aria-valuenow/valuetext 完整，未知额度不渲染假 progressbar。
- [ ] 新建 `tests/quota.client.spec.tsx`：100/0/unknown/zero-cap/缺 reset/过期/多窗/stale；扩展 components/controller 测试覆盖逐卡错误隔离、轮询可见性、保存自动刷新、取消与迟到结果。
- [ ] 现有 dirty draft/revision/reveal 测试保留；新增关闭详情清 secret、草稿重开、键盘 summary/button 与新增表单流程。
- [ ] 先写失败 fixture 测试，再 UI；检查点 U：`pnpm test:client` 与 client TypeScript 通过；只用合成配额截图，注明 fixture。

## 合流、验收与交付（主控负责最终合流/发布门槛）

- [ ] H/U 合流后执行 `pnpm typecheck`、`pnpm test`、`pnpm test:client`、`pnpm build`、`pnpm check:pack`；保留完整原始输出，不只报告 PASS 数。
- [ ] 隔离 profile 实际 Web 验证 375/768/1280px、深浅主题、键盘、新增→保存 key→额度、详情/reveal 及离页取消；核查网络无外部 icon 请求。
- [ ] 使用已配置的真实 OpenCode key，通过 host reader 仅 GET usage，保存脱敏归一化值/抓取时间/状态与 UI 截图；不输出 key、header 或原始账户对象。
- [ ] Command 当前默认 key 未配：验证 missing/source-unverified 无网络；如用户已有明确默认有效 key 才 GET credits，不能将未执行记成真实额度通过。
- [ ] 真实 usage 不产生模型生成请求；与未来独立推理替代验收分开，旧插件卸载门槛仍未满足。
- [ ] 合流修改 `docs/acceptance.md`、`docs/status.md`、`README.md`，记录来源/支持矩阵/真实读与未测项；版本与部署由主控按现有 deployment 流程完成，不由并行执行者动真实 profile。
- [ ] 候选准备：将 `package.json` 版本改为 `0.2.0`、同步锁文件；`scripts/check-pack.mjs` 从 package.json 读取版本，移除旧 0.1.1 文件名硬编码。核对 `package.json.files` 包含实际使用的图标/资源（内联 SVG 无单独资源）；不打包 artifacts、测试密钥或本机路径。
- [ ] 独立审核聚焦 key 绑定变更、取消所有权、假满额、Command 来源歧义与窄屏；阻断问题修复后才打包部署。
- [ ] 停止条件：需要新增 credential 授权、读取登录文件、任意 URL 请求、改核心/旧插件、未知 endpoint 语义或扩大消费；上报主控修订，不猜测。

交付物：逐文件差分、原始测试/build/pack 输出、隔离截图、脱敏真实 usage 验收、明确未覆盖项；本计划不批准推理替代或卸载。

## 具体测试与打包命令

在 `/Users/kevinchen/Dev/dsh-provider-manager` 运行，按实际 pnpm/Node 锁定环境，不升级 dsh 或全部依赖：

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test
pnpm run test:client
pnpm run format:check
pnpm run build
pnpm run check:pack
shasum -a 256 artifacts/dsh-provider-manager-0.2.0.tgz
git diff --check
git -C /Users/kevinchen/Dev/deepseek-harness diff --exit-code
```

修改 package 版本或确需新增依赖后，应先有意识同步 lockfile，再验证 frozen-lockfile；不能以删除锁文件解决失败。以上每条必须记录退出码。构建/pack 成功不代表浏览器行为通过。

## 隔离验收与交付给主控

- 创建本目录 `artifacts/quota-ui/<run-id>/` 下独立 HOME、DSH_HOME、cwd 和包安装目录，使用同版本公开 `@deepseek-ai/dsh@0.1.5-rc.2`；启动环境用允许列表，不继承真实 API key/`.env`。参考旧验收目录 `/tmp/dsh-provider-validation.YG52pc` 仅作为历史证据，不假设它仍存在或可重复使用。
- 通过该隔离安装的公开 `dsh plugin --profile web add <候选tgz>` 和 `dsh --profile web --host 127.0.0.1 --port 0 --no-open` 加载候选。隔离 profile 若设独立 workspace，再用 `--workspace-root`；不得误指源仓库。
- Mock quota 使用依赖注入的 fetch/clock 或仅测试专用 fixture 插件，不为方便测试开放产品的任意 URL 或跳过 TLS/Origin。实际生产 reader 必须仍固定官方 URL。
- 浏览器用当前环境提供的授权 UI 自动化工具检查；本机 Codex 环境使用 `cua_repl`，不要换成未获支持的外部浏览器控制。截图中的数据若来自 fixture 必须注明，不能声称真实套餐。
- 检查正常 0/100/超额、多窗口、缺 key、不支持、读取失败、stale、手动刷新、自动刷新、隐藏页停止、添加→详情→保存 key、显示/隐藏 key、关闭详情、重连、窄屏及深浅色。
- 真实 OpenCode usage 只读验收属于用户本次查看配额的范围，但必须在正确账号、正确官方地址下使用受管凭据；无登录/凭据时停止相应真实测试，不索要用户把 key 发到聊天。无需模型生成或付费测试来验证配额展示。
- 完成后向主控交付报告：代码 commit/diff、候选包绝对路径及 SHA256、每条命令退出码和原始输出路径、UI 截图、支持矩阵、真实读结果与未测项。不能自行批准自己的验收或以单测全绿决定卸载旧插件。

## 真实升级和恢复（仅主控验收后执行）

1. 保存新的私有备份（权限 0700/0600）：Web profile 清单、锁文件、patch、settings、现安装 manager 包。保留既有 `/Users/kevinchen/.dsh/provider-manager-backups/20260921-5w5yfcig`，不覆盖历史备份，不导出凭据明文到项目目录。
2. 候选 tgz 复制成包含 SHA256 前缀的唯一文件名；保留旧不可变 0.1.1 包，不能覆盖旧 hash 文件。
3. 主控执行 `dsh plugin --profile web add --workspace-root <已验收的候选绝对tgz> --ignore-scripts`。实际 workspace 是 `~/.dsh/profiles/web`，与源码仓库独立。
4. 必要时仅重启 `launchctl kickstart -k gui/501/com.harness.deepseek-harness`；先确认仍是此用户/服务，并检查活跃工作，不使用全局 pkill。
5. 核对实际安装版本、新总览/详情、真实 quota、默认模型与现有插件 hash/config 是否保持。不能打印浏览器 token 或 key 来做报告。
6. 若升级失败，先保留失败日志；重新安装原 `artifacts/dsh-provider-manager-0.1.1-73d7079b8678.tgz` 并只重启对应服务。仅恢复本次确实改动的 profile 项，不能整份回写 settings 覆盖用户期间的新操作；不删除会话或 key。
7. 本批完成后仍不得卸载 `dsh-llm-opencode-go`、Command Code、LLM Providers UI 等旧包；必须继续满足 `docs/provider-retirement.md` 的独立推理替代门槛。若另一个执行 agent 被要求接手完整替代，应另行形成执行适配层计划，不能将本 UI 配额计划冒充那一批。

## 独立审核记录

2026-09-21：GPT-6 Astra / Medium 只读审核了本计划和实际 binding/controller。结论为补齐客户端不得回填跨 key 旧缓存后允许实施；本文件已纳入修订。审核未读取真实凭据、未发起真实请求、未运行未实现功能的测试。本轮仅文档交付。
