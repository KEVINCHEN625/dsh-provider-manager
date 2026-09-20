# DSH Provider Manager

Independent Cordis bundle for DSH 0.1.5-rc.2. Adds **Provider 管理** to Web settings; existing adapters continue executing all model requests.

- OpenCode Go and Command Code GOAT: reference status, replacement key, explicit local-only reveal and catalog reread.
- Custom API: create/edit `llm-pi-ai` providers using an explicit protocol and manually entered model IDs. Saves only selected fields with revision checks.
- Muse Code: executable-presence detection and CLI subscription documentation. No DSH subscription execution, login, Meta API fallback or spending.

Install only after isolated validation: `dsh plugin --profile web add /absolute/path/dsh-provider-manager-0.1.0.tgz`.

`pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`, `pnpm run test:client`, `pnpm run check:pack`.

Key and configuration writes are independent operations. A successful key write remains successful if configuration later conflicts; reread metadata before retrying. Configuration refresh never changes the default model.

Reveal requires an authenticated same-origin POST from a real loopback socket; reverse proxies and tunnels are deliberately unsupported. Keys are excluded from snapshots and RPC responses. Keys shown on explicit request clear on hide, navigation, focus loss, connection change and timeout.

Command Code manages the default reference only. Literal overrides, account routing and official login fallback remain owned by the original plugin. This manager does not read `auth.json` or promise a default reference supplies every request.

Composition-only `authorizedExistingRefs` may authorize a specific provider/reference pair. Do not expose it through editable settings. Custom references are derived from the exact route; prefix resemblance does not confer authorization.

See [upgrade](docs/upgrade.md) and [acceptance](docs/acceptance.md) for boundaries and evidence.
