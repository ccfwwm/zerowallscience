# Security policy

## Supported versions

Security fixes are provided for the latest released minor version.
For release `0.4.0`, the supported host core baseline is `0.1.5-rc.1`.
Older plugin/host combinations and later host prereleases need separate
validation; see the [migration guide](./docs/migration.md).

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository. Do not open a
public issue containing exploit details, credentials, or sensitive logs.

Include the affected version, deployment shape, reproduction steps, impact, and
any suggested mitigation. Acknowledgement and next-step timing will be provided
after the report is reproduced and scoped.

## Security model

This plugin controls tool presentation and routing through the Harness
composition layer. Its monotonic guard prevents deferred names from bypassing
the dispatcher, but it is not an authorization boundary for the underlying
capability. Deployments must retain appropriate approval, sandbox, credential,
network, and policy controls.
