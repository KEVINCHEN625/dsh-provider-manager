# R6 —— DSH Desktop 适配计划

日期：2026-09-25。基线：main @ 3d40696（0.4.0 已发布）。

## 调研结论（已完成）

- **DSH Desktop**（anywhere-labs/dsh-desktop，29k⭐，v2.0.14）：薄 Electron 宿主，**原样运行上游 dsh Host**，页面从 loopback HTTP 同源加载；明确承诺"只依赖官方 DSH contract 的普通插件可三层复用（CLI / Web / Desktop）"。我们正是这种插件（只依赖 settings/credentials/llm/connection/webServer/authorization）。
- **版本断点**：桌面版固定上游 **dsh v0.1.7-rc.1**；我们声明兼容 0.1.5-rc.2。全部关键 peer 包在 0.1.7-rc.1 均已发布（authorization/credentials/llm/settings/client faces/webserver/pi-ai）。
- **安装方式**：桌面版托盘终端裸 `dsh plugin add <tarball>`（作用于当前激活 profile），装完重启 Desktop。
- **环境差异**：Desktop 用私有 dsh home 与 profile 目录（终端欢迎信息显示路径）；shim 的 node/pnpm 不改系统 PATH。我们的 host 不假设 ~/.dsh（全走服务抽象）✅。
- **reveal 风险评估**：renderer 从 loopback 同源加载 → 真实 socket 校验应原样工作（待实机确认）。

## 执行阶段

### A. 契约适配（代码层）
1. devDependencies 的 8 个 @deepseek-ai/* 包升到 `0.1.7-rc.1`，pnpm-lock 重算。
2. 全量四门跑通；逐个修复 0.1.7 的契约变化（重点排查：THINKING_LEVELS 词表、authorization begin/decline 语义、settings.mutate revision、client faces 的 inject 名单、webServer.register 签名）。
3. compatibility.dshReleases 增加 `"0.1.7-rc.1": "compatible"`（保留 0.1.5-rc.2）。
4. 若 0.1.5 与 0.1.7 契约不兼容处无法同源支持：分支处理或最低支持上移（在报告与 README 声明）。

### B. 隔离验证（0.1.7 运行时）
- 用 0.1.7-rc.1 包起隔离 DSH_HOME 的 web profile（不走本地源码仓库），装新 tarball，走查：页面加载、卡片渲染、Codex OAuth 卡状态、模型表、reveal（loopback 校验）、注入路由解析。

### C. 桌面版实机走查
- 下载 v2.0.14 macOS DMG 并安装；托盘终端装插件；重启后走查清单（同 B + 托盘/窗口行为）；记录 DSH home 路径差异。
- GUI 交互部分整理成一页清单交用户最终确认（或由用户当场点一遍）。

### D. 发布
- README（中英）加 "DSH Desktop" 安装小节（托盘终端命令 + 重启提示 + 版本矩阵）。
- 发版 0.4.1（兼容性扩展）：tarball 内容哈希命名、双 profile consistency、GitHub Release。

### E. 交叉审核 + push
- 独立 agent 审核计划与实现（重点：0.1.7 契约断言核验、compatibility 声明真实性、隔离证据）。
- 通过后 commit + push + Release。

## 红线
不改宿主源码；不假设 ~/.dsh 路径；token 零外泄；真实环境（本机 3080 服务）不动——桌面版验证在独立安装内进行。
