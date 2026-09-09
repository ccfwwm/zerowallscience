---
author: TestAuthorI04
title: Fixture pour invariant I4 — pdf_path doublement préfixé
year: 2026
state: candidate
pdf_path: 10_SOURCES/Sources/fake_doc_for_tests.pdf
state_history:
- at: '2026-01-01T00:00:00Z'
  by: synthetic_fixture
  state: candidate
---

Fixture I4 — `pdf_path` commence par `10_SOURCES/` (drift R8). Auto-fixable.
État: `candidate` pour ne pas déclencher I5/I6 (qui exigent state ∈ STATES_WITH_PDF).
