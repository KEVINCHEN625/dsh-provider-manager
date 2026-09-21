# DSH Provider Manager

Independent Cordis bundle for DSH 0.1.5-rc.2. Adds **Provider manager** to Web settings; existing adapters continue executing all model requests. This package does not replace OpenCode Go, Command Code, or other inference plugins.

- Compact list: local SVG icons, name, key status, model count, read-only quota, reset time, refresh, and details. Keys, model catalogs, and advanced settings live in details. “Add provider” opens the new-provider form.
- OpenCode Go: official GET `https://opencode.ai/zen/go/v1/usage` from the Host only (5h / weekly / monthly). No runtime import of the old plugin.
- Command Code GOAT: official GET `https://api.commandcode.ai/alpha/billing/credits` only when the default credential source is confirmable. Ambiguous multi-account or literal-key setups show source-unverified. Does not read `auth.json`.
- Custom API and unknown endpoints: quota lookup is unsupported. Muse Code shows CLI detection facts and that DSH subscription execution is not connected. The UI never invents 100% remaining or treats pay-as-you-go as a subscription.
- Custom API: create/edit `llm-pi-ai` providers using an explicit protocol and manually entered model IDs. Saves only selected fields with revision checks.

Install only after isolated validation and controller acceptance: `dsh plugin --profile web add --workspace-root /absolute/path/dsh-provider-manager-0.2.0.tgz --ignore-scripts`. Do not treat a successful manager install as permission to uninstall old providers.

`pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`, `pnpm run test:client`, `pnpm run format:check`, `pnpm run check:pack`.

Key and configuration writes are independent operations. A successful key write remains successful if configuration later conflicts; reread metadata before retrying. Configuration refresh never changes the default model. Quota reread after a key save does not change a successful key result. The client never backfills a previous account’s windows when a request or decode fails.

Reveal requires an authenticated same-origin POST from a real loopback socket; reverse proxies and tunnels are deliberately unsupported. Keys are excluded from snapshots and RPC responses. Keys shown on explicit request clear on hide, navigation, focus loss, connection change, details close, and timeout.

Command Code manages the default reference only. Literal overrides, account routing and official login fallback remain owned by the original plugin. This manager does not read `auth.json` or promise a default reference supplies every request.

Composition-only `authorizedExistingRefs` may authorize a specific provider/reference pair. Do not expose it through editable settings. Custom references are derived from the exact route; prefix resemblance does not confer authorization.

See [upgrade](docs/upgrade.md) and [acceptance](docs/acceptance.md) for boundaries and evidence.
