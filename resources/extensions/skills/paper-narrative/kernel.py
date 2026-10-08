def paper_brief_schema():
    return {
        "type": "object",
        "properties": {
            "pitch": {"type": "string"},
            "vision": {"type": "string"},
            "audience": {"type": "string"},
            "most_arresting_asset": {"type": "string"},
            "figures": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string"},
                        "claim": {"type": "string"},
                        "composite_path": {"type": ["string", "null"]},
                    },
                    "required": ["key", "claim"],
                },
            },
        },
        "required": ["pitch", "vision", "figures"],
    }


def paper_brief_task(abstract_text, figure_claims):
    figure_table = "\n".join(
        f"  {figure.get('key', '?')}: "
        f"{figure.get('claim') or figure.get('caption', '')}"
        for figure in figure_claims
    )
    return f"""Act as the corresponding author. Derive a structured paper brief
from the abstract and figure claims below.

Pitch is the grandest supportable one-sentence biological or scientific claim,
not a method description. Vision states what a reader can now do. Name the one
figure or panel that would be most arresting on a poster. Preserve every supplied
concrete `composite_path`; do not invent paths or artifact ids.

## Abstract
{abstract_text}

## Figures
{figure_table}

Return only data matching the supplied paper brief schema."""


def narrative_review_schema():
    return {
        "type": "object",
        "properties": {
            "hook_verdict": {
                "type": "object",
                "properties": {
                    "would_send_for_review": {
                        "type": "string",
                        "enum": ["yes", "weak", "no"],
                    },
                    "why": {"type": "string"},
                    "fig1_is": {"type": "string"},
                    "fig1_should_be": {"type": "string"},
                },
                "required": ["would_send_for_review", "why", "fig1_should_be"],
            },
            "figure_moves": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "what": {"type": "string"},
                        "from_fig": {"type": "string"},
                        "to_fig": {"type": "string"},
                        "why": {"type": "string"},
                    },
                    "required": ["what", "from_fig", "to_fig", "why"],
                },
            },
            "missing_panels": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "target_fig": {"type": "string"},
                        "what_to_show": {"type": "string"},
                        "analysis_needed": {"type": "string"},
                        "data_hint": {"type": "string"},
                    },
                    "required": ["target_fig", "what_to_show", "analysis_needed"],
                },
            },
            "kill_list": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "what": {"type": "string"},
                        "why": {"type": "string"},
                        "demote_to": {
                            "type": "string",
                            "enum": ["supplement", "caption", "delete"],
                        },
                    },
                    "required": ["what", "why", "demote_to"],
                },
            },
            "arc": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "fig": {"type": "string"},
                        "role": {
                            "type": "string",
                            "enum": ["hook", "mechanism", "evidence", "application", "supplement"],
                        },
                        "one_line": {"type": "string"},
                    },
                    "required": ["fig", "role", "one_line"],
                },
            },
            "boldest_defensible_fig1": {"type": "string"},
        },
        "required": [
            "hook_verdict",
            "figure_moves",
            "missing_panels",
            "kill_list",
            "arc",
            "boldest_defensible_fig1",
        ],
    }


def narrative_review_task(brief, deck_paths, rules_path=None):
    figure_table = "\n".join(
        f"  {figure.get('key', '?')}: "
        f"{figure.get('claim') or figure.get('caption', '')}"
        for figure in brief.get("figures", [])
    )
    paths = "\n".join(f"- `{path}`" for path in deck_paths)
    rules_line = f"\nDesign-rule source: `{rules_path}`" if rules_path else ""
    return f"""Act as the handling editor deciding whether this submission should
be sent for review. Judge the story rather than polishing figure craft.

Inspect every concrete image path with ZeroWall's `view_image` tool. The paths may
be page images rendered from a PDF. Do not invent a file resolver.

## Paper brief
**Pitch:** {brief.get('pitch', '—')}
**Vision:** {brief.get('vision', '—')}
**Audience:** {brief.get('audience', 'general scientist')}
**Most arresting asset:** {brief.get('most_arresting_asset', '—')}

## Figure deck images
{paths}{rules_line}

## Per-figure claims
{figure_table}

Test whether Figure 1 alone creates a compelling hook. Propose the arc from hook
through mechanism and evidence to application; move misplaced panels; specify
missing panels and the concrete analyses needed; identify content to demote or
delete; and state the boldest defensible Figure 1. Return only data matching the
supplied narrative review schema."""
