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

Real Web profile (`~/.dsh`, port 3080) after installing
`dsh-provider-manager-0.2.10-4098cd09b303.tgz` on Web and headless:

- Boot reached the local URL. The OAuth tab listed the same llm-pi-ai cards,
  all "Not signed in".
- OpenAI Codex Sign in reached the public device-login page. Cancel returned
  the card to "Not signed in". The login was not completed.
- `~/.dsh/.credentials.yaml` has no `llm-pi-ai/*` record, so a live remaining
  window was not requested.
- Launchd stdout and stderr contain none of the markers `access_token`,
  `refresh_token`, or `Bearer `.
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
