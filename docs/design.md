# DSH 外置 Provider 管理方案

日期：2026-09-21。状态：用户已批准，独立扩展已实施并部署；当前验收与范围见 [deployment.md](deployment.md)。本文件保留设计依据。

## 目标与边界

不修改 `/Users/kevinchen/Dev/deepseek-harness` 的源码；Web 为主，兼顾 headless。用户可以添加标准 API provider、自行保存或替换 key，并在主动点击后查看当前使用的 key。管理组件、现有 provider 插件、dsh 分别维护版本。兼容性通过升级前后的实际验证保障，不承诺任意未来版本无条件兼容。

## 已验证现状

- 源码基线为 `fb2c4b9e69`，版本 `0.1.5-rc.2`；原有未跟踪目录 `logs/` 保留。
- `/opt/homebrew/bin/dsh` 通过 tsx 启动仓库 `apps/cli/src/bin.ts`。
- 用户配置位于 `~/.dsh/settings.yaml`，插件位于 `~/.dsh/profiles/<profile>`，已经与源码分离。
- Web 安装 `@mars-sea/dsh-commandcode-provider` 0.11.6、`dsh-llm-opencode-go` 0.1.28、`dsh-llm-providers-ui` 0.2.8；headless 依赖声明与 Web 不完全相同。
- 通用 `llm-pi-ai` 已挂载且存在 `cliproxy` 配置；OpenCode Go 有 37 个已配置模型。默认选择为 `opencode-go/muse-spark-1.3-contributor`，推理等级 `xhigh`。
- 实机复现：OpenCode Go 详情持续 Loading，切换设置页无效。整页刷新后恢复模型列表和可编辑 key 输入框。没有填写、替换或输出真实 key。
- 已安装 OpenCode Go `lib/client.js` 的 `readManagement()` 在 RPC 抛错时不改变 loading，顶层 catch 吞异常；尚未获得首次失败请求的网络记录，不能断定最初是 401、断连或其他传输错误。
- 已安装 OpenCode Go `lib/index.js:2` 含到 `~/.dsh/profiles/web/mount-connection-rpc.mjs` 的绝对路径补丁。仅记录 npm 版本不足以复现当前运行物，更新会覆盖安装目录里的修改。
- 原生凭据 Web 接口只提供 describe/set/unset；查看已保存 key 需要独立功能。

## 方案比较

1. 只用现有 Models 页面：最少维护，能添加标准 API；不能满足已保存 key 查看，不能解决第三方页面卡住的体验。
2. 修改并维护 OpenCode Go 插件分支：可修它的页面，但通用 provider、Command Code 的统一管理还需额外工作，并持续合并上游插件变更。
3. **推荐：独立 Provider 管理扩展**。新增一个设置页，直接调用 dsh 公开的 settings、credentials、llm 服务；现有插件继续承担实际推理请求。扩展不注册第二套 `opencode-go` 或 `commandcode` 路由，不修改第三方安装产物。

## 推荐设计

独立目录 `/Users/kevinchen/Dev/dsh-provider-manager` 保存扩展源码、构建产物、测试和文档。以 dsh bundle 安装到指定 profile，Web 提供“Provider 管理”页面。headless 继续使用现有 provider 和共享凭据，无需额外启动 Web 服务。

页面分为现有服务与自定义 API。现有服务提供 OpenCode Go、Command Code 的凭据来源、配置状态、输入新 key、保存、显示/隐藏；保留原有插件的额度、登录、多账户和高级设置入口。自定义 API 提供名称、唯一 route、baseURL、三种受支持协议、模型列表与凭据引用。高级模型参数只提交用户明确填写的字段。

自定义 route 写入 `llm-pi-ai.providers`。支持 `openai-completions`、`openai-responses`、`anthropic-messages`；一个自定义 route 使用一种协议，混合协议服务分 route 配置。拒绝与任何已注册 route 冲突，特别是现有 `opencode-go`、`commandcode`、`deepseek-official`、`cliproxy`。不自动更改默认模型，也不自动用模型发现结果覆盖原目录。

配置通过 `settings.mutate` 做局部写入并携带 namespace revision，冲突提示重读。凭据通过 credentials 服务写入，避免自行编辑 YAML 和构造凭据文件锁。保存密钥与保存模型配置不是一个跨服务事务，界面分别显示结果，不能部分成功却报告整体成功。对于环境变量优先于本地凭据的情况，应显示当前来源和新值是否真正生效。

管理页面使用明确状态：加载中、就绪、失败、重试中。读取失败显示错误与重试按钮；连接恢复可重新读取，不覆盖用户未保存输入。卸载页面或插件取消在途请求；过期响应不能覆盖新结果。

## Key 显示规则

