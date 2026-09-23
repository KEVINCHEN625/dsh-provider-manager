# OpenCode Go 全模型适配与单卡收敛执行计划

日期：2026-09-23。本轮交付计划，由用户指定的另一位执行 agent 实施；本文不是已完成报告。

规划审核：独立 GPT-6 Astra / Medium 只读审核已通过，显式调用优先级与可靠输入限制
两项修订已纳入。该结论仅批准本执行计划，不代表检查点A、代码、真实调用或部署通过。

## 1. 目标、基线与边界

在 `/Users/kevinchen/Dev/dsh-provider-manager` 的当前工作树上，将现有内置
`provider-manager-opencode-go` 从三个模型扩展为当前 OpenCode Go 套餐的完整模型集，
准确支持每个模型的协议、上下文、最大输出、可调思考方式，并在详情显示这些信息。
**完成适配验收后，Provider Manager 只保留一个 OpenCode Go 卡片。**

当前已部署版本0.2.8；最终基线包SHA256：
`3d57fb850455325b6435132252806a8375b4d4173592d9e2790d6bc689f911dc`。
默认：内置 Muse Spark 1.3 Contributor / xhigh。已有 Muse 加密回放修复、DeepSeek
reasoning字段修复、稳定session头、公共PiAiAdapter和真实Web/headless验收，必须保留。
当前源码存在大量**已验收但未提交**改动；不得reset/checkout覆盖、从HEAD重建实现，
也不能把dirty内容视为本批新增。先记录工作树、文件hash、安装版本和差分基线。

不修改 `/Users/kevinchen/Dev/deepseek-harness` 源码，不运行时修改其他插件的文件，
不patch全局fetch，不另建第三个Go路由。不卸载旧Go/Command插件、不删除key、旧配置或会话。
“删除另一个卡片”仅针对本插件的管理页面与其管理RPC，**不是删除旧推理路由**。
不修改其他provider、OAuth流程、默认模型、权限、付费设置；不擅自发布npm或推送仓库。
预期候选版本0.2.9；执行开始须检查版本是否已被别的工作占用，再选未占用版本。

## 2. 模型范围与证据规则（检查点A）

读取本计划附带的完整[40项参数矩阵](opencode-all-models-2026-09-23/matrix.md)及
`matrix.json`。同目录保留官方列表、官方文档、models.dev Go子目录和SHA256来源记录。
规划时无凭据GET成功：官方 `/zen/go/v1/models` 返回40个ID；仅含ID，不含完整能力。
官方端点表明确31项协议；models.dev Go目录39项，其中38项在官方列表中。

执行时重新获取下面的公开来源，保留带时间/hash的快照并输出差分：

- https://opencode.ai/zen/go/v1/models ：实际Go目录集合来源。
- https://opencode.ai/docs/go/ ：Go特定协议、客户端要求。
- https://models.dev/api.json 的 `opencode-go` ：能力参数来源，不能混入Zen/OpenRouter。
- 缺项通过OpenCode官方源码、官方模型/网关文档进一步确认；保留commit/ref与字段来源。

明确阻断项：

- `deepseek-flash`、`hy3-preview` 在官方列表，但Go metadata缺失。不得猜成
  `deepseek-v4.1-flash` / `hy3`，也不得用统一262K/32K填洞。确认别名关系后才允许复用
  参数，仍保存用户选择的原ID及别名来源，不能悄悄改线上的model字段。
- 9个协议待核实：kimi-k2.5、glm-5、deepseek-flash、qwen3.5-plus、mimo-v2-pro、
  mimo-v2-omni、hy3-preview、grok-4.5、omen-alpha。不能仅按名称前缀/旧插件路由推断。
- `ox-alpha-free` 仅在metadata出现、当前官方Go列表不存在，不自动加入。
- Qwen3.8 Max的metadata SDK提示与官方Messages端点不可简单混用；以Go端点事实和
  可验证wire契约裁决。Omen尤其不能照搬旧插件的Responses猜测。

集合以执行时冻结的官方Go列表为准，不硬编码“永远40个”。每个ID必须有
`supported / confirmed-alias / officially-retired / blocked-with-evidence`处置记录。
目录仍存在且参数/协议不明的项是阻断，不能静默删掉后宣称“全模型”。官方确认下架的
变化可以有证据地调整基线；无证据不得用“deprecated”或一次403替代下架判定。
检查点A输出逐项来源、冲突裁决与待处理清单；能确认的独立工作继续，阻断项不可假绿。

## 3. 目录单一事实来源与更新设计

新增 `src/host/opencode/models.json`（或等价强类型数据文件）及独立schema validator。
每项至少保存：id/name/api、contextWindow、可选inputLimit、maxOutputTokens、reasoning
policy、允许efforts、toggle、budget上下界、原生replay字段、已支持输入模态、兼容策略名、
字段来源与checkedAt。SDK Model由该数据生成，UI也从同一数据投影，不能各维护一张表。

