# OAuth quota evidence

Date: 2026-09-23. Reference package: `dsh-coding-subscription-oauth@0.8.5`
(Apache-2.0), read only for protocol shape. The implementation in this repo
is separate.

## Confirmed and implemented

| Provider id | Endpoint | How the remaining window is derived |
| --- | --- | --- |
| `openai-codex` | `GET https://chatgpt.com/backend-api/wham/usage` | `rate_limit.primary_window` / `secondary_window` `used_percent` and `limit_window_seconds`. 18000 seconds is the 5-hour window; 604800 seconds is the weekly window. `reset_at` is epoch seconds. The request sends `chatgpt-account-id`, taken only from the access token JWT claim `https://api.openai.com/auth` → `chatgpt_account_id`. The reference package names this URL and header. |
| `openrouter` | `GET https://openrouter.ai/api/v1/credits` | `data.total_credits` and `data.total_usage`. Remaining percent is `round((total - used) / total * 100)` when `total > 0`. The window id is `credits`. Official credits API: https://openrouter.ai/docs/api/reference/credits/get-credits |

Both requests use only the access credential. 401 and 403 become "Sign-in expired. Sign in again." The plugin does not refresh the token.

## Confirmed absent from V1

`dsh-coding-subscription-oauth@0.8.5` contains the Codex usage client and no
Claude, Kimi, xAI, or Copilot usage URL. This plugin does not invent a
percent for those ids. A signed-in card whose id is not in the adapter table
shows "配额不受支持" / "Quota is not supported".

| Provider id | Result |
| --- | --- |
| `anthropic` | No usage URL in the reference package. Unsupported. |
| `kimi-coding` | No usage URL in the reference package. Unsupported. |
| `xai` | No usage URL in the reference package. Unsupported. |
| `github-copilot` | No usage URL in the reference package. Unsupported. |

## Credential fields

pi-ai stores an OAuth grant as `{ type: "oauth", access, refresh, expires }`.
The quota reader accepts `access_token`, `apiKey`, and `access` (pi-ai's
access-token field). An api-key record uses the seam's `key`. `refresh`,
`refresh_token`, `expires`, and every other field are not read. The snapshot
stores a SHA-256 of the record as `bindingToken`, never the token.
