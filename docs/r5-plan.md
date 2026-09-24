# R5 —— 七家 OAuth 接线 + Muse 收尾（R2，已按交叉审核修订）

日期：2026-09-24。基线：main @ 8beac23，0.3.3 双 profile。审核标注 [B*]/[S*] 对应交叉审核报告。

## 第 0 步（最高优先）：effort 词表统一 + 复现注册表隐患 [B1]

1. 隔离环境复现：0.3.3 + 注册表 adc985b（noneEnabled 已在远程）→ 拉取 → writeManaged 产
   `reasoningEfforts: { none: "none" }` → 宿主 settings schema 拒绝（THINKING_LEVELS 只认
   off/minimal/low/medium/high/xhigh/max，config.ts:293-296 实测 REJECTED）→ 确认 snapshot
   是否整体失败。录迹。
2. 修复：注入侧统一映射 `none → off`（注册表/通道事实保持 noneEnabled 命名不变；产出
   reasoningEfforts 时 `off: "none"`——键在宿主词表内、wire 值为通道拼写 none）。Muse
   适配器已用 off，选择器两侧语义统一。改 oauth-routes.ts、oauth-catalog.ts（EFFORTS
   词表）、tests/model-display.spec.ts 钉死断言、shared/protocol.ts。
3. 真实环境验证：刷新后 gpt-6-sol 等六模型选择器出现"off"档（显示名沿宿主 off 档
   本地化），选 off 实发一次 200。

## D1：注册表三态迁移（按数据来历分流）[B2/S2]

- schema：条目 `status: available|unavailable|unverified` + 可选 `source: probe|models.dev`；
  运行时读 status 优先，布尔 available 仅旧数据兜底。
- 迁移规则按来历：**probe 实测 400 的 false → unavailable**（openai-codex 的
  gpt-5.3-codex/-spark 两条退役条目）；**从未验证的 false → unverified**（anthropic 14、
  copilot 28、kimi 4 候选全部）。
- 注册表 PR 说明必须写明：旧 0.3.x 客户端的 parseAvailability 键白名单会拒新键
  status/source → 整文档解析失败回退打包快照（升级路径：装 0.4.0）。
- parseAvailability 键白名单同步扩 status/source/noneEnabled（核实现状：noneEnabled
  是否已在白名单——不在则本次一并加，否则远程 adc985b 同样触发回退）。

## D2：登录触发探测（probe-on-sign-in）[B3/B6/B7/S5]

- **本地缓存载体**：OWNED_OAUTH_NS settings 段（per provider：模型 status/verifiedAt/
  冷却时间戳）。joinCatalog 输入 = remote ∪ local，**local 同 id 覆盖**（probe 结果
  优先于远程）；远程成功不丢弃 local。冷却计数持久化于此。
- **每家 probe 形状表**（写入 docs/oauth-catalog.md，probe 脚本按表实现）：
  | provider | 协议 | 端点 | 请求形状 |
  | --- | --- | --- | --- |
  | openai-codex | openai-codex-responses | chatgpt.com/backend-api/codex/responses | stream、无输出上限、reasoning.effort=low、originator 头 |
  | anthropic | anthropic-messages | api.anthropic.com（凭 JWT 账号头） | thinking 参数族（**无 reasoning.effort 字段**） |
  | github-copilot | 混（按模型） | api.individual.githubcopilot.com | 按模型协议选形 |
  | kimi-coding | anthropic-messages | api.kimi.com/coding | thinking 参数族 |
  | xai | openai-responses | api.x.ai/v1 | responses 形状 |
  | openrouter | anthropic-messages/completions | openrouter.ai/api/v1 | 按模型协议 |
  统一口径：**绝不发输出上限参数**（Codex 硬经验）；流式；5 token 级输入。
- **结果分类学**：200+served 一致=available；200+served 不同=available+servedModel；400
  /模型名错=unavailable；**401/403=凭据问题（probe 停止该家全部模型，标 credential-
  expired，不写 unavailable）**；网络失败=保持原状态不覆盖。
- **首登风暴控制** [S5]：每次登录触发探测**每批 ≤8 个模型**（种子排序：候选文件顺序
  =热门优先），其余留待手动"继续验证"按钮或下次登录；每模型 24h 冷却。
- **隔离验证** [B7]：mock fetch 注入（CatalogStore options.fetch 先例）模拟 200/400/401
  三类响应走完整管道并录迹；不碰真实上游。
- probe 结果进 OWNED ns 后注入管道自然生效（writeManaged 读 joinCatalog 合并结果），
  "提示用户提交注册表"保留（UI 提示文案，非自动 push）。

## D3：各家差异化（修订版）

