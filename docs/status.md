# Current status

Controller review + commit (2026-09-23, `4d1bb7c`): workspace reviewed end to end
(gates green: host 346 / client 59 / typecheck / build / pack; no secrets in
source, tests, or the published registry) and committed. Committed in `4d1bb7c`:
the R3.3 channel-catalog system plus the root-cause record below.

## Root cause on record: "OAuth unavailable" (corrected)

The earlier diagnosis of a loader **realm boundary was wrong**. The actual
cause: `@deepseek-ai/dsh-authorization` is a Cordis Service that **no official
patch row ever mounts**. llm-pi-ai's `ctx.inject(['authorization'], …)` is a
lazy callback — its plugin body loads fine while the flow registration stays
pending forever, so `ctx.get('authorization')` returned undefined because the
service instance never existed. The fix (shipped on the `provider-manager-oauth`
row) mounts the official service via `ctx.plugin(AuthorizationService)` and
tolerates double-mount errors; this also activates llm-pi-ai's 39 login flows
themselves — an upstream harness gap this plugin closes. Do not re-trace the
realm theory when investigating service visibility; start from "is anything
mounting this service?".

Executor (2026-09-24): **0.3.2** registers a client `configForms` service
when the 0.1.5 host only provides `settingsScope`. Pet and Skin Center
inject `configForms`, and web boot fails closed while those entries stay
pending. The shim reads and writes through `settingsScope`. Installed
artifact: `dsh-provider-manager-0.3.2-5f99539f14b1.tgz`
(`5f99539f14b1ded79dbbdce712577b857d0312d8e290d8c61e590e1ab1f41fe1`).

Executor (2026-09-24): channel probes of `reasoning.effort=none` echoed on
`gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-5.5`
(HTTP 200, served model matched, effort echoed `none`). `gpt-6-astra` returned
HTTP 400: `none` is unsupported. The injection pipeline keeps `none` for the
echoed ids via local `noneEnabled`. The published registry still stores only
channel availability. `name` and `efforts` are read from models.dev at
runtime. `pendingProbe` is computed inside the pipeline when an id has no
models.dev spec; it is not a registry field. Local install for review is
**0.3.3** `dsh-provider-manager-0.3.3-e8f76e7bb363.tgz`
(`e8f76e7bb3631f4f7e4285cbb60cfee2ab5cd51ad7375f43acfaeebbc09b8c5d`),
which also embeds the vendor marks that simple-icons does not ship. The
recorded 0.3.2 artifact is unchanged.

Executor (2026-09-24): **0.4.0** maps channel `none` to host key `off`
(`reasoningEfforts.off = "none"`), adds the three-state catalog, sign-in
probes, and the Muse Spark 1.1/1.2 rows. Gates: typecheck, host 365, client
59, build. Artifact
`dsh-provider-manager-0.4.0-664a895a3f1b.tgz`
(`664a895a3f1bd7ca725fd05cd7a6af0f21c571c215167d09f9f5c61ef45fe1aa`),
both profiles, `sameArtifact: true`. Host tests passed 10/10.
Registry: https://github.com/KEVINCHEN625/dsh-provider-models/pull/1

Executor (2026-09-24): **0.3.1** injects models.dev names and reasoning
efforts. `none` stays out until a channel probe sets `noneEnabled`. Models
with no models.dev row keep a normalized name. `pendingProbe` is computed
by the pipeline and is not stored in the registry.
Installed artifact: `dsh-provider-manager-0.3.1-1a81e1e554ce.tgz`
(`1a81e1e554ce98edc8ce23a5be3193b03b51cb83ceba46fa7f20659c2649ab76`).
`gpt-6-sol` has `noneEnabled` after the channel echoed `reasoning.effort=none`.

Executor (2026-09-24): **0.3.0** injects a managed selector after sign-in,
adds an unofficial Muse device-code route, and embeds brand marks. Claude,
Kimi, and Copilot candidate lists are the installed client catalog crossed
with models.dev on 2026-09-24. They are not injected until a confirmed probe
passes. Installed artifact:
`dsh-provider-manager-0.3.0-33a565c1d235.tgz`
(`33a565c1d235c35d5ffd897f644acdf88f09c2988ce7aeeff0a56751d3720b7b`),
same file on web and headless.

Executor (2026-09-23): **0.2.14 splits the OAuth catalog.** Model parameters
come from models.dev. Channel availability stays in
<https://github.com/KEVINCHEN625/dsh-provider-models>. The Codex seed is the
nine client-catalog models, verified 2026-09-23. Each model's context comes
from its own models.dev entry.
`gpt-5.3-codex` remains listed and unavailable. No background timer. Sign-in
writes a route only when that provider key is absent. Shipped artifact
`dsh-provider-manager-0.2.14-9dccad6703cb.tgz`, SHA-256
`9dccad6703cb05e695a78f52c86664a88ee43c25cd616fa9065920179aade337`,
installed on web and headless. See [oauth-catalog.md](oauth-catalog.md).

Known open item (2026-09-23, controller): models.dev vs the CLIProxyAPI
channel catalog disagree on the Codex context window (1.05M vs 272K). We
ship the models.dev figure (matches the OpenCode Go catalog); if very long
sessions ever fail on the channel, check this split first.

