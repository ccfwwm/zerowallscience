import { describe, expect, it } from "vitest";
import {
  BUILTIN_WORKFLOWS,
  WorkflowScheduler,
  type WorkflowExecutor,
  type WorkflowPersistence,
  type WorkflowRun,
} from "./workflow";

function memoryPersistence(seed?: WorkflowRun): WorkflowPersistence {
  let current = seed ?? null;
  return {
    load: async () => current,
    save: async (run) => {
      current = structuredClone(run);
    },
  };
}

function executorFor(log: string[], delay = 0): WorkflowExecutor {
  return {
    execute: async ({ node }) => {
      log.push(`start:${node.id}`);
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      log.push(`done:${node.id}`);
      return { node: node.id };
    },
  };
}

describe("WorkflowScheduler", () => {
  it("ships the four built-in research workflows with ACP agent nodes", () => {
    expect(BUILTIN_WORKFLOWS.map((workflow) => workflow.id)).toEqual([
      "literature-evidence-review",
      "paper-search-deduplication",
      "reproducible-experiment",
      "report-generation",
    ]);
    for (const workflow of BUILTIN_WORKFLOWS) {
      expect(workflow.nodes.length).toBeGreaterThan(0);
      expect(workflow.nodes.some((node) => node.kind === "agent")).toBe(true);
      expect(workflow.nodes.every((node) => node.bindingSnapshot !== undefined)).toBe(true);
      expect(workflow.nodes.every((node) => node.mcpAllowList !== undefined)).toBe(true);
      expect(workflow.nodes.every((node) => node.skillsSnapshot !== undefined)).toBe(true);
    }
  });

  it("freezes the resolved binding and capability snapshots per node", async () => {
    const scheduler = new WorkflowScheduler(executorFor([]), memoryPersistence());
    const run = await scheduler.createRun({
      id: "snapshots",
      name: "Snapshots",
      nodes: [{ id: "agent", kind: "agent", dependsOn: [] }],
    }, undefined, {
      resolveNodeSnapshot: (node) => ({
        bindingSnapshot: { engineId: "codex", modelId: "gpt-5", nodeId: node.id },
        mcpAllowList: ["literature.search"],
        skillsSnapshot: [{ id: "citation-reviewer", version: "1.0.0", sha256: "abc" }],
      }),
    });
    expect(run.nodes.agent.bindingSnapshot).toEqual({ engineId: "codex", modelId: "gpt-5", nodeId: "agent" });
    expect(run.nodes.agent.mcpAllowList).toEqual(["literature.search"]);
    expect(run.nodes.agent.skillsSnapshot).toEqual([{ id: "citation-reviewer", version: "1.0.0", sha256: "abc" }]);
  });

  it("runs independent read-only nodes in parallel and mutation nodes serially", async () => {
    const log: string[] = [];
    const scheduler = new WorkflowScheduler(executorFor(log, 1), memoryPersistence());
    const run = await scheduler.createRun({
      id: "review",
      name: "Review",
      nodes: [
        { id: "a", kind: "agent", dependsOn: [] },
        { id: "b", kind: "review", dependsOn: [] },
        { id: "write", kind: "run", dependsOn: ["a", "b"], mutation: true },
      ],
    });

    await scheduler.start(run.id);

    expect(log).toEqual(["start:a", "start:b", "done:a", "done:b", "start:write", "done:write"]);
    expect((await scheduler.get(run.id))?.state).toBe("completed");
  });

  it("persists completed nodes and resumes only the unfinished graph", async () => {
    const firstLog: string[] = [];
    const persistence = memoryPersistence();
    const first = new WorkflowScheduler(executorFor(firstLog), persistence);
    const run = await first.createRun({
      id: "resume",
      name: "Resume",
      nodes: [{ id: "done", kind: "agent", dependsOn: [] }, { id: "next", kind: "artifact", dependsOn: ["done"] }],
    });
    await first.start(run.id);

    const saved = await persistence.load(run.id);
    expect(saved?.nodes.done.state).toBe("completed");
    if (!saved) throw new Error("expected a persisted workflow run");
    saved.state = "running";
    saved.nodes.next.state = "running";
    saved.nodes.next.output = undefined;
    saved.nodes.next.finishedAt = undefined;
    await persistence.save(saved);

    const secondLog: string[] = [];
    const second = new WorkflowScheduler(executorFor(secondLog), persistence);
    await second.resume(run.id);

    expect(secondLog).toEqual(["start:next", "done:next"]);
    expect((await second.get(run.id))?.nodes.done.attempts).toBe(1);
    expect((await second.get(run.id))?.nodes.next.attempts).toBe(2);
  });

  it("pauses scheduling, retries transient failures, and can be cancelled", async () => {
    let attempts = 0;
    let holdStarted!: () => void;
    const holding = new Promise<void>((resolve) => {
      holdStarted = resolve;
    });
    let resolveGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });
    const persistence = memoryPersistence();
    const executor: WorkflowExecutor = {
      execute: async ({ node }) => {
        if (node.id === "flaky") {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary");
        }
        if (node.id === "hold") {
          holdStarted();
          await gate;
        }
        return node.id;
      },
      cancel: async () => resolveGate(),
    };
    const scheduler = new WorkflowScheduler(executor, persistence);
    const run = await scheduler.createRun({
      id: "controls",
      name: "Controls",
      nodes: [
        { id: "flaky", kind: "agent", dependsOn: [], maxRetries: 1 },
        { id: "hold", kind: "run", dependsOn: ["flaky"], mutation: true },
      ],
    });

    const started = scheduler.start(run.id);
    await holding;
    await scheduler.pause(run.id);
    expect((await scheduler.get(run.id))?.state).toBe("paused");
    resolveGate();
    await started;
    expect(attempts).toBe(2);
    expect((await scheduler.get(run.id))?.state).toBe("paused");
    await scheduler.cancel(run.id);
    expect((await scheduler.get(run.id))?.state).toBe("cancelled");
  });

  it("keeps a cancelled active node cancelled after its executor unwinds", async () => {
    let started!: () => void;
    const active = new Promise<void>((resolve) => { started = resolve; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const scheduler = new WorkflowScheduler({
      execute: async () => { started(); await gate; return "late output"; },
      cancel: async () => release(),
    }, memoryPersistence());
    const run = await scheduler.createRun({
      id: "cancel-active",
      name: "Cancel active",
      nodes: [{ id: "active", kind: "run", dependsOn: [], mutation: true }],
    });

    const running = scheduler.start(run.id);
    await active;
    await scheduler.cancel(run.id);
    await running;

    const saved = await scheduler.get(run.id);
    expect(saved?.state).toBe("cancelled");
    expect(saved?.nodes.active.state).toBe("cancelled");
  });

  it("propagates blocked descendants and restores them when a failed node is retried", async () => {
    let fail = true;
    const scheduler = new WorkflowScheduler({
      execute: async ({ node }) => {
        if (node.id === "root" && fail) throw new Error("root failed");
        return node.id;
      },
    }, memoryPersistence());
    const run = await scheduler.createRun({
      id: "retry-graph",
      name: "Retry graph",
      nodes: [
        { id: "root", kind: "agent", dependsOn: [] },
        { id: "middle", kind: "review", dependsOn: ["root"] },
        { id: "leaf", kind: "artifact", dependsOn: ["middle"] },
      ],
    });

    await scheduler.start(run.id);
    expect((await scheduler.get(run.id))?.state).toBe("failed");
    expect((await scheduler.get(run.id))?.nodes.leaf.state).toBe("blocked");

    fail = false;
    await scheduler.retry(run.id, "root");
    expect((await scheduler.get(run.id))?.state).toBe("completed");
  });

  it("serializes mutation nodes across concurrent workflow runs", async () => {
    let activeMutations = 0;
    let maxActiveMutations = 0;
    const scheduler = new WorkflowScheduler({
      execute: async () => {
        activeMutations += 1;
        maxActiveMutations = Math.max(maxActiveMutations, activeMutations);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeMutations -= 1;
      },
    }, memoryPersistence());
    const definition = (id: string) => ({
      id,
      name: id,
      nodes: [{ id: "write", kind: "run" as const, dependsOn: [], mutation: true }],
    });
    const first = await scheduler.createRun(definition("first"), "run-first");
    const second = await scheduler.createRun(definition("second"), "run-second");

    await Promise.all([scheduler.start(first.id), scheduler.start(second.id)]);

    expect(maxActiveMutations).toBe(1);
  });

  it("does not start a second pump when start is called twice", async () => {
    let executions = 0;
    const scheduler = new WorkflowScheduler({
      execute: async () => {
        executions += 1;
        await new Promise((resolve) => setTimeout(resolve, 2));
      },
    }, memoryPersistence());
    const run = await scheduler.createRun({
      id: "duplicate-start",
      name: "Duplicate start",
      nodes: [{ id: "one", kind: "agent", dependsOn: [] }],
    });

    await Promise.all([scheduler.start(run.id), scheduler.start(run.id)]);

    expect(executions).toBe(1);
  });

  it("does not race duplicate starts while the first persistence save is slow", async () => {
    let executions = 0;
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
    let saves = 0;
    const persistence: WorkflowPersistence = {
      load: async () => null,
      save: async () => {
        saves += 1;
        if (saves === 2) await saveGate;
      },
      listIncomplete: async () => [],
    };
    const scheduler = new WorkflowScheduler({
      execute: async () => { executions += 1; },
    }, persistence);
    const run = await scheduler.createRun({
      id: "slow-start",
      name: "Slow start",
      nodes: [{ id: "one", kind: "agent", dependsOn: [] }],
    });

    const first = scheduler.start(run.id);
    const second = scheduler.start(run.id);
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseSave();
    await Promise.all([first, second]);

    expect(executions).toBe(1);
  });

  it("waits for an active pump before retrying or resuming", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let executions = 0;
    let failOnce = true;
    const scheduler = new WorkflowScheduler({
      execute: async ({ node }) => {
        executions += 1;
        if (node.id === "failed" && failOnce) {
          failOnce = false;
          throw new Error("temporary");
        }
        if (node.id === "slow") await gate;
      },
    }, memoryPersistence());
    const run = await scheduler.createRun({
      id: "active-control",
      name: "Active control",
      nodes: [
        { id: "slow", kind: "agent", dependsOn: [] },
        { id: "failed", kind: "agent", dependsOn: [] },
      ],
    });

    const running = scheduler.start(run.id);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const retry = scheduler.retry(run.id);
    const resume = scheduler.resume(run.id);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(executions).toBe(2);
    release();
    await running;
    await Promise.all([retry, resume]);
    expect(executions).toBe(3);
  });

  it("discovers and resumes incomplete persisted runs after restart", async () => {
    const seed: WorkflowRun = {
      id: "recover-me",
      workflowId: "recover",
      name: "Recover",
      state: "running",
      nodes: {
        done: { id: "done", kind: "agent", dependsOn: [], state: "completed", attempts: 1 },
        pending: { id: "pending", kind: "artifact", dependsOn: ["done"], state: "running", attempts: 1 },
      },
      createdAt: "2026-08-07T00:00:00.000Z",
      updatedAt: "2026-08-07T00:00:01.000Z",
    };
    let saved = structuredClone(seed);
    const persistence: WorkflowPersistence = {
      load: async () => structuredClone(saved),
      save: async (run) => { saved = structuredClone(run); },
      listIncomplete: async () => [structuredClone(saved)],
    };
    const log: string[] = [];
    const scheduler = new WorkflowScheduler(executorFor(log), persistence);

    const recovered = await scheduler.recoverIncomplete();

    expect(recovered.map((run) => run.id)).toEqual(["recover-me"]);
    expect(log).toEqual(["start:pending", "done:pending"]);
    expect(saved.state).toBe("completed");
  });

  it("reports when persistence cannot discover incomplete runs", async () => {
    const scheduler = new WorkflowScheduler(executorFor([]), {
      load: async () => null,
      save: async () => undefined,
    });
    await expect(scheduler.recoverIncomplete()).rejects.toThrow("incomplete run discovery");
  });
});
