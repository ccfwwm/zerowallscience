/**
 * Tests for ConfigStore (editable config persistence + merge precedence).
 */

import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { ConfigStore } from "../src/config-store.js";
import { DEFAULT_SURFACE_PROMPT, defaultConfig, LEGACY_SURFACE_PROMPTS } from "../src/config.js";

describe("ConfigStore", () => {
  it("resolves defaults when nothing is stored", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      const base = defaultConfig();
      base.baseUrl = "https://custom.example.com";
      const resolved = store.resolve(base);
      expect(resolved.baseUrl).toBe("https://custom.example.com");
      expect(resolved.textChunkLimit).toBe(4000);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stored values override composition config", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({ baseUrl: "https://stored.example.com", cwd: "F:\\work" });

      const base = defaultConfig();
      base.baseUrl = "https://composition.example.com";
      const resolved = store.resolve(base);
      expect(resolved.baseUrl).toBe("https://stored.example.com");
      expect(resolved.cwd).toBe("F:\\work");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists across instances and ignores unknown keys", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({ cwd: "F:\\work", unknownKey: 42 } as never);

      const reloaded = new ConfigStore(dir);
      expect(reloaded.stored().cwd).toBe("F:\\work");
      expect("unknownKey" in reloaded.stored()).toBe(false);

      const resolved = reloaded.resolve(defaultConfig());
      expect(resolved.cwd).toBe("F:\\work");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists notifyTaskEvents as a global boolean", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({ notifyTaskEvents: true });
      expect(new ConfigStore(dir).resolve(defaultConfig()).notifyTaskEvents).toBe(true);
      store.update({ notifyTaskEvents: false });
      expect(new ConfigStore(dir).stored().notifyTaskEvents).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists silent as a global boolean", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({ silent: true });

      const reloaded = new ConfigStore(dir);
      expect(reloaded.stored().silent).toBe(true);
      expect(reloaded.resolve(defaultConfig()).silent).toBe(true);

      store.update({ silent: false });
      expect(new ConfigStore(dir).stored().silent).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores non-boolean silent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({ silent: "yes" as never });
      expect(store.stored().silent).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists 结论模式 (finalOnly) as a global boolean", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({ finalOnly: true });

      const reloaded = new ConfigStore(dir);
      expect(reloaded.stored().finalOnly).toBe(true);
      expect(reloaded.resolve(defaultConfig()).finalOnly).toBe(true);

      store.update({ finalOnly: false });
      expect(new ConfigStore(dir).stored().finalOnly).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores a non-boolean finalOnly", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({ finalOnly: "yes" as never });
      expect(store.stored().finalOnly).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists the finalOnly windows and rejects non-positive or non-numeric values", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({ finalOnlyIdleMs: 15_000, finalOnlyCeilingMs: 120_000 });
      const reloaded = new ConfigStore(dir);
      expect(reloaded.stored().finalOnlyIdleMs).toBe(15_000);
      expect(reloaded.stored().finalOnlyCeilingMs).toBe(120_000);

      store.update({
        finalOnlyIdleMs: 0,
        finalOnlyCeilingMs: Number.NaN,
      });
      expect(new ConfigStore(dir).stored().finalOnlyIdleMs).toBe(15_000);
      expect(new ConfigStore(dir).stored().finalOnlyCeilingMs).toBe(120_000);

      store.update({ finalOnlyIdleMs: "60000" as never, finalOnlyCeilingMs: -1 });
      expect(new ConfigStore(dir).stored().finalOnlyIdleMs).toBe(15_000);
      expect(new ConfigStore(dir).stored().finalOnlyCeilingMs).toBe(120_000);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults 结论模式 to off with a 45s settle window and a 10min ceiling", () => {
    const cfg = defaultConfig();
    expect(cfg.finalOnly).toBe(false);
    expect(cfg.finalOnlyIdleMs).toBe(45_000);
    expect(cfg.finalOnlyCeilingMs).toBe(600_000);
  });

  it("persists surfacePromptEnabled and surfacePrompt", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({
        surfacePromptEnabled: false,
        surfacePrompt: "custom wechat prompt",
      });

      const reloaded = new ConfigStore(dir);
      expect(reloaded.stored().surfacePromptEnabled).toBe(false);
      expect(reloaded.stored().surfacePrompt).toBe("custom wechat prompt");

      const resolved = reloaded.resolve(defaultConfig());
      expect(resolved.surfacePromptEnabled).toBe(false);
      expect(resolved.surfacePrompt).toBe("custom wechat prompt");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("drops a stored superseded default prompt so the new default applies", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const legacy = LEGACY_SURFACE_PROMPTS[0]!;
      fs.writeFileSync(
        path.join(dir, "config.json"),
        JSON.stringify({ surfacePromptEnabled: true, surfacePrompt: legacy }),
        "utf-8",
      );

      const store = new ConfigStore(dir);
      expect(store.stored().surfacePrompt).toBeUndefined();
      expect(store.resolve(defaultConfig()).surfacePrompt).toBe(DEFAULT_SURFACE_PROMPT);
      // The enable flag is a real user choice and must survive.
      expect(store.resolve(defaultConfig()).surfacePromptEnabled).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps a genuinely edited prompt that merely resembles the default", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const edited = DEFAULT_SURFACE_PROMPT + " 另外请用简体中文。";
      fs.writeFileSync(
        path.join(dir, "config.json"),
        JSON.stringify({ surfacePrompt: edited }),
        "utf-8",
      );

      const store = new ConfigStore(dir);
      expect(store.resolve(defaultConfig()).surfacePrompt).toBe(edited);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores non-boolean surfacePromptEnabled and non-string surfacePrompt", () => {    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({
        surfacePromptEnabled: "yes" as never,
        surfacePrompt: 12 as never,
      });
      expect(store.stored().surfacePromptEnabled).toBeUndefined();
      expect(store.stored().surfacePrompt).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists sendWechatRateLimitPerMinute and accepts 0 as 'unlimited'", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({ sendWechatRateLimitPerMinute: 25 });
      expect(new ConfigStore(dir).stored().sendWechatRateLimitPerMinute).toBe(25);

      store.update({ sendWechatRateLimitPerMinute: 0 });
      expect(new ConfigStore(dir).stored().sendWechatRateLimitPerMinute).toBe(0);

      const reloaded = new ConfigStore(dir);
      expect(reloaded.resolve(defaultConfig()).sendWechatRateLimitPerMinute).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a non-finite or negative rate limit", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({ sendWechatRateLimitPerMinute: 7 });
      // A negative limit would refuse EVERY push, so it is not a valid "off".
      store.update({ sendWechatRateLimitPerMinute: -1 });
      expect(new ConfigStore(dir).stored().sendWechatRateLimitPerMinute).toBe(7);
      store.update({ sendWechatRateLimitPerMinute: Number.NaN });
      expect(new ConfigStore(dir).stored().sendWechatRateLimitPerMinute).toBe(7);
      store.update({ sendWechatRateLimitPerMinute: Number.POSITIVE_INFINITY });
      expect(new ConfigStore(dir).stored().sendWechatRateLimitPerMinute).toBe(7);
      store.update({ sendWechatRateLimitPerMinute: "10" as never });
      expect(new ConfigStore(dir).stored().sendWechatRateLimitPerMinute).toBe(7);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists allowedUsers as an array of strings", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({ allowedUsers: ["wxid_a", "wxid_b"] });
      expect(new ConfigStore(dir).stored().allowedUsers).toEqual(["wxid_a", "wxid_b"]);
      expect(new ConfigStore(dir).resolve(defaultConfig()).allowedUsers).toEqual(["wxid_a", "wxid_b"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a non-array or non-string-membered allowedUsers", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      const store = new ConfigStore(dir);
      store.update({ allowedUsers: ["wxid_ok"] });
      // A stored list containing a non-string would look non-empty (so the
      // first-user fallback is off) while never matching anyone.
      store.update({ allowedUsers: ["wxid_ok", 42] as never });
      expect(new ConfigStore(dir).stored().allowedUsers).toEqual(["wxid_ok"]);
      store.update({ allowedUsers: "wxid_ok" as never });
      expect(new ConfigStore(dir).stored().allowedUsers).toEqual(["wxid_ok"]);
      store.update({ allowedUsers: { 0: "wxid_ok" } as never });
      expect(new ConfigStore(dir).stored().allowedUsers).toEqual(["wxid_ok"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("sanitises a hand-edited allowedUsers read straight from config.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wechat-cfg-"));
    try {
      fs.writeFileSync(
        path.join(dir, "config.json"),
        JSON.stringify({ allowedUsers: ["wxid_ok", 7, null] }),
        "utf-8",
      );
      const store = new ConfigStore(dir);
      expect(store.stored().allowedUsers).toEqual(["wxid_ok"]);

      fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ allowedUsers: "nope" }), "utf-8");
      expect(new ConfigStore(dir).stored().allowedUsers).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults the push governance switches to off / empty", () => {
    const cfg = defaultConfig();
    expect(cfg.sendWechatRateLimitPerMinute).toBe(10);
    expect(cfg.allowedUsers).toEqual([]);
  });
});
