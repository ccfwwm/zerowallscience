// App-lifetime owner of the long-running uv provisioning flows (isolated
// Jupyter env, science-MCP connectors). This state lived inside SettingsPage
// before, so navigating away — clicking a chat or a history session —
// unmounted the page, discarded the "setting up…" flags, and (worse) severed
// the setup-progress listener, making a still-running download look frozen and
// inviting a second click that collided on the same env dir. Owning it here
// means the download is unaffected by which page is open.
import { create } from "zustand";
import { getClient, useRuntimeStore } from "./runtime";
import {
  setupJupyter,
  startJupyter,
  setupScienceMcp,
  watchSetupProgress,
  agentBrowserBin,
  detectChrome,
  getProxySetting,
  removeConfigEntry,
  setConnectorSecret,
  isTauri,
} from "./tauri";
import { isGatewayWeb } from "./webMode";
import {
  RECOMMENDED_CONNECTOR_IDS,
  SCIENCE_CONNECTORS,
  connectorConfig,
} from "./scienceConnectors";
import { BROWSER_MCP_ID, buildBrowserMcpConfig } from "./browser";
import { toast } from "./toast";

/** What the browser settings page collects before enabling / applying. */
export interface EnableBrowserOptions {
  /** Chrome profile directory to reuse; empty ⇒ isolated fresh profile. */
  profileDir?: string;
  /** Show a visible browser window (default headless). */
  headed?: boolean;
  /** agent-browser tool profile(s), comma-separated (default "core"). */
  tools?: string;
  /** Domain allowlist; empty ⇒ unrestricted. */
  allowedDomains?: string[];
  /** Drive the detected system Chrome (true) vs a separate downloaded browser
   *  (false — never touches the user's Chrome). Default true. */
  useSystemChrome?: boolean;
}

interface SetupState {
  /** True while the isolated Jupyter env is being provisioned. */
  jupyterBusy: boolean;
  /** The science connector currently provisioning, by id (null = none). */
  connectorId: string | null;
  /** Latest live uv output line — reassurance during a hundreds-of-MB download. */
  line: string | null;
  /** True while browser control is being enabled. */
  browserBusy: boolean;
  /** Bumped when any provisioning run finishes, so open pages re-read status. */
  generation: number;
  enableJupyter: () => Promise<void>;
  enableConnector: (id: string, apiKey?: string) => Promise<void>;
  enableBrowser: (opts: EnableBrowserOptions) => Promise<void>;
  /** Provision the default connector set, skipping any already configured.
   *  Returns the ids it actually enabled. */
  enableRecommendedConnectors: () => Promise<string[]>;
}

/** Set once the default connectors have been provisioned (or the attempt was
 *  made), so a restart doesn't re-run installs the user may have since removed. */
const DEFAULTS_KEY = "zerowall:connectorDefaults";

function defaultsAttempted(): boolean {
  try {
    return localStorage.getItem(DEFAULTS_KEY) === "done";
  } catch {
    return true; // no storage ⇒ never auto-install, we couldn't remember not to
  }
}

function markDefaultsAttempted(): void {
  try {
    localStorage.setItem(DEFAULTS_KEY, "done");
  } catch {
    /* ignore */
  }
}

