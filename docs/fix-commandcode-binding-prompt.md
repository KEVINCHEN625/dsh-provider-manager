# 任务：修复 dsh-provider-manager 内置 provider 的 Command Code 卡 "This credential binding is not managed" 错误

## 根因（已完全定位，不需要重新诊断）

错误链路：用户在 Web UI 的 Command Code 卡粘贴 key → 客户端调 `credential/set` RPC →
服务端 `Manager.set()` → `check()` → `binding("commandcode")` → **`settings.describe()`
找不到我们插件的设置段** → binding 失败 → 卡片显示
`REF_NOT_ALLOWED`（UI 文案 "This credential binding is not managed. Host authorization is required."）。

**为什么找不到段**：

dsh 0.2.x 的 `SettingsForms.describe()`（源码位置：
`node_modules/@deepseek-ai/dsh-settings/lib/index.js` 中的 `describe()` 方法）只收集
**顶层 schema 对象有 `meta.volatile = true` 的插件 entry**（`volatileForm(schema)` 函数
在 schema.meta.volatile 为 true 时直接返回，否则递归检查子字段——但 0.2.x 的递归行为
与 0.1.7 不同：0.1.7 递归子字段级 volatile，0.2.x 只认顶层）。

我们的 `ConfigSchema` 用的是**子字段级** `vol()`（每个字段单独调 `.volatile()`）——在
0.1.5/0.1.7 下有效，在 0.2.x 下 `describe()` 不列出 `dsh-provider-manager` 段。

**已验证的事实**（不要重复验证）：
- 顶层 `.volatile()` 的探针在 0.2.x 被收集（实测 true）；子字段级不被收集（实测 false）
- 把顶层包 `.volatile()` 会导致 `resolveConfig` 返回 Volatile 引用对象，下游字段访问
  全变 `{get, write}` 导致 4 个测试失败（已尝试并回退）
- `binding()` 的 fallback（合成假 descriptor）不够——因为 `check()` 里的 revision 校验
  和 `card()` 的 `d.revision` 走的还是真实 describe 结果

## 正确修复方案（不要再 patch binding() 的 fallback 了——重写内置 provider 的绑定路径）

**核心思路**：三个内置 provider（OpenCode Go、Command Code、Muse）的 key 是**固定
credential ref**（`OPENCODE_API_KEY`、`COMMANDCODE_API_KEY` 等），直接存在
`~/.dsh/.credentials.yaml` 里。它们**根本不需要走 settings 段绑定机制**。当前的
`binding()` → `describe()` → 找段 → 校验 apiKeyEnv 的链路是为**自定义 provider**
（用户的 `llm-pi-ai.providers.<route>.apiKeyEnv` 可配置）设计的。对内置 provider，
应该直接绑定到固定 ref，跳过 settings 查找。

### 具体改动

**`src/host/providers.ts` — `binding()` 方法（约 369 行起）**：

对 `fixed` 表中存在的 provider（即内置 provider），**在 `descriptors()` 查找之前就
提前返回**，不查 settings 段：

```typescript
binding(id: string) {
  const f = fixed[id];
  if (!f && !id.startsWith("custom:")) throw new SafeError("REF_NOT_ALLOWED");
  const route = id.startsWith("custom:") ? id.slice(7) : id;

  // Built-in providers bind directly to their fixed credential ref — no
  // settings section lookup needed. This works identically on every host
  // version (0.1.5 through 0.2.x) because the credentials service is
  // version-independent.
  if (f) {
    const d = { ns: f.ns, revision: 0, value: { apiKeyEnv: f.ref } };
    return {
      ref: f.ref,
      token: createHmac("sha256", this.salt)
        .update(JSON.stringify([id, f.ns, f.ref, 0]))
        .digest("hex"),
      d,
      profile: { apiKeyEnv: f.ref },
      route,
      ns: f.ns,
    };
  }

  // Custom providers: existing code path (llm-pi-ai section lookup, catalog
  // check, canonical ref validation) — keep unchanged.
  // ... (existing custom provider logic)
}
```

**删除**当前 `binding()` 里的所有 fallback 代码块（Go 的 main-section fallback、
commandcode 的 main-section fallback、fixed-ref fallback）——它们全部被上述提前返回
替代。

