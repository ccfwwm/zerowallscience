import { createPrivateKey, sign } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ENVELOPE_SCHEMA = "zerowall.science/environment-envelope/v1";
const PAYLOAD_SCHEMA = "zerowall.science/environment/v1";
const ED25519_PKCS8_SEED_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const MCP_PYTHON_HEALTH_PROBE = [
  "import importlib, os",
  "os.environ.setdefault('MP_API_KEY', 'zerowall-health-check')",
  "os.environ.setdefault('FRED_API_KEY', 'zerowall-health-check')",
  "modules = ['jupyterlab', 'paper_search_mcp.server', 'biomcp', 'mcp_materials', 'fred_mcp.main', 'spaceweather_mcp.server', 'mcp_weather_server', 'usgs_mcp.server', 'uniprot_mcp.server', 'wikipedia_mcp']",
  "[importlib.import_module(name) for name in modules]",
].join("; ");

export function createEd25519PrivateKey(seed) {
  if (!Buffer.isBuffer(seed) || seed.length !== 32) {
    throw new Error("Ed25519 private seed must be exactly 32 bytes");
  }
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_SEED_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

export function buildEnvironmentPayload({
  version,
  target,
  assetName,
  assetUrl,
  sha256,
  sizeBytes,
}) {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(version)) throw new Error("invalid environment version");
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(target)) throw new Error("invalid target triple");
  if (!/^[A-Za-z0-9._-]+\.tar\.gz$/.test(assetName)) throw new Error("invalid asset name");
  const url = new URL(assetUrl);
  if (url.protocol !== "https:") throw new Error("environment asset URL must use HTTPS");
  const expectedPrefix = `/environment/${version}/${target}/`;
  if (!url.pathname.startsWith(expectedPrefix) || url.pathname.includes("/latest/")) {
    throw new Error("environment asset URL must use a versioned environment path");
  }
  if (!/^[a-fA-F0-9]{64}$/.test(sha256)) throw new Error("invalid environment SHA-256");
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new Error("invalid environment size");

  const windows = target.includes("windows");
  const executable = (name) => `${name}${windows ? ".exe" : ""}`;
  const mcpPython = windows ? "mcp-python/python.exe" : "mcp-python/bin/python3";
  return {
    schema: PAYLOAD_SCHEMA,
    version,
    target,
    components: [
      {
        id: "environment-bundle",
        url: assetUrl,
        sha256: sha256.toLowerCase(),
        archive: "tarGz",
        sizeBytes,
      },
    ],
    healthChecks: [
      { executable: executable("opencode"), args: ["--version"] },
      { executable: executable("uv"), args: ["--version"] },
      { executable: executable("agent-browser"), args: ["--version"] },
      { executable: mcpPython, args: ["-s", "-c", MCP_PYTHON_HEALTH_PROBE] },
    ],
  };
}

export function signEnvironmentEnvelope(payload, privateSeedBase64) {
  const seed = Buffer.from(privateSeedBase64 ?? "", "base64");
  const privateKey = createEd25519PrivateKey(seed);
  return {
    schema: ENVELOPE_SCHEMA,
    payload,
    signature: sign(null, Buffer.from(payload), privateKey).toString("base64"),
  };
}

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`invalid argument near ${key ?? "end"}`);
    values.set(key.slice(2), value);
  }
  return values;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = args.get("output");
  if (!output) throw new Error("--output is required");
  const payload = buildEnvironmentPayload({
    version: args.get("version"),
    target: args.get("target"),
    assetName: args.get("asset-name"),
    assetUrl: args.get("asset-url"),
    sha256: args.get("sha256"),
    sizeBytes: Number(args.get("size")),
  });
  const envelope = signEnvironmentEnvelope(
    JSON.stringify(payload),
    process.env.ZEROWALL_ENV_UPDATE_PRIVATE_KEY,
  );
  await writeFile(output, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
