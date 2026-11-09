"""Application settings, loaded from environment variables.

All settings are namespaced under ``MANUSIFT_``. The service can be
configured with no environment variables at all; in that case it runs
in "mock-LLM" mode, which is what Step 1 uses for its smoke test.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from pydantic import Field, ConfigDict, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


# R-audit (2026-06-10): the original
# ``env_file=".env"`` was a *relative*
# path. Pydantic resolves it against
# the current working directory, so
# running any CLI (``manusift screen``,
# ``manusift-toolserver``, …) from outside the
# project root would silently miss the
# project's ``.env`` and fall back to
# ``MockLLM``. We resolve to the repo
# root via the package ``__file__``, so
# the same ``.env`` loads regardless of
# cwd. Cwd-relative ``.env`` remains a
# fallback for users who keep secrets
# next to their working directory.
_REPO_ROOT = Path(__file__).resolve().parents[1]
_PROJECT_ENV = _REPO_ROOT / ".env"
_CWD_ENV = Path.cwd() / ".env"
# Pick
# the
# first
# one
# that
# exists.
# Pydantic
# accepts
# a
# list
# for
# ``env_file``.
_ENV_FILE_CANDIDATES: list[str] = [
    str(_PROJECT_ENV),
    str(_CWD_ENV),
    ".env",  # final fallback, pydantic's original
]


class Settings(BaseSettings):
    # L1+P0-8 — unknown env vars are now ignored
    # rather than allowed through. The old
    # ``extra="allow"`` was a monkeypatching escape
    # hatch used by the test suite; now that every
    # test passes explicit ``Settings(...)`` we can
    # tighten the schema and have pydantic yell if
    # someone typos ``MANUSIFTT_WORKSPACE_DIR``.
    model_config = SettingsConfigDict(
        env_prefix="MANUSIFT_",
        # R-audit (2026-06-10): env_file is a
        # list so pydantic tries each in
        # order. The first existing
        # ``.env`` wins. This makes the
        # TUI work no matter where the
        # user runs it from.
        env_file=_ENV_FILE_CANDIDATES,
        env_file_encoding="utf-8",
        extra="ignore",
        # R-2026-06-15 (Phase 1 + P1-17):
        # the Settings object is
        # now ``frozen=True``: any
        # attempt to do
        # ``settings.foo = ...`` after
        # construction raises
        # ``ValidationError`` (not
        # ``FrozenInstanceError`` --
        # Pydantic v2 wraps both
        # under the same error
        # class).  The original
        # design had no such guard,
        # so a test or a tool could
        # silently mutate a
        # *shared* Settings
        # instance (the
        # ``get_settings()`` cache
        # returns the *same*
        # object every call) and
        # the next call would see
        # the modified value with
        # no audit trail.
        #
        # Use ``model_copy`` or
        # ``object.__setattr__``
        # (with a comment) to
        # mutate in tests.  The
        # runtime code never
        # mutates Settings -- it
        # builds a new instance
        # from env vars at
        # construction time and
        # then reads.
        frozen=True,
    )

    # Workspace & files
    workspace_dir: Path = Field(default=Path("./data/jobs"))
    max_upload_mb: int = Field(default=50)
    # When True, the eval suite overwrites the production workspace.
    # Almost always False; the eval tests set this to True via
    # MANUSIFT_WORKSPACE_DIR in their own tmp dirs.
    evals_use_prod_workspace: bool = False

    # L3 — CORS allow-list. Comma-separated list of origins
    # (scheme + host + port). The default is the loopback
    # host the dev server uses; production deployments
    # should set this to the real frontend origin(s).
    cors_allow_origins: str = "http://127.0.0.1:8765,http://localhost:8765"
    # L3 — POST rate limit (per IP per 60s). Set to 0 to
    # disable entirely (useful for load-testing the
    # upload endpoint).
    # E2 — name of the rate-limit
    # strategy to use. Must be the
    # ``name`` attribute of a
    # ``RateLimitStrategy`` subclass
    # registered in
    # ``manusift.rate_limit``. The
    # pre-E2 default (``per_ip``)
    # matches the pre-E2 behavior.
    rate_limit_strategy: str = "per_ip"
    rate_limit_per_minute: int = 10

    # LLM providers. Keys are ``SecretStr`` so they auto-mask
    # in logs / repr and never accidentally end up in a
    # JSON dump. Access the actual string via
    # ``settings.openai_api_key.get_secret_value()``.
    openai_api_key: SecretStr | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"

    anthropic_api_key: SecretStr | None = None
    anthropic_base_url: str = "https://api.anthropic.com"
    anthropic_model: str = "claude-3-5-sonnet-latest"

    # When a key is missing the LLM client returns a mock "no verdict"
    # response, so the pipeline keeps moving.
    default_llm_provider: str = "openai"

    # How many offline pipeline detectors may run concurrently after
    # PDF parse. 1 = serial (legacy behaviour). Threads share the
    # parsed doc (read-oriented); env ``MANUSIFT_DETECTOR_WORKERS``
    # overrides this at runtime.
    detector_workers: int = 4
    # Concurrency + per-call timeout for LLM enrichment. Set
    # ``llm_max_concurrency=0`` to disable enrichment entirely
    # (useful for benchmarking the pipeline without LLM cost).
    llm_max_concurrency: int = 4
    # Non-stream chat timeout. Thinking models + large
    # tool schemas often exceed 20s (DeepSeek / Claude
    # thinking). Pilot 2026-07 saw TimeoutError at 120s
    # stream budget; non-stream needs headroom too.
    llm_call_timeout_seconds: float = 300.0
    # Streaming chat timeout (SSE). Thinking models can
    # pause a long time between events; 600s covers a
    # heavy multi-detector planning turn over a local
    # proxy without aborting mid-response.
    llm_stream_timeout_seconds: float = 600.0
    # Hard cap on total time spent enriching; after this the
    # remaining findings are marked llm_skipped.
    llm_enrichment_budget_seconds: float = 30.0

    # Report language: "zh" (Chinese, default) or "en" (English).
    # Controls the investigation_pairs / llm_report narrative language.
    # CLI ``--lang en`` sets MANUSIFT_REPORT_LANGUAGE=en.
    report_language: str = "zh"

    # R-audit (2026-06-10):
    # allow the LLM to use
    # ``read_file`` /
    # ``ingest_from_path``
    # / ``list_dir`` to
    # access the local
    # filesystem. When
    # ``True`` (default) the
    # LLM can pick up a
    # user-supplied path
    # without the user
    # having to run
    # ``manusift ingest``
    # manually. Set to
    # ``False`` in sandboxed
    # deployments to lock
    # the LLM to the
    # vault-only model
    # (PDFs must be
    # pre-ingested by the
    # admin).
    allow_direct_fs: bool = True

    # R-audit (2026-06-14):
    # the local
    # chat-TUI profile
    # ("trusted-local")
    # is the default
    # for desktop users
    # who paste in a
    # paper directory
    # and want ManuSift
    # to actually be
    # able to read
    # the files, run
    # Python data
    # transforms,
    # install declared
    # deps, and write
    # the report. The
    # production web
    # / multi-tenant
    # path can flip
    # this off via
    # ``MANUSIFT_TRUSTED_LOCAL=false``
    # without changing
    # any other knob.
    # When ``False``,
    # the bash tool
    # falls back to
    # the original
    # conservative
    # behaviour
    # (read-only
    # env), the data
    # source ingestion
    # refuses more
    # than 3 files,
    # and the
    # tool-call per-
    # name cap drops
    # to 3 (the old
    # default).
    trusted_local: bool = True

    # R-audit (2026-06-14):
    # cap the number
    # of times the
    # same (tool_name,
    # args) signature
    # may be re-issued
    # in one run.
    # ``trusted_local``
    # raises the cap
    # from 3 to 12
    # because honest
    # workflows (e.g.
    # iterating over
    # 8 figures with
    # image_dup) easily
    # exceed 3.
    # ``0`` disables
    # The env name uses the same stem as the
    # field minus the ``_cap`` suffix because the
    # ``_cap`` suffix is a syntactic accident of
    # the field name (``tool_calls_per_name_cap``)
    # and reads more naturally in env-var form as
    # ``MAX_CALLS_PER_NAME``.
    tool_calls_per_name_cap: int = 12

    # R-audit (2026-06-14):
    # cap the total
    # number of tool
    # calls in a
    # single turn
    # (sum of all
    # tool names).
    # Replaces the
    # implicit "loop
    # never ends"
    # failure mode
    # where the LLM
    # would burn
    # thousands of
    # tool calls on
    # a runaway
    # detector loop.
    # ``0`` disables.
    # Env: ``MANUSIFT_TOOL_MAX_CALLS_PER_TURN``.
    tool_calls_per_turn_cap: int = 50

    # R-audit (2026-06-14):
    # cap on the
    # number of
    # shell commands
    # per turn. The
    # previous hard
    # limit was 3
    # (which tripped
    # the moment the
    # LLM tried to
    # ``pip install``
    # a declared
    # dep + run a
    # small Python
    # transform +
    # re-run a
    # detector).
    # ``0`` disables.
    # Env: ``MANUSIFT_BASH_MAX_CALLS_PER_TURN``.
    bash_max_calls_per_turn: int = 30

    # R-audit (2026-06-14):
    # cap on the
    # number of
    # companion data
    # files
    # (XLSX / CSV /
    # TSV / JSON /
    # ZIP) the
    # ingest step
    # will copy
    # into the
    # job materials
    # folder.
    # ``0`` disables
    # the cap.
    # Env: ``MANUSIFT_DATA_SOURCE_MAX_FILES``.
    data_source_max_files: int = 100

    # R-audit (2026-06-10):
    # web-search API key
    # for the ``web_search``
    # tool. Provider
    # selection
    # (``web_search_provider``)
    # is a string: ``"tavily"``
    # / ``"brave"`` /
    # ``"duckduckgo"``
    # (no key needed). The
    # DuckDuckGo backend
    # is the default and
    # works out of the box;
    # Tavily / Brave give
    # better result quality
    # when an API key is
    # provided.
    web_search_provider: str = "duckduckgo"
    tavily_api_key: SecretStr | None = None
    brave_api_key: SecretStr | None = None
    # R-audit (2026-06-10):
    # command execution
    # safety. When
    # ``True`` (default)
    # the ``bash`` tool
    # runs commands. When
    # ``False`` the tool is
    # disabled. Either
    # way, every command
    # is run through a
    # deny-list blocklist
    # (rm -rf /, mkfs,
    # dd to a block dev,
    # shutdown, etc.).
    allow_shell: bool = True
    # R-2026-06-15 (Phase 2 + P2-5):
    # the per-call
    # ``shell_timeout_seconds``
    # has a hard cap of
    # ``MANUSIFT_MAX_SHELL_TIMEOUT_SECONDS``-or-600
    # (10 minutes).  A
    # runaway shell that
    # takes 24 hours to
    # exit would block
    # the agent loop
    # indefinitely; the
    # cap is enforced at
    # *two* layers:
    #   1. ``Settings`` field
    #      validation rejects
    #      any value
    #      ``> MAX`` at
    #      construction
    #      time;
    #   2. ``BashTool.execute``
    #      clamps the
    #      user-supplied
    #      ``timeout_seconds``
    #      to ``max(timeout,
    #      1.0)`` so a
    #      buggy caller
    #      cannot bypass the
    #      cap with
    #      ``timeout_seconds=10**9``.
    # The default of 30s
    # matches the original
    # behaviour.
    shell_timeout_seconds: float = Field(
        default=30.0,
        ge=0.1,
        le=600.0,
        description=(
            "Hard cap on a single "
            "BashTool command's "
            "execution time.  "
            "Larger values are "
            "rejected at Settings "
            "construction; the "
            "BashTool also clamps "
            "the per-call value "
            "to this cap as a "
            "defence-in-depth. "
            "The lower bound is "
            "0.1s (one tenth of "
            "a second) so tests "
            "can exercise "
            "``TimeoutExpired`` "
            "with a small "
            "value."
        ),
    )
    # R-2026-06-15 (Phase 0.9):
    # the default working
    # directory for the
    # ``BashTool``. An
    # empty string means
    # "use the system /
    # input / context CWD,
    # in that order". A
    # non-empty value is
    # used as the
    # ``cwd=`` argument
    # to ``subprocess.run``
    # and overrides
    # any per-call
    # ``cwd`` in the tool
    # input. The path is
    # validated at the
    # call site (existence
    # is checked; a
    # missing path
    # returns a typed
    # ``data_source_missing``
    # error rather than
    # crashing the
    # shell). Env:
    # ``MANUSIFT_BASH_CWD``.
    bash_cwd: str = ""

    # R-2026-06-15 (Phase 0 +
    # 3c): prompt-cache TTL.
    # Anthropic supports
    # ``"ephemeral"``
    # (default 5 min),
    # ``"5m"``, ``"1h"``,
    # or ``"off"`` (no
    # cache marker sent).
    # OpenAI does not
    # expose the TTL knob
    # at the API level, but
    # the same vocabulary
    # is forwarded as
    # ``extra_body.cache``
    # so providers that
    # do support it pick
    # it up. The cache
    # key is the session
    # id, so a
    # ``/resume`` of the
    # same session lands
    # on the same cache
    # bucket (100% hit on
    # the first turn).
    # Env:
    # ``MANUSIFT_PROMPT_CACHE_TTL``.
    prompt_cache_ttl: str = "ephemeral"

    # R-audit (2026-06-14):
    # Python interpreter
    # the ``python_exec``
    # tool uses. Empty
    # string means
    # "use ``sys.executable``
    # at first use" so
    # a sub-shell launched
    # by the bash tool can
    # find the same Python
    # + dependencies as
    # the parent process.
    # Env: ``MANUSIFT_PYTHON_EXECUTABLE``.
    python_executable: str = ""

    def model_post_init(self, __context: Any) -> None:
        """Default ``python_executable`` to
        ``sys.executable`` at first instantiation.

        We do this in ``model_post_init`` rather than
        as a field default because pydantic-settings
        requires a string default, and we want
        ``sys.executable`` resolved at the right
        time (not at class definition time, which
        can give a stale value under ``python -c``
        entry points).
        """
        if not self.python_executable:
            import sys
            object.__setattr__(
                self,
                "python_executable",
                sys.executable,
            )


    # Pipeline-skip list (benchmark / eval / triage).
    # ```benchmark_skip_detectors``` is a comma-separated list of
    # detector names to NOT run during ```pipeline.run_pipeline```.
    # Used by the benchmark runners (real_eval_fraud_cases_v2) to
    # skip slow OCR / Crossref calls when the eval pass does not
    # need them. Empty by default (all detectors run).
    # The filter is applied in ```manusift.pipeline``` -- it does NOT
    # touch the agent-loop tool list (LLM-visible detectors) and
    # does NOT affect tests.
    benchmark_skip_detectors: str = ""

    # P3.1 (MCP product surface): ``screen_verdict`` triage knobs.
    # Verdict rule (implemented once in manusift/screen_jobs.py and
    # mirrored in the tool description + docs/mcp/README.md):
    # >=1 high-severity issue -> "flagged"; no high but at least
    # ``screen_suspect_medium_issue_threshold`` medium-severity
    # issues -> "suspect"; otherwise "clean". Issues are the P1.1
    # aggregated view, not raw findings. ``screen_top_issues`` caps
    # the top_issues list in the verdict payload.
    # Env: ``MANUSIFT_SCREEN_SUSPECT_MEDIUM_ISSUE_THRESHOLD`` /
    # ``MANUSIFT_SCREEN_TOP_ISSUES``.
    screen_suspect_medium_issue_threshold: int = 3
    screen_top_issues: int = 5

    # Detector thresholds (kept here so the same number governs both
    # production runs and unit tests).
    # Primary whole-image pHash band (bits of 64). Raised 5→8 so
    # lightly re-encoded / mild-crop duplicates still fire; near-
    # identical pairs (d≤4) stay high severity inside image_dup.
    image_duplicate_hamming_threshold: int = 8  # pHash bits

    # R-2026-06-19 (P1-B2):
    # when True, ``ReadFileTool``
    # returns a
    # ``permission_denied``
    # error for paths inside
    # any of the protected
    # directories
    # (``.git`` / ``.svn`` /
    # ``.hg`` / ``.vscode`` /
    # ``.idea`` / ``.husky`` /
    # ``.claude`` /
    # ``.manusift``).  The
    # legacy behavior
    # (allow with a
    # ``protected_dir``
    # hint) is preserved
    # when this is False.
    # Default is True so
    # the LLM never reads
    # the user's
    # ``~/.git/config``
    # or
    # ``.vscode/settings.json``
    # by accident.
    block_protected_dir_reads: bool = True

    # Image forensics: Error Level Analysis. After re-saving the image
    # at a known JPEG quality, we look at the standard deviation of the
    # per-pixel difference against the original, computed on 8x8
    # blocks; we flag the image if the *maximum* block std exceeds the
    # threshold. A composite region typically shows a noticeably
    # higher local variance than the untouched background.
    # Threshold is in 0-255 units (8-bit pixel deltas); empirical
    # baseline for clean re-encodes is around 1-2, splices 3-10+.
    ela_quality: int = 90
    ela_std_threshold: float = 3.0

    # Copy-move: split the image into a grid of this size, hash each
    # cell, and report pairs whose Hamming distance is below
    # ``copy_move_hamming_threshold``.
    copy_move_grid: int = 8  # 8x8 cells
    copy_move_hamming_threshold: int = 6  # pHash bits per cell

    # P0-8 — text-pattern detector knobs. These used
    # to be injected into Settings on first call via
    # ``_ensure_text_settings(settings)``, which
    # relied on the old ``extra="allow"`` escape
    # hatch. Now that the schema is tight
    # (``extra="ignore"``), every detector-owned
    # setting is declared here at module scope so
    # the contract is one place, not scattered.
    text_check_placeholders: bool = True
    text_check_chatbot_disclaimer: bool = True
    text_check_citation_anomaly: bool = True
    text_check_duplicate_passage: bool = True
    text_check_template_phrase: bool = True
    text_duplicate_min_tokens: int = 30
    text_duplicate_min_repeats: int = 2
    text_max_findings_per_check: int = 5

    # P0-10 — Sentry DSN for error aggregation. If
    # unset, the Sentry integration in web/app.py is
    # a no-op. Production deployments set this to
    # the Sentry project's DSN to capture unhandled
    # exceptions in the background analysis task.
    sentry_dsn: str = ""
    # P0-11 — controls the Prometheus ``/metrics``
    # endpoint. ``0`` means disabled (the default; we
    # do not expose metrics on dev). Set to a positive
    # value to enable.
    # G3 — graceful-shutdown timeout. The
    # lifespan (see ``manusift.lifecycle``)
    # waits up to this many seconds for
    # in-flight background jobs to drain
    # before the process exits. 0 disables
    # the wait (SIGTERM exits
    # immediately). 30 s matches
    # ``uvicorn timeout_graceful_shutdown``
    # so the two timers line up — the
    # uvicorn timer is the outer bound on
    # the process lifetime, our timer is
    # the inner bound on the drain.
    # G4 — idempotency-key TTL. A cached
    # response under an Idempotency-Key
    # is replayed if it was recorded less
    # than this many seconds ago. The
    # default (24 hours) matches Stripe's
    # convention and bounds the disk
    # footprint of the on-disk store.
    idempotency_ttl_seconds: float = 86400.0
    shutdown_timeout_seconds: float = 30.0
    prometheus_port: int = 0
    # P2-D1 — the Crossref citation-network detector
    # is opt-out. The detector hits
    # ``api.crossref.org`` once per candidate
    # citation; the request is cached on disk so a
    # second run over the same PDF does not
    # re-query. ``crossref_email`` enables the
    # Crossref polite pool (faster, higher rate
    # limit) — set it to an email you monitor so
    # Crossref can reach you in case of a query
    # problem.
    crossref_enabled: bool = True
    crossref_email: str = ""
    # P2.2 — the OpenAlex cited-retraction detector is
    # opt-IN (default off). It queries
    # ``api.openalex.org`` once per DOI found in the
    # reference list and flags citations of retracted
    # works. Responses are cached on disk
    # (``data/openalex_cache.json``) so a second run
    # over the same PDF does not re-query. Eval /
    # benchmark environments keep this off so the
    # pipeline stays fully offline.
    openalex_enabled: bool = False
    # P2.3 — data-availability-statement link
    # resolution is opt-IN (default off). When on, the
    # ``data_availability_concern`` detector resolves
    # DOI/URL links found in the data-availability
    # statement (HEAD/GET against the repository
    # landing page) and flags confirmed dead links.
    # Network failures degrade to ``info`` findings,
    # never ``high``.
    das_resolution_enabled: bool = False
    # P4.2 — directory holding skill markdown
    # files (``data/skills/`` by default). Host
    # agents / library loops may load these;
    # the conversational chat TUI that once
    # exposed ``/skill`` was removed (B+C).
    # P4.3 — plan-mode gate for agent hosts
    # that support confirmation before tool
    # calls. Env: ``MANUSIFT_PLAN_MODE=1``.
    plan_mode: bool = False
    # Auto-accept tool calls without a
    # confirmation prompt (agent hosts).
    # Env: ``MANUSIFT_AUTO_ACCEPT=1``.
    auto_accept: bool = False

    # E-audit (2026-06) — Obsidian /
    # knowledge-base
    # integration. Two
    # paths, two
    # settings
    # clusters:
    #
    #   A. File path
    #   (default, 0
    #   external
    #   dependency):
    #   set
    #   ``obsidian_vault_path``
    #   to a directory
    #   of .md files. The
    #   Manusift agent
    #   can list /
    #   read / search
    #   them offline. The
    #   ``obsidian_vault_glob``
    #   and
    #   ``obsidian_vault_ignore``
    #   settings control
    #   which files
    #   count as
    #   "notes"
    #   (``**/*.md``
    #   excluding
    #   ``.obsidian/**``
    #   and
    #   ``trash/**``
    #   by default).
    #
    #   B. REST path
    #   (opt-in, needs
    #   the Local REST
    #   API plugin):
    #   set
    #   ``obsidian_rest_api_url``
    #   to
    #   ``https://localhost:27124``
    #   and
    #   ``obsidian_rest_api_key``
    #   to the plugin's
    #   API key. Manusift
    #   then talks to
    #   Obsidian over
    #   HTTPS (the
    #   plugin's
    #   self-signed cert
    #   must be
    #   accepted by the
    #   local trust
    #   store OR the
    #   user sets
    #   ``obsidian_rest_api_verify_tls=False``
    #   in dev).
    #
    # Both paths
    # expose the same
    # four LLM tools
    # (``list_vault_notes``,
    # ``read_note``,
    # ``search_vault``,
    # ``recent_vault_notes``)
    # so the LLM does
    # not have to know
    # which backend is
    # in use.
    obsidian_vault_path: str = Field(default="")
    obsidian_vault_glob: str = "**/*.md"
    obsidian_vault_ignore: str = (
        ".obsidian/**,trash/**"
    )
    obsidian_rest_api_url: str = Field(default="")
    # ``SecretStr`` so the
    # API key never
    # accidentally
    # lands in a JSON
    # dump. The
    # ``resolve_backend``
    # function unwraps
    # it via
    # ``.get_secret_value()``.
    obsidian_rest_api_key: SecretStr | None = None
    # The Local REST
    # API plugin ships
    # a self-signed
    # certificate. On
    # Windows the user
    # has to add the
    # cert to the local
    # trust store OR
    # disable TLS
    # verification. The
    # default ``True``
    # is the safe
    # choice; a user
    # who has accepted
    # the cert can
    # keep ``True``; a
    # user in a dev
    # environment can
    # flip it to
    # ``False`` to
    # bypass the cert
    # check.
    obsidian_rest_api_verify_tls: bool = True

    @property
    def has_openai(self) -> bool:
        # SecretStr is truthy when set, falsy when None —
        # no need to unwrap just to test presence.
        return bool(self.openai_api_key)

    @property
    def has_anthropic(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def has_any_llm(self) -> bool:
        return self.has_openai or self.has_anthropic


def get_settings() -> Settings:
    """Return a cached Settings instance.

    We don't use ``lru_cache`` so tests can monkey-patch the env and
    call this function again.

    R-2026-06-15 (Phase 1 + 3a):
    the settings object is
    also seeded from the
    YAML layer
    (``<workspace>/.manusift/config.yaml``,
    ``<workspace>/.manusift/config.local.yaml``,
    ``<user-config-dir>/manusift/config.yaml``).
    The YAML layer is
    merged AFTER the
    P2.2 JSON layer so
    yaml values override
    JSON values. Env
    vars (handled by
    Pydantic) override
    BOTH.

    The YAML layer
    supports nested
    keys (e.g.
    ``bash.default_cwd``);
    we map them to flat
    Settings fields
    (``bash_cwd``).
    """
    return _build_settings()


# R-2026-06-15 (Phase 1 + 3a):
# mapping
# from
# YAML
# nested
# keys
# to
# flat
# Settings
# field
# names.
# This
# is
# the
# bridge
# between
# ``manusift.yaml``
# (nested,
# human-friendly)
# and
# ``Settings``
# (flat
# Pydantic
# fields).
_YAML_KEY_MAP: dict[str, str] = {
    "bash.default_cwd": "bash_cwd",
    # Future:
    # ``detectors.enabled``,
    # etc.
}


def _build_settings() -> Settings:
    """Build a ``Settings``
    instance seeded from
    the YAML layered
    config (in addition
    to the JSON layered
    config and the env
    vars).

    The merge order is:

      1. P2.2
         JSON
         layered
         config
         (flat
         keys)
      2. R-2026-06-15
         YAML
         layered
         config
         (nested
         keys
         mapped
         to
         flat
         keys
         via
         ``_YAML_KEY_MAP``)
      3. Env
         vars
         (handled
         by
         Pydantic)

    Env vars win
    (Pydantic's env
    precedence is
    higher than the
    field default).

    Note: Pydantic v2's
    ``BaseSettings``
    treats explicit
    kwargs as
    overrides of the
    env var (i.e.
    ``Settings(bash_cwd='X')``
    with
    ``MANUSIFT_BASH_CWD=Y``
    in the env yields
    ``bash_cwd='X'``).
    To preserve the
    Hermes-style "env
    var wins" contract,
    we filter out
    kwargs whose
    corresponding env
    var is set in the
    environment.
    """
    # 1)
    # P2.2
    # JSON
    # layered
    # config.
    flat: dict[str, Any] = load_layered_config()
    # 2)
    # R-2026-06-15
    # YAML
    # layered
    # config.
    yaml_merged = _yaml_settings_layer()
    for (
        nested_key,
        flat_key,
    ) in _YAML_KEY_MAP.items():
        # Walk
        # the
        # nested
        # dict
        # to
        # find
        # the
        # value.
        parts = nested_key.split(".")
        cur: Any = yaml_merged
        for p in parts:
            if not isinstance(cur, dict):
                cur = None
                break
            cur = cur.get(p)
        if cur is not None:
            flat[flat_key] = cur
    # 3)
    # Filter
    # out
    # kwargs
    # whose
    # env
    # var
    # is
    # set
    # (so
    # the
    # env
    # var
    # wins).
    # We
    # compute
    # the
    # env
    # var
    # name
    # for
    # each
    # flat
    # key
    # by
    # upper-casing
    # and
    # pre-pending
    # ``MANUSIFT_``
    # (the
    # project's
    # env
    # prefix).
    _env_prefix = "MANUSIFT_"
    filtered: dict[str, Any] = {}
    for k, v in flat.items():
        env_key = _env_prefix + k.upper()
        if env_key in os.environ:
            # Env
            # var
            # wins;
            # skip
            # the
            # flat
            # value
            # (Pydantic
            # will
            # read
            # the
            # env
            # var).
            continue
        filtered[k] = v
    return Settings(**filtered)


def _yaml_settings_layer() -> dict[str, Any]:
    """Return the merged
    YAML config
    (delegates to
    ``config_yaml.load_yaml_config``
    with the current
    ``Path.cwd()`` as
    the workspace).
    """
    from .config_yaml import (
        load_yaml_config,
    )
    return load_yaml_config(Path.cwd())


# --------------------------------------------------------------------
# P2.2 (R-2026-06-14): layered config
# --------------------------------------------------------------------
# Three layers, applied in order
# (lowest-priority first):
#
#   1. ``user``  -- ``$MANUSIFT_USER_CONFIG``
#      or ``~/manusift.json`` (per-user
#      defaults; lives outside the
#      project).
#   2. ``project`` -- ``<repo>/.manusift.json``
#      (committed defaults; the user
#      can clone and edit).
#   3. ``local``  -- ``<cwd>/.manusift.json``
#      (per-run overrides; never
#      committed).
#
# Each layer is a JSON object whose keys
# are the same names a ``Settings()``
# instance uses (e.g.
# ``{"anthropic_api_key": "..."}``).
# A later layer overrides an earlier one
# for the same key. The merged dict is
# returned (the caller is expected to
# feed it to ``Settings(**merged)`` or
# set the env vars accordingly).
#
# Pattern follows claw-code's
# ``UserConfig::layered`` in
# ``rust/crates/config/src/lib.rs``.


_PROJECT_CONFIG_PATH = _REPO_ROOT / ".manusift.json"


def _user_config_path() -> Path:
    """The user-level config file path.
    Resolved at call time so a test
    that does ``monkeypatch.setenv(
    "MANUSIFT_USER_CONFIG", ...)``
    after import takes effect.
    """
    return Path(
        os.environ.get(
            "MANUSIFT_USER_CONFIG",
            str(Path.home() / "manusift.json"),
        )
    )


def _cwd_config_path() -> Path:
    """The local (cwd) config file path.
    Resolved at call time so a
    ``monkeypatch.chdir(...)`` in a
    test takes effect. The convention
    is ``.manusift.local.json`` so it
    does not collide with the
    project-level ``.manusift.json``
    (which the user may have committed
    to a git repo).
    """
    return Path.cwd() / ".manusift.local.json"


def _safe_read_json(path: Path) -> dict[str, Any]:
    """Read a JSON file. Returns
    ``{}`` for a missing file or a
    parse error (the layered config
    is best-effort: a bad layer
    should not crash the agent).
    """
    if not path.exists():
        return {}
    try:
        import json
        with path.open(
            "r", encoding="utf-8"
        ) as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {}
        return data
    except Exception:  # noqa: BLE001
        return {}


def load_layered_config() -> dict[str, Any]:
    """Return the merged
    user / project / local config
    dict. The local layer wins on a
    key conflict; the project layer
    wins over the user layer.
    """
    user = _safe_read_json(_user_config_path())
    project = _safe_read_json(_PROJECT_CONFIG_PATH)
    local = _safe_read_json(_cwd_config_path())
    merged: dict[str, Any] = {}
    merged.update(user)
    merged.update(project)
    merged.update(local)
    return merged


def config_layers_present() -> dict[str, Path]:
    """Test affordance. Return the
    absolute path of each layer
    that exists on disk.
    """
    out: dict[str, Path] = {}
    up = _user_config_path()
    if up.exists():
        out["user"] = up
    if _PROJECT_CONFIG_PATH.exists():
        out["project"] = _PROJECT_CONFIG_PATH
    cp = _cwd_config_path()
    if cp.exists():
        out["local"] = cp
    return out
