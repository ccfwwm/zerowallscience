---
author: TestAuthorI09
title: Fixture I9 — acquisition_attempts.n non monotone
year: 2026
state: uid_resolved
uid: doi:10.0000/fixturei9
acquisition_attempts:
- at: '2026-01-01T00:00:00'
  n: 1
  source: crossref_oa
  verdict: no_oa_url
- at: '2026-01-02T00:00:00'
  n: 3
  source: openalex_oa
  verdict: failed
- at: '2026-01-03T00:00:00'
  n: 4
  source: unpaywall
  verdict: no_source
state_history:
- at: '2026-01-01T00:00:00Z'
  by: synthetic_fixture
  state: uid_resolved
---

Fixture I9 — n=1,3,4 (trou à n=2). Auto-fix : renumber en 1,2,3.
