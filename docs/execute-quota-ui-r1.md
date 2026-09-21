# 0.2.0 返修执行提示词（R1）

你担任 EXECUTOR，只修复主控审核确认的配额/详情生命周期问题，不递归委派，不改 dsh 核心、不部署真实 profile、不卸载插件。连续执行这一可验收批次，正常红测可自行修复；不重新要求用户批准已明确的修订。

工作目录：`/Users/kevinchen/Dev/dsh-provider-manager`。产品基线提交 `36acde0`，线上版本仍为 0.1.1。先读 `docs/review-0.2.0-36acde0.md`、`docs/quota-ui-plan.md`、`docs/provider-retirement.md` 及实际 diff。保留用户脏树、旧候选、所有失败日志。

## 1. Host 请求生命周期（R1）

文件：`src/host/providers.ts`、`src/host/quota.ts`；测试：`tests/quota.spec.ts`、必要的 connection/lifecycle 测试。

- 将默认 10 秒 deadline 放到一次 quota 读取最外层，覆盖首次凭据 resolve、身份复核、fetch、正文读取、最终复核；测试可注入短期限，不能延长生产期限掩盖失败。
- caller、插件生命周期、总期限都应能取消操作。超时必须实际 abort 网络 signal；无法主动取消的服务 Promise 用 abort-aware 等待及时退出并处理迟到 rejection。
- `reader.read()` 必须响应 deadline/caller abort，尝试取消 reader 并释放等待；不能为等待不合作的 cancel/resolve 又产生无界等待。finally 清 timer、listener 和对应 inflight，不清掉更新代次的所有者。
- 红测必须区分：响应头永久 pending、headers 立即到达但正文永久 pending、凭据解析 pending、最终复核 pending、caller abort、plugin dispose。断言 signal 已 abort、调用已 settle、后续同 provider 可以重试、无迟到缓存和未处理 rejection。

## 2. 身份复核和旧缓存（R2、R4）

文件：`src/host/providers.ts`、`src/host/quota.ts`；测试：`tests/quota.spec.ts`、`tests/credentials.spec.ts`。

- 统一检查缓存返回前、真正发送请求前、成功返回/写缓存前、所有 stale 返回前的身份。bindingToken 不包含 key，所以必须核验实际 resolve 的 key/source 与 HMAC 身份。
- resolve 期间 reference/revision/有效 key/source 变化应停止发送，不得先 fetch 再拒绝。
- 请求期间 key 轮换，随后 fetch reject/timeout/非200/坏JSON/超限时，均不能返回旧账户 windows。只有 Host 在期限内确认仍是同一有效身份，才可返回该身份的旧值及 stale 标记；无法确认就清空 windows，正确返回错误。
- 需要覆盖 manager.set 与外部 key 变更。旧请求不删除新缓存、不覆盖新请求结果；同 key 真正暂时失败仍可按规则显示过期值。
- 固定官方 URL、redirect:error、响应体上限、秘密不入 DTO/日志等边界保持，不开放任意 endpoint。

## 3. 详情切换清理秘密（R3）

文件：`src/client/ProviderManager.tsx`、`ProviderCard.tsx`、`ProviderDetails.tsx`，必要时 `controller.ts`；测试：components/quota/controller client tests。

- 所有详情选择变化统一清除已揭示 key、待保存秘密输入、reveal timer，并推进 reveal generation/取消旧请求，再切换 active detail。
- 覆盖 A→B、A→Muse、返回A、同卡收起、Back、路由/页面卸载。普通非秘密编辑草稿按原计划保留。
- 将 `artifacts/quota-ui/review-36acde0/ui-review.spec.tsx` 的失败行为纳入正式测试，再增加“reveal仍在途时切换，迟到响应不能显示”的反例。
- 返回旧详情时必须再次主动 Show key 才能显示，不能只依赖 textarea 当时已从 DOM 移除。

## 4. DTO 与不支持状态

文件：`src/client/validation.ts`、`controller.ts`、`src/host/quota.ts`、`providers.ts` 与对应 tests。

- validateQuota 校验响应 providerId 等于本次请求的 id；ISO 时间格式和有效范围；remainingPercent 无论是否出现 usedPercent 都必须有限且在 0..100；两者同在时保持数学关系。畸形响应进入安全错误，不能回填旧 windows。
- Command 比例计算之后再次检查有限值，覆盖 used=1e308/cap=1e-308。字段缺失或上限未明确的窗口仍无假百分比，cap=0 不推断无限额度。
- 真实存在但不可管理密钥的自定义 route，可返回 unsupported 且不查 key、不发网络。未知 route 仍拒绝。用 Local/cliproxy 的 fixture 覆盖，不放宽 binding 或 reveal/set 授权。

## 5. 验证与交付

保存新证据到 `artifacts/quota-ui/<r1-run-id>/`。原失败不可覆盖；每个已确认缺陷先见对应红测，再修复。建议候选版本 0.2.1，保持原 c97a / 927b / 0.1.1 不可变包。

```sh
pnpm run typecheck
pnpm run test
pnpm run test:client
pnpm run format:check
pnpm run build
pnpm run check:pack
git diff --check
git -C /Users/kevinchen/Dev/deepseek-harness diff --exit-code
```

原始反例放 artifacts 中：`host-repro.mjs` 断言旧缺陷存在，exit 0 表示本次缺陷复现成功，修复后预期不再满足这些断言；必须原样保留，将其转换为期望正确行为的新正式回归测试，不把历史脚本当通过门禁。`ui-review.spec.tsx` 则断言正确行为，修复后应通过；默认 Vitest 可能发现该审核测试，可显式单独运行并报告，不能仅排除它隐藏失败。

最终源码定稿后再 build/pack，生成新 hash 唯一文件。必须把**这个最终 hash 包**装入独立 HOME/DSH_HOME/干净 cwd 的同版本 dsh 做真实 Web 验证；不能用旧候选截图证明最终产物。覆核 375/768/1280、深浅主题、0/100/unknown/stale、详情切换、key reveal、添加和草稿冲突。

没有真实 key 时如实保留官方 usage 未验证，由主控在安全检查通过后补做受管账户的只读 GET。不要从真实 profile 或 auth.json 复制凭据到隔离目录，不发起模型生成。

交付：提交 hash、逐文件修订摘要、红绿原始日志和命令退出码、最终 tgz 的绝对路径/SHA256、相同 hash 的隔离 UI 证据及未测项。等待主控独立验收；不自行部署、重启真实服务或卸载旧推理插件。
