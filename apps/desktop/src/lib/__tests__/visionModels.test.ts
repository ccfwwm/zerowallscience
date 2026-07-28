import { describe, it, expect } from "vitest";
import type { ProviderInfo } from "@zerowall/sdk";
import { attachmentsHaveImage, isVisionModel, pickVisionModel } from "../visionModels";

const kimi: ProviderInfo = {
  id: "zerowall-50",
  name: "国产模型",
  models: [
    { id: "kimi-k3", name: "kimi-k3" },
    { id: "deepseek-v3", name: "deepseek-v3" },
  ],
} as ProviderInfo;

const gpt: ProviderInfo = {
  id: "zerowall-51",
  name: "GPT",
  models: [
    { id: "gpt-5.5", name: "gpt-5.5" },
    { id: "gpt-5.6", name: "gpt-5.6" },
  ],
} as ProviderInfo;

describe("attachmentsHaveImage", () => {
  it("detects raster mimes", () => {
    expect(attachmentsHaveImage([{ filename: "x.png", mime: "image/png", base64: "AA" }])).toBe(
      true,
    );
    expect(attachmentsHaveImage([{ filename: "X.JPEG", mime: "IMAGE/JPEG", base64: "AA" }])).toBe(
      true,
    );
  });
  it("ignores non-images", () => {
    expect(attachmentsHaveImage([{ filename: "a.pdf", mime: "application/pdf", base64: "AA" }])).toBe(
      false,
    );
    expect(attachmentsHaveImage(undefined)).toBe(false);
    expect(attachmentsHaveImage([])).toBe(false);
  });
});

describe("isVisionModel", () => {
  it("matches vision families", () => {
    expect(isVisionModel("GPT", "gpt-5.5", "gpt-5.5")).toBe(true);
    expect(isVisionModel("GPT", "gpt-4o-mini", "GPT-4o mini")).toBe(true);
    expect(isVisionModel("Anthropic", "claude-sonnet-4", "Claude Sonnet 4")).toBe(true);
    expect(isVisionModel("Alibaba", "qwen2-vl-7b", "Qwen2-VL")).toBe(true);
  });
  it("rejects text-only models", () => {
    expect(isVisionModel("国产模型", "kimi-k3", "kimi-k3")).toBe(false);
    expect(isVisionModel("国产模型", "deepseek-v3", "deepseek-v3")).toBe(false);
    expect(isVisionModel("OpenAI", "o1-mini", "o1-mini")).toBe(false);
  });
});

describe("pickVisionModel", () => {
  it("returns null when current is already vision-capable", () => {
    expect(pickVisionModel([kimi, gpt], "zerowall-51/gpt-5.6")).toBeNull();
  });
  it("swaps kimi-k3 to a GPT model", () => {
    expect(pickVisionModel([kimi, gpt], "zerowall-50/kimi-k3")).toBe("zerowall-51/gpt-5.5");
  });
  it("returns null when no vision model exists", () => {
    expect(pickVisionModel([kimi], "zerowall-50/kimi-k3")).toBeNull();
  });
  it("returns null on empty providers", () => {
    expect(pickVisionModel([], "zerowall-50/kimi-k3")).toBeNull();
  });
});
