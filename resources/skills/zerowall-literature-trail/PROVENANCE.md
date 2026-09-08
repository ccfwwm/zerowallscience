# Provenance

This Skill's workflow was informed by the MIT-licensed `paper-trail` project
(`roomi-fields/paper-trail`, reviewed commit `ada3cec2f09323dc2f31de4058786963b2c79bd4`).
ZeroWall implements its own provider clients and task format; no upstream
runtime code or platform-specific crawler is copied into this Skill.

The reusable concepts are the explicit acquisition states, source ledger,
atomic registry writes, PDF identity checks, and per-citation evidence
receipts. Full-text providers remain separately configured and auditable.
