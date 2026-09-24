# OAuth model catalogs

Model parameters and channel availability are separate data. Shipping a plugin
build is not required to change either one. There is no background timer. A
fetch runs when an OAuth details page opens or a sign-in succeeds, and only
when `oauthCatalogTtlMs` (default 24 hours) has elapsed. A failed fetch keeps
the built-in snapshot for that layer.

## Parameters: models.dev

`contextWindow`, `maxTokens`, efforts, input, and cost come from
[models.dev](https://models.dev/api.json). The plugin ships an OpenAI excerpt
at `src/host/oauth-catalogs/models-dev-openai.json`. Refresh tries:

1. `https://models.dev/api.json`
2. `https://cdn.jsdelivr.net/npm/@opencode-ai/models@0.0.66/dist/snapshot.js`

`anomalyco/models.dev` stores TOML, not the generated `api.json`, so the
second copy is the published SDK snapshot on jsDelivr. Responses larger than
8MB, or any document containing `access_token`, `refresh_token`, `sk-`, or a
JWT prefix, are rejected. Codex OAuth reads the `openai` provider in that file.

## Availability: dsh-provider-models

The only custom dataset is which subscription models are actually enabled.
Repository: <https://github.com/KEVINCHEN625/dsh-provider-models>

`<providerId>.json` is `{ providerId, models: [{ id, available, verifiedAt, servedModel?, contextWindow? }] }`.
That file stores channel availability only. `name` and `efforts` are not registry
fields: the injection pipeline reads them from the models.dev spec at runtime.
`pendingProbe` is also not a registry field. The pipeline sets it when an
available id has no models.dev spec, and then the selector row is `{ id, name }`
with the fallback display name. A channel `contextWindow` is
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
`stream: true`, and does not send `max_output_tokens`. HTTP 400 is
unavailable. HTTP 200 with the same response `model` is available. HTTP 200
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

`none` is injected as `reasoningEfforts.none = "none"` only after a channel
probe of `reasoning.effort = "none"` returns HTTP 200 and the stream echoes
that effort. The pipeline records that result as `noneEnabled` on its local
Codex seed. `noneEnabled` is not a published registry field. On 2026-09-24
the echo succeeded for `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`,
`gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-5.5`. `gpt-6-astra` returned HTTP
400 and said `none` is unsupported, so it stays without `none`. Models with
no models.dev row stay `pendingProbe` and receive no invented efforts.
Writing `maxTokens` also becomes llm-pi-ai's per-request default. That is host
behavior. Resetting the route returns output sizing to the installed catalog.
