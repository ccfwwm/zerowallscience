import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Settings desktop ACP boundary", () => {
  it("does not keep the retired OpenCode OAuth HTTP path in the renderer", () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "SettingsPage.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/\.oauthAuthorize\s*\(/);
    expect(source).not.toMatch(/\.oauthCallback\s*\(/);
    expect(source).not.toMatch(/\.refreshProviderCache\s*\(/);
  });
});
