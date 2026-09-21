# 0.2.0 主控验收：暂不通过

对象：提交 `36acde0`，相对 `1b7cc02`。候选不可变包 `artifacts/dsh-provider-manager-0.2.0-c97a65c04135.tgz`，已核实 SHA256 为 `c97a65c04135e50962db24beff8d638bac57b9e3f584c72a4ad80315e7cd61d9`。

当前线上仍为 0.1.1。本轮没有部署、重启真实服务、卸载旧插件或执行真实官方 usage 请求。产品工作树在审核开始时干净；dsh 跟踪文件差分为零。

审核方式：主控核对差分、源码调用路径和交付原始日志；独立 GPT-6 Astra / Medium 聚焦配额身份与请求生命周期。合成反例运行实际产品代码，不读取真实 key，不发送网络请求。原有 Host 71 / client 32 的 PASS 记录成立，但未覆盖下面的路径。

## 阻断发现

### R1 / P1：总期限没有覆盖凭据、响应正文与取消清理

位置：`src/host/providers.ts:138`；`src/host/quota.ts:275,419`。

`raceDeadline` 只等待 fetch 返回响应头；超时直接返回 TIMEOUT，不 abort fetch。`readBounded` 中的 `reader.read()` 没有与取消信号竞争；Manager 初次凭据解析也没有总期限。

独立实测：注入 10ms deadline 后返回 TIMEOUT，fetch 收到的 signal 仍为 `aborted=false`；立即返回 Response 但正文不结束，超过期限仍 pending，caller abort 后仍 pending 且 reader.cancel 未调用；credential resolve 挂起 10.3 秒仍未返回。现有名为 late body 的测试实际挂在响应头阶段，不能替代正文流测试。

影响：UI 虽可显示失败，Host 仍可能占用连接、保留监听器，或使后续同 provider 请求被在途状态阻挡。必须用覆盖整个请求的统一 deadline/取消所有权修复。

### R2 / P1：错误出口可以返回已换掉账户的旧额度

位置：`src/host/quota.ts:380–425,459–471`。

错误/超时分支直接使用请求开始时捕获的缓存 `current`，没有重新核验当前有效凭据。成功路径的 stillCurrent 检查不保护这些错误出口。

最小实测：先缓存 used=22；发起 refresh；请求期间使当前凭据身份失效；fetch reject。返回仍为 `stale=true`、remaining=78，失败路径身份复核次数为 0。客户端没有自己回填旧额度，但 Host 已把旧账户值当成可用 stale 返回。

必须在所有旧值返回出口验证身份。无法在期限内验证时返回无 windows 的错误，不能仅因 bindingToken 相同而保留旧账户数据。

### R3 / P1：切换详情后旧 key 自动重现

位置：`src/client/ProviderManager.tsx:106,114`，关联 `ProviderCard.tsx` 与 `ProviderDetails.tsx`。

点另一张卡的详情会替换 openId、自动收起原详情，但没有调用 controller.hide。原详情虽然从 DOM 移除，controller 的 revealed 值及在途请求仍存在。

主控可复现测试：OpenCode 详情 → Show key → 打开 Muse 详情 → 返回 OpenCode 详情，未再点击 Show key，合成 key 自动重现。实际 Vitest 测试失败，预期无 Revealed key 控件，实际重新出现 textarea。

证据：`artifacts/quota-ui/review-36acde0/ui-review.spec.tsx`、`ui-review.log`、`ui-review.exit`。必须统一处理所有显式/隐式详情关闭与切换，并使迟到 reveal 无法写回。

### R4 / P2：凭据解析期间配置变化，仍先发请求后拒绝

位置：`src/host/providers.ts:138–163`。

读取 binding 后等待 resolve，之后直接发请求；到响应头返回才重查。合成实测：resolve pending 期间 revision++，放行 resolve 后 fetch 被调用 1 次，随后才拒绝。

必须在发送请求前复核 binding/有效凭据，并覆盖缓存命中路径；不应等已发出请求后才发现当前授权绑定变化。

## 需同批修订的契约问题

- `src/client/validation.ts:106–148` 与 `controller.ts:300–324`：允许非 ISO 时间、单独 remainingPercent=1000、响应 providerId 与请求不一致。正常 Host 不生成这些数据，但升级兼容/畸形响应应被明确拒绝，不能渲染为有效配额。补 expected provider ID、严格数值范围与时间验证。
- `parseCommandWindow` 的 used/cap 各自有限，不保证计算后比例有限；增加除法溢出反例，不把 Infinity 放入响应。
- 既有不受管自定义 route 的“配额不支持”与“凭据不可管理”要分开。当前 `Manager.quota(custom:...)` 先调用 binding，可能将真实存在的 Local/cliproxy 返回 INVALID_INPUT；不应为返回 unsupported 而要求秘密读取权限。返修须核对存在性而不扩大允许读取的引用集合。

## 证据覆盖范围

- 核读交付的 `merge-host-tests-2.log` 与 `merge-client-tests-2.log`，原有 71/32 成功记录真实。
- 独立反例证据位于 `artifacts/quota-ui/review-36acde0/`；仅为 synthetic 值，未触真实账号。
- `host-repro.mjs` / `host-repro.log` 断言的是当前缺陷现象，exit 0 表示缺陷复现成功，**不是验收通过**；`ui-review.spec.tsx` 断言正确行为，本轮实际 exit 1。
- 最终 c97a 包的 SHA256 已核实，但交付中的实际隔离 UI 安装的是 927b 旧包。最终包还需重新实际安装及 375/768/1280、深浅主题验收。
- 因发现以上阻断，暂缓最终包 UI 部署及真实 key/官方 usage 读取。它们是修订后的必需验收项，不标为通过，也不使用本次缺失作为新功能缺陷推断。

## 决定

不放行 `36acde0` / c97a 候选。保持线上 0.1.1 和原 provider 插件。按 [execute-quota-ui-r1.md](execute-quota-ui-r1.md) 修订，交新候选与原始证据，再由主控验收。当前管理/配额实现仍不能替代旧推理插件。

R1 修订方案已经独立 Astra / Medium 审核，结论为可执行、无设计阻断；主控已纳入 cap=0 语义与历史复现脚本退出码说明。
