# Built-in OpenCode Go acceptance — 2026-09-22

## Accepted and deployed

Version 0.2.8 is installed in both real Web and headless profiles. The final
immutable tarball is:

`artifacts/go-integrated/dsh-provider-manager-0.2.8-3d57fb850455325b6435132252806a8375b4d4173592d9e2790d6bc689f911dc.tgz`

SHA-256: `3d57fb850455325b6435132252806a8375b4d4173592d9e2790d6bc689f911dc`.
Both installed host entries match
`a304f94a4d2faa3c41cfaaf41f472d7aef3b255f89b168dfa8847104b84b79b3`.
The Web launchd service was restarted. The user's default is now
`provider-manager-opencode-go/muse-spark-1.3-contributor`, effort `xhigh`.
No credentials were changed. The original Go and Command plugin entry hashes
match the deployment backup, and DSH tracked source has no diff.

The built-in connection needs no old Go plugin and does not modify its files.
The old plugins remain for rollback and models outside this three-model release.
The previous machine-specific Muse patch also remains intact. Nothing was
published to npm/GitHub or committed by this task; the tarball is distributable.

## Diagnosis and live results

- Original Go DeepSeek V4.1 Flash used Chat Completions, not Muse's Responses
  path. Its real high-effort two-request tool continuation passed, with
  reasoning_content and paired tool IDs; no encrypted_content was sent. Actual
  Web Max use after Muse history also passed. We did not reproduce Muse's failure
  on DeepSeek, nor claim every possible DeepSeek gateway error is solved.
- The new built-in factory completed real Muse 1.3/xhigh and DeepSeek/max tool
  continuations. Muse did not request/replay encrypted reasoning; DeepSeek sent
  thinking enabled and preserved reasoning_content. Evidence is in
  `artifacts/go-integrated-audit/builtin-*-candidate.json`.
- Real Web: old route → built-in Muse/xhigh → built-in DeepSeek/max, with bash
  tool roundtrips and exact expected final markers. The stored test session has
  five completed turns and ten steps, including earlier baseline turns.
- Final package: real headless Muse/xhigh returned `builtin-final-headless-ok`;
  real headless DeepSeek/max returned `builtin-deepseek-headless-ok`. Both exited
  zero and their durable records contain an actual bash tool call/result.
- Web Provider Manager displayed the built-in card, local icon, configured key,
  three models and official five-hour/weekly/monthly quota. No key was revealed.
- Final Web menus explicitly omit unsupported Off. Muse exposes
  minimal/low/medium/high/xhigh; DeepSeek exposes low/high/max, plus the host's
  separate Default selection. Default Muse/xhigh was restored after testing.

Durable summaries: `artifacts/go-integrated-audit/final-live-sessions.json`.
Live Web Muse was tested before the final two-line Off metadata correction;
the final package was then tested with Web DeepSeek and headless both models.
The unchanged explicit xhigh/max request paths, exact public model metadata and
final menu state were verified. No full-context or live image stress test was run.

## Automated and independent checks

- Final Host suite: **141/141** after the Off correction.
- Client suite: **57/57**, with unchanged client bytes after that correction.
- Independent targeted review before correction: 22/22; corrected targeted suite
  25/25, plus independent public-metadata subset 9/9.
- Typecheck, build, browser factory and changed-file formatting passed.
- Same final tarball installed in a fresh directory outside the repository using
  registry dependencies: three models, six mock requests, headless registration
  and disposal, no third-party Go plugin, exact effort sets.
- Full-repository formatting remains failed on ten pre-existing unmodified files.
  HEAD baseline failure and all earlier failed attempts are preserved. It is not
  reported as an all-green formatting run.

Original logs: `artifacts/go-integrated/`; controller deployment/live logs:
`artifacts/go-integrated-audit/`. The initial local headless install reported old
peer-version conflicts; actual supported source-launched headless calls passed.
The clean registry fixture with declared dependencies also passed. This is not
an assertion of compatibility with arbitrary older DSH hosts.

## Recovery and release scope

Private deployment backup:
`~/.dsh/provider-manager-backups/2026-09-22T03-50-05-039Z-go-integrated/`.
It includes the actual previously installed 0.2.6 manager as a rollback tarball,
profile manifests/locks, settings and original plugin entries. This is important
because the old Web manifest referenced a 0.2.3 filename despite installed 0.2.6.

Only Muse Spark 1.2/1.3 Contributor and DeepSeek V4.1 Flash are in the built-in
catalog; Muse 1.2 has offline, not live, verification. Public host validation is
DSH 0.1.5-rc.2 with pi-ai 0.85.1. Future host/model changes require regression
testing; do not advertise universal future compatibility. Users choose the
built-in connection explicitly; package installation itself never migrates
their defaults or stored sessions. Installation/selection/update/rollback steps
are in [opencode-integrated.md](./opencode-integrated.md).
