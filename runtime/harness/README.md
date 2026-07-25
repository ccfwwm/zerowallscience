# evolve-agent

A self-evolving single agent. It serves its own goals independently, with no manager or peers. In this repo, it delivers work, reviews itself, and revises itself.

## Core Idea

After each work cycle, ask: what could be better? Save reusable lessons into memory. Promote repeatedly verified lessons into principles. The agent updates its own rule file and keeps improving.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Rule core: identity, mission, principles, and self-evolution loop. |
| `KNOWLEDGE.md` | Knowledge index. |
| `knowledge/` | Current facts: `system.md` covers the system model, and `current-state.md` covers goals and progress. |
| `notes/` | Daily logs appended by date. Old entries are not edited after their day ends. |

## Startup Order

1. Read `AGENTS.md`.
2. Read `KNOWLEDGE.md`.
3. Read the latest 2-3 files in `notes/`.
4. Check the goal, worktree, code, data, and logs.

## Memory Rules

- `knowledge/` stores current facts only; update it when facts change.
- `notes/` stores daily logs; append during the day and do not edit old entries.
- Principle changes go directly into `AGENTS.md`.
