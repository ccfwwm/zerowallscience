---
author: TestAuthorI05
title: Fixture I5 — state pdf_acquired mais fichier inexistant
year: 2026
state: pdf_acquired
uid: doi:10.0000/fixturei5
pdf_path: Sources/this_file_does_not_exist_on_disk.pdf
pdf_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
state_history:
- at: '2026-01-01T00:00:00Z'
  by: synthetic_fixture
  state: pdf_acquired
---

Fixture I5 — pdf_path référence un fichier qui n'existe pas. Auto-fix (semi) : bascule needs_reacquisition.
sha256 fourni est syntaxiquement valide (64 hex) pour ne pas déclencher I6.
