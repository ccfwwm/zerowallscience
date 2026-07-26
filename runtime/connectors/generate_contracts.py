"""Derive the domain contracts in `fixtures/domain-contracts/contracts/`
from the vendored MCP servers under `bio-tools/lib/`.

The servers are the source of truth. Nothing here is authored by hand: every
field is read out of the shipped Python (or, for the five servers that ship
`schemas.json`, copied from that file verbatim). Anything the code does not
state is left out rather than guessed — in particular there is no synthetic
output schema for the signature-derived servers, because their return shape
is only described in prose.

Run from the repository root:

    python runtime/connectors/generate_contracts.py

Windows note: every file is opened with an explicit utf-8 encoding, because
the console default here is GBK and the vendored sources contain em dashes.
"""

from __future__ import annotations

import ast
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LIB = ROOT / "bio-tools" / "lib"
DOMAINS = LIB / "mcp_bio" / "domains.json"
OUT = ROOT / "fixtures" / "domain-contracts" / "contracts"


def read(path: Path) -> str:
    return io.open(path, encoding="utf-8").read()


def load_json(path: Path):
    return json.loads(read(path))


def package_for(slug: str) -> str:
    """`clinical-trials` -> `mcp_clinical_trials`, as run_server.py expects."""
    return "mcp_" + slug.replace("-", "_")


# ---------------------------------------------------------------- docstrings

ARGS_HEAD = re.compile(r"^\s*(Args|Arguments|Parameters)\s*:\s*$", re.MULTILINE)
RETURNS_HEAD = re.compile(r"^\s*Returns?\b", re.MULTILINE)


def collapse(text: str) -> str:
    return " ".join(text.split())


def split_docstring(doc: str) -> tuple[str, str, str]:
    """Return (summary, args block, returns prose) of a Google-style docstring."""
    if not doc:
        return "", "", ""
    body = doc.strip("\n")
    args_at = ARGS_HEAD.search(body)
    head = body[: args_at.start()] if args_at else body
    rest = body[args_at.end() :] if args_at else ""

    # The `Returns` section may sit inside the head (no Args) or after it.
    returns = ""
    for chunk in (rest, head):
        m = RETURNS_HEAD.search(chunk)
        if m:
            returns = collapse(chunk[m.start() :])
            if chunk is rest:
                rest = chunk[: m.start()]
            else:
                head = chunk[: m.start()]
            break

    return collapse(head), rest, returns


def arg_descriptions(args_block: str) -> dict[str, str]:
    """Parse `name: text` entries out of a Google-style Args block."""
    if not args_block.strip():
        return {}
    lines = [ln for ln in args_block.splitlines() if ln.strip()]
    if not lines:
        return {}
    base = min(len(ln) - len(ln.lstrip()) for ln in lines)
    out: dict[str, str] = {}
    current: str | None = None
    for line in lines:
        indent = len(line) - len(line.lstrip())
        entry = re.match(r"([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*:\s*(.*)$", line.strip())
        if indent == base and entry:
            current = entry.group(1)
            out[current] = entry.group(2).strip()
        elif current:
            out[current] = (out[current] + " " + line.strip()).strip()
    return {k: collapse(v) for k, v in out.items() if v}


# ------------------------------------------------------------------ signature

SCALARS = {"str": "string", "int": "integer", "float": "number", "bool": "boolean"}


def schema_for_annotation(node: ast.expr | None) -> dict:
    """Map a Python annotation onto the JSON Schema the tool actually accepts."""
    if node is None:
        return {}
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        # A stringified annotation, e.g. "list[str]".
        try:
            node = ast.parse(node.value, mode="eval").body
        except SyntaxError:
            return {}
    if isinstance(node, ast.Name):
        name = node.id
        if name in SCALARS:
            return {"type": SCALARS[name]}
        if name in ("dict", "Dict"):
            return {"type": "object"}
        if name in ("list", "List"):
            return {"type": "array"}
        return {}  # Any, or a project type — say nothing rather than guess.
    if isinstance(node, ast.Attribute):
        return {}
    if isinstance(node, ast.Subscript):
        base = node.value
        base_name = base.id if isinstance(base, ast.Name) else getattr(base, "attr", "")
        inner = node.slice
        if base_name in ("list", "List", "Sequence", "Iterable"):
            items = schema_for_annotation(inner)
            return {"type": "array", **({"items": items} if items else {})}
        if base_name in ("dict", "Dict"):
            return {"type": "object"}
        if base_name in ("Optional",):
            return nullable(schema_for_annotation(inner))
        if base_name in ("Literal",):
            values = [e.value for e in getattr(inner, "elts", []) if isinstance(e, ast.Constant)]
            return {"enum": values} if values else {}
        return {}
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        # `str | None`, `int | str | None`
        parts = [node.left, node.right]
        flat: list[ast.expr] = []
        while parts:
            part = parts.pop(0)
            if isinstance(part, ast.BinOp) and isinstance(part.op, ast.BitOr):
                parts = [part.left, part.right] + parts
            else:
                flat.append(part)
        optional = any(isinstance(p, ast.Constant) and p.value is None for p in flat)
        concrete = [
            schema_for_annotation(p)
            for p in flat
            if not (isinstance(p, ast.Constant) and p.value is None)
        ]
        concrete = [c for c in concrete if c]
        if len(concrete) == 1:
            return nullable(concrete[0]) if optional else concrete[0]
        types = [c["type"] for c in concrete if "type" in c]
        if types and len(types) == len(concrete):
            return {"type": sorted(set(types)) + (["null"] if optional else [])}
        return {}
    return {}


