---
author: TestAuthorI18
title: Fixture I18 — drift sha256 YAML vs disque
year: 2026
state: pdf_acquired
uid: doi:10.0000/fixturei18
pdf_path: Sources/fake_doc_for_tests.pdf
pdf_sha256: deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef
state_history:
- at: '2026-01-01T00:00:00Z'
  by: synthetic_fixture
  state: pdf_acquired
---

Fixture I18 — `pdf_sha256` YAML = `deadbeef…` (64 hex valides syntaxiquement,
passe I6), mais le sha réel du fichier `fake_doc_for_tests.pdf` est
`2adbafc3ed88a9ff3c05eb00377004724d962e6bce8a01624d70a4037a2b3f77`.
Drift détecté par I18. ERROR ; non auto-fix (anti-heuristique : on ne
sait pas si c'est le YAML ou le fichier qui est faux).
