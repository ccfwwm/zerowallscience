---
description: "Prepare a Windows x64 unsigned test installer, run focused regression checks, accept real cloud flows, and retain delivery evidence."
---

# Package and test ZeroWall on Windows

English | [中文](windows-delivery.zh.md)

## Summary

Use this procedure to produce and qualify a Windows x64 test installer. Automated checks cover different layers from installation and real cloud calls. The delivery owner must complete the manual checklist on the actual package before reporting an accepted build. Signing, uploading a release, and promoting a stable resource catalog are separate operations.

## Table of Contents

- [1. Prepare and check](#preflight)
- [2. Run focused regression checks](#automated-tests)
- [3. Build the unsigned installer](#package)
- [4. Accept the actual installed package](#manual-acceptance)
- [5. Retain evidence and publish deliberately](#record)
- [Dev Note](#dev-note)

-----

<a id="preflight"></a>

## 1. Prepare and check

Run from `zerowallscience-newui`. Read [the packaging guide](../../../apps/desktop/packaging/README.md) and [Windows signing requirements](../../../apps/desktop/windows-signing/README.md) first. Install Node, the pinned pnpm, Git, PowerShell 7, tar, Python, Visual C++ Build Tools, and Windows SDK. Keep secrets outside tracked files. The unsigned path does not require a signing certificate.

Agree on the complete build version before starting a real package run. Follow the owning guide's base-version, Shanghai-date, and sequence rules, checking existing local and published records. The value below is a preflight example, not a reserved release number; replace it with the confirmed value for packaging.

```powershell
pnpm install --frozen-lockfile
$buildVersion = '0.2.2-alpha.2.20261104.1'
pnpm --dir apps/desktop run package:win:x64:unsigned --check --build-version $buildVersion
```

A successful preflight reports valid local configuration and toolchain. It does not download, build, sign, install, or prove that a cloud service works. Finish dependency installation before running checks or packaging.

<a id="automated-tests"></a>

## 2. Run focused regression checks

Select tests by the changed owner. The following desktop command exercises startup and installer packaging behavior; it does not run a real Windows installation or call a model.

```powershell
pnpm run test apps/desktop/tests/main-startup.spec.ts apps/desktop/tests/installer-packaging.spec.ts apps/desktop/tests/windows-directory-installer.spec.ts
```

For plugin changes, run `npm run check` and `npm run test:package` in each affected canonical plugin directory. For native installer changes, the Windows maintainer runs the following separate UI suite; it creates test installers and isolated test locations.

```powershell
pnpm --dir apps/desktop run test:installer --language zh_CN
```

| Change | Additional evidence |
|---|---|
| TypeScript, public exports, runtime dependencies | `build:artifacts` followed by `build:check`, or `build`; packed consumer and affected runtime smoke. |
| Documentation | `pnpm run test:docs`, `pnpm run doc-sync`, `pnpm run lint`, and `git diff --check`. |
| Model-visible behavior | Owning keyless recorded-session test; live provider check when authorized credentials are available. |
| UI behavior | Owning component/browser expected output and actual desktop screenshots; use the repository browser-picker overlay for Web automation. |
| Installer, icons, animation | Native UI suite, light/dark and display scaling, reduced-animation preference, install and uninstall checks. |

Use [testing policy](../../testing.md) for suite selection and [pre-push checks](../../../.agents/skills/dsh-pre-push-checks/SKILL.md) before publishing commits. A missing API key or a skipped suite is not a pass. DSH real-API tests and AI Cloud tests authenticate to different services; one does not establish the other's success.

<a id="package"></a>

## 3. Build the unsigned installer

After preflight and focused checks pass, run this command with the confirmed version in the same shell. The packaging pipeline performs its own complete build and isolated runtime smoke. Do not start multiple package runs against one checkout because target staging directories are shared.

```powershell
pnpm --dir apps/desktop run package:win:x64:unsigned --build-version $buildVersion
```

Inspect the final exit code and the per-run `result.json`, not only a build-success line. Unsigned packaging writes no signed publication completion record and omits production updater configuration. Use a signed build and the dedicated update qualification procedure when testing actual update delivery.

| Artifact | Location under the desktop repository |
|---|---|
| Test installer | `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/zerowall-science-<build-version>-win-x64-unsigned.exe` |
| Pipeline result and stage logs | `apps/desktop/.desktop-build/packaging-runs/<run>/` |
| Native installer test output | `apps/desktop/.desktop-build/installer-tests/` |
| Prepared runtime and unpacked staging | `apps/desktop/.desktop-build/targets/win-x64/`; inspect the run result for exact paths. |

If Electron download times out, diagnose the failing URL and the current process proxy. A cached ZIP does not guarantee offline preparation because checksums may still be fetched. Use only the machine's configured proxy; preserve checksum validation. Do not fix an integrity failure by disabling validation or replacing lockfile checksums.

<a id="manual-acceptance"></a>

## 4. Accept the actual installed package

The Windows delivery owner completes this checklist in a clean Windows x64 VM or a dedicated test account with an isolated profile. Do not overwrite an active daily installation or delete its credentials to simulate a first run. Record actual package identity, screenshots, results, and remaining failures.

| Scenario | Required observation |
|---|---|
| Installation and branding | ZeroWall title, introduction, installer/app/taskbar/shortcut icons, progress animation, cancel and error recovery; light/dark and 100%/200% scaling. |
| Fresh start | Workspace opens directly; only AI Cloud sign-in and registration appear; skip is visible and does not reopen on focus in the same run. |
| Saved account | Remember-password preference is respected; restart restores valid credentials; expired credentials produce a recoverable sign-in state. |
| Models and calls | Refresh the catalog, create a session, complete one real text call and one image call, and inspect saved output. |
| Balance | Show current balance, prompt below ¥5, do not prompt at exactly ¥5, and label stale balance without an automatic recharge prompt. |
| Failure paths | Test network loss, rejected login, cancellation, and reconnection; errors remain actionable and do not duplicate jobs or orders. |
| Plugins | Discover lists the intended revisions; fresh Git install, restart, disable, re-enable, and compatible update work without duplicate UI. |
| Uninstall and update | Verify shortcuts and explicit data-retention choices; qualify signed updates separately using the installed-update procedure. |

Real cloud requests can consume balance. Use an authorized test account and record success without including credentials or payment details. Verify that the recharge entry opens correctly; placing or paying an order requires a separate authorized payment test. A recharge reminder never authorizes an automatic payment.

<a id="record"></a>

## 5. Retain evidence and publish deliberately

Keep this acceptance record beside the retained build artifacts, outside the public source history when it contains machine-specific diagnostics. Record each field before handing the installer to another tester.

- Desktop commit, DSH base, build version, dirty state, Windows version and architecture.
- Both plugin package versions and pinned commits, Discover source, and signed-catalog channel if tested.
- Installer path, byte size, SHA-256, packaging run path, exit code, and runtime smoke result.
- Automated commands and outcomes, profile isolation, installation/startup logs, screenshots, and real-cloud results.
- Untested items, recovery package and data backup, acceptance owner, and release decision.

Compute the installer digest with PowerShell `Get-FileHash -LiteralPath <absolute-installer-path> -Algorithm SHA256`. Keep executables, temporary consumer projects, personal paths, credentials, and raw account diagnostics out of source commits. Source pushes, unsigned test delivery, GitHub Releases, and signed stable catalogs are distinct milestones.

After local acceptance, follow [publishing](../../../apps/desktop/publishing/README.md) and [installed-update qualification](../../../apps/desktop/tests/installed-update/README.md) for a signed release. The preview signed catalog still requires its own signature, archive digest, compatibility rejection, update-failure recovery, and stable-promotion acceptance.

<a id="dev-note"></a>

## Dev Note

<details>
<summary>Working context</summary>

None.

</details>
