import { describe, expect, it } from "vitest";
import {
  assertTrustedWorkspaceAuthority,
  isTrustedWorkspaceRequest
} from "../src/workspace-request-trust.js";

function request(headers: Record<string, string | undefined>) {
  return { headers };
}

describe("workspace browser trust", () => {
  it("accepts loopback and explicitly trusted same-origin authorities", () => {
    expect(isTrustedWorkspaceRequest(request({ host: "127.0.0.1:3080" }), [])).toBe(true);
    expect(isTrustedWorkspaceRequest(request({
      host: "studio.internal:3080",
      origin: "http://studio.internal:3080",
      "sec-fetch-site": "same-origin"
    }), ["studio.internal:3080"])).toBe(true);
  });

  it("rejects DNS-rebinding, cross-site and opaque-origin requests", () => {
    expect(isTrustedWorkspaceRequest(request({ host: "evil.example:3080" }), [])).toBe(false);
    expect(isTrustedWorkspaceRequest(request({
      host: "localhost:3080",
      origin: "http://evil.example"
    }), [])).toBe(false);
    expect(isTrustedWorkspaceRequest(request({
      host: "localhost:3080",
      "sec-fetch-site": "cross-site"
    }), [])).toBe(false);
    expect(isTrustedWorkspaceRequest(request({ host: "localhost:3080", origin: "null" }), [])).toBe(false);
  });

  it("validates configured authorities without widening malformed entries", () => {
    expect(() => { assertTrustedWorkspaceAuthority("studio.internal:3080"); }).not.toThrow();
    for (const entry of ["studio.internal/path", "user@studio.internal", " studio.internal", "studio.internal:"]) {
      expect(() => { assertTrustedWorkspaceAuthority(entry); }).toThrow(/bare host\[:port\] authority/u);
    }
  });

});
