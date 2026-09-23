# OpenCode Go Muse Responses compatibility

This opt-in local workaround targets `dsh-llm-opencode-go` **0.1.28** with its nested `@earendil-works/pi-ai` **0.85.1**. It installs only into an explicitly supplied plugin directory. It does not change the manager UI, DSH source, persisted conversations, credentials, or fetch implementation.

The exact model allowlist is `muse-spark-1.2-contributor` and `muse-spark-1.3-contributor`, with `provider: opencode-go` and `api: openai-responses`. Unknown IDs and other providers/APIs pass through unchanged. Model 1.2 is covered by the pure sanitizer test; the full offline wire tests use 1.3. No claim of live model 1.2 validation is made.

The wrapper runs the existing `onPayload` callback first and awaits it. An undefined return keeps in-place callback mutations; any replacement is sanitized afterward. It removes only:

- `reasoning.encrypted_content` entries in `include`;
- whole `input` items whose type is `reasoning`;
- `id` from `input` items whose type is `function_call` (retaining `call_id`, `name`, `arguments` and other fields).

It preserves `reasoning.effort`, including `xhigh`, other payload fields, images/text, headers, options and session affinity. Both `stream` and `streamSimple` synchronously return the original EventStream including `.result()`. Received thinking signatures and stored history remain intact. Callback failures follow the existing pi-ai error-stream path.

Upstream context: [oh-my-pi PR #11931](https://github.com/can1357/oh-my-pi/pull/11931). This package does not assume the upstream change has shipped or apply it globally.

## Commands

Run from the manager package directory. Default mode and `--check`/`--dry-run` are read-only. Select one profile at a time:

```sh
node scripts/apply-opencode-go-muse-compat.mjs --plugin-root "$HOME/.dsh/profiles/web/node_modules/dsh-llm-opencode-go"
node scripts/apply-opencode-go-muse-compat.mjs --plugin-root "$HOME/.dsh/profiles/headless/node_modules/dsh-llm-opencode-go" --check
```

After the check reports `applicable`, explicit installation:

```sh
node scripts/apply-opencode-go-muse-compat.mjs --plugin-root "$HOME/.dsh/profiles/web/node_modules/dsh-llm-opencode-go" --apply
node scripts/apply-opencode-go-muse-compat.mjs --plugin-root "$HOME/.dsh/profiles/web/node_modules/dsh-llm-opencode-go" --check
```

Use the analogous headless path when that profile is approved for installation. Each profile is a separate operation; there is no cross-profile transaction. The script neither restarts services nor performs API requests. Coordinate profile reload/restart separately: an already loaded module retains its existing code until reloaded.

Rollback:

```sh
node scripts/apply-opencode-go-muse-compat.mjs --plugin-root "$HOME/.dsh/profiles/web/node_modules/dsh-llm-opencode-go" --rollback
```

Repeated apply/check/rollback is safe for the same helper. Rollback requires intact manifest, backup and helper snapshot, an unchanged patched/original plugin and recorded permissions. It refuses to overwrite later edits. Check and rollback validate the snapshot named in the manifest even when the manager source helper has changed. Installing a different helper is deliberately refused: first rollback, then archive the old manifest and backup outside the plugin's `lib` directory before a separately reviewed reinstall. Preserve those archives; do not discard evidence.

## Installation gates and retained evidence

Only these original SHA-256 hashes are accepted, including each profile's existing absolute `mountConnectionRpc` shim:

| Baseline | SHA-256                                                            |
| -------- | ------------------------------------------------------------------ |
| web      | `de7e75e4e78d4ab21354967507125787f0a3816ee6b54b9af5b4c81b174c8915` |
| headless | `08fa9d021bb07de5847ce5541ab652babef33d442886ddea1c00118530a6be42` |

These are machine-specific audited baselines, not universal upstream package hashes. A different machine, plugin upgrade, nested pi-ai upgrade or local edit requires a new review; do not extend the allowlist just to bypass a rejection. The script also requires exactly one Responses API factory anchor. It leaves the RPC shim untouched.

The script writes a hash-named `lib/muse-compat-<sha256>.mjs` helper snapshot (mode 0444), `lib/.muse-compat-original.js` (original file permissions), and `lib/.muse-compat-manifest.json` (mode 0600, original/patched/helper hashes and original permissions). The patched import points to this local snapshot, never to the mutable manager source. Check verifies the deployed plugin, backup and snapshot against the manifest. Rollback retains all artifacts for audit and future verification.

Writes use temporary files, fsync and atomic rename, preserving other hard links to the original inode. Symlinks in controlled paths are rejected. An exclusive lock serializes cooperating apply/rollback invocations. Do not concurrently upgrade or externally edit the same plugin directory. A crash during preparation can leave orphan artifacts or a lock; inspect and archive the evidence before manual recovery. The script fails closed rather than deleting an uncertain backup. This is an operational integrity gate, not protection against a malicious process with write access to the installation.

## Offline verification

Tests use the actual locally installed pi-ai and a local mock fetch returning synthetic Responses SSE; they do not contact a gateway. They fail when required local dependencies are missing (no silent skip). The fixture reader can recover the verified original from an already patched installation. The factory test copies the plugin to a temporary directory and patches only that copy.

```sh
pnpm test:muse-compat
# Or run subsets:
node --test tests/muse-compat.node.mjs tests/muse-compat-patcher.node.mjs
TSX_TSCONFIG_PATH=../deepseek-harness/tsconfig.json node --import ../deepseek-harness/node_modules/tsx/dist/esm/index.mjs --test tests/muse-compat-wire.node.mjs
pnpm typecheck
pnpm exec prettier --check compat scripts/apply-opencode-go-muse-compat.mjs tests/muse-compat*.mjs docs/muse-compat.md package.json
```

The wire test defaults to the web installation under `$HOME/.dsh`; `MUSE_COMPAT_PLUGIN_ROOT` overrides it. The patcher fixtures verify both local web and headless baselines. The factory test needs the local DSH checkout's TSX loader and tsconfig because the audited RPC shim references DSH TypeScript. No settings file or real credential is needed.

Evidence is retained under `artifacts/muse-compat/`, including intentional red tests and intermediate fixture failures. Scope: sanitizer/wrapper semantics, full pi-ai two-turn tool wire path, patched factory copy, strict installation/rollback gates, targeted formatting and project typecheck. This executor did not install into real profiles, restart DSH, run live API requests, or run the full UI suite.

The dedicated `*.node.mjs` names keep these Node test suites out of the default Vitest collection.
