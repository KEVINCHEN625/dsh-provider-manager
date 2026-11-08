# Provider Manager 加载性能与可靠性优化计划

> **For agentic workers:** 后续执行使用 executing-plans 按下列较大批次推进；实施者不自行批准下一阶段。本文为规划交付，不授权实施、部署或真实 provider 探测。

**Goal:** 打开 Provider 管理时先显示可用列表，使目录、额度或单个 provider 的慢响应不再阻塞整个页面，同时修复凭据显示、取消、配置并发与 key 池的相关缺口。

**Architecture:** 将本地概览、额度、模型目录、路由同步拆开；页面与宿主分别持有自己的任务生命周期。缓存只复用同一身份下的脱敏数据，刷新有总预算、合并重复请求，写配置在读取最新归属后执行。

**Tech Stack:** TypeScript、React 18、Cordis、DSH 插件服务/RPC、Vitest 3、tsdown；沿用已安装公共 API，不改 DSH 核心。

日期：2026-11-04。源码基线：`b3d3597`；审查开始时工作树干净。角色：审核推进/规划；本轮未修改产品代码、部署、用户配置或凭据，未进行真实生成请求。

## 1. 结论和证据边界

已确认首屏存在不必要的等待链；不能把用户每次实际等待的秒数、各阶段占比或唯一根因写成已经测得。本轮没有抓取用户真实浏览器的端到端 trace。旧聊天曾把类似问题归因于 token/通道，这次不能沿用该结论替代诊断。

当前路径：

```text
进入设置页 → 新建 Controller
  → await snapshot（key池 → 所有卡片 → Muse PATH 检测）
  → await oauth/snapshot
      → 逐家 OAuth：远端目录/规格（TTL 命中可跳过）
                  → 可能同步 settings → 额度
  → status=ready，列表第一次拿到 snapshot
  → 再异步读 API key 卡额度
```

`controller.ts:161-177` 将基础列表与完整 OAuth 结果串联。每段 RPC 默认各有 15 秒客户端超时；OAuth 挂起可以在基础快照结束后再阻挡约 15 秒。不是说每次都会等待 30 秒：基础快照自身超时即失败，不会继续 OAuth。失败后的 5→30 秒退避也不是正常加载耗时。

`oauth-host.ts:77-90` 逐个处理 OAuth；`oauth-catalog.ts:395-416` 目录 availability/spec 串行，镜像也串行；`read:547-558` 没有自身总 deadline。目录已有 TTL、路由写入已有相等比较，不能称为“每次必联网/必写”。snapshot 不直接调用付费模型 probe，但读取可能触发 settings 写入，因此本轮未用真实 oauth/snapshot 做只读计时。

部署核对：本地 lib 与 Mac web/headless、Windows web 的 `client.js/index.js/oauth.js` SHA-256 一致。这里只证明这三个产物一致，不证明完整包、其他依赖、运行进程已加载内容及 Desktop 一致。各处 package version 为 0.5.0，README 显示 v0.5.1。

## 2. 已执行验证

证据目录：`artifacts/performance-audit-20261104/`。

| 检查 | 实际结果 | 含义 |
|---|---|---|
| `pnpm exec vitest run` | 33 文件、444 测试通过，6.98 秒 | 现有 Vitest 基线；不包括单独 Node compat/真实生成/浏览器验收 |
| `pnpm run typecheck` | 通过 | Host、Client 类型检查通过 |
| 独立合成观察测试 | 4 项通过 | 复现现存行为，并非修复后的回归测试 |
| 工作/安装构建产物比较 | 三个主要文件一致 | 暂无这三个文件跨平台版本漂移证据 |

观察脚本 `observations.spec.ts` 使用合成 transport，不读真实秘密、不请求 provider：

