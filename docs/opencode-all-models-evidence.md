# OpenCode Go all-models evidence (execution 2026-09-23)

Candidate: **0.2.9**. Freeze directory:
`docs/opencode-all-models-2026-09-23/execution-2026-09-23/`.
Original planning snapshots under
`docs/opencode-all-models-2026-09-23/` were not overwritten.

## Authorized this turn

- Public catalog/docs fetches, offline TDD/pack, local profile install, and
  git push were authorized for the 2026-09-23 recheck.
- Not authorized: unpaid live model sweeps, npm publish, or DSH source edits.

## Sources (refreshed)

| Source | URL | SHA256 |
| --- | --- | --- |
| Official ID list | `GET https://opencode.ai/zen/go/v1/models` | recheck `f9d73c2852e94c67dc745d92caeaba34bf71ae5bcf7e4a21db2cd833c74125ad` (same 40 IDs; `created` refreshed) |
| Go docs (endpoint table) | `https://opencode.ai/docs/go/` | `f04f9a2c1d5ec68a6f486191acfee796e879f9b8266b7beb9de59f9437d6486d` |
| models.dev `opencode-go` extract | `https://models.dev/api.json` | recheck extract `9f9b5b628be47228725756b7ed320f0922f8f3a97ed17d59a2efef4374d32887` |

Rechecked 2026-09-23T06:15:22Z against the live ID list, the Go endpoint table, and models.dev `opencode-go`. Official GET still returns **40 IDs**, the same set as the planning snapshot. Protocol, context, output, independent input limit, and reasoning controls for every configured model match those sources. The only metadata change since the morning freeze is MiMo-V2.6-Pro and MiMo-V2.6-Flash: advertised input is now text, image, audio, and video. models.dev no longer lists pdf for those two. SDK input remains text and image.

Live docs endpoint table still documents **31** protocols. models.dev Go
directory has **39** models; `ox-alpha-free` remains metadata-only and is
excluded. `deepseek-flash` and `hy3-preview` remain without Go metadata.

Protocol source of truth is the live Go endpoint table, not models.dev, not
Zen, not stale v2/dev docs, and not name-prefix guesses.

## Disposition

| Disposition | Count | IDs |
| --- | ---: | --- |
| supported | 31 | every ID in the live endpoint table |
| blocked-with-evidence | 9 | `kimi-k2.5`, `glm-5`, `deepseek-flash`, `qwen3.5-plus`, `mimo-v2-pro`, `mimo-v2-omni`, `hy3-preview`, `grok-4.5`, `omen-alpha` |
| confirmed-alias | 0 | none; `deepseek-flash`/`hy3-preview` are **not** aliases of `deepseek-v4.1-flash`/`hy3` |
| officially-retired | 0 | models.dev `deprecated` is not official retirement |
| excluded | 1 | `ox-alpha-free` |

Blocked IDs stay in `models.json` and the details table. They are not in
`GO_MODELS` and cannot be called.

## Conflicts and design blocks

- Independent `inputLimit` exists for `hy3` (192,000) and `gpt-5.6-luna`
  (922,000). No verified public tokenizer is available in this plugin, so the
  numbers are displayed and **not enforced**. Character/4 heuristics were not
  used. This is `inputLimitEnforced: false`, not a completed capability.
- Qwen 3.6/3.7 expose toggle + `budget_tokens` without official
  low/medium/high. DSH levels are labeled **local budget presets**
  (1024/2048/8192/16384), never the advertised max (e.g. 262,144).
- Qwen 3.8 has native effort, so Anthropic `forceAdaptiveThinking` is used;
  budget max is shown and not mapped onto DSH efforts.
- MiniMax M3 toggle-on uses Anthropic `thinking.type=enabled` with the SDK
  floor `budget_tokens=1024` because Messages has no toggle field. DSH High is
  a host mapping, not an official effort name.
- Video/pdf/audio appear in advertised modalities; SDK `Model.input` is only
  `text`/`image`.
- Single-card retirement is **not** enabled: nine protocol-unverified IDs
  remain. Dual cards and the legacy `opencode-go` management RPC stay.

## Live calls

No additional paid model calls were made. Existing 0.2.8 Muse 1.3 / DeepSeek
live evidence is unchanged and is not a full-catalog live PASS.

Installed tarball: `artifacts/go-integrated/dsh-provider-manager-0.2.9-d8a309a2e69c9cf8ad00bdc7c5315ccd3d0c3ff5b96c9f35cc4c29a9e27dc815.tgz`,
SHA256 `d8a309a2e69c9cf8ad00bdc7c5315ccd3d0c3ff5b96c9f35cc4c29a9e27dc815`.
Web and headless profiles are on 0.2.9. No full-catalog live model sweep was run.
Machine-readable per-id catalog: `src/host/opencode/models.json`.