`scripts/sync-opencode-catalog.mjs` 默认只取公开数据并产生**候选差分**，不得在应用启动时
抓新模型并自动启用。审核通过才更新随包目录；新增未知协议/缺参数的模型隔离为待处理。
断网保留已审核目录；远程列表失败不能清空模型；重复ID/异常数字/不可信URL必须拒绝。
生产推理目的地固定在Go官方origin；远程metadata不得决定凭据发送URL。

限制全部保存原始整数，不能把1,000,000和1,048,576都存成相同1M。
最大输出是模型能力，不是一次调用承诺。实际请求需同时遵守调用者上限、剩余上下文、
输入独立上限与推理预算；不能把catalog上限一律写入configuredMaxTokens。
例如Kimi K2.7/Grok的output可等于context，这不是数据错误，也不意味着可忽略输入长度。
若公共host无法表达独立inputLimit，必须在插件adapter请求边界提供保守限制/明确拒绝，
并记录如何计算；不得只在UI显示数字却完全不执行限制，也不得改DSH私有API。
计数必须使用已核实的公开token计数接口或有证据的保守上界，覆盖system、工具schema、
消息、图片/附件等完整请求。不能用随意chars/4当准确值；无法给可靠界时保持该能力
blocked，不能把“所有请求都拒绝”算作完成模型适配。原始catalog值和实际可执行能力
分别报告，若需要新tokenizer/更大依赖变更则先提交设计修订。

## 4. 思考配置是真实能力，不是统一枚举

区分五种情况：非推理；有推理但无公开可调项；原生effort枚举；toggle；budget_tokens；
部分模型同时支持多种控制，需要组合规则，不能只选择其中一个然后声称完整适配。
`reasoning_options: []` 不等于不推理，也不等于支持所有强度。

- 显式定义pi-ai所有标准级别off/minimal/low/medium/high/xhigh/max的允许或null状态。
  未填写时底层会默认开放若干档，已在0.2.8触发过误显示Off，必须测试公开resolveModel。
- 官方`none`、host `off`、省略参数的Default、toggle disabled是不同语义。每模型明确
  映射并验证wire，不能在 UI 写“Off”但实际上仍发送开启思考或不支持的字段。
- 原生effort按原值发送，不得把max/xhigh悄悄clamp成high。若底层库映射会吞值，应在
  本插件局部API bridge修正并测试，而不是只改菜单标签。
- Qwen3.5/3.6/3.7等budget/toggle模型不得伪造“官方low/medium/high”。本插件详情提供
  每模型思考开关/预算设置，或明确标为**本地预算预设**的host档位映射；显示原生控制与
  本地预设的区别。Qwen3.8还存在原生effort，不能强行使用所有Anthropic模型同一策略。
- 需要每模型设置时，扩展现有GO_ROUTE settings namespace，保存版本化、受验证的
  overrides；校验模型ID、数值、互斥/组合约束，公共settings revision乐观并发写入，
  不改其他模型或其他provider。不在浏览器构造任意provider-wire payload。
- 配置优先级固定为：调用者显式本轮值 > 该模型本地默认 > 经确认的provider默认。
  区分字段缺省和off/none/0，非法值或互斥组合明确拒绝；不得用本地设置覆盖用户明确的
  off，不得把原生effort换成本地预算预设。所有组合按同一冻结配置快照解析并做表驱动测试。
- budget最大值不得直接作为默认预算；如Qwen3.7 Max声明budget262144而output65536，
  运行时预算需小于实际max_tokens并预留回答空间、同时遵守剩余context。无法解释的
  源数据冲突必须标出；禁止为了“显示支持”让用户配置永远无法发送的值。
- PiAiAdapter使用SimpleStreamOptions，现成Anthropic streamSimple会将普通档位换算为
  budget，forceAdaptiveThinking则走另一路。必须从真实Go契约决定；必要时局部wrapper
  将公开simple options转换为对应底层stream options，保留原EventStream/取消语义。
  不得假定GO模型与Claude的adaptive thinking完全相同。

## 5. 三协议适配（检查点B）

保持GO_ROUTE身份、OPENCODE_API_KEY引用、DSH attribution/User-Agent、每会话
x-opencode-session和并发隔离。新增Anthropic Messages factory；依据SDK实测调整baseURL，
断言最终路径恰为 `/zen/go/v1/messages`，不重复/v1、不丢失/zen/go。验证该协议实际鉴权
字段与Go要求，不复制未经确认的header。Completions和Responses也逐ID使用显式映射。

拆分协议策略文件，保留公开PiAiAdapter负责原生context/attachments/usage/errors：

- Muse两型号原加密reasoning过滤与function-call item-id清理原样回归；不要对Grok/GPT
  或所有Responses模型全局删除reasoning。每个模型按证据选择其兼容策略。