1. 基础 snapshot 已返回，OAuth promise 未完成时，页面仍为 loading，基础 snapshot 尚未发布。
2. `hideSecond()` 后，备用 key 的迟到响应仍会写回 `revealedSecond`。
3. 页面失焦/导航调用的 `hide()` 没有清除已经显示的备用 key。
4. 保存备用 key 后，同一备用槽触发两次 `refresh:true` 额度 RPC。

首版观察脚本因只等待两个 microtask，过早断言 OAuth 已启动而失败；随后改成明确的启动握手，未修改产品代码或放宽行为断言。原失败输出保存在 `observations-first-attempt.log`，最终输出为 `observations.log`。

尚未执行 build、pack、部署一致性脚本、真实 quota、付费 probe、Windows/Mac 浏览器性能 trace、物理网络断连。尤其 `check:pack` 当前会执行删除同版本旧 tarball 的脚本，本轮不运行它。

## 3. 按优先级的问题清单

| 编号 | 优先级 | 发现、源码依据与确定度 |
|---|---|---|
| F1 | P1，性能主线 | 前端串联两次 snapshot，OAuth 慢时整个列表没有数据；每次 mount 新建 Controller，离开即 dispose，无页面间概览复用。`client/controller.ts:161/558`、`ProviderManager.tsx:30/37`、`index.tsx:39`。代码与合成反例确认；真实耗时待测。 |
| F2 | P1，性能主线 | OAuth 快照逐家等待目录和额度，远端失败后才 fallback；基础快照也等全部 listModels 和 PATH 检查。`host/oauth-host.ts:77`、`oauth-catalog.ts:395/459/516/547`、`providers.ts:673`、`muse.ts:10`。宿主已安装 PiAiAdapter.listModels 还会调用 resolveApiKey，不能把 listModels 当必然的纯内存读。 |
| F3 | P1，先修安全 | 备用 key 明文走普通 RPC，未复用主 key 专用 HTTP 路径额外要求的真实 socket loopback、本机 Host/端口、必需的严格同源 Origin、no-store 与局部取消保护；客户端没有同等 generation 守卫，blur/导航只 hide 主 key。`host/index.ts:73`、`providers.ts:495`、`http.ts:67`、`client/controller.ts:358/384`、`ProviderManager.tsx:39/44/91`。Host 静态确认，客户端反例确认。通用 RPC 本身已有鉴权与 Host/Origin fence，不能说它完全没有来源检查，也不能称作公开未鉴权泄露。 |
| F4 | P1，提速前约束 | Catalog read 吞 AbortError 后可能写 fallback cache；OAuth snapshot 随后还可能 writeManaged。路由 CAS 冲突只换 revision，不重算旧整对象 ops，存在覆盖并发用户修改的路径。`oauth-catalog.ts:409/547`、`oauth-host.ts:85`、`oauth-routes.ts:208/230/369`。结构风险已确认，精确交错需实现前 RED fixture。 |
| F5 | P1，独立聊天批次 | Go failover 的 forcedSlot、lastSlotRef 是 adapter 共享闭包变量；其他聊天甚至 listModels 的 resolveApiKey 可干扰选槽。耗尽 TTL 按 ref 而非新旧 key 身份区分。另在当前安装的 0.2.1-rc.5，prepareCall 返回的 stream 直接调用宿主 streamWithSnapshot，绕过插件对 adapter.stream 的 failover 包装：`opencode/adapter.ts:182/208`、宿主 `lib/index.js:1927`。并发反例明确但本轮未动态验证，不作为已发生的数据损坏；prepareCall 包装缺口已静态确认，其他宿主版本须分别验证。 |
| F6 | P2 | 保存/删除备用 key 会重复强制刷新备用额度；load 清空 quota、每卡都请求，包括不支持额度者；备用槽不在定期刷新循环中；OAuth/login 定时读取缺少统一单飞，旧请求可能晚到。`client/controller.ts:175/336/388/424/539/545/852`、`ProviderDetails.tsx:158`。重复 RPC 已复现，不等同已证实两次外部 fetch。 |
| F7 | P2 | CatalogStore 无 in-flight 合并；QuotaReader 对已有同 provider 在途请求直接 UNAVAILABLE。简单加 Promise 缓存会带来“一人取消、其他人也失败”的新问题。`oauth-catalog.ts:374`、`quota.ts:344`。代码确认。 |
| F8 | P2 | Command Code 卡 id 与内置 runtime route 不同，纯内置环境可出现聊天可用而卡片无模型；seed 非空使所谓首次鉴权时刷新目录分支不执行。Go 标题声称显示“实际使用槽”，却只由偏好/是否配置推导，未反映耗尽后的自动切换。`providers.ts:598/603/648`、`commandcode/index.ts:14`、`commandcode/adapter.ts:124/171`、`ProviderDetails.tsx:403`。源码确认，部署实际卡片表现未测。 |
| F9 | P2 | 显式/登录后 probe 未完整传播总取消，逐模型 8 秒不等于整个操作有总预算；完整读 body 后 slice 不限制接收量。`oauth-host.ts:142/216/249`。非本次首屏 probe 根因，单列生命周期修复。 |
| F10 | P2，工程交付 | package 0.5.0 与 README v0.5.1 错位；`tsdown.config.ts` clean:false 让多代 quota chunk 共存；`scripts/name-content-tarball.mjs:18` 删除同版本历史 tarball；pack 检查临时目录缺少完整清理路径，check:deploy 固定只验 Mac 两 profile。须保持证据不可被打包流程清除。 |
| F11 | P3，有测量再做 | 每个 quota 状态变更都让订阅整个 State 的列表重渲染，卡片又接收整个 state；时区每次 render 重新读。controller 927 行、providers 817 行、OAuth 目录 781 行，职责拆分可降低返修。客户端约 185 KiB、gzip 47.3 KiB，不足以证明包体是当前首要瓶颈。`ProviderManager.tsx:33/90/181`、`ProviderCard.tsx`。无 React Profiler 数据，不先大拆 bundle/上虚拟列表。 |

