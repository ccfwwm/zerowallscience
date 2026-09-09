# Provenance

This Skill's workflow uses the complete local source project copied as the
ZeroWall `paper-download` skill at `../paper-download` (renamed at the user's
request). The original `zerowall-literature` provider clients and task
format remain in this directory; `scripts/paper_download_bridge.py` invokes
the copied runtime in an isolated registry for PDF acquisition.

Both workflows keep acquisition attempts, source ledgers, atomic state writes,
PDF identity checks, hashes, and per-citation evidence receipts auditable.
