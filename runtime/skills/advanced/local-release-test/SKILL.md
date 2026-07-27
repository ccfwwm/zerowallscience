---
name: local-release-test
description: Use the repository-local GitHub Actions release workflow to publish prerelease test builds from development branches without touching the official InternScience/InternAgents release repository.
---

# Local Release Test

Use this skill when a developer asks to create, run, monitor, or explain the repository-local release testing workflow for InternAgentS desktop builds.

The goal is to let different developers publish test releases from different branches in `qzzqzzb/InternAgents` without overwriting official releases or each other's test builds.

## Release Model

- Official releases are triggered by pushing tags like `v0.1.5` to `InternScience/InternAgents`.
- Official releases run and publish in `InternScience/InternAgents` using that repository's built-in `GITHUB_TOKEN`.
- Local test releases are triggered manually with `workflow_dispatch`.
- Local test releases publish to the current repository, normally `qzzqzzb/InternAgents`.
- Local test releases require `secrets.INTERNAGENTS_LOCAL_RELEASE_TOKEN`.
- Local test releases are marked as GitHub prereleases, so they do not replace the repository's latest stable release.
- Package-only builds are triggered manually with `workflow_dispatch` in `InternScience/InternAgents`.
- Package-only builds run in `InternScience/InternAgents` and upload workflow artifacts only; they do not create or update GitHub Releases.

The workflow generates test tags automatically:

```text
v<base_version>-test.<safe_branch_name>.<utc_timestamp>
```

Example:

```text
v0.1.5-test.zhf-local-release-for-test.20260603.192500
```

The timestamp is UTC in `yyyyMMdd.HHmmss` format. Branch separators and unsafe characters are normalized to hyphens.

The workflow intentionally does not define a custom GitHub Actions `run-name`; GitHub uses the default workflow run display. The final GitHub Release tag and title include the branch timestamp and are the source of truth for test release identity.

## Before Running

1. Confirm the developer branch has been pushed to GitHub.
2. Confirm `.github/workflows/release.yml` on the default branch includes `workflow_dispatch`. If this workflow support is still only in a PR branch, merge that support first before relying on manual dispatch.
3. Confirm the branch includes the code that should be packaged.
4. Choose a `base_version`, usually the next version being tested, such as `0.1.5`.
5. Confirm repository secret `INTERNAGENTS_LOCAL_RELEASE_TOKEN` exists and can write Contents to `qzzqzzb/InternAgents`.

## Trigger From GitHub UI

1. Open `qzzqzzb/InternAgents` on GitHub.
2. Go to `Actions`.
3. Select the `Release` workflow.
4. Click `Run workflow`.
5. Select the development branch to package.
6. Set `base_version`.
7. Optionally set `release_notes`.
8. Start the workflow.

## Trigger With GitHub CLI

Use `gh` when it is available and authenticated:

```powershell
gh workflow run release.yml `
  --repo qzzqzzb/InternAgents `
  --ref <branch-name> `
  -f base_version=0.1.5 `
  -f release_notes="Testing <short summary>"
```

Then monitor the run:

```powershell
gh run list --repo qzzqzzb/InternAgents --workflow release.yml --limit 5
gh run watch --repo qzzqzzb/InternAgents <run-id>
```

If `gh` is not installed, use the GitHub connector or GitHub web UI to inspect workflow runs.

## Expected Artifacts

The workflow should publish a prerelease in `qzzqzzb/InternAgents` with:

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows x64 NSIS installer
- remote backend CLI tarball: `internagents-backend-cli.tar.gz`

The release notes include:

- generated test release tag
- desktop version used for packaging
- source branch and commit
- exact `INTERNAGENTS_UPDATE_API_URL` for testing app updates against that prerelease
- exact `INTERNAGENTS_REMOTE_BACKEND_UPDATE_API_URL` for testing remote backend CLI release sync against that prerelease

## Official Package-Only Builds

Use the package-only workflow when the developer wants
`InternScience/InternAgents` to run the build but does not want to publish a
GitHub Release.

Trigger the workflow manually and point it at the source ref to package:

```powershell
gh workflow run package.yml `
  --repo InternScience/InternAgents `
  -f source_repository=qzzqzzb/InternAgents `
  -f source_ref=main `
  -f desktop_version=0.1.5
```

Then monitor the run:

```powershell
gh run list --repo InternScience/InternAgents --workflow package.yml --limit 5
gh run watch --repo InternScience/InternAgents <run-id>
```

Expected workflow artifacts:

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows x64 NSIS installer
- remote backend CLI tarball: `internagents-backend-cli.tar.gz`

The workflow does not create or edit a GitHub Release. Pushing a package tag
is not part of this flow; for a private source repository, configure
`INTERNAGENTS_SOURCE_TOKEN` in `InternScience/InternAgents` with read access to
that source repository. This workflow does not update the
`InternScience/InternAgents` `main` branch.

## Testing App Updates Against A Test Release

Because local test releases are prereleases, clients should use the exact release API URL from the release notes rather than relying on `/releases/latest`.

Set this in `.env` when testing update checks locally:

```text
INTERNAGENTS_UPDATE_API_URL=https://api.github.com/repos/qzzqzzb/InternAgents/releases/tags/<generated-test-tag>
INTERNAGENTS_REMOTE_BACKEND_UPDATE_API_URL=https://api.github.com/repos/qzzqzzb/InternAgents/releases/tags/<generated-test-tag>
```

For example:

```text
INTERNAGENTS_UPDATE_API_URL=https://api.github.com/repos/qzzqzzb/InternAgents/releases/tags/v0.1.5-test.zhf-local-release-for-test.20260603.192500
INTERNAGENTS_REMOTE_BACKEND_UPDATE_API_URL=https://api.github.com/repos/qzzqzzb/InternAgents/releases/tags/v0.1.5-test.zhf-local-release-for-test.20260603.192500
```

Restart the app/backend after changing `.env` so the update endpoint reads the new value.

The same generated release API URL can be used for desktop update checks and remote backend release sync for the selected test build.

## Safety Rules

- Do not push or overwrite official `v*.*.*` tags for test-only builds.
- Do not fall back to `GITHUB_TOKEN` for local release publishing; the workflow expects `INTERNAGENTS_LOCAL_RELEASE_TOKEN`.
- Keep local test releases as prereleases unless the developer explicitly asks for a stable release flow change.
- Prefer creating a fresh test release per run; branch-and-timestamp tags are designed to make that cheap and collision-free.
- Do not reintroduce a custom workflow `run-name` unless it has been validated with GitHub Actions expression rules.

## Troubleshooting

- If the workflow is not shown in the GitHub UI, check that the workflow file with `workflow_dispatch` has been merged to the default branch.
- If the run fails before build jobs start, inspect the `Prepare release metadata` job first.
- If release publishing fails with permission errors during a test release, confirm `INTERNAGENTS_LOCAL_RELEASE_TOKEN` is set as an Actions secret, is scoped to `qzzqzzb/InternAgents`, and has repository Contents read/write permission. Also confirm the `release` job has `contents: write`.
- If the app does not see a test release, use `INTERNAGENTS_UPDATE_API_URL` with the exact generated tag URL.
- If an official tag run tries to publish to the development repository, stop and inspect metadata outputs before rerunning.