项目已有价值应保留：主 key reveal 的保护、quota 账户指纹和 stillCurrent 检查、namespace revision、防迟到响应的部分 generation、keyless fixtures、静态模型种子、主/客户端分开构建和安装哈希核对。优化不得以删掉这些检查换速度。

## 4. 方案选择

1. **只并行两个 snapshot：不选。** 能省部分串行时间，但列表仍被完整 OAuth 阻塞，且不解决每次重进/远端挂起/写入竞争。
2. **在现有架构中做分阶段读取与受控缓存：推荐。** 保留 RPC 和公共插件 API，先解决首屏与慢卡隔离，再加强目录刷新与后台同步。
3. **重写前端数据层或替换宿主连接：暂不选。** 改动和兼容成本高，当前证据不支持把它列为首批必要工作。

### 目标行为

- 打开即显示页面框架；API key/OAuth 概览各自到达即可显示，不等另一组全部完成。
- 额度、模型目录、CLI 检测独立 loading/ready/stale/error；未知不是“未配置”、不是“0 个模型”。局部失败不清空已验证的同身份列表。
- 初始本地概览不进行外部目录/额度/生成请求，不写 settings。对可能联网的通用 listModels 延后到独立的详情/增强任务；已知内置目录可直接用本地数据。模型表和编辑表单只在对应数据就绪后开放。
- 重进同一连接上下文可立即展示非账户相关的列表框架/静态元数据。账户名、登录/凭据状态、额度必须先通过轻量 Host 身份校验才能复用；无可靠变更通知时，不先展示上次账户信息再悄悄纠正。缓存不保存明文 key、grant、reveal 结果；不使用 localStorage 持久化凭据相关状态。
- 手动刷新不把整个页面变空白；状态保留为 revalidating。失去认证显示明确的重新打开/认证指引，不能靠无穷 RPC 重试宣称自动修复认证。
- settings 写入不再藏在读快照里。B 保留已经持久化的授权路由和现有内置静态种子，只移除概览隐式同步，不新增后台写。C 才在独立的 authorization/settings/credentials 生命周期上建立路由 owner，RPC 另行嵌套依赖 connection/webServer；不能继续让整个 owner 只在有 Web 服务时存在。不能要求用户先打开设置页聊天才有模型。若 B 的功能必须依赖新同步，先把对应 C 正确性工作前移并完成审核。

