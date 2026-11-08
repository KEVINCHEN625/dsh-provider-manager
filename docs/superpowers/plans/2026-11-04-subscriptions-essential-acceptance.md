# 订阅接入关键修复验收记录

2026-11-04。基线 `b3d3597`。按用户要求收紧为关键修复，未执行旧性能计划的全量重构。

## 实际改动

- `src/client/controller.ts`：基础快照先发布 ready，再合入 OAuth；额度使用独立请求，自动读不强制刷新，手动读强制刷新。按 load、请求序号和 binding 身份拒绝迟到结果；取消复位 busy；登出成功即清本地账户/额度，即使随后 metadata 失败也不复活旧状态。备用 key 的 hide/blur/切页/断连/卸载/保存删除开始均取消旧 reveal；删除重复额度刷新。
- `src/host/login.ts`、`oauth-host.ts`：同一份本地 record 生成脱敏账号和 binding；概览不请求目录/额度、不写路由。保留原登录后及显式目录操作路径、持久路由和静态种子。
- `src/host/index.ts`、`providers.ts`：备用 key 明文不再通过通用 RPC 返回，统一经过现有专用 reveal HTTP 安全检查，只允许固定 Go 第二槽；Command Code 管理卡保留原 UI id/ref，优先用内置 runtime route，兼容 legacy。
- `src/host/opencode/adapter.ts`：每条流独立 attempt，上下文覆盖迭代器推进/关闭；同时覆盖普通 stream 和 prepared stream，并保留宿主捕获的 prepared call。仅在尚未输出内容时最多切换一次不同且可用的备用凭据。有效主 key 不因无关备用故障失效；健康记录只保存 ref+规范化 key 的哈希与 TTL，旧请求迟到不覆盖新 key 状态。

没有新增共享缓存框架或后台路由同步 owner，没有修改宿主私有接口、默认模型、授权策略或包版本。基础 snapshot 现有的 listModels/PATH 等待没有在本批移除，因此只能确认解除 OAuth 对基础列表的阻塞，不能声称首屏完全不受其他读取影响。

## 独立审核

执行者与独立审核者分离。审核主动发现并要求修复：OAuth 取消后残留 loading、登出后 metadata 失败保留旧账号、保存/删除开始时旧 reveal 未撤销、并行读取坏备用 key 拖垮健康主 key、原始/规范化 key 指纹不一致。执行者另补出了旧 key 迟到耗尽覆盖新 key 状态的反例。这些问题均有原始 RED 和后续 GREEN 记录。

最终独立源码结论：收紧范围符合，未发现剩余源码阻断；其建议的 listModels 显式断言也已补入。审核结论不等同真实订阅/provider 验证。

## 验证证据

目录：`artifacts/subscriptions-essential-20261104/`。

| 证据 | 实际结果 |
|---|---|
| `20-full-test-final.log` | `pnpm exec vitest run`，35 文件、482/482 通过，5.67 秒 |
| `18-typecheck.log` | Host/Client 类型检查通过 |
| `19-build.log` | `pnpm run build` 通过；宿主要求的浏览器 CJS factory 保留 tsdown 既有建议警告 |
| `21-candidate.log` | 独立 staging 构建打包；客户端 factory 可执行、Host/OAuth 可导入、types/patch 齐全；只含当前四个 JS 文件，36 个既有根目录 tarball 均保留 |
| `22/23-…-parent-resolution.log` | 初次 smoke 使用 profile 顶层依赖解析，实际命中 0.2.1-rc.5；是额外开发依赖组合证据，不冒充安装插件的实际解析组合 |
| `24-exact-peer-web.log` | 验证脚本第一次精确解析失败：CJS require.resolve 不支持 ESM-only 包的 main；修正验证脚本，不改产品 |
| `25-exact-peer-web.log`、`26-exact-peer-headless.log` | 按实际安装插件逐包解析，pi-ai peer 为 0.1.5-rc.3；prepared-call 主槽 quota 失败后切备用并完成，网络完全 mock，凭据纯合成 |
| `01/04/07/09/12/13/15` RED 日志 | 初始及审核反例失败输出完整保留；相关 GREEN 和全量日志均在同目录 |

候选包：

```text
/Users/kevinchen/Dev/dsh-provider-manager/artifacts/subscriptions-essential-20261104/candidate-1793802334322/dsh-provider-manager-0.5.0-b4d28d61909b.tgz
SHA-256 b4d28d61909b7bb5b3064918265b1b666bf3a0b16741699c98817e06865e9d1c
```

打包/验证脚本和每个候选的 verification.json 同样保留。没有运行会删除旧包的 `check:pack` 链，没有下载或升级依赖。smoke 只在候选解包目录创建临时依赖链接，finally 已移除，未更改真实 profile。

## 明确未做

- 未安装候选到 Mac/Windows 正在运行的 profile，未重启任何服务；当前运行插件仍为原安装产物。
- 未发真实订阅生成、真实登录、真实额度或付费 probe；未执行 Windows 原生候选 smoke、完整历史宿主版本矩阵、真实浏览器性能 trace 或干净网络安装。
- 未 commit/push/publish；产品改动留在当前工作树，先前未跟踪计划和历史证据保留。

本记录验收的是源码、测试与候选产物；真实部署和账号验收需单独记录，不将其写成已通过。