- 当前DeepSeek原生`reasoning`→`reasoning_content`克隆归一仅覆盖v4.1。
  新增Completions模型按字段能力扩展，不仅看前缀。上游SDK硬编码旧provider名的其他
  特判也要审查，不能伪造opencode-go身份绕过新route的replay所有权。
- Anthropic thinking/redacted-thinking签名、工具use/result、工具后续轮、多工具和图片，
  以及跨协议切换，都经过真实序列化链路测试。不要将隐藏推理改成普通最终回答。
- 创建不可变配置快照；更新目录/预算只影响后续prepareCall。不能在prepared stream时
  重新读取新profile导致本轮元数据与请求不一致。key仍按公开接口于stream开始解析。
- 保留abort、消费者提前关闭、idle timeout、finish/usage顺序，不另造泄漏iterator。
  如果确需包裹async iterable，finally必须关闭inner并传播取消。

检查点B：所有冻结集合ID都有准确schema/协议/策略与离线wire用例；未确认项不通过。

## 6. 参数展示与单卡行为（检查点C、最后启用）

详情模型表至少显示：模型名/ID、协议、精确上下文、独立输入上限（如有）、最大输出、
原生effort/开关/预算、输入模态及实际支持范围、来源日期。默认收起的紧凑行可以用
K/M，但详情/tooltip必须可核对整数。不得显示“未声明档位”为“不能思考”。

关键数据链：`catalog → host Manager.card DTO → shared protocol → client validation
→ controller → ProviderDetails`。公共PiAiAdapter.listModels只保证id/name等字段，不能
假设包含api、maxTokens；resolveModel也不提供所有catalog输出能力。对实际listModels的
ID join自身审核目录，补齐自己的DTO；`src/client/validation.ts`必须同步保留新增字段，
否则后端加了参数仍会在客户端丢失。只发送非敏感metadata，不发送key/native历史。

全模型验收通过后，删除本插件 `OpenCode Go (legacy plugin)` 管理卡：

1. snapshot/统计/筛选只输出GO_ROUTE一个Go项，名称可改成简洁“OpenCode Go”，保留
   “Provider Manager 内置”说明；不要改变route ID或复制造成第三个卡。
2. 退役本插件对旧id `opencode-go` 的card/models-refresh/quota/set/reveal入口，在读取
   credentials或网络前返回明确退役/INVALID_INPUT错误；旧客户端必须重新加载列表。
   这**不影响旧插件自身的RPC**、旧推理route或DSH的其他设置页面。
3. 继续将opencode-go列为reserved，禁止custom:opencode-go绕过绑定。新卡token不能被
   旧id接受，旧token也不能作用于新卡。测试过期请求/refresh不会把旧卡带回列表。
4. 保留OPENCODE_API_KEY；新卡设置/查看key、官方额度与刷新照常工作。移除“双卡”及
   “去旧LLM Providers配置”的过时文案，说明保留旧路由时共用key的事实即可。
5. 其他卡、旧推理会话和配置不删除；全局模型选择器中的旧插件分组属于另一个范围，
   本批不隐藏它或卸载插件。用户授权的是Provider Manager中的重复卡收敛。

开发阶段可在候选分支实现C，但不得先部署仅删卡、模型未完成的半成品。

## 7. 逐文件工作包与顺序

| 工作包 | 文件范围 | 交付/关键依赖 |
|---|---|---|
| A | docs/opencode-all-models-2026-09-23、docs/opencode-all-models-evidence.md | 刷新40项基线、来源差分、协议/别名裁决；只补文档不改本轮原始快照 |
| B1 | src/host/opencode/models.json、catalog-schema.ts、catalog.ts；scripts/sync-opencode-catalog.mjs | 严格数据schema、显式protocol、reasoning union、候选同步；不用旧插件运行依赖 |
| B2 | src/host/opencode/profile.ts、adapter.ts、index.ts；新policies/{responses,completions,messages}.ts | 三协议、精确wire、每模型设置/快照、公共接口，不改宿主 |
| B3 | src/shared/protocol.ts、src/client/validation.ts、controller.ts；src/host/providers.ts | 元数据DTO及受验证模型设置RPC；Go quota严格固定官方URL |
| C | ProviderDetails.tsx、locales.ts、相关CSS、ProviderManager.tsx/ProviderIcon.tsx（仅必要改动） | 清晰模型参数表、预算设置、单卡与旧管理入口退役 |
| T | tests/opencode-*.spec.ts、tests/fixtures/opencode-wire.mjs、相关client/credentials/http/quota tests | 每ID每配置wire；alias/native replay；旧卡退役与不删推理路由 |
| P | scripts/check-opencode-pack.mjs、opencode-pack-runner.mjs、check-pack.mjs、package/lock | 扩大全目录fresh tarball验收；移除三模型硬编码，锁兼容依赖 |
| D | README两语、docs/opencode-all-models-acceptance.md、docs/status.md | 安装/更新/回滚/目录刷新与真实覆盖范围，历史证据保留 |

