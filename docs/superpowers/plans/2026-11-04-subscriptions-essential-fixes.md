# 订阅接入关键修复：收紧后的执行范围

用户 2026-11-04 授权修关键问题，强调服务各家订阅接入，不复杂化。本文件取代性能计划 A–E 的全量执行范围；旧计划保留为审计证据，不代表本轮全部实施。

基线 b3d3597；产品工作树干净，先前 docs/superpowers 未跟踪文件全部保留。在当前源码目录实施，不提交、不推送、不改真实 profile/凭据、不重启服务、不进行真实付费请求。

1. **解除 OAuth 阻塞。** Controller 先发布基础列表，再独立合入 OAuth 本地 metadata。OAuth snapshot 只读本地状态和一致的 binding identity，不等目录/额度、不写路由。额度用现有专用请求异步读；自动读不强制刷新，手动按钮才强制；仅 configured 且支持的 provider 发起。额度按请求序号+binding identity+生命周期守卫，登出/换账户后旧响应不得回写；同身份 metadata 刷新不清空已读额度。保留既有登录后和显式目录激活/更新路径，持久路由/静态种子不变；测试不打开页面时已有路由可用。不承诺基础 snapshot 的 listModels/PATH 也已去除等待。
2. **备用 key 与主 key 同等保护。** 复用现有专用 reveal HTTP 的严格本机/Origin/no-store/取消路径，只允许固定 Go 第二槽，禁止任意 ref；关闭普通 RPC 明文入口。hide/blur/切页/断连/dispose/换 key 与迟到响应守卫对齐。消除重复备用额度强制刷新。
3. **Command Code 卡片映射。** 优先识别内置 route，兼容 legacy，固定 credential ref 不变；静态种子保持，不添加自动目录联网。覆盖内置单独、legacy 单独、并存。
4. **Go failover。** 每次 stream invocation 的 attempt/slot 独立；Node AsyncLocalStorage 方案须绑定 iterator.next/return/throw，不仅 generator 构造。adapter.stream 与 prepareCall 返回 stream 均覆盖，保留宿主 prepared snapshot。共享健康状态按 ref+不可逆 credential identity 隔离，不保留明文；无第二个不同可用凭据时不重试原 key。每流最多一次、内容开始后不重试、abort 不重试、上游关闭一次。覆盖同一 prepared call 的并发两次调用、listModels 交错、换 key、取消。

逐文件范围主要为：client/controller.ts、transport.ts、ProviderManager.tsx、OAuthCard.tsx/Details.tsx（确有必要时）、validation.ts（DTO必要变更）；host/oauth-host.ts、index.ts、http.ts、providers.ts、opencode/adapter.ts、commandcode 目录的最小引用；相关现有测试与必要的少量聚焦测试。不要顺便拆 controller、引入缓存框架/后台 owner、大改 CatalogStore/CAS/打包脚本或改包版本。

每项先 RED 再 GREEN，保留输出；独立 reviewer 已确认收紧方案可实施，上述身份守卫、非强制自动额度、prepared-call 与取消反例为必须项。执行者不再递归委派。

验证：相关测试族、全量现有 Vitest、Host/Client typecheck、build；独立 staging 打候选包并检查当前引用闭包与浏览器 factory，不执行会删除同版本历史包的 check:pack 链。真实订阅账户生成、安装、重启与发布未包含在本次范围。

停止：发现必须依赖宿主私有 API、改变模型/路由归属/授权策略、需要真实凭据或收费请求、无法保证取消或请求身份时报告；正常范围内测试失败由执行者继续修复。
