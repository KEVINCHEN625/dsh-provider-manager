# 可转发执行提示词

你担任 EXECUTOR，执行已规划并独立审核的“Provider 配额与紧凑管理页”批次。只负责实施、测试和交付，不重新启动主控流程，不递归委派，不自行批准验收或卸载旧插件。

## 项目与必读文件

- 唯一产品写入目录：`/Users/kevinchen/Dev/dsh-provider-manager`。
- 主执行方案：`/Users/kevinchen/Dev/dsh-provider-manager/docs/quota-ui-plan.md`。
- 当前部署证据：`/Users/kevinchen/Dev/dsh-provider-manager/docs/deployment.md`。
- 原设计与当前状态：同目录 `design.md`、`status.md`。
- 条件卸载授权与门槛：同目录 `provider-retirement.md`。
- dsh 源码 `/Users/kevinchen/Dev/deepseek-harness` 仅可读取，不能修改，包括构建产物、锁文件和 node_modules。真实 profile 与已安装第三方插件也不能直接修改。

先检查实际工作树与 package 版本；产品基线 0.1.1、代码基线 `b8898b4`，计划文档可能有后续提交。保留用户脏树和所有历史失败证据。

## 本批结果

将现管理页改成截图所示 dsh LLM Providers / CC Switch 风格：本地图标、名称与 key 状态、模型数、真实剩余配额、重置时间、刷新、详情。列表紧凑；key、模型和高级设置移到详情；新增表单由“添加 provider”打开。

OpenCode Go 与 Command Code 分别做自研 Host 只读 quota reader，不 runtime import 旧插件。官方地址固定、redirect:error、超时/响应体限制、绑定和缓存隔离，凭据不进入客户端或日志。未知 API 显示不支持，Muse 未接通显示事实，不伪造 100% 配额或把按量 API 当订阅。

特别注意：外部 key 变化可能不改变 bindingToken；客户端只能保留 Host 明确返回的 stale 数据，不能在请求/解码失败时回填上一个账户额度。Command 只在可确认默认凭据来源时查配额，不能假设多账户实际用钥。

## 执行方式

按方案检查点 0 → H → U → 合流验证连续完成。使用相关实施与 TDD 技能，正常红测和范围内问题自行修复，不每个小补丁向用户交接。计划已经界定设计，不重新要求用户批准相同设计。

保留现有 reveal/隐藏/失焦/卸载/超时清除、dirty 草稿 baseline revision、独立 key/config 保存结果和原推理路由。用正常可读源码，不交付压缩手写源码。

目标候选版本 0.2.0。完成 typecheck、Host/client tests、format check、build、真实 tarball factory 验证与隔离 Web 页面验证，记录原始输出及截图。真实只读 usage 可在合法受管凭据可用时验证，但不得打印真实 key、header、token 或原始账户信息；本批不发起模型生成请求。

## 操作边界

- 不卸载旧 provider，不更改用户默认模型，不删除 settings、凭据或会话。
- 不安装 Muse、不读取 auth.json、不修改套餐或付款，不提供静默收费 fallback。
- 不扩展任意 URL、任意凭据引用或查询脚本执行能力。
- 不自行部署到 `~/.dsh` 或重启真实服务；将候选与证据交主控验收。真实部署和旧插件卸载分别按方案规定的门槛进行。
- 若必须改核心、扩大授权、遇到未知 endpoint 语义或无法保持账户隔离，停止受影响部分并给出事实和修订建议；不跳过测试或放宽断言。

## 交付报告

报告完成/未完成项，代码 commit/diff，候选 tgz 绝对路径与 SHA256，各测试命令退出码及日志路径，隔离 UI 截图，真实只读查询证据与未测项目，兼容性/回退说明。不要将“管理页与配额可用”写成“已经能独立替代旧推理插件”。
