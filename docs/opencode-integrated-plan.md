# Provider Manager built-in OpenCode Go implementation plan

Date: 2026-09-22. Role split: controller plans/verifies/deploys; designated executor
implements; independent reviewer checks architecture and implementation. Preserve
the existing uncommitted Muse workaround and its evidence.

## Goal and design

Ship an independent OpenCode Go inference connection with Provider Manager,
without editing DSH or another plugin's files. Register a new route and settings
namespace `provider-manager-opencode-go`, displayed as OpenCode Go (Provider
Manager). Keep the old route available. Install does not change default model or
persistently rewrite old sessions. New users need only a key and model selection.

First release has exactly three built-in models: Muse Spark 1.2 Contributor,
Muse Spark 1.3 Contributor, DeepSeek V4.1 Flash. This is not a claim that every Go
model is supported. No discovery, arbitrary endpoint, full third-party provider
replacement, OAuth change or automatic package patching in this batch.

Use public `PiAiAdapter` and `ResolvedPiAiProviderProfile`, with a package-owned
pi-ai provider and local API factories. Pin pi-ai 0.85.1 and test against DSH
0.1.5-rc.2. Models and provider identities must consistently use the new route.
The fixed inference endpoint is `https://opencode.ai/zen/go/v1`.
Credentials resolve via DSH's credentials service and default OPENCODE_API_KEY;
never read user files inside the distributable package.

Local API wrappers take session ID from the actual stream options, and add
`x-opencode-session` plus truthful client identification while retaining DSH
attribution headers. Verify that this boundary receives the session ID; if it
does not, stop for design correction. Do not use process-wide mutable headers,
global fetch patches, or unsupported mutation of DSH request middleware.

Muse Responses removes encrypted reasoning requests/history and function-call
item IDs, preserving call IDs, tool outputs, text/images and effort. Implement a
typed equivalent for the new route; preserve the prior compatibility helper and
deployed snapshots unchanged. DeepSeek stays Chat Completions with explicit
DeepSeek thinking and `reasoning_content` replay, never Muse's filtering. Native
replay crossing adapters/models obeys the host's public ownership rules.

Evidence: the old DeepSeek route already passed a real two-request tool test
(`artifacts/go-integrated-audit/deepseek-baseline-live.json`); do not describe it as
a reproduced encrypted-content failure. Official Go docs identify Chat
Completions. models.dev/api.json currently lists DeepSeek context 1,000,000,
output 384,000, low/high/max; Muse context 1,048,576, output 131,072,
minimal/low/medium/high/xhigh. Advertise only supported text/image modalities.
Record metadata source/date and avoid claiming a full-limit live stress test or
that subscription requests are free. Upstream reasoning-only empty-output reports
are not solved by relabeling hidden reasoning as a user-facing answer.

## Files and dependency order

1. `package.json`, `pnpm-lock.yaml`: version 0.2.8 candidate; exact pi-ai runtime
   dependency, required public DSH/schema peer and dev dependencies. No dependency
   on dsh-llm-opencode-go, user's HOME or a source checkout at runtime. Keep old
   diagnostic scripts for historical compatibility; new test/build paths portable.
2. `src/host/opencode/catalog.ts`: closed three-model catalog, reasoning levels,
   accurate model limits, fixed endpoint and route constants.
3. `src/host/opencode/profile.ts` and `adapter.ts`: protocol-specific API wrappers,
   session headers, public PiAiAdapter setup, credentials/auth and image attachment
   resolution. Preserve abort, result/event stream identity, retry/idle behavior
   and prepared call snapshots. Prefer minimal public composition, not copied
   private adapter internals. Unknown models fail clearly.
4. `src/host/opencode/index.ts`, `src/host/index.ts`: install namespace/defaults and
   register the lane outside Web-only injection. Dispose registration on plugin
   unload/HMR. Fixed endpoint/ref simplify binding; no secrets in metadata.
5. `src/host/providers.ts`, relevant shared DTO/client/locales/icon files: add new
   fixed provider card, credential binding/reveal, reserved route and OpenCode
   icon/quota handling. Label old versus built-in route visibly; each quota
   binding/cache includes its own identity/revision. No automatic default switch.
6. `tests/opencode-*.spec.ts`, relevant manager/client tests: tests before code,
   preserve red outputs. New tests depend on declared packages, not live profiles.