### 建议验收目标（待基线校准，非实测成绩）

在独立 profile、固定 mock 数据和同一测试机上：非账户相关框架显示 p95 ≤100ms；含已校验身份状态的本地概览 p95 ≤500ms；同连接重进静态缓存框架 p95 ≤100ms。重进账户/额度仍须先校验身份，不能用错误账户数据满足速度指标。外部服务挂起 30 秒时，上述预算不随之变化。每个新鲜度期限内的同身份目录/额度只允许一个在途外部请求；用户刷新另行定义强制更新语义。

每次报告至少 20 次样本，区分首进/重进、冷缓存/热缓存、客户端 mount→overview、overview→各卡完成、Host 分阶段时间。固定合成规模 20 API provider + 40 OAuth entry；阈值若受设备或 fixture 影响不合理，先报告并调整计划，不能事后放宽断言掩盖回归。

## 5. 可验收实施批次

依赖：A → B → C；D 可在 A 后独立实施和验收；E 在拟发布代码稳定后。每批先 RED，再修复，再跑所属现有测试族；检查点通过后批内连续执行。跨批切换由审核推进员验收，不把每个补丁拆成外部交接。

### A：安全闭环、脱敏测量和基线

文件：`src/host/http.ts`、`index.ts`、`providers.ts`；`src/client/controller.ts`、`transport.ts`、`ProviderManager.tsx`、`ProviderDetails.tsx`；`src/shared/protocol.ts`；`tests/http.spec.ts`、`http.integration.spec.ts`、`connection.integration.spec.ts`、`second-key.spec.ts`、`controller.client.spec.tsx`、`components.client.spec.tsx`、`quota.client.spec.tsx`。新测试文件建议 `tests/loading-performance.client.spec.tsx`。

- [ ] 用本轮观察反例建立应当通过的相反断言：hide/blur/离开详情/断连/dispose 后，两个槽都不能保留或重新显示明文。
- [ ] 备用 key reveal 复用主 key 的专用 HTTP 边界，以明确的槽标识白名单选择固定 ref；更新 payload 验证与 transport，删除普通 RPC 的明文入口。保持现有主 key 调用兼容；拒绝任意 ref、坏 Origin/Host、非本机 socket，所有返回 no-store。
- [ ] reveal 都有独立 abort + generation；超时、关闭、切槽、保存/删除使先前响应失效。含秘密的响应不进入任何概览缓存。
- [ ] 添加可关闭的阶段计时，只允许 phase、duration、count、结果码、随机关联 id；不记录 key/account、record、响应正文、请求 URL query、binding 值、完整 settings。
- [ ] 基线 fixture 注入慢 OAuth、挂起 listModels、PATH access 延迟、断连、失效认证；记录请求数、状态顺序及 p50/p95。

检查点 A：安全反例转成回归通过；旧 HTTP 安全断言不放宽；计时日志扫描不含合成 secret 标记；完成可比较的性能基线后才接受 B 的提速数字。

### B：首屏分阶段、重进复用、减少刷新

文件：`src/shared/protocol.ts`、`src/client/validation.ts`、`controller.ts`、`ProviderManager.tsx`、`ProviderCard.tsx`、`OAuthCard.tsx`、`OAuthDetails.tsx`、`ProviderDetails.tsx`、`QuotaSummary.tsx`、`locales.ts`、`index.tsx`、`styles.ts`；`src/host/providers.ts`、`oauth-host.ts`、`login.ts`、`index.ts`、`oauth-entry.ts`、`muse.ts`。新增 `src/client/overview-store.ts`（插件/connection 上下文持有脱敏概览及订阅，页面只持有草稿与 reveal）；需要时新增 `src/host/overview.ts`（本地只读 DTO 组装）。测试涵盖 providers/oauth/controller/transport/components/quota 与 A 的性能 fixture。

