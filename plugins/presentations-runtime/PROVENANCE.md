# dsh-ppt runtime provenance

- Upstream: https://github.com/yejiming/dsh-ppt
- Fixed commit: `538f23c834056e2b3ab7314524d4b31416803a6b`
- Upstream package version: `0.0.1`
- License: MIT (see `LICENSE`)

ZeroWall ships only the compiled runtime, type declarations, and the `ppt`
preset from this fixed revision. The package is an internal library dependency
of `@zerowallscience/plugin-presentations`; it is not loaded as a second DSH
plugin. ZeroWall owns session containment, persistence, artifact registration,
native-renderer approvals, profile composition, and production packaging.
