# Implementation and deployment evidence

Automated tests use synthetic values, never real profile credentials. The initial local checks preceded deployment; controller deployment acceptance is recorded below. No real inference, account login or paid request was performed.

Public compile/runtime contracts: npm DSH service packages pinned to 0.1.5-rc.2; Cordis 4.0.2. This is not proof of arbitrary future version compatibility.

Raw outputs in `artifacts/`: A1-red.log (missing bundle), A2-red.log (missing Host implementation), A2-boundaries-red.log / green.log (readonly and ownership), advanced-red.log / green.log, http-missing-socket-red.log / green.log, http-real-red.log / green-2.log, lifecycle.log. Earlier failed attempts are retained. Basic HTTP cases were written after the initial handler implementation; this is a TDD process lapse, not claimed red-first coverage. Follow-up real HTTP timeout and missing-socket cases have observed failing counterexamples.

Real node:http tests verify completed body reads do not abort delayed resolve, slow unfinished bodies time out, and no-store applies. Real Cordis tests verify delayed DI, endpoint refusal, disposal and remount. Browser and isolated full DSH runtime validation were separate gates, subsequently exercised by the controller as recorded below.

This implementation agent did not self-approve Batch B or C. The controller subsequently performed isolated Web/headless integration and real profile deployment as recorded below. No claim that Muse subscription execution works.

