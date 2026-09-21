# dsh-provider-manager

**Every provider, one page.**

English | [中文](README.zh.md)

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4D6BFE?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

The promise of DeepSeek Harness is *everything is a plugin*. This plugin extends it one step further: **every provider you can use in DSH — coding subscriptions, public APIs, private gateways — managed from one Settings page.**

Whatever you bring — an OpenCode Go subscription, a Command Code GOAT plan, a ZCode GLM Coding Plan key, an OpenRouter account, or your own gateway behind `127.0.0.1` — the flow is the same: **one card, paste the key, see the real remaining quota, save the route.** No YAML editing, no CLI round-trips, no guessing which credential the model picker actually reads.

Verified on **DSH `0.1.5-rc.2`**.

## The idea: providers are the scarce resource, so manage them like one

Model quality today is table stakes; what actually shapes your day is **which providers you can reach, with which credentials, at what remaining quota**. dsh-provider-manager treats that as a first-class surface:

| You bring | This page gives you |
| --- | --- |
| **Coding subscriptions** — OpenCode Go, Command Code GOAT | Default-key editing, official live quota (5h / weekly / monthly), source-of-truth checks |
| **Public API keys** — 16 presets from ZCode to OpenRouter to Meta | Prefilled official endpoints, China/Overseas region choice, per-model 1M-context ticks |
| **Your own gateway** — local proxies, company gateways, relays | A clean custom route with the right protocol, named and managed like any built-in |
| **CLI-only plans** — Muse Code | An honest row that says so, instead of pretending |