export const useSetupStore = create<SetupState>((set, get) => ({
  jupyterBusy: false,
  connectorId: null,
  line: null,
  browserBusy: false,
  generation: 0,

  enableJupyter: async () => {
    // One provisioning run at a time: a second `uv venv` / `pip install` into
    // the same env dir races the first and fails.
    if (get().jupyterBusy) return;
    set({ jupyterBusy: true, line: null });
    try {
      toast.success("Setting up Jupyter — first run downloads a few hundred MB, please wait…");
      await setupJupyter();
      const s = await startJupyter();
      if (!s.url || !s.token || !s.mcp_command) throw new Error("setup finished incomplete");
      await getClient()!.addMcpServer("jupyter", {
        type: "local",
        command: [s.mcp_command],
        enabled: true,
        // START_NEW_RUNTIME=false: jupyter-mcp-server's `serve` defaults it to
        // true, which starts a kernel SYNCHRONOUSLY at launch — before the stdio
        // MCP handshake — so a slow/wedged kernel makes `initialize` never return
        // and OpenCode marks the connector "failed". Off, it answers the
        // handshake immediately and connects the kernel lazily on first tool use.
        environment: {
          JUPYTER_URL: s.url,
          JUPYTER_TOKEN: s.token,
          START_NEW_RUNTIME: "false",
          ALLOW_IMG_OUTPUT: "true",
        },
      });
      toast.success("Jupyter MCP enabled — the agent can now drive notebooks.");
      await useRuntimeStore.getState().loadCatalog();
    } catch (e) {
      toast.error(`Jupyter setup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      set((st) => ({ jupyterBusy: false, line: null, generation: st.generation + 1 }));
    }
  },

  enableConnector: async (id, apiKey) => {
    if (get().connectorId) return; // one connector provisioning at a time
    const c = SCIENCE_CONNECTORS.find((x) => x.id === id);
    if (!c) return;
    set({ connectorId: id, line: null });
    try {
      toast.success(`Setting up ${c.label} — first run downloads a managed Python, please wait…`);
      const python = await setupScienceMcp(c.pkg);
      const key = apiKey?.trim();
      if (c.apiKeyEnv && key) {
        await setConnectorSecret(c.id, c.apiKeyEnv, key);
      }
      await getClient()!.addMcpServer(c.id, connectorConfig(c, python));
      toast.success(`${c.label} enabled — the agent can now use it from chat.`);
      await useRuntimeStore.getState().loadCatalog();
    } catch (e) {
      toast.error(`${c.label} setup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      set((st) => ({ connectorId: null, line: null, generation: st.generation + 1 }));
    }
  },

  // Sequential on purpose: every connector installs into the SAME shared uv env,
  // and two concurrent `uv pip install` runs against one env dir collide.
  enableRecommendedConnectors: async () => {
    const client = getClient();
    if (!client) return [];
    let configured: Set<string>;
    try {
      configured = new Set((await client.listMcpServers()).map((s) => s.name));
    } catch {
      return []; // can't tell what's already there — don't guess and reinstall
    }
    const todo = RECOMMENDED_CONNECTOR_IDS.filter((id) => !configured.has(id));
    if (todo.length === 0) return [];

    const done: string[] = [];
    for (const id of todo) {
      await get().enableConnector(id);
      // enableConnector reports its own failures; treat "now in the config" as
      // the only evidence it worked.
      const now = await client.listMcpServers().catch(() => []);
      if (now.some((s) => s.name === id)) done.push(id);
    }
    return done;
  },

  enableBrowser: async (opts) => {
    if (get().browserBusy) return;
    set({ browserBusy: true, line: null });
    try {
      // Resolve the sidecar path, the browser to reuse, and the proxy here so
      // the UI stays thin. Reusing the detected Chrome avoids a download and
      // (macOS) decrypts the real profile cleanly; the proxy mirrors the agent's.
      const bin = await agentBrowserBin();
      // Only bind the system Chrome when the user chose it; the private-browser
      // mode leaves executablePath unset so agent-browser uses its own download.
      const chrome = opts.useSystemChrome === false ? null : await detectChrome();
      const proxy = (await getProxySetting())?.effective ?? null;
      const config = buildBrowserMcpConfig({
        bin,
        profileDir: opts.profileDir,
        executablePath: chrome?.path,
        headed: opts.headed,
        proxy,
        tools: opts.tools,
        allowedDomains: opts.allowedDomains,
      });
      // addMcpServer PATCHes the config, and OpenCode deep-merges the nested
      // `environment` map — so a reconfigure that DROPS a setting can't take
      // effect on a plain re-add: turning "Show the browser window" off (or
      // switching to the private browser, or clearing the domain allowlist)
      // only omits the env key, and the merge keeps the stale old value. Remove
      // the existing entry first so the environment is rewritten from scratch.
      // removeConfigEntry rewrites the file and restarts the sidecar, so wait
      // for it to come back before re-adding; the first enable has no entry to
      // remove (it rejects) — skip the wait and go straight to the add.
      const hadEntry = await removeConfigEntry("mcp", BROWSER_MCP_ID)
        .then(() => true)
        .catch(() => false);
      if (hadEntry) await useRuntimeStore.getState().connectRetry();
      await getClient()!.addMcpServer(BROWSER_MCP_ID, config);
      toast.success("Browser control enabled — the agent can now drive Chrome from chat.");
      await useRuntimeStore.getState().loadCatalog();
    } catch (e) {
      toast.error(`Browser control setup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      set((st) => ({ browserBusy: false, line: null, generation: st.generation + 1 }));
    }
  },
}));

// A SINGLE app-lifetime uv-progress listener. Registered once from AppShell so
// a page unmount can never sever it — the old per-page listener died with
// SettingsPage and made a running download look frozen.
let progressUnlisten: (() => void) | null = null;

/**
 * First run only: bring the default connectors up so a fresh install can search
 * the literature without a trip to Settings.
 *
 * Runs at most once per install, and never in the gateway web client (the host
 * owns the sidecar and its Python env). It installs Python packages, which is
 * why it announces itself and why it is remembered even on failure: a user who
 * removes a default connector must not find it reinstalled on next launch.
 */
export function ensureDefaultConnectors(): void {
  if (isGatewayWeb || !isTauri) return;
  if (defaultsAttempted()) return;
  markDefaultsAttempted();
  void (async () => {
    toast.success(
      `Setting up ${RECOMMENDED_CONNECTOR_IDS.length} default connectors in the background — ` +
        "first run downloads a managed Python. Settings → Connectors shows progress.",
    );
    const enabled = await useSetupStore.getState().enableRecommendedConnectors();
    if (enabled.length > 0) {
      toast.success(`${enabled.length} connector(s) ready — the agent can use them from chat.`);
    }
  })();
}

/**
 * Heal installs whose Jupyter MCP entry predates the START_NEW_RUNTIME fix.
 * Those entries let jupyter-mcp-server start a kernel synchronously at launch,
 * which blocks the stdio MCP handshake and leaves the connector stuck "failed".
 * Patch the env in place (additive deep-merge, so command/token are preserved)
 * without forcing the user back through Setup. No-op when Jupyter isn't
 * configured, isn't local, or the flag is already present.
 */
export async function healJupyterMcpEnv(): Promise<void> {
  if (isGatewayWeb || !isTauri) return;
  const client = getClient();
  if (!client) return;
  let config;
  try {
    config = (await client.listMcpServers()).find((s) => s.name === "jupyter")?.config;
  } catch {
    return; // can't read the config — don't guess
  }
  if (!config || config.type !== "local") return;
  const env = config.environment ?? {};
  if ("START_NEW_RUNTIME" in env) return; // already healed
  try {
    await client.addMcpServer("jupyter", {
      ...config,
      environment: { ...env, START_NEW_RUNTIME: "false" },
    });
    await useRuntimeStore.getState().loadCatalog();
  } catch {
    /* best-effort: a failed heal must not block startup */
  }
}

/** Start the shared uv-progress listener (idempotent). Call once from AppShell. */
export function ensureSetupProgressListener(): void {
  if (progressUnlisten) return;
  progressUnlisten = () => {}; // claim the slot synchronously against a double call
  void watchSetupProgress((p) => useSetupStore.setState({ line: p.line })).then((u) => {
    progressUnlisten = u;
  });
}
