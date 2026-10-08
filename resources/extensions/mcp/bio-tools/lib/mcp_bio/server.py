"""mcp-bio: the single bundled bio-retrieval MCP server.

Aggregates all 23 domain servers (5 tier-1 drop-ins + 18 tier-2 domain
servers) into ONE stdio MCP process. The 247 source tools remain internal and
are reached through eight compact catalog/dispatch tools.
Tool names are globally unique across domains (asserted at import).

The 23-domain partitioning lives on as:
  - ``domains.json`` — domain slug -> sorted tool names. Single source of
    truth for the skill-doc clustering (operon's bundledRegistry mirrors it;
    a tripwire test keeps the copies in sync).
  - the per-domain packages themselves (``mcp_pubmed``, ``mcp_variants``, …),
    which remain independently runnable for development.

Dispatch preserves each tier's wire behavior exactly:
  - tier-1: verbatim embedded schemas + sync handlers via anyio.to_thread —
    identical to Tier1Server (same low-level Server machinery, same
    validation and error shapes).
  - tier-2: pass-through to each domain's FastMCP instance
    (``fm.call_tool``), so content/structured-content conversion matches the
    standalone server.
"""

from __future__ import annotations

import importlib
import json
from importlib import resources

import anyio
import anyio.to_thread
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

from mcp_servers_common.tier1 import READ_ONLY

SERVER_NAME = "bio-mcp-server"
CATALOG_VERSION = "2026-09-07.2"

TIER1_PACKAGES = [
    "mcp_pubmed",
    "mcp_clinical_trials",
    "mcp_chembl",
    "mcp_biorxiv",
    "mcp_biomart",
]

TIER2_PACKAGES = [
    "mcp_cellguide",
    "mcp_variants",
    "mcp_clinical_genomics",
    "mcp_expression",
    "mcp_regulation",
    "mcp_protein_annotation",
    "mcp_rna",
    "mcp_structures_interactions",
    "mcp_omics_archives",
    "mcp_cancer_models",
    "mcp_genes_ontologies",
    "mcp_drug_regulatory",
    "mcp_research_resources",
    "mcp_chemistry",
    "mcp_human_genetics",
    "mcp_literature",
    "mcp_genomes",
    "mcp_zinc",
]


def load_domains() -> dict[str, list[str]]:
    """domain slug -> sorted tool names (the 23-domain partition)."""
    # encoding=utf-8: Windows defaults to the ANSI code page (e.g. GBK), which
    # cannot decode the UTF-8 JSON shipped in this package.
    with resources.files(__package__).joinpath("domains.json").open(
        "r", encoding="utf-8"
    ) as f:
        return json.load(f)


def load_deferred() -> dict:
    """Deferral gate, two independent criteria:

    - ``domains``/``tools``: NET-NEW upstream resources vs operon main,
      deferred pending separate legal review. The stacked PR empties these
      lists to enable them — tests and the startup self-check all key off
      this file, so that flip is the single knob.
    - ``license_tools``: upstream LICENSE forbids/restricts commercial use
      (KEGG academic-only, CADD non-commercial, PanglaoDB). Deliberately not
      on the stacked PR's flip — lifted per-upstream when legal clears the
      specific license.

    Fails CLOSED on typos: every named domain/tool must exist in
    domains.json — an unknown slug previously fell out of the gate silently
    with every tripwire still green (#2875 review)."""
    with resources.files(__package__).joinpath("deferred.json").open(
        "r", encoding="utf-8"
    ) as f:
        deferred = json.load(f)
    domains = load_domains()
    all_tools = {n for tools in domains.values() for n in tools}
    bad_domains = set(deferred.get("domains", [])) - set(domains)
    bad_tools = (set(deferred.get("tools", []))
                 | set(deferred.get("license_tools", []))) - all_tools
    if bad_domains or bad_tools:
        raise ValueError(
            "deferred.json names entries unknown to domains.json (a typo "
            f"here would fail OPEN): domains={sorted(bad_domains)} "
            f"tools={sorted(bad_tools)}")
    return deferred


