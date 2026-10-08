import json
import os
import subprocess
import sys


def public_data_planner_path():
    here = os.path.dirname(sys._getframe().f_code.co_filename)
    if not here:
        raise RuntimeError("skill directory is unavailable in this runtime")
    return os.path.join(here, "scripts", "public_data_plan.py")


def public_data_providers():
    """Return the provider-neutral adapter catalog."""
    result = subprocess.run(
        [sys.executable, public_data_planner_path(), "providers"],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def create_public_data_plan(
    provider,
    identifier,
    data_type,
    plan_path,
    output_dir=None,
    release=None,
    transport="auto",
    filters=None,
    max_files=None,
    max_bytes=None,
):
    """Create a pending plan without downloading data."""
    command = [
        sys.executable,
        public_data_planner_path(),
        "init",
        "--provider",
        str(provider),
        "--identifier",
        str(identifier),
        "--data-type",
        str(data_type),
        "--transport",
        str(transport),
        "--plan",
        str(plan_path),
    ]
    if output_dir is not None:
        command.extend(["--output-dir", str(output_dir)])
    if release is not None:
        command.extend(["--release", str(release)])
    if max_files is not None:
        command.extend(["--max-files", str(max_files)])
    if max_bytes is not None:
        command.extend(["--max-bytes", str(max_bytes)])
    for key, value in (filters or {}).items():
        command.extend(["--filter", f"{key}={value}"])
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def validate_public_data_plan(plan_path):
    """Validate a plan and return errors and warnings."""
    result = subprocess.run(
        [sys.executable, public_data_planner_path(), "validate", str(plan_path)],
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout or result.stderr)
    if result.returncode not in (0, 2):
        raise RuntimeError(result.stderr.strip() or "plan validation failed")
    return payload