It deliberately does **not** re-implement inference. Chat keeps running on the adapters you already trust — [`dsh-llm-opencode-go`](https://github.com/NOirBRight/dsh-llm-opencode-go), [Command Code provider](https://github.com/Mars-Sea/dsh-commandcode-provider), and the rest. This page owns the part they scatter: **credentials, quota, and routes, in one ledger.** That separation is the point — your providers get one manager, and every adapter stays swappable.

## What's on the page

- **A ledger that looks like LLM Providers.** Trademark-style marks, LLM / Agent badges, a 3-column list (connection · remaining window · Details). Quota lives on the list; keys and catalogs open one click deeper.
- **Real quota, Host-only, from official endpoints.** OpenCode Go reads `GET https://opencode.ai/zen/go/v1/usage`; Command Code reads `GET https://api.commandcode.ai/alpha/billing/credits` — only when the default credential is unambiguous. Custom endpoints show **unsupported**, never a fake 100% bar. Accounts are never merged.
- **16 API presets, one card each.** **ZCode** (GLM Coding Plan, China / Overseas, Anthropic on the same card), **MiMo** (Xiaomi Token Plan `tp-` keys, China / Singapore / Europe), **MiniMax** (China / Overseas, Anthropic on the same card), plus **OpenRouter, SiliconFlow, Moonshot, DeepSeek, OpenAI, Anthropic, Groq, Together, Fireworks, DashScope, Google Gemini, Mistral** — and one-click **Meta Model API** (pay-as-you-go, not a Muse Code subscription).
- **Custom routes for everything else.** Any OpenAI-Completions, OpenAI-Responses, or Anthropic-Messages endpoint becomes a first-class route (`^[a-z][a-z0-9-]*$`), with reserved-name protection so you can never shadow `opencode-go`, `commandcode`, `deepseek-official`, or `cliproxy`.
- **Per-model 1M context.** Every addable model carries a **1M context** checkbox, prefilled to official sizes (GLM-5.3 / Flash / 5.2, MiMo V2.5, MiniMax-M3, Gemini 2.5 Flash, GPT-4.1 mini, Muse Spark = 1M; GLM-5-Turbo = 200K; MiniMax-M2.7 = 204,800). Tick or untick before save; it writes `models[].contextWindow` for `llm-pi-ai`.
- **Sign-in providers.** Official authorization flows for Claude, Codex, Kimi, xAI, Copilot, OpenRouter, and other catalog providers that register a login method. Filter **ALL | LLM | OAuth**; credentials land in the official store and this page never echoes tokens.
- **Honest Muse Code.** Everyday / High / Power **cannot attach to DSH**. The row reports whether the CLI is on `PATH` and links the Meta Model API way in. Spark inside DSH means OpenCode Go — or Meta Model API if you pay Meta separately.
- **Keys stay on the Host.** Snapshots never include secrets. Reveal is a loopback-only `POST /provider-manager/reveal` with a real-socket check; values clear on hide, blur, connection change, or a 30s TTL. See [Security](#security).

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

Then open **Settings → Provider manager**. Check [Releases](https://github.com/KEVINCHEN625/dsh-provider-manager/releases) for the latest tarball and swap the URL.

If the web profile is itself a pnpm workspace (`packages: [.]`), pass pnpm's boolean `--workspace-root` **before** the tarball:

```sh
dsh plugin --profile web add --workspace-root --ignore-scripts --force \
  ./dsh-provider-manager-0.2.3.tgz
```

CLI success and a live page are separate checks. Restart Web after adding the plugin.

### Also install the adapters you actually chat with

| You want to… | Also install |
| --- | --- |
| Chat with OpenCode Go / Spark in DSH | [`dsh-llm-opencode-go`](https://github.com/NOirBRight/dsh-llm-opencode-go) + [`dsh-llm-providers-ui`](https://github.com/NOirBRight/dsh-llm-providers-ui) |
| Chat with Command Code GOAT | [Command Code provider plugin](https://github.com/Mars-Sea/dsh-commandcode-provider) |
| Muse Code CLI plan | Official Muse CLI only — **not this plugin, not DSH** |

## Using the page

The list shows icon, name, LLM/Agent badge, key status, primary remaining window, Details.

**OpenCode Go** — default ref `OPENCODE_API_KEY`. Quota from the official usage endpoint. Unofficial base URLs: quota unsupported.

**Command Code GOAT** — default ref `COMMANDCODE_API_KEY` only. Literal keys, extra accounts, and `auth.json` may take precedence; this page does not read login files. Ambiguous sources show **source-unverified** instead of a fake bar.

**Custom API** — `llm-pi-ai` route. **Add provider** starts from a known API when one matches. ZCode, MiMo, MiniMax, SiliconFlow, and Moonshot stay on **one card**: choose **China** or **Overseas**, then save. The key must match the console that issued it.

| Preset | Notes |
| --- | --- |
| **ZCode** | GLM Coding Plan (`glm-5.3-flash`, `glm-5.3`). China `https://open.bigmodel.cn/api/coding/paas/v4`, Overseas `https://api.z.ai/api/coding/paas/v4`. Anthropic Messages uses `/api/anthropic`. Do **not** use `/api/paas/v4`. |
| **MiMo** | Xiaomi Token Plan (`tp-` keys, not pay-as-you-go `sk-`). China `https://token-plan-cn.xiaomimimo.com/v1`, Overseas Singapore `https://token-plan-sgp.xiaomimimo.com/v1`. Europe cluster is `token-plan-ams` — paste it if that is what the Token Plan page shows. |
| **MiniMax** | China `https://api.minimax.cn/v1`, Overseas `https://api.minimax.io/v1`. Anthropic uses `/anthropic` on the same card. |
| **OpenRouter** | `https://openrouter.ai/api/v1` |
| SiliconFlow / Moonshot | China and Overseas URLs on the same card |
| DeepSeek, OpenAI, Anthropic, Groq, Together, Fireworks, DashScope, Google Gemini, Mistral, Meta Model API | Official base URL prefilled |

Save configuration first, then save the key. Each model row can tick **1M context**; that writes `models[].contextWindow` for `llm-pi-ai` (1,048,576 when ticked, or the model's listed size when not). The optional fallback context field only applies to IDs without a size. The env name is derived from the route (`DSH_PROVIDER_MANAGER_<hex(route)>_API_KEY`). Quota lookup is **unsupported** for these endpoints. Reserved routes: `opencode-go`, `commandcode`, `deepseek-official`, `cliproxy`, `muse-code`.

**Muse Code** — always `CLI_ONLY`. Docs: [subscriptions](https://dev.meta.ai/docs/muse-code/subscriptions), [Meta Model API for coding agents](https://dev.meta.ai/docs/guides/coding-agents).

## Security

- RPC and snapshots never echo key material.
- Reveal requires an authenticated same-origin POST from a **real loopback socket** — proxies, tunnels, and `Origin: null` are rejected.
- Revealed values clear on hide, back, blur, connection change, and TTL (max 30s).
- Quota fetches send `Authorization: Bearer` only to the official OpenCode / Command URLs above.

Remote browsers need SSH forwarding to `127.0.0.1` to persist settings or reveal a key.

## Roadmap — closing the last miles to "everything"

The goal is every provider usable in DSH. What's left, in priority order:

1. **More subscription quota adapters** — Kimi for Coding, GLM Coding Plan, MiniMax Coding, Codex / ChatGPT, Claude Pro/Max, Grok Build: the same official-endpoint ledger treatment OpenCode Go and Command Code get today (including quota reads for OAuth accounts).
2. **Key health check on save** — verify a freshly pasted key against the provider before you trust the card.
3. **Model discovery** — fetch a provider's live model list into the form, next to manual entry.
4. **Multi-account** — per-provider key pools with rotation, for plans that allow it.

## Uninstall

```sh
dsh plugin --profile web remove dsh-provider-manager
dsh web
```

Removes this bundle only. Credentials, custom `llm-pi-ai` routes, OpenCode Go, and Command Code stay.

## Develop

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm test:client
pnpm build && pnpm check:pack
```

Design, deployment evidence, and the review trail live in [`docs/`](docs/). The plugin touches only published dsh services — `settings`, `credentials`, `llm` — and never patches the harness or other plugins.

## License

[MIT](LICENSE)