按A→B1/B2→B3→T→C验收→P→本机验证执行较大连续批次，设上述检查点。
先红测再最小实现；tests里的GO_MODELS[2]等位置假设改为按ID查找。
若需要升级pi-ai，必须单列旧/新行为比较并重新审核三协议；不能顺手升级DSH解决问题。

## 8. 验收矩阵与真实请求预算

离线强制覆盖全ID和全部声明控制值：ID集合等值、每条来源/limits、公开resolveModel真实
菜单集合、实际HTTP路径/鉴权header名/session/attribution、每个effort/none/toggle/budget
wire值、最小/最大/越界预算、缺字段、schema拒绝未知参数。不要只测试数据常量等于自身。
由模拟SSE产生assistant→DSH BlockAssembler持久replay→tool result→下一轮请求，覆盖三
协议、原生和别名reasoning字段、多工具/长ID/图片、跨模型/协议/旧adapter→新adapter。

并发两个session、缺session fallback、key替换、prepared快照、abort/early-close/timeout、
无凭据/无附件、429/5xx/空回答、配置保存冲突均需回归。单卡测试包括无旧插件fresh安装、
有旧插件升级、旧RPC fail-closed、reserved绕行、真实quota解析/缓存命中/换key失效。
不得再用解析失败的fixture“证明缓存失效”。全仓原有10文件format失败保留基线；不改
无关文件掩盖它，修改文件格式必须通过。

运行：typecheck、Host全量、client全量、format（注明基线）、build、browser factory、
仓库外仅registry依赖的tarball Web/headless装载/卸载。包内不能含本机绝对路径、私有
源码导入或运行时包文件改写。全模型模拟测试不能偷偷需要真实HOME/key。

真实验收分层记录，不能把mock通过写成所有模型真实可用：

- 首先保留Muse xhigh、DeepSeek max既有回归，再按每种协议/策略族小规模试跑。
- 对冻结集合每个可调用ID做一次最小工具两轮；每个真实effort不必全扫，但每档必须有
  离线wire测试，报告明确live采样档位。别名额外确认响应模型信息，不能仅凭HTTP200认定
  上下文/effort上限真实成立。
- 建议首轮每模型最多2请求，排障额外总计最多8请求、并发最多2；单请求输出上限尽量
  4096且满足该模型已核实的最小预算。模型要求更高预算/额度不足时先报告，不无限重试。
  以执行时批准的总请求/输出预算为硬上限，禁止压满1M上下文、测试最大输出或盲扫协议。
  只用已有Go套餐、合成短提示与无副作用工具，不转Zen/pay-as-you-go或购买额外额度。
- 账号地区/套餐/限额导致未测项目标记blocked/skipped，不算PASS。每模型未实测时只能
  声称目录/离线适配覆盖，不能声明全模型真实兼容；单卡正式发布门槛由主控据覆盖清单验收。

检查点C前必须有：全目录参数/协议完成、必要离线矩阵通过、live覆盖/阻断清单透明且
主控接受。有仍未解决的关键协议或元数据缺项时，不正式切换单卡版本。

## 9. 本机部署、回滚和执行者交付

先完成可审阅候选包和独立审核；执行者不得用自评PASS替代主控验收。取得本批真实部署
授权后，备份实际installed包而非只信manifest（以前manifest版本曾落后于实际文件），
备份Web/headless控制文件和settings，记录旧Go/Command文件hash。按profile安装SHA命名
不可变tarball，使用ignore-scripts、按需workspace-root，不使用force重装其他包。
重载真实Web前确认没有需要保留的运行任务。部署后验证两profile同hash、key不变、默认
route/model/effort不变、DSH源码无差分、旧推理插件字节不变、单卡模型表/额度/编辑key
入口可用。真实key不输出、不截图显示、不发日志；仅指定官方endpoint可接收凭据。

失败回退上一不可变包和必要配置，重启被改profile；不删除新失败证据或已存在会话。
全模型功能审核通过后再确认重复卡确实消失。报告必须分别列：代码完成、离线、真实
调用、部署、未覆盖、源数据冲突、回滚位置。保留catalog原始来源及最终机器可读验收表：
每ID协议/limits/reasoning策略/测试证据/真实状态。不能只交测试数量与截图。

停止条件：要改DSH源码/私有接口、扩大凭据目的地或付费范围、旧配置迁移破坏会话、
同模型证据矛盾无法裁决、无法表达原生控制却想伪造支持。正常TDD失败和范围内问题应
持续修复；不重新召集主控流程或递归委派，除非执行任务另有授权。
