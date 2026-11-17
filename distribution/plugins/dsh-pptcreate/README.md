# @zerowall/dsh-pptcreate

English | [中文](README.zh.md)

## Summary

Presentation creation. Provides editable and image presentations, OCR reconstruction, quality checks, page jobs and recovery. Image parameters are configured in the image creation plugin. PDF conversion consumes the official officeToPdf service; PNG rendering uses the same LibreOffice kit without a second engine.

## Use

ZeroWall Desktop selects this package from its installation manifest. Open Plugins to inspect status and package-owned settings. The tested baseline is DSH 0.2.2-rc.1 and Node.js 24.9 or later. Preserve existing configuration and data when updating.

Startup loads the workbench routes and bundled instructions before reporting readiness. Missing resources fail plugin loading with a reinstall message. Desktop keeps this package outside ASAR and verifies its physical files against the prepared npm package. The npm archive includes reconstruction scripts and model locks, without model binaries. First launch prepares OCR dependencies and models through the Python plugin; the PPT panel shows progress and a retry action.

New presentations default to full-page image generation and a non-editable image PPTX, followed by OCR reconstruction in an independent project and an editable PPTX. Both files are retained. Load `ppt-maker` before starting; discover only the tools needed for the current stage. Explicit native editable creation and image-only requests are supported, and existing projects retain their saved mode.

OCR reconstruction waits for the Python dependency service. Interpreter and dependency locations come from `ZEROWALL_PYTHON_EXECUTABLE`, `ZEROWALL_PYTHON_ENV_ROOT` and `ZEROWALL_PYTHON_SITE_PACKAGES`; the plugin does not search previous installations.

See the [retained migration reference](migration-reference.md) for detailed workflows and historical platform requirements. The package manifest owns current dependency versions.

## Development

Build and inspect archives from the repository root:

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

Keep the package LICENSE and any third-party notices with redistributions.
