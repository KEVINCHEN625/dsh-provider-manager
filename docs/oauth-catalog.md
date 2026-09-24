# OAuth model catalogs

Model parameters and channel availability are separate data. Shipping a plugin
build is not required to change either one. There is no background timer. A
fetch runs when an OAuth details page opens or a sign-in succeeds, and only
when `oauthCatalogTtlMs` (default 24 hours) has elapsed. A failed fetch keeps
the built-in snapshot for that layer.

## Parameters: models.dev

`contextWindow`, `maxTokens`, efforts, input, and cost come from
[models.dev](https://models.dev/api.json). One download of `api.json` is
shared by every provider for the catalog TTL. The plugin ships excerpts for
OpenAI, Anthropic, GitHub Copilot, Kimi, xAI, and OpenRouter. Refresh tries:

1. `https://models.dev/api.json`
2. `https://cdn.jsdelivr.net/npm/@opencode-ai/models@0.0.66/dist/snapshot.js`

`anomalyco/models.dev` stores TOML, not the generated `api.json`, so the
second copy is the published SDK snapshot on jsDelivr. Responses larger than
8MB, or any document containing `access_token`, `refresh_token`, `sk-`, or a
JWT prefix, are rejected. Codex OAuth reads the `openai` provider in that file.

## Availability: dsh-provider-models

The only custom dataset is which subscription models are actually enabled.
Repository: <https://github.com/KEVINCHEN625/dsh-provider-models>

`<providerId>.json` is `{ providerId, models: [{ id, available, status?, source?, verifiedAt, servedModel?, contextWindow?, noneEnabled? }] }`.
`status` is `available`, `unavailable`, or `unverified`. The runtime reads
`status` first. A row without `status` falls back to the boolean: `true` is
available and `false` is unverified. `source` is `probe` or `models.dev`.
`name` and `efforts` are not required registry fields: the injection pipeline
reads them from the models.dev spec at runtime. `pendingProbe` is also not a
registry field. The pipeline sets it when an available id has no models.dev
spec, and then the selector row is `{ id, name }` with the fallback display
name. A channel `contextWindow` is
written only after a measurement for that one model disagrees with models.dev,
and then that measurement wins. The Codex seed does not copy one window onto
every id. Mirrors:

- `https://raw.githubusercontent.com/KEVINCHEN625/dsh-provider-models/main/<providerId>.json`
- `https://cdn.jsdelivr.net/gh/KEVINCHEN625/dsh-provider-models@main/<providerId>.json`

`/backend-api/models?client_version=0.5.0` can authenticate and still return
an empty list. It reports session extras, not the catalog. Availability is
probed.

The Codex seed verified on 2026-09-23 is the nine models in the Codex client
catalog. Their context windows come from each models.dev entry:

`gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-reserve`, `gpt-5.6-sol`,
`gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `codex-auto-review`.

models.dev gives `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`,
`gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-5.5` a context of 1050000 and an
output of 128000. `gpt-5.3-codex` is 400000 / 128000. `gpt-5.3-codex-spark` is
128000 / 32000. `gpt-reserve` and `codex-auto-review` are absent from
models.dev, so their context stays unset. OpenCode Go records `gpt-5.6-luna`
at 1050000 from the same source.

`gpt-5.6-terra` and `gpt-5.6-luna` were also confirmed through the signed-in
channel. `gpt-5.3-codex` and `gpt-5.3-codex-spark` stay in the file with
`available: false` and no channel window, so the details page can still
recognize them. Their context and output numbers come from models.dev.

`scripts/diff-codex-catalog.mjs` diffs
`https://raw.githubusercontent.com/router-for-me/models/main/codex_client_models.json`
against the channel snapshot. A changed id is published only after
`scripts/probe-codex.mjs --confirm` accepts it. The probe reads the credential
field `access`, calls `https://chatgpt.com/backend-api/codex/responses` with
`stream: true`, and does not send `max_output_tokens`. A 400 whose body says
the model is missing is unavailable. HTTP 200 with the same response `model`
is available. HTTP 200
with a different response `model` is available and records `servedModel`.
Details then shows that the request was served by the other model.

## Route pinning

Settings `models` is the intersection: models.dev parameters for channel rows
with `available: true` and a complete spec. `gpt-reserve` and
`codex-auto-review` are written as `{ id, name }` only, because models.dev has
no spec for them and the pipeline marks them `pendingProbe`. An unavailable
row is not written.

Sign-in writes `llm-pi-ai` `providers.<id>` when the catalog has available
rows and the profile is missing, empty, or already marked with
`displayName` containing `(Provider Manager)`. Each available row with a
models.dev spec is written in full. An available row without a spec is written
as `{ id }` only. A profile with any other fields is left alone. Logout
removes a marked route. An existing `{}` is upgraded once the credential is
configured.

Details can activate an empty route on purpose, reset a route this plugin
pinned by deleting `models`, and refresh a pinned list when a newer channel
catalog arrives. Logout deletes the route only when this plugin owns it.
Ownership is `dsh-provider-manager.ownedOauthRoutes`.

The channel spelling stays `none`. Settings write the host key `off` with
wire value `"none"` (`reasoningEfforts.off = "none"`) only when `noneEnabled`
is true. On 2026-09-24 the echo succeeded for `gpt-6-sol`, `gpt-6-luna`,
`gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-5.5`. `gpt-6-astra`
returned HTTP 400 and said `none` is unsupported, so `noneEnabled` is false.
Models with no models.dev row stay `pendingProbe` and receive no invented
efforts. Writing `maxTokens` also becomes llm-pi-ai's per-request default.
That is host behavior. Resetting the route returns output sizing to the
installed catalog.

## Sign-in probe

The first sign-in probes at most 8 models, in seed order, skipping any model
still inside its 24 hour cooldown. Continue verification probes the next
batch. Results live in the `dsh-provider-manager` settings section (`probe`),
and a local row overrides the same remote id. 200 with a matching served
model is available. 200 with a different served model is available plus
`servedModel`. 400 or 404 is unavailable only when the body says the model
name is missing; any other 400 keeps the previous status. 401 or 403 stops
that provider's batch, marks the credential expired, and does not write
unavailable. A network failure keeps the previous status. No probe sends
`max_tokens`, `max_output_tokens`, or `max_completion_tokens`.

| Provider | Endpoint | Body |
| --- | --- | --- |
| openai-codex | `https://chatgpt.com/backend-api/codex/responses` | responses, `stream: true`, `reasoning.effort=low` |
| anthropic | `https://api.anthropic.com/v1/messages` | messages, `thinking.type=enabled` |
| kimi-coding | `https://api.kimi.com/coding/v1/messages` | messages, `thinking.type=enabled` |
| github-copilot | `https://api.individual.githubcopilot.com` | Claude ids use messages; other ids use `chat/completions` |
| xai | `https://api.x.ai/v1/responses` | responses, `reasoning.effort=low` |
| openrouter | `https://openrouter.ai/api/v1/chat/completions` | chat, no `reasoning.effort` |
| radius | none | no known catalog |

OpenRouter's published set is the free group (`cost.input == 0`), the 20
newest `release_date` values, and a fixed allowlist, capped at 50. models.dev
has no usage field. "Add from catalog" stores ids in the owned settings
section and merges them into the next managed write. Suggesting a registry
update is copy only; the plugin does not push one.

Anthropic ships 15 unverified rows, including `claude-opus-5-5`. GitHub
Copilot ships 32. Kimi merges `kimi-code-plan-global` over
`kimi-code-plan-cn`. xAI ships the five chat models that declare reasoning:
`grok-4.3`, `grok-4.5`, `grok-4.6`, `grok-4.7`, and
`grok-4.20-multi-agent-0309`. Imagine models and rows without reasoning are
left out. Radius has no file.
