---
name: zerowall-scientific-engine-center
description: Configure, probe, and launch local or remote scientific engines with explicit source, version, path, capability, and diagnostic state.
---

Engine configuration priority is project > user > environment > discovered > default. For Fiji, a directory may resolve `fiji-windows-x64.exe`, `ImageJ-win64.exe`, `fiji.bat`, or `fiji`; an explicitly supplied executable is checked first. Always show the resolved path and raw diagnostic. A configured directory with no valid entry is `invalid`; an engine that cannot report version but can be manually opened is `degraded`, not `available`.

Never overwrite an existing Fiji, napari, BrainGlobe, HE, or Python environment. Probe in an isolated temporary working directory. Save only configuration metadata in settings/ResearchStore; analysis data remains an asset or artifact. Remote R/OmicVerse/Biomni endpoints must report connectivity and credential failures without exposing secrets.
