# Environment Entrypoint

Use this reference when a project scaffold needs environment management.

## Principle

The scaffold skill defines where environment context lives. It does not solve concrete dependency conflicts. Route concrete Pixi work to:

- `managing-pixi-environments` for governance, workspace boundaries, naming, and lifecycle;
- `pixi-environment-builder` for creating, migrating, editing, solving, debugging, and validating actual environments.

## Default Structure

For complex projects, prefer a light root plus child workspaces:

```text
pixi.toml
pixi.lock
pixi-workspaces/
  <workspace-name>/
    pixi.toml
    pixi.lock
    README.md
docs/
  ENVIRONMENTS.md
  ai_context/
    environment_policy.md
```

Do not force child workspaces into a small project. One root `pixi.toml` can be enough when all code has one dependency lifecycle.

## AGENTS.md Environment Policy

Include:

```markdown
AI must not install packages with pip, conda, or install.packages() inside a formal project environment unless the user approves it.

Environment changes must be made through the relevant pixi.toml.

Every formal workspace should have a meaningful check task.

External databases, indexes, reference genomes, and model weights are documented resources, not Pixi dependencies.
```

## Documentation

`docs/ENVIRONMENTS.md` should explain what each environment is for and how to check it. It should not duplicate every dependency from `pixi.toml`.