7. `scripts/check-pack.mjs` or a separate portable distribution check: build and
   install tarball in a fresh fixture without the third-party Go plugin, load the
   public factory/host entry, register/use the adapter against a mock endpoint.
   Ensure runtime artifact contains no machine paths and client bundle no server
   credentials or Node dependencies.
8. README/README.zh, `docs/opencode-integrated.md`, applicable third-party notices:
   install/key/model-selection/update/rollback instructions, supported model and
   host versions, test scope. Attribution if code is copied; prefer small original
   wrappers over vendoring the third-party plugin.

## Tests and acceptance

- Pure policy and actual mock wire: Muse old encrypted history removed; tool
  call/result IDs remain paired; image/text/effort remain; non-Muse untouched.
- DeepSeek thinking enabled and requested high/max preserved, reasoning_content
  on tool continuation including empty/missing history cases. Do not expose hidden
  thinking as final text when content is empty.
- Actual adapter paths: stream and prepareCall, two concurrent sessions, stable
  fallback scoped per call when no session is supplied, attribution/header
  precedence, abort/consumer close propagation and no extra wrapper lifecycle.
- Current/foreign replay, Muse↔DeepSeek tool IDs and old adapter→new adapter;
  unknown model, missing key, image attachment absence, settings/credential update
  between requests. No unrelated payload mutations.
- New/old cards and key editing/reveal, quota allowlist and revision/binding
  isolation, standalone startup with no Go plugin in Web and headless contexts.
- Host tests, affected client tests, typecheck, format, build, tarball fixture.
  Do not silently skip a missing public dependency or compatibility failure.
- Controller live verification uses only synthetic prompts and actual configured
  credentials: Muse xhigh and DeepSeek high/max tool continuations; fresh Web
  session and headless plus model switch, after backing up real deployment.

## Deployment and rollback

Executor does not touch real ~/.dsh, restart services or publish. Controller
reviews code, then installs the immutable candidate tarball into both profiles
with backups, preserves old adapters, and tests the new lane. For this user's
requested integration, switch only the existing default Muse model's provider
to the new lane after successful tests, preserving model and xhigh. Do not rewrite
all session histories. Rollback restores prior manager/default-selection state;
retain the already working old OpenCode plugin patch.

Stop on a required DSH/private-API change, unsupported public package contract,
unexpected credential destination, wider model migration, or a design-changing
failure. Routine failing tests and scoped fixes remain executor work. No public
publish, messages to maintainers, or old provider uninstall in this batch.

## Independent review gate — accepted corrections

Architecture reviewer approved the public interfaces with these mandatory
implementation constraints; they are part of the execution plan:

1. pi-ai 0.85.1 only aliases `reasoning` to `reasoning_content` for its literal
   `opencode-go` provider. On our new route, the DeepSeek wrapper must clone
   same-route/same-model/same-API assistant history and normalize only a native
   `thinkingSignature: "reasoning"` to `"reasoning_content"`. Preserve the source
   history. Configure DeepSeek thinkingFormat, supportsReasoningEffort,
   requiresReasoningContentOnAssistantMessages and requiresThinkingAsText=false.
   Exercise actual delta.reasoning → DSH replay → nonempty reasoning_content
   continuation, plus direct reasoning_content responses. Empty-field padding
   alone does not preserve native reasoning.
2. Old adapter→new adapter replay degrades to neutral content under host ownership
   rules. Tests expect text/tool-pair integrity, not lossless native signatures;
   never relabel a foreign provider to recover stripped replay. Prepared calls
   reuse PiAiAdapter's captured profile. A credential resolves when streaming
   begins against that profile, not at prepareCall time.
3. Replace every quota provider ternary with a single explicit definition/map.
   Adding the new provider to an allowlist must never cause an OpenCode key to
   reach Command's URL. Test exact usage URL, kind, source, no redirects,
   independent identity/revision binding and shared-key cache invalidation. Tell
   users that both OpenCode cards reference the same key, so editing one updates
   both connections.
4. The distribution fixture lives outside the repository and installs only the
   tarball plus declared registry dependencies. Import the host from that root,
   without an old Go plugin or Web services, and register/run mock tool
   continuations. The existing browser factory check alone is insufficient.
   Do not add a configurable production endpoint solely to make tests easier.
