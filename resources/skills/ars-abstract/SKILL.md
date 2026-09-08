---
name: ars-abstract
description: "ARS academic-paper `abstract-only` mode — bilingual abstract + keywords"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-abstract` (port of the Claude Code slash command). First call the `skill` tool with name `academic-paper` to load that skill (unless it is already loaded in this session), then execute the mode it specifies:

Trigger the `academic-paper` skill in `abstract-only` mode. Produces a bilingual (zh-TW + EN) abstract plus keywords. Fidelity spectrum, medium oversight. Carries the v3.6.7 `report_compiler_agent` PATTERN PROTECTION layer when invoked through the pipeline.

Mode reference: `MODE_REGISTRY.md` § academic-paper.
Skill entry: `academic-paper/SKILL.md`.

Note: this command was ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, CC-BY-NC-4.0). The deterministic tooling it references (scripts/*.py, MODE_REGISTRY.md, shared/) ships in the upstream repo — clone it alongside this plugin if you need script-based features such as the citation verification gate.
