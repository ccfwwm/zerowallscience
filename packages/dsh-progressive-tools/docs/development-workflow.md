# Development with a coding agent

## Start from an observable outcome

Read [AGENTS.md](../AGENTS.md), [contributing](../CONTRIBUTING.md), and the
owning module before editing. Record the current branch and worktree state.
Define one behavior, its acceptance evidence, and the supported runtime.
For example: “After discovery, the next request has identical tool bytes and
system text, and a discovered target executes through its ordinary policy.”

Create a focused branch. Preserve unrelated edits and never stage everything
without checking the staged diff. Do not change dependencies, public modes,
or session protocols merely to make a failing fixture pass.

## Make the smallest complete change

1. Reproduce the problem at the public runtime boundary.
2. Identify the owner: catalog ranking, state, prompt projection, routing, or replay.
3. Implement the change with public services and reversible effects.
4. Add behavior tests, including resume/unload when state or lifecycle changes.
5. Update both overviews, configuration, architecture and changelog if behavior changes.
6. Run the required checks and inspect the staged diff before committing.

An agent's explanation is not acceptance evidence. Keep a failing request,
assertion, or reproducible scenario that a maintainer can inspect. When a
runtime moves a field, verify where real requests now carry the value rather
than preserving assertions that compare two absent fields.

## Review checklist

- The first request is already small; ordinary discovery does not mutate the prefix.
- Native and SDK presentation describe the same permitted route.
- Deferred calls traverse the underlying tool's complete execution pipeline.
- Failed discovery does not commit state; another agent cannot inherit that state.
- Resume and plugin unload preserve their documented contracts.
- Documentation distinguishes measurements, estimates, fixtures, and untested behavior.
- No secrets, generated dependencies, or unrelated workspace files are staged.

Use a Conventional Commit subject. PRs should state the user-visible change,
compatibility impact, validation evidence, and remaining limits. Release work
follows [releasing](releasing.md); publishing a repository release is separate
from publishing an npm package.
