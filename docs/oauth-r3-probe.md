# OAuth realm probe

Date: 2026-09-23. Isolated home: `/tmp/dsh-r3-home` (APFS clone of the Web
profile). Port 3097. The real `~/.dsh` profile was not modified for the probe.
Raw output is also in `artifacts/oauth-probe-a.txt` and
`artifacts/oauth-probe-b.json`.

## Probe A — required `inject: ["authorization"]`

Row `provider-manager-oauth` named `dsh-provider-manager/oauth`. Boot failed
before the plugin's `apply` ran:

```
dsh: plugin tree failed to load: dsh: 1 entry did not activate
dsh-provider-manager/oauth: pending (waiting for service: authorization)
```

The composed Web config has no row that mounts `@deepseek-ai/dsh-authorization`.
`llm-pi-ai` only calls `ctx.inject(['authorization'], ...)`, which is optional,
so that plugin stays active without the service. A required inject on the
external row does not become INACTIVE. `assertEntriesActivated` rejects the
whole process. Scheme A is not safe to ship.

## Probe B — mount the official service from this package

Same subpath row, `inject: ["credentials"]` only. `apply` saw
`ctx.get("authorization")` absent, then called
`ctx.plugin(AuthorizationService)`.

| Phase | authorization present | llm-pi-ai flows |
| --- | --- | --- |
| immediate | no, then the service was mounted | 0 |
| 2.5s later | yes | 39 |

The 39 keys are all `llm-pi-ai/<id>`, including `openai-codex`, `openrouter`,
`anthropic`, `kimi-coding`, `github-copilot`, and `xai`. No credential
payloads were written. The isolated process stayed up on port 3097.

Shipped shape: the oauth subpath mounts `AuthorizationService` when it is
absent, then registers `/provider-manager-oauth` from
`ctx.inject(["authorization", "connection", "webServer"])`. The nested
`webServer` inject is optional, so a headless profile does not leave the row
pending. The RPC owner is `scope.extend({ webServer: scope.webServer })`, the
same carrier the main plugin uses. Without that carrier, `connection.rpc.handle`
does not attach a browser route: the row is active, the client call fails, and
the OAuth tab shows the absent-service copy even though `list()` works.

## Probe B form (shipped)

This is not a cross-realm proxy and not a second package. `cordis.patch.yml`
inserts two rows from one tarball:

- `id: provider-manager`, `name: dsh-provider-manager` (main ledger, quota, custom API, built-in Go)
- `id: provider-manager-oauth`, `name: dsh-provider-manager/oauth`

The oauth entry's exported `inject` is only `["credentials"]`. `apply` calls
`ctx.plugin(AuthorizationService)` when that service is absent. Login RPC is
registered later from the nested, optional
`ctx.inject(["authorization", "connection", "webServer"], ...)`. The row does
not set `isolate`, so the mounted service is visible to `llm-pi-ai` in the
same tree. If the mount throws, the catch leaves the row quiet. If
`webServer` is absent, the nested inject never runs and the main row still
mounts. Updating either row is one `dsh plugin add` of the content-hashed
tarball; both entries come from that package.

## Decline chain (isolated, 0.2.11)

Markers in `artifacts/oauth-chain-markers.txt`. No URL, code, or token was
written there.

```
OAUTH_NOTIFY {"hasUrl":true,"hasCode":false}
OAUTH_PROMPT {"kind":"text"}
OAUTH_BEGIN {"serviceStatus":"cancelled","declinedFlag":true,"mapped":"declined"}
```

The page showed a `claude.ai` link, then Decline. The official service
settled `cancelled`; this plugin mapped that decline to session result
`declined`, and the page read "Sign-in declined." The login was not
finished, so no grant record was committed and the main snapshot could not
observe a configured change.

Real Web profile (`~/.dsh`, port 3080) after installing
`dsh-provider-manager-0.2.11-527df6c3686c.tgz` on Web and headless:

- Boot reached the local URL. The OAuth tab listed the llm-pi-ai cards
  (39 detail buttons), all "Not signed in". Screenshot:
  `artifacts/oauth-r3-real-cards.png`.
- Anthropic Sign in reached a `claude.ai` authorize link. Cancel returned
  "Sign-in cancelled." and "Not signed in". The login was not completed.
- `~/.dsh/.credentials.yaml` has no `llm-pi-ai/*` record, so a live remaining
  window was not requested.
- Launchd stdout and stderr contain none of the markers `sk-`, `eyJ`,
  `access_token`, `refresh_token`, or `Bearer `. Host and client test output
  (340 and 58 passed) match that.
- `node scripts/check-deploy-consistency.mjs` reported `sameArtifact: true`
  for `cordis.patch.yml`, `lib/client.js`, `lib/index.js`, `lib/oauth.js`,
  and `lib/quota-0E4Xaz5G.js`.

Isolated UI check after that fix (port 3097, then the process was stopped):

- OAuth tab listed the llm-pi-ai flows, including Anthropic, OpenAI Codex,
  OpenRouter, Kimi For Coding, GitHub Copilot, and xAI. Badges read
  "Not signed in".
- Anthropic Sign in reached a `claude.ai` authorize URL. Cancel returned to
  the Sign in button. The login was not completed.
- Disabling row `provider-manager-oauth` on the isolated profile patch left
  the process ready. The LLM cards (Command Code, OpenCode Go, Muse Code)
  still rendered. The OAuth tab read "This profile does not provide an
  authorization service." The isolated patch was restored afterward.
