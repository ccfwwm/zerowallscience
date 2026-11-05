---
kind: upgrade-guide
description: "ZeroWall plugin bundle names use the npm account scope instead of the previous Git package scope."
---

# ZeroWall npm plugin names

English | [中文](guide.zh.md)

## Change

ZeroWall AI Cloud and Brand UI use `@ccfwwm/dsh-plugin-ai-cloud` and `@ccfwwm/dsh-plugin-brand-ui`. The former `@zerowall` names identify the Git distributions. New desktop profiles select `@ccfwwm/dsh-bundle-science`, which owns cloud onboarding, account-page selection and plugin-index configuration. Desktop Host does not force an account-page override after user patches.

## Migration

1. Fully quit the desktop app and retain a backup of its profile and user data.
2. Start the updated ZeroWall desktop distribution. It renames enabled built-in bundle entries, saves `package.before-npm-scope.json`, and leaves disabled choices and user patches intact. Separately installed old Git packages remain installed until explicitly removed.
3. For a manual profile, install the new names and replace the old entries in `dsh.profile.bundles`. To select the complete Science suite, follow [npm distribution](../../../developer/zerowall/npm-distribution.md#migration); keep only one composition enabled.
4. Restart and confirm the account entry, model settings and brand marks. New profiles obtain account presentation from the Science bundle; existing user patches continue to take precedence.