def deferred_tool_names() -> set[str]:
    """All tool names excluded by the deferral gate (whole deferred domains
    plus individually deferred tools, on either criterion)."""
    deferred = load_deferred()
    domains = load_domains()
    names: set[str] = set(deferred.get("tools", []))
    names.update(deferred.get("license_tools", []))
    for d in deferred.get("domains", []):
        names.update(domains.get(d, []))
    return names


def _pkg_for_domain(domain: str) -> str:
    return "mcp_" + domain.replace("-", "_")


class BioAggregate:
    """Union of the tier-1 handler maps and tier-2 FastMCP instances."""

    def __init__(self) -> None:
        deferred = load_deferred()
        skip_pkgs = {_pkg_for_domain(d) for d in deferred.get("domains", [])}
        # Compact mode keeps every mapped domain capability available through
        # exact dispatch. deferred.json remains provenance for older bundles,
        # but no longer shrinks the runtime capability surface.
        skip_tools: set[str] = set()

        # tier-1: verbatim schemas + sync handlers
        self.t1_schemas: list[dict] = []
        self.t1_handlers: dict[str, object] = {}
        # Per-domain serialization (reviews 3386234819, 3386420557): worker
        # -thread dispatch runs same-domain calls concurrently, but each
        # domain funnels into ONE process-wide client wrapping a
        # requests.Session (not thread-safe) with non-atomic stats writes.
        # One anyio.Lock per source package, acquired ON THE EVENT LOOP
        # before entering the thread pool — a parked same-domain call waits
        # as a coroutine instead of pinning one of anyio's ~40 shared worker
        # tokens, so a same-domain pile-up can never starve cross-domain
        # calls (the reason the worker dispatch exists).
        self.domain_locks: dict[str, anyio.Lock] = {}
        self.t1_locks: dict[str, anyio.Lock] = {}
        for pkg in TIER1_PACKAGES:
            if pkg in skip_pkgs:
                continue
            pkg_lock = self.domain_locks.setdefault(pkg, anyio.Lock())
            t1 = importlib.import_module(f"{pkg}.server").build_server()
            for name, handler in t1.handlers.items():
                if name in skip_tools:
                    continue
                if name in self.t1_handlers:
                    raise ValueError(f"duplicate tier-1 tool: {name} ({pkg})")
                self.t1_handlers[name] = handler
                self.t1_locks[name] = pkg_lock
            self.t1_schemas.extend(
                s for s in t1.schemas if s["name"] not in skip_tools
            )

        # tier-2: FastMCP instances; dispatch map tool -> fm
        self.t2_fm: dict[str, object] = {}
        self.t2_locks: dict[str, anyio.Lock] = {}
        for pkg in TIER2_PACKAGES:
            if pkg in skip_pkgs:
                continue
            pkg_lock = self.domain_locks.setdefault(pkg, anyio.Lock())
            fm = importlib.import_module(f"{pkg}.server").mcp
            for t in fm._tool_manager.list_tools():
                if t.name in skip_tools:
                    continue
                if t.name in self.t2_fm or t.name in self.t1_handlers:
                    raise ValueError(f"duplicate tool: {t.name} ({pkg})")
                self.t2_fm[t.name] = fm
                self.t2_locks[t.name] = pkg_lock

        served = set(self.t1_handlers) | set(self.t2_fm)
        mapped = {n for tools in load_domains().values() for n in tools}
        expected = mapped - skip_tools
        if served != expected:
            raise ValueError(
                f"domains.json/deferred.json out of sync with served tools: "
                f"only-served={sorted(served - expected)} "
                f"only-expected={sorted(expected - served)}"
            )

    def tool_names(self) -> set[str]:
        return set(self.t1_handlers) | set(self.t2_fm)

    async def internal_tools(self) -> dict[str, Tool]:
        """Return the complete internal schema catalog without advertising it."""
        tools = {
            s["name"]: Tool(
                name=s["name"], description=s["description"],
                inputSchema=s["input_schema"], annotations=READ_ONLY,
            )
            for s in self.t1_schemas
        }
        seen_fm = []
        for fm in self.t2_fm.values():
            if any(fm is candidate for candidate in seen_fm):
                continue
            seen_fm.append(fm)
            tools.update({
                tool.name: tool for tool in await fm.list_tools()
                if tool.name in self.t2_fm
            })
        return tools

    async def call_internal(self, tool: str, arguments: dict):
        """Dispatch one internal capability with the existing locking model."""
        handler = self.t1_handlers.get(tool)
        if handler is not None:
            async with self.t1_locks[tool]:
                text = await anyio.to_thread.run_sync(lambda: handler(arguments))
            return [TextContent(type="text", text=text)]
        fm = self.t2_fm.get(tool)
        if fm is None:
            raise ValueError(f"Unknown internal bio capability: {tool}")

        def _run_in_worker() -> object:
            return anyio.run(fm.call_tool, tool, arguments)

        async with self.t2_locks[tool]:
            return await anyio.to_thread.run_sync(_run_in_worker)


