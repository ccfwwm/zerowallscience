---
description: Show the registry status — count of refs per FSM state. Read-only, fast (< 5s).
---

# `/paper-trail:status` — Registry status

Read-only snapshot of the registry. Counts refs per FSM state and
categorizes them (active / waiting / blocked_human / terminal).

## Usage

```
/paper-trail:status
```

No arguments.

## What it does

Delegates to the worker B :

```bash
python -m pipeline status
```

## Output

```
# Registry status — 909 refs

État                                      Count  Catégorie
----------------------------------------------------------------------
candidate                                   210  active
uid_resolved                                  1  active
awaiting_rtfm_ocr                            13  waiting
page1_validated                              29  active
sota_cited_confirmed                        536  terminal
retracted                                   120  terminal

Récap : active=240  waiting=13  blocked_human=0  terminal=656
```

## Categories

- **active** : refs the worker should process (`candidate`,
  `uid_resolved`, `pdf_acquired`, `needs_reacquisition`,
  `page1_validated`)
- **waiting** : `awaiting_rtfm_ocr` (worker idle, RTFM is OCRing)
- **blocked_human** : `blocked_human:*` (curator decision needed)
- **terminal** : `sota_cited_confirmed`, `retracted` (worker never
  touches these)

## When to use

- Beginning of session : overview of registry state
- After a batch run : verify state distribution shifted as expected
- Before deciding what to invoke (cascade, doctor, audit-sota)
