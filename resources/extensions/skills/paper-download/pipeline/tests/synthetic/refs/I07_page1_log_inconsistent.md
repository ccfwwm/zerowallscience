---
author: TestAuthorI07
title: Fixture I7 — state page1_validated mais verdict failed
year: 2026
state: page1_validated
uid: doi:10.0000/fixturei7
pdf_path: Sources/fake_doc_for_tests.pdf
pdf_sha256: 2adbafc3ed88a9ff3c05eb00377004724d962e6bce8a01624d70a4037a2b3f77
page1_validation_log:
  at: '2026-01-01'
  verdict: failed_author_mismatch
state_history:
- at: '2026-01-01T00:00:00Z'
  by: synthetic_fixture
  state: pdf_acquired
- at: '2026-01-02T00:00:00Z'
  by: synthetic_fixture
  state: page1_validated
---

Fixture I7 — page1_validation_log.verdict ne contient pas 'validated'. Auto-fix : needs_reacquisition.
sha256 = hash réel de fake_doc_for_tests.pdf pour passer I6.
