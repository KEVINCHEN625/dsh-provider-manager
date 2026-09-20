# Upgrade and removal

Baseline: `installation-baseline.json` records existing package hashes and the known OpenCode local patch. It is evidence, not a full recovery backup. This package neither updates those packages nor rewrites their files.

1. Build with the committed lockfile and retain test output and tarball.
2. Validate the candidate in an independent profile/runtime, synthetic credentials only. A second DSH_HOME pointing to mutable source is insufficient isolation.
3. Independently approve real-profile installation and any necessary targeted restart. Do not perform paid requests or CLI login as an installation side effect.
4. Record actual package versions, hashes, launch paths and default route/model/reasoning before and after deployment. Preserve existing dirty files and sessions.

For removal, consult `dsh plugin --help` for the installed version, remove only the `dsh-provider-manager` bundle/package via the public CLI, and restart only the affected process if required. Do not remove credentials, model configuration or sessions. Restore a private profile backup only after reviewing its scope; rolling back executable code does not guarantee old versions can read newer sessions.

The first release intentionally does not perform authenticated remote model discovery. Catalog reread and manually entered models avoid unreviewed redirect forwarding of stored keys.

In the isolated rc.2 Web runtime, adding the bundle succeeded but the running process did not load its new entry until a targeted restart. Treat CLI installation success and live plugin activation as separate checks; do not restart unrelated DSH profiles.
