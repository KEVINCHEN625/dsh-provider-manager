# Muse compatibility acceptance — 2026-09-22

## Result

The local OpenCode Go Muse compatibility patch is installed in both Web and
headless profiles. The Web launchd service was restarted successfully. DSH
tracked source, settings.yaml, credentials, and the default
`opencode-go/muse-spark-1.3-contributor` / `xhigh` selection are unchanged.
No provider was uninstalled. These changes are not committed or published.

The failure concerns replay of native encrypted reasoning. Local wire capture
confirmed the installed pi-ai requested and replayed that content. The narrowly
scoped workaround removes those wire items and function-call item IDs while
preserving call IDs, results and current-turn reasoning effort. It does not edit
stored conversation history. Exact gateway caller-pool mechanics were not proved.

## Verified evidence

- Independent design/code review; targeted offline suite: 12/12, including an
  additional successful run after deployment (`artifacts/muse-compat-audit/post-deployment-tests.log`).
- Typecheck, targeted formatting and package content checks passed; full UI suite
  was not rerun. Executor raw evidence is under `artifacts/muse-compat/`.
- Candidate and deployed Web plugin factory each completed two real Responses
  requests: Muse 1.3 Contributor, xhigh, synthetic tool call, matching result and
  final `muse-compat-ok`. Final request captures showed no encrypted reasoning
  request/replay and no function-call item ID, with session headers retained.
  Evidence: `artifacts/muse-compat-audit/candidate-live-auto.json` and
  `artifacts/muse-compat-audit/deployed-live.json`.
- Actual `dsh --profile headless` in an empty temporary workspace completed a
  bash `printf muse-compat-ok` tool roundtrip and exited 0.
- The same persisted test session was then opened in Web and continued through
  the real UI, completing bash `printf muse-web-compat-ok` and returning that
  marker. The UI displayed Muse 1.3 Contributor / Xhigh, two turns and four steps.
  Evidence: `artifacts/muse-compat-audit/web-headless-session-summary.json`.
- Settings and credential file hashes match their pre-deployment baseline;
  `git -C ../deepseek-harness diff --exit-code` passed.

An initial diagnostic request used a named tool choice and failed because this
gateway accepts only `auto`. That probe failure is preserved as
`artifacts/muse-compat-audit/candidate-live.json`; the diagnostic was corrected to
the normal automatic choice. No product tool-choice behavior was changed.
Real checks consumed API quota; zero cost values in the plugin's model catalog
are not evidence of free requests.

## Boundaries and maintenance

Live validation is for Muse Spark 1.3 Contributor, not every model or arbitrary
long-running session. Muse 1.2 has only offline sanitizer coverage. New model IDs
are deliberately not auto-enabled. Hidden reasoning history is not replayed;
current-turn xhigh remains active.

This is a version-checked patch to the external inference plugin, not a complete
independent replacement provider. A DSH-only update does not directly edit this
external file, but plugin reinstall/upgrade can remove the patch and new host
versions still require compatibility testing. Run the check after updates;
unknown versions/hashes stop for review. Installation and safe rollback commands
are in [muse-compat.md](./muse-compat.md). Backups and a hash-bound helper snapshot
remain beside each patched plugin. Do not remove old inference plugins on the
basis of this fix.
