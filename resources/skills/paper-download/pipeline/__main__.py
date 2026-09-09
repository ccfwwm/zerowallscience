"""Entry point : `python -m pipeline ...`"""
import sys


def _main() -> int:
    # `preflight` est volontairement court-circuité ici : c'est la seule
    # sous-commande qui doit pouvoir tourner SANS RESEARCH_VAULT_PATH
    # (puisqu'elle sert justement à diagnostiquer son absence). On évite
    # l'import de `cli`, qui charge `config` au module-level et lèverait
    # ConfigError avant même qu'on atteigne preflight.
    if len(sys.argv) >= 2 and sys.argv[1] == "preflight":
        from .preflight import run_preflight
        as_json = "--json" in sys.argv[2:]
        rc, out = run_preflight(as_json=as_json)
        print(out)
        return rc

    from .cli import main
    return main()


if __name__ == "__main__":
    sys.exit(_main())