def nullable(schema: dict) -> dict:
    if "type" in schema and isinstance(schema["type"], str):
        return {**schema, "type": [schema["type"], "null"]}
    return schema


def literal_default(node: ast.expr):
    """Return the default value when it is a plain literal, else the marker."""
    try:
        return ast.literal_eval(node)
    except (ValueError, SyntaxError):
        return _NO_LITERAL


_NO_LITERAL = object()


def input_schema(func: ast.FunctionDef | ast.AsyncFunctionDef, docs: dict[str, str]) -> dict:
    a = func.args
    positional = a.posonlyargs + a.args
    defaults: list[ast.expr | None] = [None] * (len(positional) - len(a.defaults)) + list(a.defaults)
    properties: dict[str, dict] = {}
    required: list[str] = []

    for arg, default in zip(positional, defaults):
        if arg.arg in ("self", "cls", "ctx"):
            continue
        prop = schema_for_annotation(arg.annotation)
        if arg.arg in docs:
            prop["description"] = docs[arg.arg]
        if default is None:
            required.append(arg.arg)
        else:
            value = literal_default(default)
            if value is not _NO_LITERAL and value is not None:
                prop["default"] = value
        properties[arg.arg] = prop

    for arg, default in zip(a.kwonlyargs, a.kw_defaults):
        prop = schema_for_annotation(arg.annotation)
        if arg.arg in docs:
            prop["description"] = docs[arg.arg]
        if default is None:
            required.append(arg.arg)
        else:
            value = literal_default(default)
            if value is not _NO_LITERAL and value is not None:
                prop["default"] = value
        properties[arg.arg] = prop

    schema: dict = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    return schema


# ------------------------------------------------------------------- upstream

def module_constants(tree: ast.Module) -> dict[str, object]:
    out: dict[str, object] = {}
    for node in tree.body:
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if isinstance(target, ast.Name):
                    value = literal_default(node.value) if node.value else _NO_LITERAL
                    if value is not _NO_LITERAL:
                        out[target.id] = value
    return out


def pacing_for(package: str) -> dict | None:
    """Read the declared politeness interval out of a fleet package's client."""
    client = LIB / package / "client.py"
    if not client.exists():
        return None
    tree = ast.parse(read(client))
    constants = module_constants(tree)
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.name != "__init__":
            continue
        a = node.args
        pairs = list(zip(a.posonlyargs + a.args, [None] * (len(a.posonlyargs + a.args) - len(a.defaults)) + list(a.defaults)))
        pairs += list(zip(a.kwonlyargs, a.kw_defaults))
        for arg, default in pairs:
            if arg.arg not in ("min_interval_s", "sleep_s") or default is None:
                continue
            value = literal_default(default)
            if value is _NO_LITERAL and isinstance(default, ast.Name):
                value = constants.get(default.id, _NO_LITERAL)
            if isinstance(value, (int, float)) and value > 0:
                return {
                    "package": package,
                    "minIntervalSeconds": float(value),
                    "requestsPerSecond": round(1.0 / float(value), 3),
                }
    return None


def helper_map(tree: ast.Module) -> dict[str, str]:
    """`_openalex` -> `openalex_works`, for the lru_cache lazy-import helpers."""
    out: dict[str, str] = {}
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for inner in ast.walk(node):
            if isinstance(inner, ast.ImportFrom) and inner.module:
                out[node.name] = inner.module.split(".")[0]
    return out