- 默认只显示是否配置、来源及可写性，不在列表/初始化响应携带秘密。
- 仅用户主动点击“显示 key”后，请求专用端点。客户端传 provider/account 标识；Host 固定授权 OpenCode Go 与 Command Code 的约定引用，新 provider 使用管理器分配的专用引用。已有自定义引用需要 Host 配置明确授权，不能因出现在可编辑 settings 中就自动获准，不接受任意环境变量名或文件路径。保存前重新核对引用绑定，变化时要求刷新。
- 普通管理调用使用 `connection.rpc.handle`，明确注入 connection 与 webServer。reveal 使用 `webServer.register` 的独立 POST 路由，以取得真实 socket 地址并设置响应头；先执行 `connection.requestRejection(req)`，再校验真实 `req.socket.remoteAddress` 为 loopback、Host 为 loopback、Origin 为对应同源地址，拒绝缺失/null Origin，不信任转发头。请求为 application/json 且限制体积，所有响应 `Cache-Control: no-store`。普通 RPC 没有 socket/响应头，不能用它冒充这些保证。
- key 只驻留在当前控件，隐藏、离开、页面隐藏/失焦、连接变化或超时后清空；不放 localStorage、URL、日志、诊断报告或 agent 输出。超时默认 30 秒，作为可配置策略。请求代次检查防止隐藏后迟到响应重新显示，取消请求不能替代该检查。
- 显示的是受管凭据引用解析到的值，并标明来源。首版 Command Code 管理默认引用；如存在字面 apiKey 覆盖、多账户路由或官方 auth.json fallback，明确展示覆盖/未覆盖范围，保留原插件管理入口，不声称默认引用就是每次请求的实际 key。首版不迁移或私自读取官方登录文件，也不自动改变活动账户。完整多账户显示另行扩大 provider 适配范围。
- 初期不支持揭示 OAuth grant、任意系统秘密，也不把普通设置页扩成通用凭据浏览器。

## 文件与验收批次

| 文件 | 职责 |
| --- | --- |
| `package.json`, `cordis.patch.yml` | 独立 bundle、明确依赖/兼容版本与生命周期 |
| `src/host/index.ts` | 注入公开服务，挂管理端点，不注册推理 route |
| `src/host/providers.ts` | 现有服务映射、route 冲突、模型协议与 namespace 局部修改 |
| `src/host/credentials.ts` | 来源解析、允许引用集合、set/reveal 与写入结果 |
| `src/host/http.ts` | 鉴权、本机限制、请求验证、no-store、取消和安全错误 |
| `src/client/index.tsx` | 独立 settings.section 页面、国际化与服务注入 |
| `src/client/controller.ts` | 加载/失败/重试、revision、过期响应及 key 清理 |
| `src/shared/protocol.ts` | 管理请求与脱敏响应类型 |
| `tests/` | 管理、生命周期、凭据和协议回归 |
| `docs/upgrade.md` | 基线清单、隔离验证、更新与恢复步骤 |

批次一：确认公开插件 API、形成详细逐文件实施计划并独立审核。测试先覆盖失败读取不永久 loading、重试恢复、key 显示的权限限制、来源与有效值一致、冲突拒绝及不覆盖其他 namespace。

批次二：隔离 profile 联调。使用干净 cwd、环境允许列表、独立 DSH_HOME、本地 mock key/模型服务；不复制真实凭据和会话，不允许插件绝对 import 回到真实 home。Web 验证添加 provider、保存/替换/显示/隐藏 key、重新进入后状态正确；headless 验证新 route 普通流式及工具调用往返。

批次三：用户实际 profile 安装与验收。先保存配置和实际插件产物基线，再安装管理扩展。仅在必要时安排实际服务重启；不随扩展安装顺带更新 dsh 或其他插件。真实 key 验证不通过 agent 输出，实际生成请求使用最小范围并单独记录是否执行。

## 更新与停止条件

更新基线必须包含 dsh commit、launcher、每个 profile 的实际依赖 realpath/版本、锁文件及本地补丁。源码 link 依赖使原目录更新会影响运行进程，所以候选验证必须使用独立 checkout/build 与独立 profile，不能仅创建第二个 DSH_HOME 却复用可变源码链接。

先验证候选组合的启动、设置页、provider 清单、凭据写入/读取、流式和工具调用，再切换；版本兼容声明不能替代这些测试。会话格式可能只允许单向升级，不能以切回旧代码作为真实会话可回退的保证。

若公开服务/前端 slots 不兼容、必须修改 dsh 核心、需要扩大凭据访问、无法保留默认模型/现有路由、实际key来源不能正确解析，停止该批次并修订计划。不删除历史补丁或失败证据，不靠放宽测试通过验收。

## 当前交付状态

扩展 0.1.1 已完成独立审核、真实隔离 Web 与 headless 验收，并部署到本机 Web profile。真实 API 生成未执行。新管理页提供独立可恢复入口，不宣称修复原 OpenCode Go 插件的历史卡死逻辑。详细证据、限制与 Muse Code 未接通状态见 [deployment.md](deployment.md)。

## 已批准的套餐重点（2026-09-21）

用户要求重点优化 OpenCode Go、Command Code GOAT、Muse Code。前两者保留已有原生适配器，提供显式身份/凭据来源、模型数量、管理入口、错误恢复；模型匹配遵循适配器协议，保留其套餐过滤和额度入口。不会自动跨套餐切换、自动购买、升级订阅或在耗尽额度时转按量API。

Muse Code 官方订阅文档明确：订阅专用凭据用于 Muse Code CLI，另建 Meta API key 按量计费（https://dev.meta.ai/docs/muse-code/subscriptions）。官方提供 `muse serve` 与 `@muse-code/sdk` 集成（https://meta-models.github.io/muse-code-sdk/next/）。本机尚未发现 `muse` 命令；已询问用户具体为官方订阅或第三方API套餐，回答前不假造其baseURL或宣称订阅已接通。公共管理扩展可继续实施，Muse条目必须诚实区分CLI订阅和API路线；完整CLI桥接涉及工具执行/审批/进程生命周期，需要独立适配计划及相应验证，不能冒充普通OpenAI兼容模型配置。
