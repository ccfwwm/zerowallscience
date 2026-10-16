# Sidebar compatibility for 8.3.0

The 8.3.0 catalog selects `dsh-better-sidebar@0.26.1-zws.3`. The earlier audit is recorded in `docs/verification-three-plugin-upgrade-20261014.md`.

Compared with parent HEAD `8cfe6f15531a4b4e404759338a15146ea6cb2bf1` at `packages/dsh/dsh-better-sidebar`, the current `plugins/dsh-better-sidebar` source has no content changes except `package.json` (normalizing checkout CRLF to LF). Host, Client, public service types, patches and tests are unchanged. The new resource identity accompanies the flat directory migration and preserves the audited API.

`config/integrations/plugin-compatibility.json` therefore retains the exact audited consumer allowlist and previous range, and updates only its tested dependency version to `0.26.1-zws.3`. It does not permit arbitrary future dependency versions or consumers. Reused tarball bytes and `packageDependencies` remain immutable; only signed catalog compatibility metadata may extend the audited edge.

Validation: `node --test tools/release/plugin-compatibility.test.mjs tests/contracts/runtime-contract.test.mjs tests/contracts/better-sidebar-inject.test.mjs`. Full catalog generation also verifies every selected dependency edge before signing the resource catalogs. Packaging and runtime acceptance receipts are recorded under `artifacts/verification/8.3.0/`.
