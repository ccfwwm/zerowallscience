---
author: TestAuthorI14
title: Fixture I14 — transition sortante depuis état terminal
year: 2026
state: uid_resolved
uid: doi:10.0000/fixturei14
state_history:
- at: '2026-01-01T00:00:00Z'
  by: synthetic_fixture
  state: candidate
- at: '2026-01-02T00:00:00Z'
  by: synthetic_fixture
  state: retracted
- at: '2026-01-03T00:00:00Z'
  by: synthetic_fixture
  state: uid_resolved
---

Fixture I14 — state_history sort de `retracted` (terminal) pour aller en `uid_resolved`.
Note : on choisit state actuel = uid_resolved pour cohérence avec dernière entrée
de l'history (sinon I8 lèverait aussi). I14 doit lever, I8 non.
