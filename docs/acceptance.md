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
