// The setup store owns the long-running uv provisioning flows so they survive
// page navigation. These guard the two properties that broke before: a second
// concurrent start must not race the first into the same env dir, and the
// busy/generation lifecycle must be observable regardless of which page reads.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addMcpServer: vi.fn(async (_name: string) => {}),
  loadCatalog: vi.fn(async () => {}),
  connectRetry: vi.fn(async () => true),
  /** Resolves ⇒ an entry existed and was removed; rejects ⇒ nothing to remove. */
  removeConfigEntry: vi.fn(async () => {}),
  agentBrowserBin: vi.fn(async () => "/bin/agent-browser"),
  detectChrome: vi.fn(async () => ({ path: "/Chrome", kind: "chrome" })),
  getProxySetting: vi.fn(async () => ({ effective: null })),
  /** Resolver for the in-flight setupJupyter promise, so tests hold it open. */
  resolveSetup: (() => {}) as () => void,
  setupJupyter: vi.fn(),
  setupScienceMcp: vi.fn(async (_pkg: string) => "/env/bin/python"),
  setConnectorSecret: vi.fn(async () => {}),
  /** MCP entries currently in the config, mutated by addMcpServer below so
   *  "did it land?" is answered by the config, not by the call succeeding. */
  configured: [] as { name: string; status: string }[],
  listMcpServers: vi.fn(),
}));

mocks.listMcpServers.mockImplementation(async () => mocks.configured);

mocks.setupJupyter.mockImplementation(
  () => new Promise<void>((r) => (mocks.resolveSetup = () => r())),
);

vi.mock("./runtime", () => ({
  getClient: () => ({
    addMcpServer: mocks.addMcpServer,
    listMcpServers: mocks.listMcpServers,
  }),
  useRuntimeStore: {
    getState: () => ({ loadCatalog: mocks.loadCatalog, connectRetry: mocks.connectRetry }),
  },
}));
vi.mock("./tauri", () => ({
  isTauri: true,
  setupJupyter: mocks.setupJupyter,
  startJupyter: async () => ({
    url: "http://127.0.0.1:9",
    token: "tok",
    mcp_command: "/env/bin/jupyter-mcp-server",
  }),
  setupScienceMcp: mocks.setupScienceMcp,
  watchSetupProgress: async () => () => {},
  removeConfigEntry: mocks.removeConfigEntry,
  agentBrowserBin: mocks.agentBrowserBin,
  detectChrome: mocks.detectChrome,
  getProxySetting: mocks.getProxySetting,
  setConnectorSecret: mocks.setConnectorSecret,
}));
vi.mock("./scienceConnectors", () => ({
  SCIENCE_CONNECTORS: [
    { id: "papers", label: "Papers", pkg: "paper-search-mcp", apiKeyEnv: "PAPERS_API_KEY" },
    { id: "weather", label: "Weather", pkg: "mcp-weather-server", recommended: true },
    { id: "water", label: "Water", pkg: "usgs-mcp", recommended: true },
  ],
  RECOMMENDED_CONNECTOR_IDS: ["weather", "water"],
  connectorConfig: () => ({ type: "local", command: ["/env/bin/python"], enabled: true }),
}));
vi.mock("./webMode", () => ({ isGatewayWeb: false }));
vi.mock("./toast", () => ({ toast: { success: () => {}, error: () => {} } }));

import { useSetupStore } from "./setup";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setupJupyter.mockImplementation(
    () => new Promise<void>((r) => (mocks.resolveSetup = () => r())),
  );
  mocks.configured = [];
  mocks.listMcpServers.mockImplementation(async () => mocks.configured);
  mocks.setupScienceMcp.mockImplementation(async () => "/env/bin/python");
  mocks.addMcpServer.mockImplementation(async (name: string) => {
    mocks.configured = [...mocks.configured, { name, status: "connected" }];
  });
  useSetupStore.setState({ jupyterBusy: false, connectorId: null, line: null, generation: 0 });
});

