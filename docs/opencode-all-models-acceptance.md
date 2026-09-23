# OpenCode Go all-models acceptance (0.2.9 candidate)

This is an executor report, not controller approval.

## Code complete (offline)

- Catalog freeze: 40 official IDs, 31 enabled, 9 `blocked-with-evidence`,
  `ox-alpha-free` excluded. See
  [opencode-all-models-evidence.md](opencode-all-models-evidence.md).
- Single source: `src/host/opencode/models.json` + `catalog-schema.ts`.
  `scripts/sync-opencode-catalog.mjs` writes candidate diffs only (`--apply`
  required to overwrite).
- Completions, Responses, and Anthropic Messages factories. Anthropic base URL
  is `https://opencode.ai/zen/go` so the SDK path is exactly
  `/zen/go/v1/messages`.
- Muse sanitizer remains Muse-only. `reasoning` → `reasoning_content` clone
  applies to catalog replay-field Completions models, not all Responses.
- Host DTO → protocol → client validation → details table. Exact integers, not
  rounded 1M. Blocked rows remain visible.
- Dual OpenCode cards are unchanged. Legacy management RPC is not retired.

## Offline tests

Recorded 2026-09-23, candidate **0.2.9**, not deployed:

- `pnpm typecheck`: pass
- `pnpm test`: 17 files, **305** tests pass
- `pnpm test:client`: 4 files, **58** tests pass
- `pnpm build`: pass
- `pnpm check:pack:opencode`: fresh tarball outside the repo, 31 enabled models,
  62 mock requests, headless mount/unload, no third-party Go plugin, no real network
- `prettier --check src tests scripts`: the existing 7-file baseline still fails
  (`FilterTabs.tsx`, `OAuthCard.tsx`, `OAuthDetails.tsx`, `ProviderManager.tsx`,
  `login.ts`, `login.spec.ts`, `oauth.spec.ts`). Files touched for this catalog
  pass Prettier.

Tarball: `artifacts/go-integrated/dsh-provider-manager-0.2.9-d8a309a2e69c9cf8ad00bdc7c5315ccd3d0c3ff5b96c9f35cc4c29a9e27dc815.tgz`  
SHA256: `d8a309a2e69c9cf8ad00bdc7c5315ccd3d0c3ff5b96c9f35cc4c29a9e27dc815`

Per-id wire coverage is offline only: every enabled ID and every non-null
thinking level, plus blocked IDs failing before fetch. Mock SSE is not live
compatibility.

## Live / deploy

- Parameter recheck at 2026-09-23T06:15:22Z: every configured model's protocol,
  context, output, independent input limit, and reasoning controls match the
  live Go endpoint table and models.dev `opencode-go`. MiMo-V2.6-Pro and
  MiMo-V2.6-Flash advertised input is text/image/audio/video.
- Installed 2026-09-23 into both real Web and headless profiles from the
  immutable tarball above. Web service restarted and is listening. Settings
  SHA256 stayed `ed04f12b0fd3bee414ba74ba1541d65fd2f5c23a78e1535a232c09477b8402d2`.
  Default remains `provider-manager-opencode-go` / `muse-spark-1.3-contributor`.
- No paid full-catalog live sweep was run.
- Rollback: reinstall retained 0.2.8 tarball
  `3d57fb850455325b6435132252806a8375b4d4173592d9e2790d6bc689f911dc`.
  Profile backup: `~/.dsh/provider-manager-backups/2026-09-23T06-17-42Z-go-0.2.9`.

## Remaining blocks

1. Nine protocol-unverified official IDs stay in the catalog as
   `blocked-with-evidence` and are not callable. See
   [opencode-all-models-evidence.md](opencode-all-models-evidence.md).
2. Independent input-limit enforcement is not implemented. `hy3` (192,000) and
   `gpt-5.6-luna` (922,000) are displayed with `inputLimitEnforced: false`.
   No verified tokenizer is bundled; character/4 rejection was not used.
3. Qwen 3.8 `budget_tokens` is displayed. DSH levels follow native effort via
   adaptive thinking, not a numeric budget control.
4. Qwen 3.6/3.7 DSH levels are local budget presets (1024/2048/8192/16384),
   labeled as such. They are not official effort names.
5. Single-card retirement is not enabled. The legacy management card and RPC
   remain. The plan forbids that switch while protocol gaps are open.
6. pi-ai 0.85.1 Anthropic calls `client.beta.messages`. This route strips
   `?beta=true` and sends no `anthropic-beta` feature list, because Go docs
   do not document those headers. Auth for Messages is the SDK `x-api-key`.
   Completions and Responses use `Authorization: Bearer`.

## Default model

Unchanged: callers that already selected built-in Muse Spark 1.3 Contributor /
xhigh keep that selection. This package does not rewrite defaults.
