"""
Extract tool definitions from bio-tools MCP servers and generate manifest files.
"""
import os
import re
import json
from pathlib import Path

MCP_LIB_PATH = Path("runtime/connectors/bio-tools/lib")
OUTPUT_PATH = Path("runtime/connectors/manifests")

# Mapping from mcp_ modules to domain groups
DOMAIN_MAPPING = {
    "mcp_literature": "literature",
    "mcp_genomes": "genomics",
    "mcp_clinical_genomics": "variants",
    "mcp_variants": "variants",
    "mcp_expression": "gene-expression",
    "mcp_protein_annotation": "proteomics",
    "mcp_structures_interactions": ["protein-structure", "protein-interactions"],
    "mcp_chemistry": "chemistry",
    "mcp_zinc": "drug-discovery",
    "mcp_omics_archives": ["metabolomics", "transcriptomics"],
    "mcp_cellguide": "single-cell",
    "mcp_regulation": "pathways",
    "mcp_genes_ontologies": "ontology",
    "mcp_drug_regulatory": "regulatory",
    "mcp_research_resources": ["biobanks", "antibodies"],
    "mcp_cancer_models": "cell-lines",
    "mcp_rna": "transcriptomics",
    "mcp_human_genetics": "clinical-trials",
}

def extract_tools_from_server(server_path: Path):
    """Extract @mcp.tool definitions from a server.py file."""
    with open(server_path, 'r', encoding='utf-8') as f:
        content = f.read()

    tools = []
    # Pattern: @mcp.tool ... def function_name(...) -> ...: """docstring"""
    # Split content by @mcp.tool to process each tool separately
    parts = content.split('@mcp.tool')

    for part in parts[1:]:  # Skip first part (before any @mcp.tool)
        # Extract function name
        func_match = re.search(r'def\s+(\w+)\s*\(', part)
        if not func_match:
            continue

        tool_name = func_match.group(1)

        # Extract docstring - look for triple quotes after the colon
        doc_match = re.search(r':\s*"""([^"]+?)(?:"""|\n\n)', part, re.DOTALL)

        description = tool_name.replace('_', ' ').title()
        if doc_match:
            docstring = doc_match.group(1).strip()
            # Get first sentence or first line
            first_line = docstring.split('\n')[0].strip()
            # Remove trailing periods for consistency
            description = first_line.rstrip('.')

        tools.append({
            "name": tool_name,
            "description": description,
        })

    return tools

def generate_manifests():
    """Generate manifest files for each domain group."""
    OUTPUT_PATH.mkdir(parents=True, exist_ok=True)

    domain_tools = {}

    # Scan all mcp_* directories
    for mcp_dir in sorted(MCP_LIB_PATH.glob("mcp_*")):
        if not mcp_dir.is_dir():
            continue

        server_file = mcp_dir / "server.py"
        if not server_file.exists():
            continue

        mcp_name = mcp_dir.name
        if mcp_name not in DOMAIN_MAPPING:
            print(f"Warning: {mcp_name} not in DOMAIN_MAPPING")
            continue

        tools = extract_tools_from_server(server_file)
        if not tools:
            continue

        domains = DOMAIN_MAPPING[mcp_name]
        if isinstance(domains, str):
            domains = [domains]

        # For now, assign all tools to first domain (manual split needed later)
        primary_domain = domains[0]

        if primary_domain not in domain_tools:
            domain_tools[primary_domain] = []

        domain_tools[primary_domain].extend(tools)

        print(f"{mcp_name} -> {primary_domain}: {len(tools)} tools")

    # Write manifest files
    total_tools = 0
    for domain, tools in sorted(domain_tools.items()):
        manifest_file = OUTPUT_PATH / f"{domain}.json"

        manifest = {
            "domain": domain,
            "toolCount": len(tools),
            "tools": tools,
        }

        with open(manifest_file, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)

        total_tools += len(tools)
        print(f"Generated {manifest_file}: {len(tools)} tools")

    print(f"\nTotal: {total_tools} tools across {len(domain_tools)} domains")
    print(f"Target: 247 tools across 23 domains")
    print(f"Gap: {247 - total_tools} tools")

if __name__ == "__main__":
    generate_manifests()