Planning handoff (2026-09-23): user requested a plan for another executor to
cover all OpenCode Go models and then remove the duplicate legacy card from
Provider Manager. See [execution plan](opencode-all-models-plan.md),
[40-ID source matrix](opencode-all-models-2026-09-23/matrix.md), and
[forwardable executor prompt](execute-opencode-all-models.md). This planning
turn changed documentation only; installed 0.2.8, provider cards, source runtime,
credentials and service state remain unchanged. Protocol/metadata gaps are
explicit checkpoint-A work, not verified implementation claims.

Latest controller acceptance (2026-09-22): **0.2.8 is deployed to real Web and
headless**, with an independent built-in OpenCode Go route for Muse 1.2/1.3 and
DeepSeek V4.1 Flash. Real Muse 1.3 and DeepSeek tool continuations passed;
default is built-in Muse 1.3/xhigh. Key and DSH source are unchanged, old provider
plugins remain. Final tarball, tests (Host 141, Client 57), retained formatting
baseline failure and rollback are recorded in
[opencode-integrated-acceptance.md](opencode-integrated-acceptance.md).
Source changes are not committed or publicly published.

## Historical checkpoints (superseded by the latest acceptance above)

Controller review of candidate 0.2.0 / `36acde0`: **not accepted for deployment**. Confirmed synthetic counterexamples concern full-operation cancellation, old-account stale quota after a key change, and secret reappearance when switching details. See [review-0.2.0-36acde0.md](review-0.2.0-36acde0.md) and the bounded [R1 execution prompt](execute-quota-ui-r1.md). The installed Web version remains 0.1.1; no old provider was removed and no real quota request was performed in this review.

Executor candidate (2026-09-21): compact quota UI batch implemented in-tree as **0.2.0**. Host-only OpenCode/Command readers and the compact list are in the candidate tarball. This is **not** deployed to `~/.dsh`, does **not** restart the real service, and does **not** uninstall old inference plugins. Controller acceptance remains required. See [acceptance.md](acceptance.md) and artifacts under `artifacts/quota-ui/20260921-exec/`.

Planning handoff (2026-09-21): user requested a complete execution plan for another EXECUTOR, not implementation in this turn. The compact icon/quota overview and detail-page increment is specified in [quota-ui-plan.md](quota-ui-plan.md), with a copy-ready dispatch in [execute-quota-ui.md](execute-quota-ui.md). Independent plan review and the external-key cache correction are recorded there. No quota/UI product changes, deployment, or removals were performed in this planning turn.


User follow-up (2026-09-21): authorized retiring the old third-party provider plugins only after the self-maintained replacement independently passes compatibility tests. Current 0.1.1 still consumes their inference adapters, so removal is not yet allowed by that condition. Replacement scope and gates are recorded in [provider-retirement.md](provider-retirement.md). No old provider package was removed.

Controller update (2026-09-21): version 0.1.1 is deployed to the real Web profile after isolated browser and same-home headless validation. Existing user settings and provider artifacts remain unchanged. See [deployment.md](deployment.md) for final evidence and the still-unconnected Muse Code subscription boundary. The executor-only checkpoint below records the earlier handoff, not a deployment blocker.

Implementation, isolated Web/headless integration and the initial 0.1.0 real-profile deployment were accepted by the controller. The 0.1.1 candidate corrects only the OpenCode Go navigation copy to Settings → LLM Providers → OpenCode Go; its deployment remains with the controller. After review fixes, 34 Host/pack tests and 20 client tests passed. Evidence: `artifacts/release-host-tests.log`, `artifacts/release-client-tests.log`. Separate Host/Client TypeScript checks and tsdown build passed (`artifacts/release-typecheck.log`, `artifacts/release-build.log`). Tarball factory verification is recorded in `artifacts/release-pack.log` when packaged.

The real-service compatibility fix uses public Context.extend to expose the already injected WebServer to Connection's shadow-context RPC getter on the same lifecycle fiber. This was validated with actual published Cordis, WebServer and Connection services, including carrier replacement and authentication denial. Earlier fake-carrier tests missed the problem; their original evidence remains preserved.

The manager uses published 0.1.5-rc.2 packages in its own node_modules. No runtime imports point into the original source checkout or real user profile. Settings writes and key writes are separate, not claimed transactional.

Known scope: Muse CLI executable presence only; no CLI login or bridge. Command Code default credential reference only. Manual custom model entry and existing catalog reread only; remote authenticated discovery intentionally disabled.

Controller acceptance of 0.1.0: the real page shows OpenCode Go with 37 models and a configured key; Command Code with 71 models and the default key missing; Local with 3 models and an unmanaged reference; Muse CLI not detected. The original source tree was not modified, the real settings hash was unchanged, and versions plus host/client hashes of all four existing provider plugins were unchanged.

In the isolated UI, adding `pm-ui`, saving a synthetic key, reveal/hide, and reload all succeeded. Configuration saved in the UI was then consumed by headless under the same isolated home: SSE and a real bash tool-result roundtrip passed (`artifacts/ui-saved-headless-*.log`). This does not verify real paid API generation or package quota behavior; neither was tested.

Real installation required `--workspace-root` for the profile's own workspace (`packages: [.]`), not the source checkout, plus `--ignore-scripts`. The first failed attempt remains in `artifacts/live-install.log`; the successful attempt is `artifacts/live-install-workspace.log`. The controller restarted only the existing service with `launchctl kickstart -k gui/501/com.harness.deepseek-harness`. Private backup: `~/.dsh/provider-manager-backups/20260921-5w5yfcig`. The executor did not deploy or restart the real service.
