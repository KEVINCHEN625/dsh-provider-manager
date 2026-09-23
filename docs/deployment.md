# Deployment

Pack the plugin, then install that one tarball into every profile.

```bash
pnpm check:pack
```

`check:pack` writes `artifacts/dsh-provider-manager-<version>-<hash>.tgz`.
`<hash>` is the first 12 hex characters of the SHA-256 of the tarball bytes.
A renamed copy with different bytes fails `scripts/check-pack.mjs`.

Install the same file into Web and headless:

```bash
dsh plugin --profile web add -w /absolute/path/dsh-provider-manager-<version>-<hash>.tgz
dsh plugin --profile headless add -w /absolute/path/dsh-provider-manager-<version>-<hash>.tgz
node scripts/check-deploy-consistency.mjs
```

Use an absolute path. A relative `artifacts/...tgz` is resolved as a Git
dependency, and omitting `-w` makes pnpm try to add the package at the
workspace root.

The consistency script refuses the pair unless `lib/**/*.js` and
`cordis.patch.yml` in both installed packages match the tarball. Restart Web
with the existing singleton (`launchctl kickstart -k gui/$(id -u)/com.harness.deepseek-harness`).
Do not start a second listener on port 3080.

After install, Provider Manager's OAuth tab lists llm-pi-ai sign-in cards.
If the `provider-manager-oauth` row is disabled, that tab says the profile
does not provide an authorization service and the other tabs keep working.