- [ ] 定义基础概览 DTO 与各资源独立状态，逐一更新生产者、验证器、消费 UI 和 fixtures；不能把完整 `models:[]` 临时当作“目录确实为空”。
- [ ] 基础 API 与 OAuth metadata 并发获取并独立发布；一个失败只影响该组。Host 初始响应不 await 目录、quota、未知 adapter listModels 或 PATH 扫描；后台/详情补全有各自超时与状态。
- [ ] 每次概览只读一次 settings/provider 索引；凭据状态读取有界并发，局部错误如实返回。CLI 检测按 PATH/platform 短 TTL 缓存，异常状态不得伪装成未安装。
- [ ] 概览 store 归属插件上下文，卸载释放；保留完整 connection generation identity，不能继续只降成 boolean。缓存按宿主/profile 上下文、连接代次、provider 与槽、Host 确认的不可逆身份标识隔离；任何客户端本地凭据/登录/登出操作即时失效对应条目。页面关闭期间的其他窗口/外部工具变更若无可靠订阅事件，则每次重进先发轻量 Host identity 校验，校验前仅展示非账户框架；失败时保持未知。不得把整个 Controller 连同秘密、draft、login 状态放入共享缓存，不向日志输出身份标识。
- [ ] reload 保留同身份已知数据并标记刷新中；删除重复的备用额度刷新；轮询只处理支持额度且相关可见卡片，并明确包含打开的备用槽。初始可见性从 document 实况设置。
- [ ] OAuth 快照刷新、登录 poll、目录读取单飞/序号守卫；延迟旧响应不能覆盖较新状态。未保存的草稿和原 revision 保留，切换登录身份时清理不适用的状态。
- [ ] 处理取消后的状态：不能留下永远 loading；失效认证给单独错误提示，网络恢复重试有界且不重放写操作。

检查点 B：无网络且全部外部服务挂起时概览照常显示；初始概览 fetch/probe/settings.mutate 计数均为 0；实际请求中凭据服务等不可取消公共 API 至少停止后续发布并释放等待方，不能假称其底层 I/O 已终止。增加“页面卸载→另一窗口/外部工具换账户→同一连接重进”反例，校验前不出现旧账户/额度。独立 headless fixture 不挂 webServer、不打开设置页，验证已有持久路由和内置 seed 仍可用；此批不增加新后台写。重进、断连、快切页面、修改配置时没有陈旧数据回写。

### C：目录/额度共享刷新与配置同步正确性

文件：`src/host/oauth-catalog.ts`、`oauth-host.ts`、`oauth-entry.ts`、`oauth-routes.ts`、`quota.ts`、`oauth-probe.ts`；必要时新增 `src/host/shared-refresh.ts`（共享任务和订阅者取消语义）。测试：`oauth-catalog.spec.ts`、`oauth-quota.spec.ts`、`oauth.spec.ts`、`quota.spec.ts`、`lifecycle.spec.ts`、`oauth-probe.spec.ts`。

