---
author: TestAuthorI16
title: Fixture I16 — RTFM signale un échec d'ingest
year: 2026
state: pdf_acquired
uid: doi:10.0000/fixturei16
pdf_path: Sources/fake_doc_for_tests.pdf
pdf_sha256: 2adbafc3ed88a9ff3c05eb00377004724d962e6bce8a01624d70a4037a2b3f77
state_history:
- at: '2026-01-01T00:00:00Z'
  by: synthetic_fixture
  state: pdf_acquired
---

Fixture I16 — RTFM remonte un échec `pdftext-other` sur ce PDF. WARN ;
non auto-fix. Le test mocke `rtfm_failures.list_failures` pour renvoyer
une RtfmFailure pointant sur ce filepath.