describe("setup store", () => {
  it("marks busy while provisioning Jupyter and clears + bumps generation after", async () => {
    const gen0 = useSetupStore.getState().generation;
    const run = useSetupStore.getState().enableJupyter();
    expect(useSetupStore.getState().jupyterBusy).toBe(true); // set synchronously

    mocks.resolveSetup();
    await run;

    const s = useSetupStore.getState();
    expect(s.jupyterBusy).toBe(false);
    expect(s.line).toBeNull();
    expect(s.generation).toBe(gen0 + 1);
    expect(mocks.addMcpServer).toHaveBeenCalledWith("jupyter", expect.anything());
  });

  it("ignores a second concurrent enableJupyter — no colliding provisioning run", async () => {
    const p1 = useSetupStore.getState().enableJupyter();
    const p2 = useSetupStore.getState().enableJupyter(); // guarded: returns at once
    await p2; // the guarded call resolves without waiting on the first
    expect(mocks.setupJupyter).toHaveBeenCalledTimes(1);

    mocks.resolveSetup();
    await p1;
    expect(mocks.setupJupyter).toHaveBeenCalledTimes(1);
  });

  it("tracks the connector being provisioned and clears it when done", async () => {
    const run = useSetupStore.getState().enableConnector("papers", "key123");
    expect(useSetupStore.getState().connectorId).toBe("papers");
    await run;
    expect(useSetupStore.getState().connectorId).toBeNull();
    expect(mocks.setConnectorSecret).toHaveBeenCalledWith("papers", "PAPERS_API_KEY", "key123");
    expect(mocks.addMcpServer).toHaveBeenCalledWith("papers", expect.anything());
    expect(mocks.setConnectorSecret.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.addMcpServer.mock.invocationCallOrder[0],
    );
    expect(JSON.stringify(mocks.addMcpServer.mock.calls[0])).not.toContain("key123");
  });

  // The config PATCH deep-merges the nested `environment`, so a re-add can only
  // add/overwrite keys, never drop one. Turning "Show the browser window" off
  // just omits AGENT_BROWSER_HEADED — the merge would keep the stale "true".
  // Removing the entry first (then re-adding) rewrites the environment clean.
  it("rewrites the browser entry from scratch on reconfigure — removes before re-adding", async () => {
    await useSetupStore.getState().enableBrowser({ headed: false, useSystemChrome: true });

    expect(mocks.removeConfigEntry).toHaveBeenCalledWith("mcp", "browser-control");
    // An existing entry was removed, so we wait for the restarted sidecar.
    expect(mocks.connectRetry).toHaveBeenCalled();
    // Remove must precede the re-add, or the add merges into the stale entry.
    expect(mocks.removeConfigEntry.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.addMcpServer.mock.invocationCallOrder[0],
    );
    // The freshly written config carries no headed flag → it starts headless.
    const calls = mocks.addMcpServer.mock.calls as unknown as Array<
      [string, { environment?: Record<string, string> }]
    >;
    const [, config] = calls[calls.length - 1];
    expect(config.environment?.AGENT_BROWSER_HEADED).toBeUndefined();
  });

  it("first enable has no entry to remove — skips the sidecar wait, still adds", async () => {
    mocks.removeConfigEntry.mockRejectedValueOnce(new Error("not in the config's mcp section"));

    await useSetupStore.getState().enableBrowser({ headed: true, useSystemChrome: true });

    expect(mocks.connectRetry).not.toHaveBeenCalled();
    expect(mocks.addMcpServer).toHaveBeenCalledWith("browser-control", expect.anything());
  });
});

// The app used to ship with zero connectors configured: every install started
// with an agent that could not search the literature until the user found
// Settings → Connectors and clicked through five rows.
describe("the default connector set", () => {
  it("provisions each default once, in list order", async () => {
    const enabled = await useSetupStore.getState().enableRecommendedConnectors();

    expect(enabled).toEqual(["weather", "water"]);
    // Sequential and ordered: all connectors install into ONE shared uv env, and
    // two concurrent `uv pip install` runs against the same env dir collide.
    expect(mocks.addMcpServer.mock.calls.map((c) => c[0])).toEqual(["weather", "water"]);
  });

  it("leaves an already-configured connector alone", async () => {
    mocks.configured = [{ name: "weather", status: "connected" }];

    const enabled = await useSetupStore.getState().enableRecommendedConnectors();

    expect(enabled).toEqual(["water"]);
    expect(mocks.addMcpServer.mock.calls.map((c) => c[0])).toEqual(["water"]);
  });

  it("does nothing when they are all present", async () => {
    mocks.configured = [
      { name: "weather", status: "connected" },
      { name: "water", status: "failed" }, // present but broken is still present
    ];

    expect(await useSetupStore.getState().enableRecommendedConnectors()).toEqual([]);
    expect(mocks.setupScienceMcp).not.toHaveBeenCalled();
  });

  // A failed install must not be reported as enabled: the toast would claim the
  // agent gained a tool it cannot call.
  it("reports only what actually landed in the config", async () => {
    mocks.setupScienceMcp.mockImplementation(async (pkg: string) => {
      if (pkg === "mcp-weather-server") throw new Error("uv pip install failed");
      return "/env/bin/python";
    });

    const enabled = await useSetupStore.getState().enableRecommendedConnectors();

    expect(enabled).toEqual(["water"]);
  });

  it("cannot run without a client — it would reinstall what is already there", async () => {
    mocks.listMcpServers.mockRejectedValue(new Error("not connected"));

    expect(await useSetupStore.getState().enableRecommendedConnectors()).toEqual([]);
    expect(mocks.setupScienceMcp).not.toHaveBeenCalled();
  });
});