| Provider | models.dev 映射 | 初始注册表 | 特殊 |
| --- | --- | --- | --- |
| Anthropic | `anthropic`（15 条，候选少 claude-opus-5-5——补录）[S4] | 15→unverified | — |
| GitHub Copilot | `github-copilot`（32 条，候选少 4 条——补录）[S4] | 32→unverified | 混协议按模型 |
| Kimi | `kimi-code-plan-global` + `kimi-code-plan-cn` 双目录合并（当前内容相同，合并去重按 id，global 优先） | 4→unverified | — |
| xAI | `xai`（12 条中**仅 5 条 chat 模型可注入**：grok-4.3/4.5/4.6/4.7/4.20-multi-agent；imagine 图像 4 条与无 reasoning 3 条不收）[S1] | 5→unverified | — |
| OpenRouter | `openrouter`（385） | **top-N 可复现规则**：免费组（cost.input==0）+ release_date 倒序前 20 + 人工白名单兜底（无 usage 排名字段，不虚构"使用排名"）[B5] | "从目录添加"：自选清单存 OWNED ns 并入 writeManaged 的 nextModels，防整段覆写 [B4]；总数上限 50（parse 上限 200 内） |
| Radius | 无 | 不建文件 | 卡片"无已知模型目录" |
| Muse | `meta` | 适配器内置 | 见 D4 |

models.dev 文档缓存共享 [S6]：CatalogStore 单份 api.json 缓存供全部 provider 复用（现按 providerId 独立缓存，7 家全配时最多 7×4.9MB）。

## D4：Muse 收尾（修订）

- 模型 3→5（补 muse-spark-1.1/1.2，参数 models.dev 已核：1048576/131072）。
- **档位按 models.dev 每模型实录：仅 muse-spark-1.3 含 max 六档；1.1/1.2/contributor 均
  五档（minimal..xhigh）**——"六档对齐"表述作废 [S3]。
- 设备码降级验证照旧（首个 POST 即 notify{url,code}，decline/cancel/record 语义已验）。
- Muse 卡 effort 档显示与 llm-pi-ai 侧 off 档（第 0 步统一后）语义一致。

## D5：实照与 flaky

- 选择器实照为**硬门**：Codex（规范名+effort+off 档）；OpenRouter top-N（用户已登录则
  真实截图，未登录则隔离实照）。
- flaky：完整 host 测试连跑 10 次，捕获即归因记录（修或记录，不阻断）。
- 基线构成清理 [S8]：artifacts/ 下 ui-review.spec.tsx 移出 vitest 范围（调整 exclude
  或挪目录），基线数字相应重算并在报告注明新基线。

## 文件清单（补齐 [S7]）

package.json、src/shared/protocol.ts（三态+off 映射类型）、src/host/oauth-catalog.ts
（词表/映射/三态/合并/缓存共享/白名单）、src/host/oauth-routes.ts（off 映射、自选清单
并入）、src/host/oauth-host.ts（OWNED ns 读写）、src/host/login.ts（authorized→probe
队列）、src/host/muse/catalog.ts（5 模型档位）、scripts/probe-oauth.mjs（多家形状表
实现，live 仍 --confirm）、src/client/OAuthDetails.tsx（三态文案/继续验证/从目录添加）、
src/client/controller.ts、locales.ts、tests/*（model-display/oauth-catalog/oauth-routes/
muse/OAuthDetails 组件）、docs/oauth-catalog.md（probe 形状表/三态语义）、docs/status.md。

## 验收门（全过才算完成）

0. 第 0 步复现录迹 + off 修复后真实选择器实发 200（off 档）。
1. 四门全绿（新基线重算后），报告附完整数字。
2. 隔离：mock fetch 三类响应（200/400/401）走完 登录→probe 队列→local 覆盖→注入→
   选择器；下架移除；冷却持久化。录迹。
3. Muse 设备码降级录迹 + 5 模型参数表。
4. 实照：Codex 选择器（off 档已现）+ OpenRouter top-N。
5. 注册表 PR：三态迁移（含 codex 退役→unavailable、46 条→unverified）+ xai/openrouter
   种子 + 差集补录（anthropic 15/copilot 32），PR 说明含旧客户端冻结警示。
6. flaky 10 连跑记录；发版 0.4.0 双 profile 同产物 consistency；token 零外泄五处 grep；
   环境干净。

## 红线

不变：token 永不外泄、不自动登录、无凭据不发真实请求、不覆盖用户手写路由、无后台
timer。新增：reasoningEfforts 键域永远在宿主 THINKING_LEVELS 内（off 映射后）；probe
绝不带输出上限参数。
