import { describe, expect, it } from "vitest";
import i18n, { NAMESPACES } from "./index";

describe("i18n instance", () => {
  it("initializes with English and the full namespace set", () => {
    expect(i18n.language).toBe("en");
    expect(NAMESPACES).toContain("common");
    expect(NAMESPACES).toContain("review");
    expect(NAMESPACES).toContain("usage");
    expect(NAMESPACES.length).toBe(10);
  });

  it("resolves a seeded key", () => {
    expect(i18n.t("common:actions.save")).toBe("Save");
  });

  it("falls back to English for a not-yet-shipped language", async () => {
    await i18n.changeLanguage("pt-BR");
    // pt-BR is registered but not shipped → no bundled resources → falls back to en.
    expect(i18n.t("common:actions.save")).toBe("Save");
    await i18n.changeLanguage("en");
  });

  it("localizes every action in the Chinese app update dialog", async () => {
    await i18n.changeLanguage("zh-Hans");

    expect(i18n.t("settings:updates.close")).toBe("关闭");
    expect(i18n.t("settings:updates.later")).toBe("稍后");
    expect(i18n.t("settings:updates.download")).toBe("下载更新");
    expect(i18n.t("settings:updates.downloading")).toBe("正在下载…");
    expect(i18n.t("settings:updates.openInstaller")).toBe("打开安装程序");

    await i18n.changeLanguage("en");
  });
});
