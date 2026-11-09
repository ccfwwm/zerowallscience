#!/usr/bin/env python3
"""Create, validate, and inventory provider-neutral public-data download plans."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROVIDERS: dict[str, dict[str, Any]] = {
    "geo": {
        "data_types": ["metadata", "series-matrix", "soft", "supplementary", "raw-reads"],
        "transports": ["auto", "mcp", "api", "https", "ftp", "manual"],
        "identifier_hint": "GSE, GDS, GSM, or GPL accession",
    },
    "sra": {
        "data_types": ["metadata", "run-info", "raw-reads"],
        "transports": ["auto", "mcp", "api", "https", "ftp", "sra-toolkit", "manual"],
        "identifier_hint": "SRP/SRR/SRS/SRX, ERP/ERR, DRP/DRR, or BioProject accession",
    },
    "ena": {
        "data_types": ["metadata", "run-info", "raw-reads"],
        "transports": ["auto", "mcp", "api", "https", "ftp", "manual"],
        "identifier_hint": "study, experiment, sample, or run accession",
    },
    "gdc": {
        "data_types": [
            "manifest",
            "files",
            "expression",
            "mutations",
            "copy-number",
            "clinical",
            "methylation",
        ],
        "transports": ["auto", "mcp", "api", "https", "gdc-client", "manual"],
        "identifier_hint": "TCGA project, case, file UUID, or saved query identifier",
    },
    "gtex": {
        "data_types": [
            "gene-expression",
            "median-expression",
            "sample-expression",
            "tissue-metadata",
            "bulk-files",
        ],
        "transports": ["auto", "mcp", "api", "https", "manual"],
        "identifier_hint": "release, gene, tissue, or named query",
    },
    "depmap": {
        "data_types": [
            "model-metadata",
            "expression",
            "mutations",
            "copy-number",
            "dependency",
            "release-files",
        ],
        "transports": ["auto", "mcp", "api", "https", "manual"],
        "identifier_hint": "release, model, file, or named query",
    },
    "custom": {
        "data_types": ["metadata", "files"],
        "transports": ["auto", "api", "https", "ftp", "manual"],
        "identifier_hint": "stable catalog identifier or URL",
    },
}


def utc_now() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def parse_size(value: str) -> int:
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*([KMGTPE]?I?B)?\s*", value, re.I)
    if not match:
        raise argparse.ArgumentTypeError(
            "size must be an integer byte count or a value such as 500MB, 10GB, or 2GiB"
        )
    number = float(match.group(1))
    unit = (match.group(2) or "B").upper()
    decimal = {"B": 1, "KB": 10**3, "MB": 10**6, "GB": 10**9, "TB": 10**12, "PB": 10**15, "EB": 10**18}
    binary = {"KIB": 2**10, "MIB": 2**20, "GIB": 2**30, "TIB": 2**40, "PIB": 2**50, "EIB": 2**60}
    multiplier = decimal.get(unit, binary.get(unit))
    if multiplier is None:
        raise argparse.ArgumentTypeError(f"unsupported size unit: {unit}")
    return int(number * multiplier)


def parse_filters(values: list[str]) -> dict[str, str]:
    filters: dict[str, str] = {}
    for item in values:
        if "=" not in item:
            raise ValueError(f"filter must use key=value syntax: {item!r}")
        key, value = item.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or not value:
            raise ValueError(f"filter key and value must be non-empty: {item!r}")
        if key in filters:
            raise ValueError(f"duplicate filter key: {key}")
        filters[key] = value
    return filters


def safe_segment(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-.")
    return value or "dataset"


def build_plan(args: argparse.Namespace) -> dict[str, Any]:
    provider = args.provider.lower()
    identifier = args.identifier.strip()
    output_dir = args.output_dir or f"data/public/{provider}/{safe_segment(identifier)}"
    manifest_path = args.manifest_path or str(Path(output_dir) / "manifest.json")
    return {
        "schema_version": 1,
        "created_at": utc_now(),
        "dataset": {
            "provider": provider,
            "identifier": identifier,
            "data_type": args.data_type,
            "release": args.release,
            "filters": parse_filters(args.filters),
        },
        "acquisition": {
            "transport": args.transport,
            "resume": args.resume,
            "overwrite": args.allow_overwrite,
            "max_files": args.max_files,
            "max_bytes": args.max_bytes,
            "checksum": args.checksum,
        },
        "output": {
            "directory": output_dir,
            "manifest": manifest_path,
        },
        "approval": {
            "required": True,
            "status": "pending",
        },
        "provenance": {
            "adapter": None,
            "adapter_version": None,
            "query_url": None,
        },
        "notes": args.notes,
    }


def looks_absolute(path: str) -> bool:
    return path.startswith(("/", "\\\\")) or bool(re.match(r"^[A-Za-z]:[\\/]", path))


def validate_plan(plan: Any) -> dict[str, list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(plan, dict):
        return {"errors": ["plan must be a JSON object"], "warnings": []}
    if plan.get("schema_version") != 1:
        errors.append("schema_version must be 1")

    dataset = plan.get("dataset")
    acquisition = plan.get("acquisition")
    output = plan.get("output")
    approval = plan.get("approval")
    if not isinstance(dataset, dict):
        errors.append("dataset must be an object")
        dataset = {}
    if not isinstance(acquisition, dict):
        errors.append("acquisition must be an object")
        acquisition = {}
    if not isinstance(output, dict):
        errors.append("output must be an object")
        output = {}
    if not isinstance(approval, dict):
        errors.append("approval must be an object")
        approval = {}

    provider = str(dataset.get("provider") or "").lower()
    identifier = str(dataset.get("identifier") or "").strip()
    data_type = str(dataset.get("data_type") or "")
    provider_info = PROVIDERS.get(provider)
    if provider_info is None:
        errors.append(f"unsupported provider: {provider!r}")
    else:
        if data_type not in provider_info["data_types"]:
            errors.append(
                f"unsupported data_type {data_type!r} for {provider}; "
                f"choose one of {provider_info['data_types']}"
            )
        transport = str(acquisition.get("transport") or "")
        if transport not in provider_info["transports"]:
            errors.append(
                f"unsupported transport {transport!r} for {provider}; "
                f"choose one of {provider_info['transports']}"
            )
    if not identifier:
        errors.append("dataset.identifier is required")

    accession_patterns = {
        "geo": r"^(GSE|GDS|GSM|GPL)\d+$",
        "sra": r"^((SR|ER|DR)[APRSX]\d+|PRJ(NA|EB|DB)\d+)$",
        "ena": r"^((SR|ER|DR)[APRSX]\d+|PRJ(NA|EB|DB)\d+)$",
        "gdc": r"^(TCGA-[A-Z0-9-]+|[0-9a-fA-F-]{32,36}|[A-Za-z0-9._:-]+)$",
    }
    pattern = accession_patterns.get(provider)
    if identifier and pattern and not re.match(pattern, identifier, re.I):
        warnings.append(
            f"identifier {identifier!r} is unusual for provider {provider}; verify it during discovery"
        )

    filters = dataset.get("filters", {})
    if not isinstance(filters, dict):
        errors.append("dataset.filters must be an object")
    if provider == "gtex" and data_type == "gene-expression" and not (
        isinstance(filters, dict) and any(k in filters for k in ("gene", "genes"))
    ):
        warnings.append("GTEx gene-expression plans normally include a gene or genes filter")
    if provider == "gdc" and data_type not in ("manifest", "files") and not filters:
        warnings.append("GDC analysis-product plans should record workflow/sample filters")

    for field in ("max_files", "max_bytes"):
        value = acquisition.get(field)
        if value is not None and (not isinstance(value, int) or isinstance(value, bool) or value <= 0):
            errors.append(f"acquisition.{field} must be a positive integer or null")
    checksum = acquisition.get("checksum")
    if checksum not in ("sha256", "none"):
        errors.append("acquisition.checksum must be 'sha256' or 'none'")
    if acquisition.get("overwrite") is True:
        warnings.append("overwrite is enabled; require explicit user confirmation before execution")
    if acquisition.get("max_files") is None and acquisition.get("max_bytes") is None:
        warnings.append("no transfer limit is set; resolve expected scale before bulk acquisition")

    for field in ("directory", "manifest"):
        value = str(output.get(field) or "").strip()
        if not value:
            errors.append(f"output.{field} is required")
        elif looks_absolute(value):
            warnings.append(f"output.{field} is absolute and reduces plan portability: {value}")

    if approval.get("required") is not True:
        errors.append("approval.required must be true for public-data acquisition plans")
    if approval.get("status") not in ("pending", "approved", "rejected"):
        errors.append("approval.status must be pending, approved, or rejected")

    provenance = plan.get("provenance")
    if not isinstance(provenance, dict):
        errors.append("provenance must be an object")
    notes = plan.get("notes")
    if not isinstance(notes, list) or any(not isinstance(x, str) for x in notes):
        errors.append("notes must be an array of strings")
    return {"errors": errors, "warnings": warnings}


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in {path}: {exc}") from exc


def write_json(path: Path, value: Any, replace: bool = False) -> None:
    if path.exists() and not replace:
        raise ValueError(f"refusing to replace existing file without an explicit flag: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def plan_digest(plan: Any) -> str:
    payload = json.dumps(plan, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build_manifest(
    plan: dict[str, Any], scan_dir: Path, output: Path, checksum: str
) -> dict[str, Any]:
    if not scan_dir.is_dir():
        raise ValueError(f"scan directory does not exist: {scan_dir}")
    files: list[dict[str, Any]] = []
    output_resolved = output.resolve()
    for path in sorted(p for p in scan_dir.rglob("*") if p.is_file()):
        if path.resolve() == output_resolved:
            continue
        stat = path.stat()
        item: dict[str, Any] = {
            "path": path.relative_to(scan_dir).as_posix(),
            "bytes": stat.st_size,
        }
        if checksum == "sha256":
            item["sha256"] = sha256_file(path)
        files.append(item)
    return {
        "schema_version": 1,
        "created_at": utc_now(),
        "plan_sha256": plan_digest(plan),
        "provider": plan.get("dataset", {}).get("provider"),
        "identifier": plan.get("dataset", {}).get("identifier"),
        "scan_root": str(scan_dir),
        "checksum": checksum,
        "summary": {
            "file_count": len(files),
            "total_bytes": sum(item["bytes"] for item in files),
        },
        "files": files,
    }


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("providers", help="print supported providers and adapter capabilities")

    init = sub.add_parser("init", help="create a provider-neutral download plan")
    init.add_argument("--provider", required=True, choices=sorted(PROVIDERS))
    init.add_argument("--identifier", required=True)
    init.add_argument("--data-type", required=True)
    init.add_argument("--release")
    init.add_argument("--filter", dest="filters", action="append", default=[], metavar="KEY=VALUE")
    init.add_argument("--transport", default="auto")
    init.add_argument("--output-dir")
    init.add_argument("--manifest-path")
    init.add_argument("--max-files", type=int)
    init.add_argument("--max-bytes", type=parse_size)
    init.add_argument("--checksum", choices=("sha256", "none"), default="sha256")
    init.add_argument("--no-resume", dest="resume", action="store_false", default=True)
    init.add_argument("--allow-overwrite", action="store_true")
    init.add_argument("--note", dest="notes", action="append", default=[])
    init.add_argument("--plan", required=True, type=Path)
    init.add_argument("--replace-plan", action="store_true")

    validate = sub.add_parser("validate", help="validate an existing plan")
    validate.add_argument("plan", type=Path)

    manifest = sub.add_parser("manifest", help="inventory acquired files")
    manifest.add_argument("plan", type=Path)
    manifest.add_argument("--scan-dir", type=Path)
    manifest.add_argument("--output", type=Path)
    manifest.add_argument("--checksum", choices=("auto", "sha256", "none"), default="auto")
    manifest.add_argument("--replace", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = make_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "providers":
            print(json.dumps(PROVIDERS, indent=2, ensure_ascii=False))
            return 0
        if args.command == "init":
            plan = build_plan(args)
            result = validate_plan(plan)
            if result["errors"]:
                print(json.dumps(result, indent=2, ensure_ascii=False), file=sys.stderr)
                return 2
            write_json(args.plan, plan, replace=args.replace_plan)
            print(json.dumps({"plan": str(args.plan), "validation": result, "content": plan}, indent=2, ensure_ascii=False))
            return 0
        if args.command == "validate":
            plan = read_json(args.plan)
            result = validate_plan(plan)
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return 0 if not result["errors"] else 2
        if args.command == "manifest":
            plan = read_json(args.plan)
            result = validate_plan(plan)
            if result["errors"]:
                print(json.dumps(result, indent=2, ensure_ascii=False), file=sys.stderr)
                return 2
            output_info = plan["output"]
            scan_dir = args.scan_dir or Path(output_info["directory"])
            output = args.output or Path(output_info["manifest"])
            checksum = args.checksum
            if checksum == "auto":
                checksum = plan["acquisition"]["checksum"]
            value = build_manifest(plan, scan_dir, output, checksum)
            write_json(output, value, replace=args.replace)
            print(json.dumps({"manifest": str(output), "summary": value["summary"]}, indent=2))
            return 0
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
