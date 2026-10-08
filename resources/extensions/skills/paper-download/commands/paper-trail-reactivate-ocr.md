---
description: Re-evaluate refs in state `awaiting_rtfm_ocr` via `rtfm check`. Transitions to `page1_validated` if OCR succeeded, or `needs_reacquisition` if OCR failed.
---

# `/paper-trail:reactivate-ocr` — Resume OCR-waiting refs

Polls RTFM (local indexing engine) for refs in state `awaiting_rtfm_ocr`
and dispatches them based on the OCR verdict.

## Usage

```
/paper-trail:reactivate-ocr
/paper-trail:reactivate-ocr --quiet
```

No other arguments.

## What it does

Delegates to the worker B :

```bash
python -m pipeline reactivate-ocr [--quiet]
```

For each ref in state `awaiting_rtfm_ocr` :

1. Calls `rtfm check --path <pdf>` via the RTFM CLI
2. Dispatches based on the verdict :
   - `ok` (OCR done, chunks indexed) → re-run page 1 validation,
     transition to `page1_validated` if validation passes
   - `still_pending` (OCR not yet finished) → no change
   - `missing_in_index` (RTFM hasn't seen this file yet) → log and wait
   - `anomaly` (OCR done but 0 chunks) → log anomaly, no transition
   - `ocr_failed` (OCR attempted and failed) → transition to
     `needs_reacquisition` for cascade retry

## Output

```
# reactivate-ocr — N refs en awaiting_rtfm_ocr scannées
  converted                  N  (→ page1_validated)
  still_pending              N
  missing_in_index           N
  anomaly                    N
  ocr_failed                 N  (→ needs_reacquisition)
  needs_reacq_post_ocr       N
  error                      N
```

## Cadence

There's no automatic polling. The skill is invoked manually when the
user wants to check OCR progress. RTFM OCR jobs typically take minutes
to hours depending on PDF size and queue depth.

Recommendation : run `/paper-trail:reactivate-ocr` at the start of each
session to clear refs whose OCR completed in the interim.

## Cross-reference

- I15 invariant (doctor) reports refs that have been `awaiting_rtfm_ocr`
  > 30 days with no recent RTFM check
- See `pipeline/USAGE.md` for the worker B CLI
- See `tools/rtfm-bridge` (if installed) for direct RTFM integration
