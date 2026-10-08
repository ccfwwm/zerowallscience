---
author: TestAuthorI15
title: Fixture I15 — awaiting_rtfm_ocr en retard
year: 2026
state: awaiting_rtfm_ocr
uid: doi:10.0000/fixturei15
pdf_path: Sources/fake_doc_for_tests.pdf
pdf_sha256: 2adbafc3ed88a9ff3c05eb00377004724d962e6bce8a01624d70a4037a2b3f77
ocr_pending_since: '2025-01-01'
last_rtfm_check_at: '2025-06-01T00:00:00Z'
state_history:
- at: '2025-01-01T00:00:00Z'
  by: synthetic_fixture
  state: pdf_acquired
- at: '2025-01-02T00:00:00Z'
  by: synthetic_fixture
  state: awaiting_rtfm_ocr
---

Fixture I15 — `ocr_pending_since` > 30j (2025-01-01) et `last_rtfm_check_at` > 7j (2025-06-01).
INFO ; non auto-fix.
sha256 = hash réel de fake_doc_for_tests.pdf pour passer I6.