- [ ] 本地/last-good 即时返回，远端刷新受总 deadline、镜像尝试预算、流式字节上限控制；availability/spec 可独立并行，但不能在共享写竞争未处理前直接全量 Promise.all。
- [ ] 同 identity 的读合并，在途任务不直接依附第一个调用者 signal；单订阅者取消仅取消自身等待。纯按需任务在最后等待方离开时取消；Host 主动刷新持有独立租约，最后页面关闭不释放这个租约，工作持续到完成、deadline 或 owner dispose。所有租约释放才取消共享工作。身份变化与 cache publish 前再次校验一致。
- [ ] AbortError 不转成可缓存的普通网络失败；保留 last-good，标记 stale/source/fetchedAt；失败重试短 TTL，不把一次失败冻结整个成功 TTL。额度不能跨账户复用，即使 provider id 相同。
- [ ] 将读快照中的 writeManaged 移到明确、可观测的 Host 同步任务；用户操作与同步按 namespace 协调，CAS 冲突后重读归属/profile 并重新生成 ops，不能仅重放旧对象。
- [ ] logout、用户接管路由、换账号、dispose 使所有相应同步 generation 失效；慢任务不得复活已删除/自定义路由。将路由同步 owner 与 Web RPC owner 分开：前者只依赖 authorization/settings/credentials，后者才注入 connection/webServer。保留 seed 和既有持久路由，单独验证无 webServer 的冷启动 headless；管理 API 不能因此获得跨 profile 权限。
- [ ] 显式 probe 及登录后的既有探测传播 owner/request 取消和总预算，真正限制 body 接收；不增加探测数量、频率或自动付费调用范围。

检查点 C：确定性交错覆盖双窗口同读、一人取消、关闭最后页面但 Host 租约仍在、所有租约释放、换 key、logout+慢刷新、CAS冲突+用户编辑、宿主卸载；断言外部 fetch 次数、owner 失效后无写入、路由归属不变。在没有 webServer/没有打开页面的 fixture 中确认路由 owner 可正确工作并释放；无授权/无凭据时不探测。没有完整证据不得启用新的后台同步。

### D：聊天 key 池、卡片与模型目录一致性（独立批次）

文件：`src/host/opencode/adapter.ts`、`pool.ts`、`providers.ts`、`commandcode/adapter.ts`、`commandcode/catalog.ts`、`src/client/ProviderDetails.tsx`、`locales.ts`；需要时新增 `src/host/opencode/key-health.ts`。测试：`go-key-pool.spec.ts`、`opencode-adapter.spec.ts`、`opencode-manager.spec.ts`、`commandcode-adapter.spec.ts`、`providers.spec.ts`、`lifecycle.spec.ts` 与对应 client 测试。

- [ ] 先建立单请求 prepared-call stream 首个实质 chunk 为 quota 错误的 RED 测试，验证应当只 failover 一次；现有 prepared snapshot 测试不能替代它。再建立两请求交错测试：A 取主 key 后暂停，B 取备用 key，再让 A 返回 quota 错误；确认不会标错槽或重试同一耗尽 key。
- [ ] 每条流持有独立 attempt/slot 状态，只共享按 credential identity 区分的健康记录。已安装 PiAiAdapter 存在 prepareCall→streamWithSnapshot 路径，不能只包 adapter.stream 就声称覆盖所有聊天入口；须验证 stream 与 prepareCall 均走修复逻辑，并保留官方 snapshot/replay/工具/取消行为。优先公共组合接口；接口不能安全关联时停止并修订设计，不全局串行聊天，不依赖私有 monkey patch。
- [ ] 同一流最多切换一次；开始输出内容后不重试；consumer.return/abort 关闭上游一次；换 key 清理旧身份的耗尽 TTL。
- [ ] 显式映射 Command Code UI id 到 runtime route，保持原 credential ref；覆盖只有内置、只有 legacy、两者并存。维持静态 seed；任何在线目录刷新都有显式触发和预算，不放回首屏/首 token 的关键路径。
- [ ] Go 标题改为“偏好/配置推导的额度”，或在另经设计的脱敏运行状态支持下显示真实最近选槽；不得把推断继续标成实际聊天用 key。

检查点 D：既有协议、工具往返、failover、取消测试通过；增加确定性并发和 prepareCall 路径证据；独立并发审核通过后才可部署。

### E：构建发布、维护性与按需渲染优化

