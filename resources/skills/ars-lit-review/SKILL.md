---
name: ars-lit-review
description: "ARS academic-paper `lit-review` mode — annotated bibliography in paper format"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-lit-review` (port of the Claude Code slash command). First call the `skill` tool with name `academic-paper` to load that skill (unless it is already loaded in this session), then execute the mode it specifies:

Trigger the `academic-paper` skill in `lit-review` mode. Produces an annotated bibliography rendered as a literature review section. Fidelity spectrum, medium oversight.

For the upstream research-side literature review (annotated bibliography + synthesis report) prefer the `deep-research` skill `lit-review` mode instead.

Mode reference: `MODE_REGISTRY.md` § academic-paper.
Skill entry: `academic-paper/SKILL.md`.

Note: this command was ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, CC-BY-NC-4.0). The deterministic tooling it references (scripts/*.py, MODE_REGISTRY.md, shared/) ships in the upstream repo — clone it alongside this plugin if you need script-based features such as the citation verification gate.
