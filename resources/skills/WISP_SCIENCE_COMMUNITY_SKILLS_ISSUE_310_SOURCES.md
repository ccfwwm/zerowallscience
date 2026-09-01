# Wisp Science community Skills issue 310 source record

ZeroWall Science 4.3.15 integrates ten user-supplied community Skills from the
`wisp-science-community-skills-issue-310` contribution bundle received on
2026-09-01:

```text
bioinfor-figure-export
bioinfor-literature-search-digest
bioinfor-public-data-access
code-organization
managing-pixi-environments
pixi-environment-builder
project-scaffold
sc-upstream
singlecell-milor
singlecell-qc
```

`WISP_SCIENCE_COMMUNITY_SKILLS_ISSUE_310_MANIFEST.json` preserves the supplied
bundle's pre-adaptation file list, byte counts, and SHA-256 values. The bundle
did not include a standalone license file. It was supplied by the repository
owner for integration into this AGPL-3.0-only project.

## ZeroWall adaptation

- Retained each `SKILL.md`, referenced guide, script, template, asset, eval, and
  `agents/openai.yaml` file needed by the workflow.
- Excluded the bundle-level introduction and scratch text files because they
  are not runtime Skills.
- Replaced Wisp-specific connector wording with ZeroWall's live MCP/tool
  discovery contract.
- Added ZeroWall credential, approval, long-running execution, workspace path,
  dependency, and cross-platform boundaries without changing the scientific
  methods.
- Added packaged-runtime checks for every imported Skill.
