# Current status

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
