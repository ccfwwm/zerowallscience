"""
Validate that the connector registry meets P4 Phase 1 requirements.
"""
import json
from pathlib import Path

def validate_registry():
    manifests_dir = Path("runtime/connectors/manifests")

    if not manifests_dir.exists():
        print(f"ERROR: {manifests_dir} does not exist")
        return False

    total_tools = 0
    domain_count = 0
    tool_names = set()
    duplicates = []

    domains = []

    for manifest_file in sorted(manifests_dir.glob("*.json")):
        with open(manifest_file, 'r', encoding='utf-8') as f:
            manifest = json.load(f)

        domain = manifest['domain']
        tool_count = manifest['toolCount']
        tools = manifest['tools']

        # Check toolCount matches actual tools
        if len(tools) != tool_count:
            print(f"WARNING: {domain} toolCount={tool_count} but has {len(tools)} tools")

        # Check for duplicate tool names
        for tool in tools:
            name = tool['name']
            if name in tool_names:
                duplicates.append(name)
            tool_names.add(name)

        domains.append({
            'domain': domain,
            'toolCount': len(tools),
            'tools': [t['name'] for t in tools]
        })

        total_tools += len(tools)
        domain_count += 1

    print(f"\n{'='*60}")
    print(f"P4 Phase 1 Validation Report")
    print(f"{'='*60}\n")

    print(f"Domain Groups: {domain_count} / 23 (target)")
    print(f"Total Tools:   {total_tools} / 247 (target)")

    if duplicates:
        print(f"\nERROR: Duplicate tool names found:")
        for name in duplicates:
            print(f"  - {name}")

    success = (domain_count == 23 and total_tools == 247 and len(duplicates) == 0)

    if success:
        print(f"\n*** P4 Phase 1 COMPLETE ***")
        print(f"23 domain groups with 247 unique tools registered")
    else:
        print(f"\n*** VALIDATION FAILED ***")
        if domain_count != 23:
            print(f"  - Need {23 - domain_count} more domain groups")
        if total_tools != 247:
            print(f"  - Need {247 - total_tools} more tools")
        if duplicates:
            print(f"  - {len(duplicates)} duplicate tool names")

    print(f"\n{'='*60}")
    print(f"Domain Breakdown:")
    print(f"{'='*60}\n")

    for d in sorted(domains, key=lambda x: x['toolCount'], reverse=True):
        print(f"{d['domain']:22} {d['toolCount']:3} tools")

    return success

if __name__ == "__main__":
    import sys
    success = validate_registry()
    sys.exit(0 if success else 1)
