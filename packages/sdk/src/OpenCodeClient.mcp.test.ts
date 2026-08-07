import { describe, expect, it, vi } from "vitest";
import { OpenCodeClient } from "./OpenCodeClient";

function response(body: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OpenCodeClient MCP compatibility", () => {
  it("removes an MCP entry through the gateway-compatible config API", async () => {
    const fetchImpl = vi.fn(async () => response());
    const client = new OpenCodeClient({ baseUrl: "https://gateway.test", fetchImpl });

    await client.removeMcpServer("papers");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://gateway.test/global/config",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ mcp: { papers: null } }),
      }),
    );
  });

  it("reconnects and updates local environment without making callers read raw config", async () => {
    const config = {
      mcp: {
        papers: {
          type: "local",
          command: ["python", "-m", "papers"],
          enabled: true,
          environment: { EXISTING: "value" },
        },
      },
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(config))
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response(config))
      .mockResolvedValueOnce(response());
    const client = new OpenCodeClient({ baseUrl: "https://gateway.test", fetchImpl });

    await client.reconnectMcpServer("papers");
    await client.ensureMcpEnvironment("papers", { SAFE_MODE: "true" });

    expect(fetchImpl.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({
      mcp: { papers: { ...config.mcp.papers, enabled: false } },
    }));
    expect(fetchImpl.mock.calls[2]?.[1]?.body).toBe(JSON.stringify({
      mcp: { papers: { ...config.mcp.papers, enabled: true } },
    }));
    expect(fetchImpl.mock.calls[4]?.[1]?.body).toBe(JSON.stringify({
      mcp: {
        papers: {
          ...config.mcp.papers,
          environment: { EXISTING: "value", SAFE_MODE: "true" },
        },
      },
    }));
  });
});