Scope clarification confirmed by controller: remote discovery / models/apply are closed for this release. Manual model-list saves preserve existing per-model fields by ID. Route deletion is deferred (not part of the user's requested initial add/edit/key-management flow); no credentials are deleted automatically.

Independent review corrections: preserve explicitly authorized existing custom references on edits; abort-aware reveal ownership releases HTTP handlers even when the backing credential read never settles; cancel key writes before persistence begins when metadata read was in flight. Raw observed failures: `review-blockers-red.log`, `set-cancel-red-2.log`; corrected Host run: `host-review-fixed.log` (31 tests). Late rejected reads are consumed without unhandled rejection.

The first concurrently run full test suite exposed a test-fixture timing failure: the normal-body success test used a 50ms total deadline, allowing CPU contention to expire before parsing. The success fixture now uses 1000ms while retaining its delayed 10ms credential read; the separate slow-body deadline test remains 20ms. Production deadline remains 10 seconds. Original failure retained in `test-complete.log`, corrected run in `test-complete-2.log`.

Real-service integration caught a further rc.2 compatibility issue masked by the original fake carrier: Connection's getter-returned RPC closure used a Cordis shadow Context without access to the injected carrier, leaving the nested manager fiber failed and real requests falling through to 405. `src/host/index.ts` now uses public `Context.extend` on the same fiber to expose the already injected `webServer` to that public helper. No DSH core, third-party package, authentication policy or RPC envelope was replaced. Observed failure: `connection-stack-diagnostic.log`. Real published WebServer + Connection tests verify valid authenticated snapshot success, exact reveal precedence/no-store, auth denial, disposal/remount and carrier replacement in `connection-scoping-green-2.log`.

Release local gates: `release-typecheck.log`, `release-build.log`, `release-host-tests.log` (34 tests), `release-client-tests.log` (20 tests), `release-pack.log` (tarball extraction and actual browser closure factory evaluation). tsdown's advisory preference for ESM is expected: DSH's browser module loader requires this CJS closure-factory format. The browser artifact does not bundle React/Cordis and contains no node imports or original-home/source paths. This is local release validation, not a claim that the final tarball has passed the controller's separate full DSH runtime install or any real paid endpoint.


## Controller deployment acceptance and 0.1.1 copy correction

The controller accepted initial 0.1.0 real-profile deployment. Original source files were unchanged; the real settings hash was unchanged; versions and `lib/index.js` / `lib/client.js` hashes for all four existing provider plugins were unchanged. Observed real UI state: OpenCode Go 37 models, key configured; Command Code 71 models, default key missing; Local 3 models, credential reference unmanaged; Muse CLI not detected. These counts describe that acceptance snapshot, not fixed values in the product.

The isolated UI successfully added `pm-ui`, saved a synthetic key, revealed and hid it, and reloaded. Headless using the same isolated home and UI-saved configuration passed SSE and a real bash tool-output roundtrip; raw evidence is `artifacts/ui-saved-headless-*.log`. No real API generation or subscription/quota behavior was tested.

Real installation used `--workspace-root` within the profile's own workspace (`packages: [.]`) and `--ignore-scripts`; it did not target the original source workspace. The failed first attempt remains `artifacts/live-install.log`, and success is `artifacts/live-install-workspace.log`. The controller used `launchctl kickstart -k gui/501/com.harness.deepseek-harness` for the existing service. Private backup remains at `~/.dsh/provider-manager-backups/20260921-5w5yfcig`.

Version 0.1.1 corrects only the OpenCode Go native-page instructions, in host notice and English/Chinese UI copy, to Settings → LLM Providers → OpenCode Go. The package version and pack-gate target advance accordingly. No runtime behavior changed; 0.1.1 deployment is performed separately by the controller.

## 0.2.0 candidate — compact list and read-only quota (executor, not deployed)

Executor implemented the quota-ui plan in `/Users/kevinchen/Dev/dsh-provider-manager` only. `deepseek-harness` tracking files were unchanged (`git diff --exit-code`). The candidate was **not** installed into `~/.dsh` and the real service was not restarted. Old provider plugins were not uninstalled. This page being usable is not a claim that the manager can independently replace inference adapters.

Support matrix in this candidate:

| Surface | Overview | Query | Not done |
| --- | --- | --- | --- |
| OpenCode Go | Real key/read result | Official usage 5h/week/month | No routing or plan change; no generation |
| Command Code GOAT | Missing / source-unverified / windows | Official credits when default source is confirmable | No multi-account guess; no auth.json |
| Muse Code | CLI fact + subscription not connected | None | No fake bar; Meta API is not a subscription |
| Custom / unknown | Credential + models + unsupported | None | No arbitrary `/usage` |

Client never backfills previous windows on RPC or validation failure. Host cache identity includes HMAC(key), so a rotated key with the same bindingToken cannot reuse another account’s windows. Command `secrets` sidecar missing ⇒ source-unverified.

Commands (cwd manager, frozen lockfile). Evidence: `artifacts/quota-ui/20260921-exec/`.

| Command | Exit | Log |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 0 | `merge-frozen-lockfile.log` |
| `pnpm run typecheck` | 0 | `merge-typecheck.log`, `merge-typecheck-2.log` |
| `pnpm run test` | 0 | `merge-host-tests.log` / `merge-host-tests-2.log` (71) |
| `pnpm run test:client` | 0 | `merge-client-tests.log` / `merge-client-tests-2.log` (32) |
| `pnpm run format:check` | 0 | `merge-format-check.log` |
| `pnpm run build` | 0 | `merge-build.log`, `merge-build-2.log` |
| `pnpm run check:pack` | 0 | `merge-pack.log`, `merge-pack-2.log` |
| `git diff --check` | 0 | `merge-diff-check.log` |
| `git -C deepseek-harness diff --exit-code` | 0 | `merge-dsh-clean.log` |

Host red/green history retained: `h-red.log`, `h-green-1.log`, `h-green-2.log`. Client red history: `u-client.log`, `u-client-2.log`.

Candidate tarball (after README/acceptance update) is recorded in the executor delivery report with SHA256. `scripts/check-pack.mjs` reads the version from `package.json`. Immutable 0.1.1 hashed tarball was not overwritten.

Isolated Web: public `@deepseek-ai/dsh@0.1.5-rc.2` under `artifacts/quota-ui/20260921-exec/isolated/` with allowlisted env (no inherited API keys). Plugin add of the hashed tarball succeeded. Screenshots (synthetic data, not a real subscription): `ui-1280-overview.png`, `ui-768-overview.png`, `ui-dark-overview.png`, `ui-add-form.png`, `ui-details-key-saved.png`, `ui-375-wrap.png`. Compact list, add `pm-ui`, save synthetic key, reveal/hide without screenshot of the secret, details keyboard Enter, dark theme, and 375px two-row wrap were exercised. Muse shows CLI-not-detected and quota unsupported. Custom `pm-ui` shows quota unsupported. Isolated OpenCode/Command quota reads returned UNAVAILABLE (no managed default key in that HOME); that is not a fake 100% bar. Network audit: no remote icon URLs; client.js only includes the Muse docs `https://dev.meta.ai/docs/muse-code/subscriptions` link. Log: `isolate-plugin-add.log`, `isolate-network-audit.log`, `ui-375-overflow.log`.

Real official usage GET was **not** executed: process env had no OpenCode/Command keys, isolated HOME did not inherit them, `auth.json` was not read, and the real Web profile was not used. Command missing/unverified without network is covered by Host tests (`tests/quota.spec.ts`). 0/100/unknown/stale/expired-reset/no-backfill/key-rotation cases are covered by Host and client tests, not by a live subscription screenshot.

Rollback: keep installing `artifacts/dsh-provider-manager-0.1.1-73d7079b8678.tgz` until the controller accepts 0.2.0. Quota UI availability does not satisfy [provider-retirement.md](provider-retirement.md).

