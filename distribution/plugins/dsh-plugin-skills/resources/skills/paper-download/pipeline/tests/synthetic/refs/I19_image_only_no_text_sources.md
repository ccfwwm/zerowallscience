---
author: TestAuthorI19
title: Fixture I19 — PDF image-only sans source texte vraiment testée
year: 2026
state: pdf_acquired
uid: doi:10.0000/fixturei19
pdf_path: Sources/fake_doc_for_tests.pdf
pdf_sha256: 2adbafc3ed88a9ff3c05eb00377004724d962e6bce8a01624d70a4037a2b3f77
acquisition_attempts:
- n: 1
  source: crossref_oa
  verdict: no_source
- n: 2
  source: arxiv
  verdict: skipped_breaker_open
state_history:
- at: '2026-01-01T00:00:00Z'
  by: synthetic_fixture
  state: pdf_acquired
---

Fixture I19 — PDF image-only (le test mocke `is_pdf_image_only` → True),
state pdf_acquired, et `acquisition_attempts` ne contient AUCUNE source
texte avec verdict "réel" (toutes en `no_source` ou `skipped_*`).
INFO ; suggérer relance cascade via sources texte.
