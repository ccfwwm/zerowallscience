---
description: Audit the registry via the 19 mechanical invariants (I1-I19). Reports ERROR/WARN/INFO violations. Optional auto-fix for safe ones (I4 path, I6 sha256, I9 attempts).
---

# `/paper-trail:doctor` — Run invariants audit

Invoke the `registry-doctor` skill to check the 19 invariants on the
registry.

## Usage

```
/paper-trail:doctor                              # full check, severity ≥ info
/paper-trail:doctor --severity error             # errors only
/paper-trail:doctor --severity warn              # errors + warnings
/paper-trail:doctor --fix                        # apply safe auto-fixes
/paper-trail:doctor --fix --severity warn        # idem
/paper-trail:doctor --json                       # machine-readable output
/paper-trail:doctor --correlate-rtfm             # Couche 5 — RTFM crosscheck
/paper-trail:doctor --check-sha                  # slow — recompute all sha256
```

## What it does

Delegates to the worker B :

```bash
python -m pipeline doctor [flags]
```

Returns a markdown (or JSON) report classifying violations by invariant
and severity. Safe auto-fixes :

- **I4** : strip prefix `10_SOURCES/` from `pdf_path` if present
- **I6** : recompute `pdf_sha256` from disk file if missing or malformed
- **I9** : renumber `acquisition_attempts[].n` to be strictly 1..N
- **I5 semi** : if PDF missing on disk, transition to `needs_reacquisition`
- **I7 semi** : if `page1_validation_log` inconsistent, transition to
  `needs_reacquisition`

Never auto-fixes (require human decision) :

- **I10** : empty `blocked_reason` — humain must categorize the blockage
- **I8** : non-monotonic `state_history` — likely a bug or migration
  artifact
- **I14** : transition out of terminal state — likely a manual mutation
  needing audit

## Exit code

- `0` : no errors (warns/infos may be present)
- `1` : at least one ERROR remaining (after auto-fixes if `--fix`)

Useful for CI / pre-commit hooks.

## Cross-reference

See also :

- `/paper-trail:status` — overall registry state counts
- `/paper-trail:cascade` — push refs forward (which doctor will audit)
- `pipeline/USAGE.md` for the underlying worker B CLI
