# Contributing

Contributions are welcome through focused issues and pull requests.

Start with the [documentation map](./docs/README.md). For agent-assisted work,
follow the [development workflow](./docs/development-workflow.md) and the
repository instructions in [AGENTS.md](./AGENTS.md).

## Development setup

Requirements:

- Node.js `^22.19.0` or `>=24.0.0`
- pnpm 11
- The exact host core versions declared in `package.json` (`0.1.5-rc.1` for this release)

```sh
pnpm install
pnpm run check
pnpm peers check
```

## Change guidelines

- Keep runtime behavior on public DeepSeek Harness services and events.
- Preserve per-agent isolation and reversible Cordis cleanup.
- Keep prompt projection and execution routing aligned. Any newly deferred path
  must be covered by the monotonic routing guard and an end-to-end request test.
- Add tests for behavior changes, including resume or unload behavior when
  relevant.
- Update README, configuration reference, architecture notes, and changelog when
  public behavior changes.
- Keep commits focused and use Conventional Commit subjects.

## Pull requests

Describe the user-visible problem, the chosen behavior, compatibility impact,
and verification performed. Keep unrelated refactors out of the same change.

Include resume/unload evidence for lifecycle changes and actual request
assertions for presentation changes. State when a test uses a fixture instead
of a remote service or interpreter. See [testing](./docs/testing.md) for the
current suite boundaries and [releasing](./docs/releasing.md) for publication.
