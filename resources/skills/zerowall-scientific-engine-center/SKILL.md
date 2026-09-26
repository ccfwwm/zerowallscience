---
name: zerowall-scientific-engine-center
description: Configure, probe, and launch local or remote scientific engines with explicit source, version, path, capability, and diagnostic state.
---

Fiji configuration priority is project > user > environment > discovered > default. Before launch or analysis, call `getScientificEngineConfigs({sessionId})` and use the returned `id`, `enabled`, source and path. Only Fiji accepts `setScientificEngineConfig({sessionId, config})` with a directory or executable. napari, BrainGlobe, HE Python and HE StarDist all use the one `%APPDATA%\zerowall-science\Python\python.exe` runtime and its `Lib\site-packages`; napari discovers its launcher in `Lib\site-packages\bin\napari.exe`. Remote R uses its RMCP connector. Probe with `probeScientificEngine({sessionId, engine})` and report its status and diagnostic. HE StarDist invokes the Python `StarDist2D` API with frozen model weights, not Fiji/ImageJ. A missing path or dependency is not available.

Skills that need a native window must then call the registered Host action (`launchScientificEngine` or the `science_viewer` `launch_native` action) with the real project asset ID. A `spawned` result only means the process started; follow it with `native_status` and keep the state `进程已启动，窗口状态待确认` until the GUI is independently confirmed. If no session is active, ask the user to open the 科研工作台 so the Host can bind a project; never fabricate a session or bypass the configured path with a shell command.

Never create or select an isolated local Python environment for a scientific engine. Probe in a temporary working directory using the shared interpreter. Save only Fiji configuration metadata in settings/ResearchStore; analysis data remains an asset or artifact. Remote R/OmicVerse/Biomni endpoints must report connectivity and credential failures without exposing secrets.
