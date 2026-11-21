# @zerowall/dsh-plugin-ai-cloud

English | [中文](README.zh.md)

## Summary

On official Desktop 9.x, remembered credentials use an OS-encrypted Electron vault through private parent-process IPC. Child-process disconnects and timeouts reject the operation and release listeners. Other hosts retain the configured credential provider.

AI Cloud. Provides ZeroWall sign-in, model catalogs, chat and media calls. Credentials stay in Host secure storage. Sign in and synchronize the catalog before choosing models in each feature plugin.

Sign-in, registration and password recovery use one responsive branded dialog sequenced after first-run notices. Connection details stay collapsed by default. The Cloud account settings page has Overview, Recharge and orders, and Model services tabs with one content scroller. The plugin instance shares billing and model state across tabs; payment polling survives page closure. Passwords and verification codes remain local to the authentication form, while explicitly remembered credentials stay in Host secure storage.

Chat models in groups explicitly typed Gemini use Google's native Generative Language streaming protocol. Groups whose names contain 生图 are treated as image-generation groups and remain on the media routes.

Claude chat models expose Low, Medium and High thinking intensity. Adaptive Claude models also expose Max and, where supported, Xhigh; they send native adaptive thinking and output effort. Older thinking models use token budgets. Unsupported levels and the gateway-incompatible Off option stay hidden. After updating this plugin, restart Desktop to load the new model capabilities.

## Use

Managed models use Xhigh when supported, then High, then their first supported effort. Explicit supported selections are retained. Once the account exposes `gpt-6.2-sol`, an unconfigured or original DeepSeek default becomes that model with `xhigh`; other explicit models stay selected. The SDK recognizes `gpt-6.2-sol`, `gpt-6.2-astra` and `claude-fable-5-2`.

Managed model context capacity and output capacity are independent. Catalog output capacity does not become a per-request cap. OpenAI Responses, Chat Completions and Gemini omit optional output limits unless the caller supplies one; Anthropic Messages requires `max_tokens` and uses the model's advertised output capacity. Model and gateway limits still apply. Empty upstream truncation responses without generated content or output usage are reported as retryable `EMPTY_RESPONSE` failures instead of successful output exhaustion.

The generated [models.dev capacity reference](src/account/host/models-dev-context.ts) records its source, fetch time and response SHA-256. Refresh it with `pnpm --filter @zerowall/dsh-plugin-ai-cloud run models:refresh`; gateway capacity remains authoritative, and model-owner limits take priority over third-party provider limits.

Each startup loads bundled or cached capacities immediately and refreshes models.dev asynchronously, with a 20-second network timeout. Failed refreshes retain the working snapshot. The validated cache is written atomically under the DSH home cache directory; disposal cancels refresh and waits for completion.

ZeroWall Desktop selects this package from its installation manifest. Open Plugins to inspect status and package-owned settings. The tested baseline is DSH 0.2.2-rc.1 and Node.js 24.9 or later. Preserve existing configuration and data when updating.

See the [retained migration reference](migration-reference.md) for detailed workflows and historical platform requirements. The package manifest owns current dependency versions.

## Development

Build and inspect archives from the repository root:

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

Keep the package LICENSE and any third-party notices with redistributions.

The account header refreshes account details and models. Saved credentials reauthenticate first; sessions without a saved password refresh their token and model catalog. New profiles default to XYZ direct, followed by HK Hong Kong and CN backup. Explicit gateway selections remain stored.
