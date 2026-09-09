---
author: TestAuthorI06
title: Fixture I6 — sha256 mal formé
year: 2026
state: pdf_acquired
uid: doi:10.0000/fixturei6
pdf_path: Sources/fake_doc_for_tests.pdf
pdf_sha256: notavalidsha256
state_history:
- at: '2026-01-01T00:00:00Z'
  by: synthetic_fixture
  state: pdf_acquired
---

Fixture I6 — pdf_sha256 n'est pas 64 hex chars. Auto-fix : recompute depuis le fichier.
pdf_path pointe sur un fichier qui EXISTE (fake_doc_for_tests.pdf) pour ne pas déclencher I5.
