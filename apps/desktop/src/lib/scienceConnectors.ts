// Curated open-source science MCP connectors (P1-2). These are existing,
// maintained open-source MCP servers — we one-click provision them into a
// shared isolated env (bundled uv) and register them; we do not reimplement
// literature/database access ourselves. Keep this list small and vetted.
import type { McpConfig } from "@zerowall/sdk";

export interface ScienceConnector {
  /** MCP server name written into OpenCode's config. */
  id: string;
  label: string;
  /** Short discipline chip, e.g. "materials", "economics". */
  discipline: string;
  description: string;
  /** PyPI package installed into the shared science-MCP env. */
  pkg: string;
  /** Console script the package installs (resolved next to the managed python).
   *  Preferred when set — many MCP servers ship a script, not a `-m` module. */
  bin?: string;
  /** Fallback: Python `-m` module the server runs as, plus any args. */
  module?: string;
  /** Python code that calls the package's console entrypoint without relying
   *  on a generated launcher containing the build machine's absolute path. */
  entrypoint?: string;
  args?: string[];
  /** Env var the server reads its API key from (free keys; never logged). */
  apiKeyEnv?: string;
  /** Where the user gets a free key. */
  apiKeyUrl?: string;
  /** Shown before Enable when the install is large. */
  installNote?: string;
  /** Upstream project, shown so users can vet it before enabling. */
  source: string;
  /** Part of the default set enabled on first run. Only keyless, small-install
   *  connectors qualify: a default that needs a signup, or that pulls in
   *  pymatgen, is not a default. */
  recommended?: boolean;
}

export const SCIENCE_CONNECTORS: ScienceConnector[] = [
  {
    id: "paper-search",
    label: "Literature search",
    discipline: "all fields",
    description:
      "arXiv · PubMed · Crossref · Semantic Scholar · bioRxiv/medRxiv — search & fetch papers",
    pkg: "paper-search-mcp",
    module: "paper_search_mcp.server",
    source: "github.com/openags/paper-search-mcp",
    recommended: true,
  },
  {
    id: "biomcp",
    label: "Biomedical databases",
    discipline: "biology",
    description: "PubMed articles, ClinicalTrials.gov, and genomic variants (MyVariant/ClinVar)",
    pkg: "biomcp-python",
    module: "biomcp",
    args: ["run"],
    source: "github.com/genomoncology/biomcp",
    recommended: true,
  },
  {
    id: "materials-project",
    label: "Materials Project",
    discipline: "materials",
    description:
      "Query material properties, crystal structures, and phase diagrams from the Materials Project database",
    pkg: "mcp-materials-project",
    entrypoint: "from mcp_materials import main; main()",
    apiKeyEnv: "MP_API_KEY",
    apiKeyUrl: "https://next-gen.materialsproject.org/api",
    installNote: "large — installs pymatgen + mp-api on first enable",
    source: "github.com/luffysolution-svg/mcp-materials-project",
  },
  {
    id: "fred",
    label: "FRED economic data",
    discipline: "economics",
    description:
      "Federal Reserve (FRED) economic time series — GDP, inflation, unemployment, rates, and more",
    pkg: "fred-mcp",
    entrypoint: "from fred_mcp.main import main; main()",
    apiKeyEnv: "FRED_API_KEY",
    apiKeyUrl: "https://fred.stlouisfed.org/docs/api/api_key.html",
    source: "github.com/tosin2013/fred-mcp",
  },
  {
    id: "spaceweather",
    label: "Space weather",
    discipline: "physics",
    description:
      "Solar wind, solar flares, Kp/Dst geomagnetic indices, radiation storms, and aurora forecasts (NOAA SWPC · NASA DONKI · USGS)",
    pkg: "spaceweather-mcp",
    module: "spaceweather_mcp.server",
    source: "github.com/hoon1983/spaceweather-mcp",
    recommended: true,
  },
  {
    id: "open-meteo",
    label: "Weather & climate (Open-Meteo)",
    discipline: "earth/climate",
    description:
      "Current & historical weather, air quality, and timezones from Open-Meteo — free, no key",
    pkg: "mcp-weather-server",
    module: "mcp_weather_server",
    source: "github.com/isdaniel/mcp_weather_server",
    recommended: true,
  },
  {
    id: "usgs-water",
    label: "USGS water data",
    discipline: "earth/climate",
    description:
      "USGS Water Services — streamflow, flood stages, peak events, and monitoring sites across the US",
    pkg: "usgs-mcp",
    entrypoint: "from usgs_mcp.server import main; main()",
    source: "github.com/mansurjisan/ocean-mcp",
    recommended: true,
  },
  {
    id: "uniprot",
    label: "UniProt proteins",
    discipline: "biology",
    description:
      "UniProt protein knowledgebase — search entries, sequences, functions, and cross-references — no key",
    pkg: "uniprot-mcp-server",
    module: "uniprot_mcp.server",
    source: "github.com/smaniches/uniprot-mcp",
  },
  {
    id: "wikipedia",
    label: "Wikipedia",
    discipline: "reference",
    description:
      "Search Wikipedia and fetch article summaries, sections, and links for background & definitions — no key",
    pkg: "wikipedia-mcp",
    module: "wikipedia_mcp",
    source: "github.com/rudra-ravi/wikipedia-mcp",
  },
];

/** Ids of the default set, in list order. Derived rather than hand-maintained so
 *  a connector can never be marked recommended and then silently left out. */
export const RECOMMENDED_CONNECTOR_IDS: string[] = SCIENCE_CONNECTORS.filter(
  (c) => c.recommended,
).map((c) => c.id);

/** Local-MCP config for a connector. Secrets are injected into the sidecar
 * process from the OS credential manager and never serialized here. */
export function connectorConfig(
  c: ScienceConnector,
  python: string,
  _apiKey?: string,
): McpConfig {
  const command = c.entrypoint
    ? [python, "-s", "-c", c.entrypoint]
    : [python, "-s", "-m", c.module ?? "", ...(c.args ?? [])];
  return {
    type: "local",
    command,
    enabled: true,
    ...(c.apiKeyEnv
      ? { environment: { [c.apiKeyEnv]: `{env:${c.apiKeyEnv}}` } }
      : {}),
  };
}
