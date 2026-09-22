# ZeroWall Science 7.0.0 production acceptance record

Verified: 2026-09-22 (Asia/Shanghai). This record covers the deployed `raiagentai`
science-computation service, not a claim that every 7.0.0 desktop feature or the
obesity--alopecia research question is complete.

## Deployed revision and service state

- Deployed revision: `36ea1bc8ec351534a557d0f470c53d6418c0d8d4`.
- Production deployment record:
  `/var/lib/rdatalinux-r-platform/deployments/release.reFkif/deployment.json`.
- Active services: `rdatalinux-r-gateway`, `rdatalinux-r-plumber`,
  `rdatalinux-r-worker`, `omicverse-api`, and `biomni-api`.
- Queue snapshot: 0 queued, 0 running, 220 succeeded, 86 failed, 8 cancelled,
  and 6 timed out. Historic failed jobs are retained as audit history and do not
  indicate that the current smoke jobs failed.

## Successful production checks

| Check | Evidence | Result |
| --- | --- | --- |
| Compact MCP handshake | 26 advertised tools; dynamic Biomni capability available; runtime `biomini-venv` | Passed |
| MR runner | Job `20260922122742.633492-o6t8xhdy06s595hb`; runner `7.0.0-genetics.1`; result SHA-256 `e9f10e770d9e00a49494dc9f424c97daf472ff979d4131f0609d2792783cba66` | Passed on synthetic fixture |
| Colocalization runner | Job `20260922131836.942411-kzyd6ar6n6g2blmm`; coloc `5.2.3`; `PP.H4=0.15167380550298626`; result SHA-256 `1ef1db0c89cce664ada6dd7836851f308cfab01688efbca34d57780adba30d7b` | Passed on synthetic fixture |
| Remote project files | Project `r-files-smoke-1790052252611`; write, read, listing and manifest verification; `evidence.txt` SHA-256 `60c623077222ea156cbbeb79c7da01311c928d32f30de501f8116400843ce954` | Passed |
| AutoDock Vina | Job `3dd80b4f-2a97-49ff-8a6c-372dde5e6d70`; deterministic seed 42; ethanol score `-2.581`; five artifact hashes and SDF/PDBQT heavy-atom coordinates verified | Passed on test ligand/receptor |

The local test evidence for this revision was: Node 26/26, Biomni service 15
passed, Biomni adapter tests passed, deployment tests 11 passed, and genetics
numerical tests 8/8.

## Controls verified in this release

- Genetics submissions use bounded SQLite lock retry; idle workers do not
  repeatedly contend for writes and heartbeats are rate-limited.
- Schema migration runs from the Plumber startup path.
- Vina validates optional receptor SHA-256, retains a source PDBQT, emits SDF
  and PDBQT poses, fixes the random seed, and records engine/version, box,
  receptor hash, affinity, CPU, and ligand limits in the result manifest.
- New smoke scripts cover the `r_files` route and the genetics/coloc route.

## Explicit limits and remaining acceptance work

- MR and coloc checks used synthetic fixtures. They establish execution and
  provenance only; they establish no biological or medical result.
- The obesity--alopecia question is not frozen. Candidate source metadata and
  access constraints are documented in
  `docs/obesity-alopecia-data-recon-2026-09-22.md` before any study gate is
  presented.
- The legacy FigureYa smoke assertion still assumes 17 tools and must be
  changed to validate the current compact 26-tool surface before it is counted
  as a release gate.
- Windows installer, migration, native Fiji/napari, eight tool workbench, and
  BrainGlobe acceptance are separate 7.0.0 gates. This document must not be
  used to mark those gates complete.