BIO_DOMAIN_GROUPS = {
    "bio_data": {
        "biomart", "biorxiv", "clinical-trials", "drug-regulatory",
        "literature", "omics-archives", "pubmed", "research-resources",
    },
    "bio_annotation": {
        "cellguide", "genes-ontologies", "protein-annotation", "rna",
    },
    "bio_variant": {
        "clinical-genomics", "genomes", "human-genetics", "variants",
    },
    "bio_expression": {"expression", "regulation"},
    "bio_analysis": {
        "cancer-models", "chembl", "chemistry", "structures-interactions",
        "zinc",
    },
}

PUBLIC_TOOLS = {
    "bio_search": "Search the internal Bio capability catalog. Returns short matches by default and one exact input schema when detail=true.",
    "bio_data": "Execute an exact literature, trial, archive, dataset, drug-regulatory, or research-resource capability returned by bio_search.",
    "bio_annotation": "Execute an exact gene, ontology, protein, RNA, or cell annotation capability returned by bio_search.",
    "bio_variant": "Execute an exact variant, clinical-genomics, genome, GWAS, or human-genetics capability returned by bio_search.",
    "bio_expression": "Execute an exact expression or regulatory-genomics capability returned by bio_search.",
    "bio_analysis": "Execute an exact chemistry, structure, interaction, cancer-model, ChEMBL, or ZINC capability returned by bio_search.",
    "bio_jobs": "Inspect Bio execution semantics. Built-in Bio calls are synchronous and do not create persistent server jobs.",
    "bio_artifacts": "Inspect Bio result semantics. Results are returned as structured tool content and do not create hidden artifact files.",
}


def _summary(description: str | None, limit: int = 350) -> str:
    """Keep default catalog responses small while preserving exact detail."""
    text = " ".join(str(description or "").split())
    if len(text) <= limit:
        return text
    return text[: max(1, limit - 3)].rstrip() + "..."


def _capability_maps() -> tuple[dict[str, tuple[str, str]], dict[str, str]]:
    by_id: dict[str, tuple[str, str]] = {}
    public_for_id: dict[str, str] = {}
    assigned_domains = set().union(*BIO_DOMAIN_GROUPS.values())
    domains = load_domains()
    if assigned_domains != set(domains):
        raise ValueError(
            "Bio compact groups are out of sync with domains.json: "
            f"unassigned={sorted(set(domains) - assigned_domains)} "
            f"unknown={sorted(assigned_domains - set(domains))}"
        )
    for public_tool, group_domains in BIO_DOMAIN_GROUPS.items():
        for domain in sorted(group_domains):
            for tool in domains[domain]:
                capability_id = f"bio.{domain}.{tool}"
                by_id[capability_id] = (domain, tool)
                public_for_id[capability_id] = public_tool
    return by_id, public_for_id


