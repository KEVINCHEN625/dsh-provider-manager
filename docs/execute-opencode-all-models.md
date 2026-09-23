# 转交执行 agent 的提示词

你是本批产品执行者，不是审核推进员。请在当前工作树继续实施，不递归委派，不重新
启动整个项目规划流程。先阅读：

1. `/Users/kevinchen/Dev/dsh-provider-manager/docs/opencode-all-models-plan.md`
2. `/Users/kevinchen/Dev/dsh-provider-manager/docs/opencode-all-models-2026-09-23/matrix.md`
3. 同目录 `matrix.json`、`provenance.json` 和三份原始快照。
4. `docs/opencode-integrated-acceptance.md`、当前AGENTS规则及实际工作树差分。

目标：把现有 `provider-manager-opencode-go` 适配到当前官方Go套餐完整模型集合，
准确实现并显示每项上下文、最大输出、独立输入上限、原生effort/开关/预算与协议。
全模型验收后，Provider Manager只保留一张内置OpenCode Go卡片，移除legacy管理卡及
其管理RPC入口；保留旧推理插件、OPENCODE_API_KEY、配置、历史与其他provider。

实施仓库：`/Users/kevinchen/Dev/dsh-provider-manager`。
DSH源码 `/Users/kevinchen/Dev/deepseek-harness` 只读。当前0.2.8内置三个模型已部署，
大量dirty改动已验收但未提交，必须保存，不能从HEAD覆盖。此次预期0.2.9候选，版本
冲突则先记录并选下一未占用版本。不要修改真实profile或服务来绕过开发测试。

执行要点：

- 先刷新官方来源并冻结集合。规划快照40个ID、31个确定协议、38个完整metadata；
  deepseek-flash/hy3-preview参数及9项协议待核实，不得猜默认值或静默遗漏。
- 建立单源catalog、验证schema和只产候选差分的同步脚本；完成Completions、Responses、
  Anthropic Messages三种策略。保持route身份，不依赖旧Go插件、机器路径或私有API。
- 保留Muse加密回放修复、DeepSeek字段归一、DSH UA与session头。预算模型不伪造官方
  effort，完整null映射禁止底层自动开放不支持的档位。按计划处理预算、输入上限和
  调用者显式值优先，公开接口无法可靠实现时报告设计阻断。
- 参数必须贯通host DTO、client validation和详情模型表。新增模型不能靠数组位置测试。
- 全模型功能及测试完成后再启用单卡行为；旧管理ID fail-closed不读取key/不发请求，
  reserved防绕行。不要卸载第三方插件，也不要改其他DSH页面的卡片或模型分组。
- TDD、实际SDK wire及replay、跨协议、生命周期、key/quota、Web/headless、仓库外
  fresh tarball均按计划验收。不得把mock、跳过、未测写成真实通过；保留原始红测与
  既有全仓格式失败。常规范围内失败继续修复，扩大设计/权限才停止报告。

先交可审阅实现、不可变tarball、逐模型证据表、变更清单和剩余阻断，交主控独立验收。
执行者不自行批准下一阶段。真实模型调用/本机安装/启用单卡按计划预算及主控门槛推进；
执行时明确已获的授权，不反复索要已有授权。未经授权不额外消费、发布npm或推送Git。
完成后更新项目状态与验收文档，给出实际部署版本/hash、默认模型保持结果和回退方法。
