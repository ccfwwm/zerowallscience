# Documentation map

Release baseline: plugin `0.4.0`, host runtime `0.1.5-rc.1`.

| Your task | Start here |
| --- | --- |
| Understand the product | [English overview](../README.md) · [中文概览](../README.zh-CN.md) |
| Install and verify a profile | [Getting started](getting-started.md) |
| Configure visibility and discovery | [Configuration](configuration.md) |
| Upgrade an existing deployment | [Migration](migration.md) |
| Diagnose a failure | [Troubleshooting](troubleshooting.md) |
| Understand the implementation | [Architecture](architecture.md) · [Disclosure model](progressive-disclosure.md) |
| Change the code with an agent | [Development workflow](development-workflow.md) · [Agent instructions](../AGENTS.md) |
| Understand verification coverage | [Testing](testing.md) |
| Publish or roll back a release | [Releasing](releasing.md) |
| Evaluate future investment | [Roadmap](roadmap.md) · [Dated upstream assessment](upstream-capability-review.md) |
| Report a security issue | [Security policy](../SECURITY.md) |

Runtime compatibility is deliberately narrow. A host version outside the
declared peer versions requires a separate compatibility run; matching the
major or minor number alone is insufficient for these prereleases.
