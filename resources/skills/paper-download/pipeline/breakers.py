"""Circuit-breakers per-source pour la cascade.

État EN MÉMOIRE uniquement (choix explicite §3.1 du plan-design) : le breaker
est réinitialisé à chaque session, donc une source réparée entre deux runs
n'est pas désactivée à tort.

Sémantique :
- `record(success: bool)` : ajoute un événement de réussite/échec horodaté.
- `is_open() -> bool` : True si on a observé ≥ `fail_threshold` échecs
  consécutifs dans une fenêtre glissante `window_s` secondes.

Quand un breaker est ouvert dans la cascade, on n'appelle pas la source et on
log un attempt `{"source": X, "verdict": "skipped_breaker_open"}`.

Décision : "consécutifs dans une fenêtre" plutôt que "N total fails dans
fenêtre" — éviter qu'un succès intercalé réinitialise instantanément après un
streak. Un succès remet le compteur de fails consécutifs à 0.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class CircuitBreaker:
    """Fuse per-source : ouvre après N échecs consécutifs dans une fenêtre."""

    source: str
    fail_threshold: int = 5
    window_s: float = 60.0

    # État interne : timestamps des échecs consécutifs (réinitialisé à chaque
    # succès). Pas besoin de stocker les succès.
    _consecutive_fail_ts: list[float] = field(default_factory=list)

    def record(self, success: bool) -> None:
        """Enregistre un événement. `success=True` réinitialise le streak."""
        if success:
            self._consecutive_fail_ts.clear()
            return
        now = time.monotonic()
        # Purge les fails hors fenêtre (pas en plein milieu d'un streak)
        cutoff = now - self.window_s
        self._consecutive_fail_ts = [
            t for t in self._consecutive_fail_ts if t >= cutoff
        ]
        self._consecutive_fail_ts.append(now)

    def is_open(self) -> bool:
        """True ssi ≥ fail_threshold échecs consécutifs dans la fenêtre."""
        if len(self._consecutive_fail_ts) < self.fail_threshold:
            return False
        cutoff = time.monotonic() - self.window_s
        in_window = [t for t in self._consecutive_fail_ts if t >= cutoff]
        return len(in_window) >= self.fail_threshold


class BreakerRegistry:
    """Container : 1 CircuitBreaker par source connue, lazy-init.

    Usage :
        reg = BreakerRegistry()
        if reg["scihub"].is_open():
            ...
        reg["scihub"].record(success=False)
    """

    def __init__(self, fail_threshold: int = 5, window_s: float = 60.0) -> None:
        self._fail_threshold = fail_threshold
        self._window_s = window_s
        self._breakers: dict[str, CircuitBreaker] = {}

    def __getitem__(self, source: str) -> CircuitBreaker:
        if source not in self._breakers:
            self._breakers[source] = CircuitBreaker(
                source=source,
                fail_threshold=self._fail_threshold,
                window_s=self._window_s,
            )
        return self._breakers[source]

    def __contains__(self, source: str) -> bool:
        return source in self._breakers

    def snapshot(self) -> dict[str, dict]:
        """Snapshot debug : état de chaque breaker."""
        out = {}
        for src, br in self._breakers.items():
            out[src] = {
                "open": br.is_open(),
                "consecutive_fails": len(br._consecutive_fail_ts),
                "fail_threshold": br.fail_threshold,
                "window_s": br.window_s,
            }
        return out
