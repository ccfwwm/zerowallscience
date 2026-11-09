# Python runtime

English | [中文](plugin-detail.zh.md)

## Summary

DSH supplies Python 3.12.14. uv 0.13.7 automatically prepares locked core dependencies. Desktop supplies an offline wheel directory; npm installations download the same hash-locked packages from the configured index. Optional Skill topics use independent environments.

## Configuration

Inspect startup preparation below and retry failed attempts. Refresh reads state. Explicit package changes create verified environment generations while running consumers retain their generation. Paths come from environment variables or profile settings; old Python directories are not migrated. Standalone npm installations can download the exact payload Python version through uv when DSH supplies no interpreter.

Confirmed package indexes persist across starts. Use an HTTPS URL without credentials, query parameters or fragments. Failed preparation retains the active generation; reading missing Skill dependencies requires an explicit preparation action.

Set `ZEROWALL_PYTHON_WHEELHOUSE` to an absolute directory for offline core preparation. Every listed wheel is verified; an invalid override stops preparation instead of falling back online. Without an override or packaged wheels, the first npm preparation needs network access.
