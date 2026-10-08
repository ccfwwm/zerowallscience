"""Lock fichier exclusif pour empêcher 2 sessions de pipeline run / reactivate-ocr.

Implémentation `fcntl.flock(LOCK_EX | LOCK_NB)` + PID liveness check + cleanup
auto à la sortie du context manager.

Détail :
- Le lock vit dans `_registry/_worker.lock` par défaut (à côté du registre).
- En cas d'occupation, on lit (PID, hostname, start_at) écrits dans le fichier.
  Si le PID n'est plus alive (`os.kill(pid, 0)` lève ProcessLookupError), on
  considère le lock orphelin → on supprime et retry une fois.
- Sortie du with : `flock(LOCK_UN)`, suppression du fichier, close du fd.
- WSL2 drvfs : `fcntl.flock` fonctionne historiquement sur /mnt/d/. Si jamais
  un OSError EINVAL/ENOTSUP émerge, on prévoit un fallback maison (le user
  passe `lock_path=...` pointant `~/.cache/paper-trail/`).

Usage :
    from pipeline.lock import WorkerLock, LockBusyError
    try:
        with WorkerLock():
            ...
    except LockBusyError as e:
        print(str(e), file=sys.stderr); sys.exit(2)
"""
from __future__ import annotations

try:
    import fcntl
except ImportError:  # Windows: use the native CRT lock API.
    fcntl = None  # type: ignore[assignment]
    import msvcrt
import os
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path

from .config import REGISTRY


class LockBusyError(RuntimeError):
    """Levée quand le lock est déjà détenu par un processus vivant."""


class WorkerLock:
    """Context manager : fcntl.flock LOCK_EX | LOCK_NB sur `_worker.lock`."""

    def __init__(self, lock_path: Path | None = None) -> None:
        self.lock_path = lock_path or (REGISTRY / "_worker.lock")
        self._fd: int | None = None

    def _read_holder(self) -> dict[str, str]:
        """Best-effort lecture du contenu du lock file (PID, host, start_at)."""
        out = {"pid": "?", "host": "?", "start_at": "?"}
        try:
            txt = self.lock_path.read_text(encoding="utf-8")
        except OSError:
            return out
        for line in txt.splitlines():
            if "=" in line:
                k, _, v = line.partition("=")
                k = k.strip()
                v = v.strip()
                if k in out:
                    out[k] = v
        return out

    def _pid_alive(self, pid: int) -> bool:
        try:
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            # Le PID existe mais on n'a pas le droit de signal — considère vivant.
            return True
        except (OSError, ValueError):
            return False

    def __enter__(self) -> "WorkerLock":
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        # Try once, then one retry après cleanup zombie éventuel.
        for attempt in (1, 2):
            # O_CREAT | O_RDWR : on doit pouvoir écrire (PID, host, start_at)
            # et lire en cas d'échec d'acquisition.
            fd = os.open(self.lock_path, os.O_CREAT | os.O_RDWR, 0o644)
            try:
                if fcntl is not None:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                else:
                    if os.fstat(fd).st_size == 0:
                        os.write(fd, b"\0")
                    os.lseek(fd, 0, os.SEEK_SET)
                    msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
            except OSError:
                # Lock détenu — examiner le PID
                os.close(fd)
                holder = self._read_holder()
                try:
                    pid_int = int(holder["pid"])
                except (ValueError, TypeError):
                    pid_int = -1
                if pid_int > 0 and not self._pid_alive(pid_int):
                    # Zombie : on supprime et on retry une fois
                    if attempt == 1:
                        try:
                            self.lock_path.unlink()
                        except OSError:
                            pass
                        continue
                raise LockBusyError(
                    f"another pipeline session running "
                    f"(PID={holder['pid']}, started {holder['start_at']}, "
                    f"host={holder['host']}, lock={self.lock_path})"
                )

            # Succès : on écrit les métadonnées et on garde le fd
            payload = (
                f"pid={os.getpid()}\n"
                f"host={socket.gethostname()}\n"
                f"start_at={datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}\n"
            )
            os.ftruncate(fd, 0)
            os.lseek(fd, 0, os.SEEK_SET)
            os.write(fd, payload.encode("utf-8"))
            os.fsync(fd)
            self._fd = fd
            return self
        # Boucle for ne devrait pas tomber ici (return ou raise dedans)
        raise LockBusyError(f"failed to acquire lock {self.lock_path}")

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._fd is not None:
            try:
                if fcntl is not None:
                    fcntl.flock(self._fd, fcntl.LOCK_UN)
                else:
                    os.lseek(self._fd, 0, os.SEEK_SET)
                    msvcrt.locking(self._fd, msvcrt.LK_UNLCK, 1)
            except OSError:
                pass
            try:
                os.close(self._fd)
            except OSError:
                pass
            self._fd = None
        try:
            self.lock_path.unlink()
        except OSError:
            pass
