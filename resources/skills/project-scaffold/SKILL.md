---
name: project-scaffold
description: Build AI-ready project scaffolds from README requirements. Use this when starting a new project from a README, organizing README.md/AGENTS.md/docs/git/Pixi/data boundaries, deploying project context for human-AI collaboration, deciding what belongs in git versus data/result/figure/tmp, or turning loose project requirements into a maintainable engineering scaffold. This skill should trigger for new project setup, project bootstrapping, AI context design, documentation scaffolding, and reproducible environment entrypoints.
---

# Project Scaffold

## ZeroWall execution contract

These host rules override workflow examples below when they differ.

- Use ZeroWall tools by their actual names. Begin with `read`, `search`, and `grep`; discover optional MCP capabilities with `search_mcp_tools`.
- Keep all generated project files inside the active project or Session workspace and preserve unrelated user files.
- Resolve credentials only through **Settings > Credentials**. Never create, scan, or load project `.env` files and never print secret values.
- Keep network calls, overwrites, repository initialization, and destructive moves approval-gated.
- Do not install runtimes or dependencies automatically. Report the exact missing runtime or package instead.
- Use project-relative paths and cross-platform commands. Gate Unix-only examples behind an explicit WSL, container, or SSH context.

## Overview

Use this skill to turn a README-level project idea into an AI-ready project scaffold. The default working language is Chinese, while stable engineering terms and file names remain English or Chinese-English paired, such as `project scaffold`, `AI context`, `workflow map`, `data lineage`, and `DATA_MANIFEST`.

This skill is the project-starting layer. It defines structure, context, git/data boundaries, and environment entrypoints. It does not own detailed code layout decisions or Pixi solver work; route those to `code-organization`, `managing-pixi-environments`, and `pixi-environment-builder` when needed.

## Operating Mode

Start with read-only discovery. Read `README.md` first when it exists, then inspect existing directories, git status, docs, environment manifests, and large-data conventions. Do not create or edit files until the user has accepted a scaffold design.

Use a two-step deployment model:

1. Parse the README and current project state.
2. Propose a decision-complete scaffold.
3. After user approval, create or update files incrementally.

Keep the user as project owner. Treat AI as the maintainer of drafts, indexes, and consistency checks; the user decides which analysis or project state is accepted.

## Scaffold Design

Read `references/project-docs.md` when designing README, AGENTS, docs, logs, and status files.

The default scaffold should consider:

```text
README.md
AGENTS.md
.gitignore

docs/
  DATA_MANIFEST.md
  ENVIRONMENTS.md
  ai_context/
    project_structure.md
    naming_convention.md
    output_figure_policy.md
    environment_policy.md
    workflow_map.md
    data_lineage.md
    status_policy.md
  log/
    PROJECT_LOG.md

pixi-workspaces/
scripts/ or src/
utils/
data/
result/
figure/
tmp/
```

Do not force every directory into every project. Select the smallest structure that preserves the project's boundaries and future maintainability.

## Routing Rules

Use `code-organization` when the main question is how to organize scripts, source modules, utilities, entrypoints, tests, outputs, or code dependencies.

Use `managing-pixi-environments` when the main question is Pixi workspace boundaries, naming, lifecycle, kernel strategy, or long-term environment governance.

Use `pixi-environment-builder` when the main question is creating, migrating, editing, solving, debugging, or validating actual Pixi environments.

Use this skill itself for the top-level project scaffold and AI context system.

## Required Policies

Read `references/ai-context-system.md` before writing `AGENTS.md` or `docs/ai_context/`.

Read `references/git-data-boundary.md` before writing `.gitignore` or git policies.

Read `references/environment-entrypoint.md` before adding Pixi or environment documentation.

The baseline policies are:

- Git manages source, scripts, utilities, docs, environment manifests, and lightweight configuration.
- Git does not manage `data/`, `output/`, `result/`, `figure/`, `tmp/`, `.pixi/`, caches, large references, indexes, databases, or model weights.
- Large or generated artifacts that do not enter git still need documentation through `DATA_MANIFEST`, `workflow_map`, or `data_lineage` when they become formal project inputs or outputs.
- `AGENTS.md` controls AI behavior; `README.md` is the human/AI entrypoint; `docs/ai_context/` stores engineering rules; `docs/log/PROJECT_LOG.md` stores milestone labels rather than exhaustive history.

## Output Style

Respond in Chinese by default. Keep file names, directory names, commands, and durable engineering concepts in English. When a concept first appears, pair it if useful:

- 项目脚手架 `project scaffold`
- AI 上下文 `AI context`
- 工作流图 `workflow map`
- 数据血缘 `data lineage`
- 数据清单 `DATA_MANIFEST`
- 环境清单 `ENVIRONMENTS`
- 状态系统 `status system`

When presenting a scaffold proposal, include:

- 当前项目意图和假设
- 推荐目录结构
- README/AGENTS/docs responsibilities
- git/data boundary
- environment entrypoint
- code-organization handoff, if relevant
- implementation steps after approval
