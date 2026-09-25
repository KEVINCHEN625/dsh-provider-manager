# DSH Desktop 走查清单（v2.0.14 / dsh 0.1.7-rc.1）

适用：dsh-provider-manager 0.4.1+。安装位置 ~/Applications/DSH Desktop.app。

## 安装插件（一次性）

1. 启动 DSH Desktop（托盘出现鲸鱼图标）。
2. 托盘菜单 → **Open DSH Terminal**（macOS 打开 Terminal，已注入私有 dsh/pnpm/node PATH）。
3. 欢迎信息确认：当前 profile、profile 目录、DSH home。
4. 执行（替换为 Releases 最新 tarball URL 或本地路径）：

   ```sh
   dsh plugin add --ignore-scripts --force \
     https://github.com/KEVINCHEN625/dsh-provider-manager/releases/download/v0.4.1/dsh-provider-manager-0.4.1-2bed172c3592.tgz
   ```

5. 托盘 → **Restart DSH Desktop**（插件变更需重启进入 Loader 组合）。

## 走查点（重启后逐项确认）

- [ ] 设置页出现 **Provider manager**（ALL | LLM | OAuth 三 tab、品牌厂标卡片）。
- [ ] OAuth tab：各家卡片 + Sign in 入口（Codex/Claude/Kimi/xAI/Copilot/OpenRouter/Muse 设备码）。
- [ ] Codex Sign in：浏览器/设备码流程走通，模型表出现（规范名 + 参数 + effort）。
- [ ] 对话模型选择器：openai-codex 模型可见可选，发一条消息成功。
- [ ] OpenCode Go 卡片（内置适配器）：填 OPENCODE_API_KEY 后额度窗口出现。
- [ ] Show key：loopback 校验在 Desktop 环境同样生效（显示/隐藏正常）。
- [ ] Logout：凭据清除，卡片回到未登录态。

## 已知边界（重要）

- **首次启动 Desktop 会把 `~/.dsh/settings.yaml` 导入它自己的 `desktop` profile，
  然后把原文件改名为 `settings.yaml.imported`。** 同时使用 CLI/Web 的用户请在
  Desktop 首启后执行
  `cp ~/.dsh/settings.yaml.imported ~/.dsh/settings.yaml` 恢复，两边配置随后各自
  演进（Desktop 写 desktop profile，CLI/Web 继续读 settings.yaml）。
- `desktop` profile 由 Electron 独占管理：CLI 的
  `dsh plugin --profile desktop add` 会被拒绝（"managed exclusively by the
  Electron application"），装插件请走托盘终端（里面的 dsh 有权限）。
- 0.1.7 的 plugin manager 有 peer 版本门禁：0.4.1 起 peer 已声明为
  `0.1.5-rc.2 || 0.1.7-rc.1`，在 Desktop（0.1.7-rc.1）上直接可装；0.4.0 及更早
  需 allow-version 逃生口。
