# Built-in OpenCode Go (0.2.9 candidate)

Provider Manager registers `provider-manager-opencode-go` in Web and headless
DSH. The original `opencode-go` connection remains available and is labeled
“legacy plugin” in the manager. Duplicate-card retirement is gated on the nine
still-unverified official IDs. No installation step automatically changes the
default model, reasoning level, or stored session history.

The built-in route materializes the 31 models whose protocol is in the live Go
endpoint table. The other nine official IDs stay in the details table as
blocked rows. Limits, native effort/toggle/budget, and blocked reasons are in
[opencode-all-models-evidence.md](opencode-all-models-evidence.md) and
`src/host/opencode/models.json`.

## Install and choose

Use the reviewed local candidate tarball (not an unpublished registry version):

```sh
dsh plugin --profile web add --ignore-scripts /absolute/path/dsh-provider-manager-0.2.9.tgz
```

For a pnpm workspace profile, put `--workspace-root` before the tarball. Install
into each desired profile separately. Restart that profile after installation.
In Settings → Provider manager, open **OpenCode Go (Provider Manager)**, save
the OpenCode key, then choose its model in the DSH model selector. Both OpenCode
cards refer to `OPENCODE_API_KEY`; editing either updates both connections and
invalidates both quota caches. A read-only environment key remains read-only.

The new route uses only `https://opencode.ai/zen/go/v1` (Anthropic Messages
uses SDK base `https://opencode.ai/zen/go` so the path is
`/zen/go/v1/messages`). It has no configurable endpoint or discovery. It needs no third-party Go plugin, copied helper, source
checkout, or patch to DSH. Credentials and image attachments use DSH services;
no home-directory credential files are read by this implementation.

Per-model limits are the audited catalog, not a three-row excerpt. See the
Provider manager details table (exact integers) and
[opencode-all-models-evidence.md](opencode-all-models-evidence.md).

Metadata sources: [OpenCode Go](https://opencode.ai/docs/go/) and
[models.dev catalog](https://models.dev/api.json), checked 2026-09-23. These are
advertised limits, not full-limit stress-test results. Subscription requests
consume plan quota; zero token-cost placeholders in the mandatory pi-ai model
metadata do not mean requests are free or provide a billing estimate.

## Compatibility and verification

Built and tested against public DSH `0.1.5-rc.2` and exact pi-ai `0.85.1`.
The public `PiAiAdapter` owns prepared snapshots, credentials at streaming start,
attachments, timeout/retry metadata, and stream cancellation. Small package-owned
API wrappers add session headers and append the manager identity to DSH's
User-Agent. No global fetch patch is installed by production code.

Muse filtering affects only this route's two Muse models: remove encrypted
reasoning requests/history and function-call item IDs, keeping call IDs, outputs,
text, images and effort. DeepSeek keeps native reasoning; same-route/model/API
`reasoning` signatures become `reasoning_content` only in a cloned outgoing
context. Foreign adapters' replay metadata follows DSH ownership rules and may
degrade to neutral content. Hidden reasoning is never relabeled as visible text.
The old DeepSeek route already passed real tool continuations; this work does
not claim it had Muse's encrypted-content failure.

Offline tests exercise actual public adapter and runtime tool continuations,
native replay, model switches, headers, concurrent sessions, key rotation,
missing credentials/attachments, cancellation, quota identity and shared-key
invalidation, and headless mount/unload. The distribution check installs the
tarball plus declared registry dependencies into a temporary directory outside
the repository and, for the 0.2.9 catalog, runs 62 mock requests (31 enabled
models, two turns each) without an old Go plugin. The earlier 0.2.8 check was
three models and six requests. Tests do not call real models. Real deployment
and live model verification are separate controller acceptance steps.

## Update and rollback

Retain the prior tarball and deployment/config backup before replacing a version.
Use the unique candidate path without `--force`; forcing a reinstall can replace
other locally patched dependencies.
To roll back, reinstall the retained prior tarball, restore the previous default
provider selection if changed explicitly, and restart the affected profile.
The legacy Go plugin and its existing compatibility patch are untouched; they
can continue serving their old route. Do not rewrite all session histories.

The integration imports public MIT-licensed DSH and pi-ai packages. It does not
vendor the third-party OpenCode Go plugin or its private adapter implementation.
