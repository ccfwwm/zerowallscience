# Release procedure

## Prepare

1. Choose a version that reflects the compatibility impact. Changing the
   supported host baseline warrants a minor version while the plugin is `0.x`.
2. Update `package.json`, both overviews and their installation refs, the
   changelog date, compatibility notes, and release notes.
3. Run `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm run check`,
   and `pnpm peers check`. Review the package contents and documentation links.
4. Commit all intended release files and ensure the target tree is clean apart
   from explicitly unrelated local artifacts.

## Publish to GitHub

Push the release commit to `main` and retain the implementation branch.
Wait for every required CI job on that exact commit to succeed. Create a
`vX.Y.Z` tag at that commit; do not move an already-published tag. Pack from
that checkout:

```sh
pnpm pack --pack-destination <artifact-directory>
```

Inspect the tarball to ensure compiled entry points, declarations, the bundle
patch, license and documentation are included. Generate a SHA-256 checksum
for the tarball. Create a GitHub Release targeting the verified tag and attach
the package archive and checksum. Describe the required host version, behavior
changes, upgrade steps, test results and known limitations.

Verify the public release URL, tag target, asset names, sizes, and downloaded
asset checksums. GitHub supplies separate source archives automatically.
Do not claim npm availability unless a separate registry publication succeeded.

## Rollback and correction

Do not silently replace a released tag or archive. Publish a corrective version
and explain the affected behavior. If a release is unusable, mark the notes
clearly and direct users to a known-working host/plugin pair. Session backups
and host storage migrations follow the [migration guide](migration.md).