def error_helpers(tree: ast.Module) -> dict[str, str]:
    """`_openalex_key_result` -> `openalex_key_required`."""
    out: dict[str, str] = {}
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for inner in ast.walk(node):
            if not (isinstance(inner, ast.Return) and isinstance(inner.value, ast.Dict)):
                continue
            for key, value in zip(inner.value.keys, inner.value.values):
                if (
                    isinstance(key, ast.Constant)
                    and key.value == "error"
                    and isinstance(value, ast.Constant)
                    and isinstance(value.value, str)
                ):
                    out[node.name] = value.value
    return out


def names_called(func: ast.FunctionDef | ast.AsyncFunctionDef) -> set[str]:
    return {n.id for n in ast.walk(func) if isinstance(n, ast.Name)}


# ------------------------------------------------------------------ contracts

def tools_from_signatures(pkg: str, tree: ast.Module) -> tuple[list[dict], list[dict]]:
    helpers = helper_map(tree)
    errors = error_helpers(tree)
    pacing: dict[str, dict] = {}
    for package in sorted(set(helpers.values())):
        found = pacing_for(package)
        if found:
            pacing[package] = found

    tools: list[dict] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if not any("mcp.tool" in ast.unparse(d) for d in node.decorator_list):
            continue

        summary, args_block, returns = split_docstring(ast.get_docstring(node) or "")
        used = names_called(node)
        tool: dict = {
            "name": node.name,
            "description": summary,
            "inputSchema": input_schema(node, arg_descriptions(args_block)),
        }
        if returns:
            tool["returns"] = returns
        upstreams = sorted({helpers[h] for h in used if h in helpers})
        if upstreams:
            tool["upstreams"] = upstreams
        cases = sorted({errors[h] for h in used if h in errors})
        if cases:
            tool["errorCases"] = [
                {"case": case, "expectedError": {"error": case, "message": "string"}}
                for case in cases
            ]
        tools.append(tool)

    tools.sort(key=lambda t: t["name"])
    used_packages = {u for t in tools for u in t.get("upstreams", [])}
    upstreams = [pacing[p] for p in sorted(used_packages) if p in pacing]
    return tools, upstreams


def tools_from_schemas(schemas: dict) -> list[dict]:
    tools = []
    for tool in schemas["tools"]:
        entry = {
            "name": tool["name"],
            "description": collapse(tool.get("description", "").split("\n\n")[0]),
            "inputSchema": tool["input_schema"],
        }
        if "output_schema" in tool:
            entry["outputSchema"] = tool["output_schema"]
        tools.append(entry)
    tools.sort(key=lambda t: t["name"])
    return tools


def build(slug: str, expected: list[str]) -> dict:
    pkg = package_for(slug)
    server = LIB / pkg / "server.py"
    schemas = LIB / pkg / "schemas.json"

    if schemas.exists():
        data = load_json(schemas)
        tools = tools_from_schemas(data)
        contract = {
            "domain": slug,
            "package": pkg,
            "derivedFrom": f"bio-tools/lib/{pkg}/schemas.json",
            "originalConnector": data.get("original_connector"),
            "toolCount": len(tools),
            "tools": tools,
        }
    else:
        tree = ast.parse(read(server))
        tools, upstreams = tools_from_signatures(pkg, tree)
        contract = {
            "domain": slug,
            "package": pkg,
            "derivedFrom": f"bio-tools/lib/{pkg}/server.py",
            "toolCount": len(tools),
            "tools": tools,
        }
        if upstreams:
            contract["upstreams"] = upstreams

    found = sorted(t["name"] for t in contract["tools"])
    if found != sorted(expected):
        missing = sorted(set(expected) - set(found))
        extra = sorted(set(found) - set(expected))
        raise SystemExit(
            f"{slug}: tools do not match domains.json (missing={missing}, extra={extra})"
        )
    return contract


def main() -> int:
    domains = load_json(DOMAINS)
    OUT.mkdir(parents=True, exist_ok=True)

    # Drop anything that is no longer a real domain, so a stale slug cannot
    # linger and pass tests on its own terms.
    keep = {f"{slug}.json" for slug in domains}
    for path in sorted(OUT.glob("*.json")):
        if path.name not in keep:
            path.unlink()
            print(f"removed stale {path.name}")

    total = 0
    for slug, expected in sorted(domains.items()):
        contract = build(slug, expected)
        target = OUT / f"{slug}.json"
        with io.open(target, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(contract, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        total += contract["toolCount"]
        print(f"{slug:26} {contract['toolCount']:3} tools  <- {contract['derivedFrom']}")

    print(f"\n{len(domains)} domains, {total} tools")
    return 0


if __name__ == "__main__":
    sys.exit(main())
