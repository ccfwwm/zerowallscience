# @zerowall/dsh-plugin-python

English | [中文](README.zh.md)

## Summary

ZeroWallScience reuses DSH's bundled CPython 3.12.14 and uv 0.13.7. First launch prepares hash-locked core, MCP and OCR dependencies in the background. Extension wheels and OCR models are downloaded, not embedded in Desktop. Python and OCR status, progress and retries remain visible in settings; startup and ordinary PPT editing do not wait for network access.

Dependencies are installed into a new immutable environment generation. A verified generation becomes active atomically; running consumers retain their existing generation. Explicit additions and rollback switch generations without modifying DSH's interpreter. Optional Skill topics prepare independent environments only when enabled, keeping their dependency versions separate from core.

Rollback restores the saved preceding generation through one pointer commit. Repeating rollback retains the restored generation; the next successful installation records a new rollback target.

Failed installations discard the unfinished generation and retain the active one. A writer lock serializes changes across Hosts. Reading a Skill's dependency location does not install or retry missing dependencies. Disabling the plugin cancels and waits for its dependency commands before releasing it.

## Use

Desktop supplies the base interpreter through `DSH_PYTHON_EXECUTABLE`. The npm package includes uv, hash locks, manifests and licenses, without extension wheels or model binaries. First preparation requires networking; verified environments and models are reused offline. A standalone npm carrier without DSH Python uses uv to obtain the exact declared interpreter. System Python, Conda and previous ZeroWall environments are never discovered or migrated.

Locations come from environment variables or profile fields:

| Variable | Purpose |
| --- | --- |
| `DSH_PYTHON_EXECUTABLE` | Absolute DSH base interpreter path |
| `DSH_HOME` | DSH user data home, containing the default dependency store |
| `ZEROWALL_PYTHON_DEPENDENCIES_ROOT` | Environment generations and receipts |
| `ZEROWALL_PYTHON_ASSETS_ROOT` | Matching target manifest, uv and hash locks |
| `ZEROWALL_PYTHON_WHEELHOUSE` | Optional absolute directory containing the manifest's locked core wheels |
| `ZEROWALL_UV_EXECUTABLE` | Optional uv override, matching the payload version |
| `ZEROWALL_PYTHON_INDEX_URL` | HTTPS core and topic index; default Tsinghua mirror, with Aliyun and PyPI settings presets |

A package index confirmed in Python settings is saved atomically to `settings.json` in the dependency store and overrides the initial profile or environment default on the next start. Index URLs must not contain credentials, query parameters or fragments. Failed saves retain the current setting; diagnostics omit command error output and child processes do not inherit token, key, secret or password variables.

Core installation uses `core.lock` with required hash verification and binary wheels. Only an explicitly configured `ZEROWALL_PYTHON_WHEELHOUSE` enables an offline source; a retained checkout wheel directory is not selected. Invalid explicit locations stop preparation. Optional topics remain separate from the automatic core environment.

After preparation, the service publishes `ZEROWALL_PYTHON_ENV_ROOT`, `ZEROWALL_PYTHON_EXECUTABLE` and `ZEROWALL_PYTHON_SITE_PACKAGES`. Consumers await the Python readiness/resolver methods before launching processes. Child environments remove ambient Python and Conda overrides. No installation folder, username or old location is hardcoded.

Target metadata currently covers Windows x64; prepare matching resources before shipping another platform. OCR V5 resources use versioned RapidAI ModelScope URLs with pinned byte counts and SHA-256. The user-writable model store defaults under `DSH_HOME`; `ZEROWALL_OCR_MODELS_ROOT` overrides it and `ZEROWALL_OCR_MODEL_MIRROR` supplies a compatible HTTPS mirror directory. Partial downloads never become ready models. Transfers retry at most `downloadAttempts` times (default 3); `timeoutMs` bounds each transfer. Disabling the plugin cancels and awaits preparation.

## Development

Build and inspect archives from the repository root:

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

Regenerate target resources with `node distribution/scripts/prepare-python-runtime.mjs --python <absolute-target-interpreter> --target win-x64 --refresh-lock`. Omit `--refresh-lock` to retain the checked lock. `--download-wheels` writes optional acceptance artifacts under `.artifacts/python-downloads`, outside published resources. Keep uv and OCR licenses with redistributions.

Python settings reports the active uv version and searches package names from catalogIndexUrl. Package-name and release-version filters accept fuzzy matches. Package discovery defaults to the Aliyun Simple index and stays independent from indexUrl, which controls dependency installation. Select an exact version, preview its compatible dependency plan, then apply explicitly. Search failures retain the current environment.
