/**
 * Settings-panel wiring guard.
 *
 * `src/client.js` is a plain-JS bundle with no test coverage, and every way a
 * new config key can be half-wired fails SILENTLY — the checkbox renders, the
 * save returns `{ok:true}`, and nothing is persisted (this exact bug shipped
 * once; see CHANGELOG 0.8.x "设置页「静默」在重新扫码后被取消勾选"):
 *
 *   - missing from the form init (`setForm({…})`) ⇒ renders off on load
 *   - missing from the `saveConfig` POST body   ⇒ the save sends nothing
 *   - missing from the JSX                      ⇒ no control at all
 *
 * The host side is equally quiet: `EDITABLE_KEYS` drops unknown keys without
 * an error, and the boolean type-guard silently refuses a non-boolean.
 * These assertions pin the two sides together for every toggle the panel
 * renders, plus 结论模式 specifically.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EDITABLE_KEYS, ConfigStore } from "../src/config-store.js";
import { defaultConfig } from "../src/config.js";

const client = readFileSync(fileURLToPath(new URL("../src/client.js", import.meta.url)), "utf8");

/** Every toggle the WeChat panel renders as a checkbox. */
const RENDERED_TOGGLES = [
  "crossSessionNotify",
  "notifyTaskEvents",
  "silent",
  "finalOnly",
  "surfacePromptEnabled",
] as const;

describe("settings panel ↔ host config wiring", () => {
  it.each(RENDERED_TOGGLES)("%s is an editable config key", (key) => {
    expect(EDITABLE_KEYS as readonly string[]).toContain(key);
    expect(defaultConfig()).toHaveProperty(key);
  });

  it.each(RENDERED_TOGGLES)("%s has a checkbox bound to the form state", (key) => {
    expect(client).toContain(`checked: !!form?.${key}`);
    expect(client).toContain(`setForm({ ...form, ${key}: e.target.checked })`);
  });

  it.each(RENDERED_TOGGLES)("%s is initialised from the server config", (key) => {
    expect(client).toContain(`r.body.config?.${key}`);
  });

  it.each(RENDERED_TOGGLES)("%s is included in the save payload", (key) => {
    expect(client).toContain(`${key}: !!form.${key}`);
  });

  it("the 结论模式 control is labelled and explained to the user", () => {
    expect(client).toContain("结论模式");
    expect(client).toContain("/flush");
    // The panel must point at the WeChat-side switch too: a user who only
    // reads the settings page would otherwise never learn `/final` exists.
    expect(client).toContain("/final on|off");
  });

  // The two text/number fields have their own silent-failure modes, so they are
  // guarded the same way the checkboxes are: a field that is missing from the
  // form init renders empty, and one missing from the save payload sends
  // nothing while the panel still reports success.
  it.each(["sendWechatRateLimitPerMinute", "allowedUsers"])(
    "%s is initialised, rendered and saved",
    (key) => {
      expect(client).toContain(`r.body.config?.${key}`);
      expect(client).toContain(`value: form.${key}`);
      expect(client).toContain(`${key}:`);
      expect((EDITABLE_KEYS as readonly string[]).includes(key)).toBe(true);
    },
  );

  it("accepts both the numeric limit and the allowlist through the store", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-panel-"));
    try {
      const store = new ConfigStore(dir);
      expect(store.update({ sendWechatRateLimitPerMinute: 5 }).sendWechatRateLimitPerMinute).toBe(5);
      expect(store.update({ allowedUsers: ["wxid_a", "wxid_b"] }).allowedUsers).toEqual(["wxid_a", "wxid_b"]);
      // 0 is meaningful (= unlimited), so it must NOT be rejected as falsy.
      expect(store.update({ sendWechatRateLimitPerMinute: 0 }).sendWechatRateLimitPerMinute).toBe(0);
      // Junk is refused rather than persisted.
      expect(store.update({ sendWechatRateLimitPerMinute: -1 }).sendWechatRateLimitPerMinute).toBe(0);
      expect(store.update({ allowedUsers: ["ok", 7] as never }).allowedUsers).toEqual(["wxid_a", "wxid_b"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a plain boolean round-trips through the store the panel posts to", () => {
    // The store's boolean guard is an explicit allow-list; a key missing from
    // it accepts junk silently instead of rejecting it. Uses a throwaway
    // storage dir — NEVER the real `~/.dsh-wechat`.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-panel-"));
    try {
      const store = new ConfigStore(dir);
      expect(store.update({ finalOnly: true }).finalOnly).toBe(true);
      expect(store.update({ finalOnly: "nope" as never }).finalOnly).toBe(true);
      expect(new ConfigStore(dir).stored().finalOnly).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