**`card()` 方法**：`card.bindingToken` 和 `card.credential` 从 `binding()` 拿到的就是
正确值（上述提前返回会成功），不需要改。但把 `catch { card.error = "REF_NOT_ALLOWED" }`
改为只在 `!f` 时才可能触发（内置 provider 不会再走这条 catch 了）。

**`set()` / `reveal()`**：`check()` 里的 `binding()` 调用会走提前返回，token 是确定
性的（HMAC of salt + id + ns + ref + revision=0），所以 `p.bindingToken === b.token`
在同一个 Manager 实例内始终匹配。**不需要改这两个方法**。

**`quota()`**：`binding()` 成功后 `profile.apiKeyEnv` 是固定 ref，`source` 字段的
`command-default-reference` 判定需要确认 `profile` 上有正确的字段。当前代码用
`binding.d.secrets` 检查 source ambiguity——对内置 provider 合成的 `d` 没有 `secrets`
字段，所以 `commandSourceAmbiguous()` 会返回 false（正确的默认行为，内置 key 不
ambiguous）。确认这一点即可。

### 不要动的东西

- `Manager.setSecondGoKey()` / `revealSecondGoKey()` / `clearSecondGoKey()` — 已经
  直接用 credentials 服务，不走 binding，**不需要改**
- 自定义 provider 的 binding 路径 — 保持现有逻辑不变
- `ConfigSchema` 的子字段 `vol()` — 保留（0.1.5 需要，0.2.x 多余但无害）
- `ensureSection()` / `compat.ts` — 保留（0.1.5 的 installSection 路径仍需要）

### 测试修复

现有的 3 个失败测试需要更新期望值（它们期望旧的行为）：

1. `tests/providers.spec.ts` — `"commandcode binding falls back to the main section"`
   → 改为断言内置 provider 的 binding **始终成功**（不依赖 settings 段）：
   ```typescript
   test("built-in commandcode binding works without a settings section", async () => {
     const f = fixture();
     const m: any = new Manager(f.services);
     // No llm-commandcode section in fixture — binding should still succeed
     const card = await m.card("commandcode");
     expect(card.error).toBeUndefined();
     expect(card.credential?.configured).toBe(false); // COMMANDCODE_API_KEY not in fixture
   });
   ```

2. `tests/quota.spec.ts` — `"missing Command key and source ambiguity never fetch"` 和
   `"Command default key fetch uses credits URL"` — 改为断言 quota 在 key 未配置时
   返回 `missing-credential`（现在 binding 成功了，走到 credentials.describe 返回
   configured=false，然后 quota 会因无 key 而返回 missing-credential——具体断言看
   quota() 里对 `info.configured === false` 的处理路径）。

3. `tests/lifecycle.spec.ts` — `"real Cordis delayed DI"` — 可能需要更新期望以匹配
   新的 binding 返回值（token 计算方式变了）。

### 验收标准

1. `pnpm typecheck` 零错误
2. `pnpm test` 全绿（更新后的测试）
3. `pnpm test:client` 全绿
4. `pnpm build && pnpm check:pack` 通过
5. 在真实 Web UI 上（dsh 0.2.1-rc.5 宿主）打开 Provider Manager → Command Code 卡
   → **能正常显示 key 输入框、保存 key、显示额度**（不报 "not managed"）
6. OpenCode Go 卡不受影响（同样走提前返回，行为不变）
7. 自定义 provider 的卡片不受影响（走原有 settings 路径）

## 文件路径

- 工作区：`/Users/kevinchen/Dev/dsh-provider-manager`
- 要改的主文件：`src/host/providers.ts`（binding() 方法在约 369 行）
- 测试：`tests/providers.spec.ts`、`tests/quota.spec.ts`、`tests/lifecycle.spec.ts`
- 不要改：`src/host/compat.ts`、`src/host/commandcode/`（适配器）、`src/host/opencode/`、
  `src/host/index.ts`（RPC 注册）、`src/client/`（UI 层）

## 红线

- 不修改 dsh 宿主源码或 node_modules
- 不改 `Manager.setSecondGoKey()` 等已验证的方法
- 不删自定义 provider 的 binding 逻辑
- 改完后跑四门（typecheck/test/test:client/build+pack）全绿才提交
