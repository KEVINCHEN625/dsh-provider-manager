# dsh-provider-manager

English | [中文](README.zh.md)

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4D6BFE?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) settings plugin for **providers**: one compact ledger for OpenCode Go quota, Command Code quota, custom APIs, and an honest Muse Code row.

It does **not** replace [LLM Providers](https://github.com/NOirBRight/dsh-llm-providers-ui), [OpenCode Go](https://github.com/NOirBRight/dsh-llm-opencode-go), or Command Code. Chat still runs on those adapters. This page is the place to **see remaining quota, write the default key, and add a custom API** without leaving Settings.

Verified on **DSH `0.1.5-rc.2`**.

## Why this plugin

- **Looks like LLM Providers.** Trademark-style marks, LLM / Agent badges, a 3-column ledger (connection · remaining window · Details). Quota stays on the list; keys and catalogs open on a separate page.
- **Quota is Host-only and official.** OpenCode Go uses `GET https://opencode.ai/zen/go/v1/usage`. Command Code uses `GET https://api.commandcode.ai/alpha/billing/credits` only when the default credential is unambiguous. Custom endpoints get **unsupported**, never a fake 100% bar. Accounts are never merged.
- **Does not steal the native editors.** Plan filters, model catalogs, and GOAT eligibility stay on **Settings → LLM Providers** and **Settings → Models / Command Code**.
- **Custom API presets.** One **ZCode** card with **China / Overseas** URLs (Coding Plan, not `/api/paas/v4`). OpenRouter, SiliconFlow, Moonshot, DeepSeek, OpenAI, Anthropic, Groq, Together, Fireworks, DashScope, Gemini, Mistral, and one-click **Meta Model API**. Meta is **pay-as-you-go**, not a Muse Code CLI subscription.
- **Honest Muse Code.** DSH cannot attach Everyday / High / Power. The row only reports whether the CLI is on `PATH`. Spark inside DSH is OpenCode Go (or Meta Model API if you pay Meta separately).
- **Keys stay on the Host.** Snapshots never include secrets. Reveal is loopback-only `POST /provider-manager/reveal`.

## Screenshots

Settings → **Provider manager** — remaining quota on the list, details one click away:

![Provider manager list: OpenCode Go remaining quota, Command Code, custom API, Muse Code](docs/images/provider-manager-list.png)

OpenCode Go details — write the default key; Host reads 5-hour / weekly / monthly remaining:

![OpenCode Go account card](docs/images/provider-manager-opencode.png)

![OpenCode Go remaining quota windows](docs/images/provider-manager-quota.png)

Muse Code — CLI-only, with a button to add Meta Model API:

![Muse Code details: DSH does not run the Muse Code CLI as a native adapter](docs/images/provider-manager-muse.png)

One-click Meta Model API draft (`openai-responses` at `https://api.meta.ai/v1`):

![Add provider form prefilled for Meta Model API](docs/images/provider-manager-meta.png)

## Install

This package declares `dsh.bundle`, so `dsh plugin add` activates a settings layer. Official notes: [Package and install a plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish).

Install the **release tarball** (it already contains `lib/`). We do not ship a `prepare` script, so `github:KEVINCHEN625/dsh-provider-manager` will not compile on install — this plugin handles credentials and should not require `allowBuilds`.

```sh
dsh plugin --profile web add --ignore-scripts --force \
  https://github.com/KEVINCHEN625/dsh-provider-manager/releases/download/v0.2.3/dsh-provider-manager-0.2.3.tgz
dsh --profile web --dump-config   # look for "# == dsh-provider-manager"
dsh web
```

Then open **Settings → Provider manager**.

If the web profile is itself a pnpm workspace (`packages: [.]`), pass pnpm’s boolean `--workspace-root` **before** the tarball:

```sh
dsh plugin --profile web add --workspace-root --ignore-scripts --force \
  ./dsh-provider-manager-0.2.3.tgz
```

CLI success and a live page are separate checks. Restart Web after adding the plugin.

### Also install the adapters you actually chat with

| You want to…                         | Also install                                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat with OpenCode Go / Spark in DSH | [`dsh-llm-opencode-go`](https://github.com/NOirBRight/dsh-llm-opencode-go) + [`dsh-llm-providers-ui`](https://github.com/NOirBRight/dsh-llm-providers-ui) |
| Chat with Command Code GOAT          | Command Code provider plugin                                                                                                                              |
| Muse Code CLI plan                   | Official Muse CLI only — **not this plugin, not DSH**                                                                                                     |

## Using the page

The list shows icon, name, LLM/Agent badge, key status, primary remaining window, Details.

**OpenCode Go** — default ref `OPENCODE_API_KEY`. Quota from the official usage endpoint. Unofficial base URLs: quota unsupported.

**Command Code GOAT** — default ref `COMMANDCODE_API_KEY` only. Literal keys, extra accounts, and `auth.json` may take precedence; this page does not read login files. Ambiguous sources show **source-unverified** instead of a fake bar.

**Custom API** — `llm-pi-ai` route `^[a-z][a-z0-9-]*$`. **Add provider** can start from a known API. ZCode, SiliconFlow, and Moonshot stay on **one card**: choose **China** or **Overseas**, then save. The key must match the console that issued it.

| Preset                                                                                                    | Notes                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ZCode**                                                                                                 | GLM Coding Plan. China `https://open.bigmodel.cn/api/coding/paas/v4`, Overseas `https://api.z.ai/api/coding/paas/v4`. Anthropic Messages uses `/api/anthropic` on the same card. Do **not** use the general `/api/paas/v4` path. |
| **OpenRouter**                                                                                            | `https://openrouter.ai/api/v1`                                                                                                                                                                                                   |
| SiliconFlow / Moonshot                                                                                    | China and Overseas URLs on the same card                                                                                                                                                                                         |
| DeepSeek, OpenAI, Anthropic, Groq, Together, Fireworks, DashScope, Google Gemini, Mistral, Meta Model API | Official base URL prefilled                                                                                                                                                                                                      |

Save configuration, then save the key. The env name is derived from the route (`DSH_PROVIDER_MANAGER_<hex(route)>_API_KEY`). Quota lookup is **unsupported** for these endpoints. Reserved: `opencode-go`, `commandcode`, `deepseek-official`, `cliproxy`, `muse-code`.

**Muse Code** — always `CLI_ONLY`. Docs: [subscriptions](https://dev.meta.ai/docs/muse-code/subscriptions), [Meta Model API for coding agents](https://dev.meta.ai/docs/guides/coding-agents).

## Security

- RPC and snapshots never echo key material
- Reveal requires an authenticated same-origin POST from a **real loopback socket** (proxies, tunnels, `Origin: null` are rejected)
- Revealed values clear on hide, back, blur, connection change, and TTL (max 30s)
- Quota fetches send `Authorization: Bearer` only to the official OpenCode / Command URLs above

Remote browsers need SSH forwarding to `127.0.0.1` to persist settings or reveal a key.

## Uninstall

```sh
dsh plugin --profile web remove dsh-provider-manager
dsh web
```

Removes this bundle only. Credentials, custom `llm-pi-ai` routes, OpenCode Go, and Command Code stay.

## Develop

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm test
pnpm run test:client
pnpm run format:check
pnpm run check:pack
```

Host, client, and Cordis patch live in this repository. Do not patch DSH core to “make Muse native.” Add the GitHub topic `dsh-plugin` so the repo shows up in DSH plugin lists.

## License

[MIT](LICENSE)
