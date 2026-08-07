import { describe, expect, it } from "vitest";
import { runtimeActivitySnapshot } from "./runtime-activity";

describe("runtimeActivitySnapshot", () => {
  it("counts active MCP tool calls as mutation-protected activity", () => {
    expect(runtimeActivitySnapshot({
      permissions: [],
      threads: {
        session: {
          blocks: [
            { kind: "tool-call", tool: "mcp-files", title: "write", status: "running" },
            { kind: "tool-call", tool: "mcp-search", title: "search", status: "success" },
          ],
        },
      },
    })).toEqual({ mcpMutations: 1, runActivities: 0 });
  });

  it("counts active running jobs without counting completed job blocks", () => {
    expect(runtimeActivitySnapshot({
      permissions: [],
      threads: {
        session: {
          blocks: [{ kind: "running-jobs", title: "REMOTE", jobs: [{ label: "job-1", elapsed: "1s" }, { label: "job-2", elapsed: "2s" }] }],
        },
        done: { blocks: [{ kind: "status-line", text: "2 running", tone: "done" }] },
      },
    })).toEqual({ mcpMutations: 0, runActivities: 2 });
  });

  it("protects pending MCP permission requests", () => {
    expect(runtimeActivitySnapshot({
      permissions: [{ action: "mcp" }],
      threads: {},
    })).toEqual({ mcpMutations: 1, runActivities: 0 });
  });
});
