import { describe, expect, it } from "vitest";
import {
  RECOMMENDED_CONNECTOR_IDS,
  SCIENCE_CONNECTORS,
  connectorConfig,
} from "./scienceConnectors";

const byId = (id: string) => {
  const c = SCIENCE_CONNECTORS.find((x) => x.id === id);
  if (!c) throw new Error(`no connector ${id}`);
  return c;
};

describe("connectorConfig", () => {
  it("launches a `-m module` connector (paper-search)", () => {
    const cfg = connectorConfig(byId("paper-search"), "/env/bin/python");
    expect(cfg).toMatchObject({
      type: "local",
      command: ["/env/bin/python", "-s", "-m", "paper_search_mcp.server"],
      enabled: true,
    });
    expect(cfg.type === "local" && cfg.environment).toBeUndefined();
  });

  it("keeps a module connector's extra args (biomcp run)", () => {
    const cfg = connectorConfig(byId("biomcp"), "/env/bin/python");
    expect(cfg.type === "local" && cfg.command).toEqual([
      "/env/bin/python",
      "-s",
      "-m",
      "biomcp",
      "run",
    ]);
  });

  it("launches a console entrypoint through the integrated interpreter", () => {
    const cfg = connectorConfig(byId("materials-project"), "/env/bin/python");
    expect(cfg.type === "local" && cfg.command).toEqual([
      "/env/bin/python",
      "-s",
      "-c",
      "from mcp_materials import main; main()",
    ]);
  });

  it("keeps entrypoint launch portable on Windows", () => {
    const cfg = connectorConfig(byId("fred"), "C:\\env\\Scripts\\python.exe", "KEY");
    expect(cfg.type === "local" && cfg.command).toEqual([
      "C:\\env\\Scripts\\python.exe",
      "-s",
      "-c",
      "from fred_mcp.main import main; main()",
    ]);
  });

  it("serializes only a Keychain environment reference for keyed connectors", () => {
    const cfg = connectorConfig(byId("materials-project"), "/env/bin/python", "  mp-secret  ");
    expect(cfg.type === "local" && cfg.environment).toEqual({
      MP_API_KEY: "{env:MP_API_KEY}",
    });
    expect(JSON.stringify(cfg)).not.toContain("mp-secret");
  });

  it("keeps the Keychain reference when the key is entered separately", () => {
    const cfg = connectorConfig(byId("fred"), "/env/bin/python", "   ");
    expect(cfg.type === "local" && cfg.environment).toEqual({
      FRED_API_KEY: "{env:FRED_API_KEY}",
    });
  });

  it("every connector declares an id, discipline, package, and a launch path", () => {
    for (const c of SCIENCE_CONNECTORS) {
      expect(c.id && c.discipline && c.pkg && c.source).toBeTruthy();
      expect(Boolean(c.entrypoint) || Boolean(c.module)).toBe(true);
      if (c.apiKeyEnv) expect(c.apiKeyUrl).toBeTruthy(); // key-needing → tell users where to get one
    }
  });

  it("ships at least two non-bio disciplines (P1-2 breadth)", () => {
    const disciplines = new Set(SCIENCE_CONNECTORS.map((c) => c.discipline));
    expect(disciplines.has("materials")).toBe(true);
    expect(disciplines.has("economics")).toBe(true);
  });

  it("covers physics and earth/climate — the two previously-empty disciplines", () => {
    const disciplines = new Set(SCIENCE_CONNECTORS.map((c) => c.discipline));
    expect(disciplines.has("physics")).toBe(true);
    expect(disciplines.has("earth/climate")).toBe(true);
  });

  it("launches the space-weather connector through Python (physics)", () => {
    const cfg = connectorConfig(byId("spaceweather"), "/env/bin/python");
    expect(cfg.type === "local" && cfg.command).toEqual([
      "/env/bin/python",
      "-s",
      "-m",
      "spaceweather_mcp.server",
    ]);
  });

  it("launches Open-Meteo weather as a `-m module` connector (earth, no key)", () => {
    const c = byId("open-meteo");
    expect(c.apiKeyEnv).toBeUndefined(); // Open-Meteo is free, no key
    const cfg = connectorConfig(c, "/env/bin/python");
    expect(cfg.type === "local" && cfg.command).toEqual([
      "/env/bin/python",
      "-s",
      "-m",
      "mcp_weather_server",
    ]);
  });

  it("launches USGS water data through its Python entrypoint (earth, no key)", () => {
    const cfg = connectorConfig(byId("usgs-water"), "/env/bin/python");
    expect(cfg.type === "local" && cfg.command).toEqual([
      "/env/bin/python",
      "-s",
      "-c",
      "from usgs_mcp.server import main; main()",
    ]);
  });

  it("uses the integrated Python entrypoint for every connector", () => {
    for (const connector of SCIENCE_CONNECTORS) {
      const cfg = connectorConfig(connector, "C:\\environment\\mcp-python\\python.exe");
      expect(cfg.type === "local" && cfg.command[0]).toBe(
        "C:\\environment\\mcp-python\\python.exe",
      );
    }
  });

  it("isolates every integrated Python connector from user site packages", () => {
    for (const connector of SCIENCE_CONNECTORS) {
      const cfg = connectorConfig(connector, "C:\\environment\\mcp-python\\python.exe");
      expect(cfg.type === "local" && cfg.command[1]).toBe("-s");
    }
  });
});

// The app used to configure no connectors at all, so every install began with an
// agent that could not search the literature. A default set fixes that, but only
// if the set is one that can be provisioned with no input from the user.
describe("the default connector set", () => {
  it("is derived from the list, so a marked connector can never be left out", () => {
    expect(RECOMMENDED_CONNECTOR_IDS).toEqual(
      SCIENCE_CONNECTORS.filter((c) => c.recommended).map((c) => c.id),
    );
    expect(RECOMMENDED_CONNECTOR_IDS.length).toBeGreaterThan(0);
  });

  it("contains no connector that needs an API key", () => {
    for (const id of RECOMMENDED_CONNECTOR_IDS) {
      // An enabled server with no key fails every call until the user hunts one
      // down — worse than leaving it off.
      expect(byId(id).apiKeyEnv, `${id} requires an API key`).toBeUndefined();
    }
  });

  it("contains no connector flagged as a large install", () => {
    for (const id of RECOMMENDED_CONNECTOR_IDS) {
      // `installNote` is how the list marks a heavy dependency tree (pymatgen,
      // mp-api). First run must not silently commit the user to that download.
      expect(byId(id).installNote, `${id} is a large install`).toBeUndefined();
    }
  });

  it("leads with literature search — what the workbench is for", () => {
    expect(RECOMMENDED_CONNECTOR_IDS[0]).toBe("paper-search");
  });
});
