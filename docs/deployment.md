# 本机部署与验收

2026-09-21：已安装 `dsh-provider-manager` 0.1.1 到 `~/.dsh/profiles/web`。入口：Settings → Provider manager。管理扩展独立于 dsh 源码，未修改 `/Users/kevinchen/Dev/deepseek-harness` 的跟踪文件。

安装包：`artifacts/dsh-provider-manager-0.1.1-73d7079b8678.tgz`。SHA256：`73d7079b86782f57bb4b31becf9ee66a932fe5ce7cc129aa4ce4ff0152bfb08f`。已验证从 0.1.0 升级到 0.1.1；不能据此承诺任意未来 dsh 版本兼容。

## 已验证

- Host/打包 34 项、客户端 20 项测试通过；Host/Client 类型检查与构建通过，解包后的 browser factory 实际执行通过。证据：`artifacts/v0.1.1-*.log`。
- 同版本公开 dsh 0.1.5-rc.2 使用独立 HOME、DSH_HOME、cwd 与环境允许列表启动；最终代码管理请求 HTTP 200，鉴权与实际 Web 页面均工作。
- 隔离 Web 页面新增 `pm-ui`，保存合成测试 key，显示、隐藏、重新读取；未使用真实密钥。
- Web 保存的同一份配置和凭据在 headless 中完成普通 SSE 和实际 bash 工具往返；工具只执行 `printf PM_TOOL_OK`。证据：`artifacts/ui-saved-headless-{text,tool}.log`。不是只检查目录，也不是直接调用 provider 代替 dsh。
- 真实 Web 新页面显示 OpenCode Go 37 个模型、文件来源凭据已配置；Command Code 71 个目录模型、默认凭据未配置；原有 Local 路由保留。目录数量不代表套餐全部授权，也不代表真实生成请求已经验证。
- `settings.yaml` 哈希与基线一致，默认模型仍为 OpenCode Go 的 Muse Spark 1.3 Contributor / Xhigh。四个原 provider/plugin 的版本、Host/Client 关键产物哈希均不变。证据：`artifacts/final-deployment-check.json`。
- 真实 API 生成和套餐额度消耗未测试；未在页面显示、输出或替换用户真实 key。

## 部署命令与保留证据

真实 profile 自身是 pnpm workspace（`packages: [.]`），因此安装命令需要 `--workspace-root`。该选项指向 profile，不是 dsh 源码仓库。

```sh
dsh plugin --profile web add --workspace-root /Users/kevinchen/Dev/dsh-provider-manager/artifacts/dsh-provider-manager-0.1.1-73d7079b8678.tgz --ignore-scripts
launchctl kickstart -k gui/501/com.harness.deepseek-harness
```

首次遗漏 workspace 标志的失败保留在 `artifacts/live-install.log`；成功初次安装为 `live-install-workspace.log`，升级为 `live-upgrade-0.1.1.log`。早期真实 Web 暴露的 RPC 注入问题已修复为公开 `Context.extend` 兼容接法，失败与真实服务回归证据保留；未复制现有临时 shim，未改核心。

私有备份：`/Users/kevinchen/.dsh/provider-manager-backups/20260921-5w5yfcig`，包含设置、profile 清单/锁文件/patch 与原插件产物。没有删除历史补丁或会话。备份根目录仅本机用户可访问。

## 使用范围和待用户信息

- OpenCode Go：管理默认凭据，重新读取已有模型目录；高级模型、额度在原 Settings → LLM Providers → OpenCode Go。
- Command Code GOAT：管理默认凭据引用；多账户、字面配置或官方 CLI 登录来源仍在原 Command Code 页面。默认引用未配置不能推出所有认证来源均未配置。
- 新的标准 API：先保存名称、route、协议、URL、模型 ID，再在卡片保存 key。支持 Chat Completions、Responses、Anthropic Messages；一个自定义 route 一种协议。不会自动跨套餐或转按量计费。
- 既有自定义凭据需要 Host 显式授权才可由新管理器读写；Local 路由因此保留但不擅自增加其密钥查看权限。
- Muse Code：本机未检测到 CLI，订阅执行尚未接通。官方订阅通过 Muse Code CLI 使用，额外 Meta API key 是另一条按量计费路线。用户尚需确认指的是官方订阅还是第三方 API 套餐；第三方需提供官方接入文档，勿发送 key。当前只有明确的状态/说明卡，不把它写成已实现的模型适配器。
- 不修改或覆盖原 OpenCode Go 设置卡片；原页面失败后的永久 Loading 缺陷仍属于原插件，新管理页提供独立可恢复入口。