文件：`package.json`、`tsdown.config.ts`、`scripts/name-content-tarball.mjs`、`check-pack.mjs`、`check-deploy-consistency.mjs`、`check-opencode-pack.mjs`、`README.md`、`README.zh.md`、`docs/status.md`、新验收文档；测试 `pack.spec.ts`。新 `scripts/check-release-manifest.mjs` 对 tag/版本/发布包做一致性检查；是否新增 CI 依据现有 CI 清单，不假定已有 workflow。

- [ ] 在本轮发布决策时统一版本与文档，记录基线/候选 hash。构建使用独立新 outDir/staging，仅将当前引用 chunk 纳入候选包；不清理用户已有 lib/artifacts 来假装包干净。
- [ ] tarball 按内容命名但不删除其他历史包；部署校验接受显式候选与 profile/平台目标，不为满足“只有一个包”删证据。
- [ ] 临时目录和本轮创建资源在 finally 清理，日志单独保留；compat 脚本的宿主版本/依赖矩阵明确，0.1.5/0.1.7/0.2.x 声明须有对应 smoke，而非只用当前 devDependency 测试。
- [ ] 分离 controller 的 overview、quota、reveal、login 职责及 Host 概览/绑定职责，跟随前述批次自然拆分；兼容 shim 订阅纳入插件卸载 disposer，不保留无人监听的宿主订阅。
- [ ] Profiler 确认渲染确实显著后，改窄订阅/稳定 props、memo 时区；只有包加载仍超预算才研究详情拆包，并验证宿主自定义 ModuleLoader 的支持。不给小列表先加虚拟化或更换 React 数据框架。

检查点 E：候选 tarball 在干净独立 profile 可用、旧证据完整保留、版本一致；逐目标核对实际安装 artifact；报告实测首屏/重进分位数与请求数，不只交付 PASS 数量。

## 6. 测试、交付与停止条件

执行时沿用已声明脚本：Host `pnpm test`、Client `pnpm test:client`、`pnpm run typecheck`；每批跑相关完整族。最终发布候选再 `pnpm run build`，在 E 的保留证据修正完成后运行 `pnpm run check:pack`。外部 Node compat、隔离 profile、各平台 browser smoke 分开报告，不并入 Vitest 计数。所有测试失败必须保留原始输出；不得放宽权限/断言、删测试、扩大重试窗口来掩盖问题。

每批交付：实际差分与文件清单、RED→GREEN 原始输出、关键调用链说明、测量 fixture/样本与环境、资源清理记录、未测范围。独立审核主动寻找迟到响应、换账户、路由接管与并发反例。下一批通过前由审核推进员验收。

停止并报告：需要改宿主私有 API/全局行为；需要扩大凭据可见范围；改变路由所有权/默认模型/登录授权策略；需要安装、更新或重启真实 profile；需要真实付费探测；跨账户缓存隔离无法建立；无法安全实现 Go 每请求上下文。当前规划不授予这些操作授权。

首个推荐实施包为 A+B，内设 A 检查点；C、D 分别进行聚焦并发审核。E 发布治理先做不删除证据的改造，其余性能细节由 A/B 测量决定。避免把所有模块一次重写。

## 7. 本轮审核状态

后端规划者进行了只读源码检查，返回独立的等待链、取消/CAS、第二 key reveal、Go 并发及 route 映射发现；主控复核关键路径并运行上述基线与合成观察测试。规划者未运行产品测试、未作修改。本轮未逐行校验所有静态模型 JSON、SVG path 或历史证据，不宣称仓库不存在其他问题。

独立审核已对照实际源码完成，提出 5 项修订：B/C 无 Web 服务的路由 owner 与迁移边界、页面关闭期间外部换账户的缓存校验、prepared-call failover 缺口、通用 RPC 已有来源防护的准确措辞、后台租约与页面取消的区分。上述修订已合入，记录见同目录 `2026-11-04-provider-manager-performance-review.md`。用户尚未批准实施。