def build_public_tools() -> list[Tool]:
    """Build the eight stable tools advertised by the compact MCP surface."""
    dispatch_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "capability_id": {
                "type": "string",
                "description": "Exact bio.<domain>.<tool> id returned by bio_search",
            },
            "arguments": {"type": "object", "default": {}},
        },
        "required": ["capability_id"],
    }

    search_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "query": {"type": "string", "default": ""},
            "capability_id": {"type": "string"},
            "detail": {"type": "boolean", "default": False},
            "limit": {"type": "integer", "minimum": 1,
                      "maximum": 50, "default": 8},
        },
    }
    status_schema = {
        "type": "object", "additionalProperties": False,
        "properties": {"action": {"type": "string", "enum": ["status"],
                                   "default": "status"}},
    }
    return [
        Tool(
            name=name, description=description,
            inputSchema=(search_schema if name == "bio_search" else
                         status_schema if name in {"bio_jobs", "bio_artifacts"}
                         else dispatch_schema),
            annotations=READ_ONLY,
        )
        for name, description in PUBLIC_TOOLS.items()
    ]


def build_server() -> tuple[Server, BioAggregate]:
    agg = BioAggregate()
    server = Server(SERVER_NAME)
    by_id, public_for_id = _capability_maps()

    @server.list_tools()
    async def _list_tools() -> list[Tool]:
        return build_public_tools()

    @server.call_tool()
    async def _call_tool(tool: str, arguments: dict | None):
        args = dict(arguments or {})
        if tool == "bio_search":
            internal = await agg.internal_tools()
            exact_id = str(args.get("capability_id", "")).strip()
            detail = bool(args.get("detail", False))
            if exact_id:
                mapped = by_id.get(exact_id)
                if mapped is None or mapped[1] not in internal:
                    raise ValueError(f"Unknown Bio capability: {exact_id}")
                schema = internal[mapped[1]]
                summary = (schema.description or "") if detail else _summary(schema.description)
                payload = {
                    "catalog_version": CATALOG_VERSION,
                    "capability": {
                        "id": exact_id,
                        "domain": mapped[0],
                        "public_tool": public_for_id[exact_id],
                        "summary": summary,
                    },
                }
                if detail:
                    payload["capability"]["input_schema"] = schema.inputSchema
                return [TextContent(type="text", text=json.dumps(payload))]
            query = str(args.get("query", "")).strip().lower()
            limit = max(1, min(50, int(args.get("limit", 8))))
            matches = []
            for capability_id, (domain, internal_name) in by_id.items():
                schema = internal.get(internal_name)
                if schema is None:
                    continue
                capability_text = capability_id.lower()
                description = str(schema.description or "")
                haystack = f"{capability_text} {description.lower()}"
                if query and query not in haystack:
                    continue
                matches.append({
                    "id": capability_id, "domain": domain,
                    "public_tool": public_for_id[capability_id],
                    "summary": _summary(description),
                    "_rank": (0 if query and query in capability_text else
                              1 if query and query in description.lower() else 2),
                })
            matches.sort(key=lambda item: (item.pop("_rank"), item["id"]))
            matches = matches[:limit]
            return [TextContent(type="text", text=json.dumps({
                "catalog_version": CATALOG_VERSION,
                "public_tool_count": len(PUBLIC_TOOLS),
                "internal_tool_count": len(agg.tool_names()),
                "matches": matches,
            }))]
        if tool == "bio_jobs":
            return [TextContent(type="text", text=json.dumps({
                "mode": "synchronous", "persistent_jobs": False,
            }))]
        if tool == "bio_artifacts":
            return [TextContent(type="text", text=json.dumps({
                "mode": "inline_structured_content", "persistent_artifacts": False,
            }))]
        if tool not in BIO_DOMAIN_GROUPS:
            raise ValueError(f"Unknown tool: {tool}")
        capability_id = str(args.get("capability_id", "")).strip()
        mapped = by_id.get(capability_id)
        if mapped is None or public_for_id.get(capability_id) != tool:
            raise ValueError(
                f"Unknown capability for {tool}: {capability_id}. "
                "Use bio_search to resolve an exact capability id."
            )
        tool_args = args.get("arguments", {})
        if not isinstance(tool_args, dict):
            raise ValueError("arguments must be an object")
        return await agg.call_internal(mapped[1], dict(tool_args))

    return server, agg


def main() -> None:
    server, _ = build_server()

    async def _main() -> None:
        async with stdio_server() as (read, write):
            await server.run(read, write, server.create_initialization_options())

    anyio.run(_main)


if __name__ == "__main__":
    main()
