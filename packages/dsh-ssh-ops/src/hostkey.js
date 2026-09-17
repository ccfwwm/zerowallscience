/**
 * Host-key fingerprint TOFU helpers for dsh-ssh-ops.
 *
 * Pure, side-effect-free functions split out of the connect path so the
 * ssh2 `hostVerifier` contract (raw host-key blob Buffer since ssh2 v1.17)
 * and the accept-new / verify / off decision matrix are unit-tested against
 * the REAL wire shape — a mock object must never hide a contract drift.
 *
 * The KnownHosts wrapper adapts a dsh-storage-domain table
 * (get/put/delete/entries) to host+port addressing so the connect path speaks
 * in servers, not in opaque storage keys.
 */
import { createHash } from "node:crypto";

/** Host-key verification modes, in the order used by the UI selector. */
export const HOST_KEY_MODES = ["accept-new", "verify", "off"];

export const DEFAULT_HOST_KEY_MODE = "accept-new";

/**
 * Extract the SSH host-key algorithm name from a raw host-key blob
 * (SSH wire format: `uint32 len` + algorithm string + key data).
 */
export function blobAlgorithm(blob) {
  if (!Buffer.isBuffer(blob) || blob.length < 4) return "";
  try {
    const len = blob.readUInt32BE(0);
    return blob.toString("utf8", 4, 4 + len);
  } catch {
    return "";
  }
}

/**
 * SHA-256 fingerprint (base64, without the `SHA256:` prefix) of an ssh2
 * host-key blob. ssh2 v1.17 `hostVerifier` receives the RAW host-key blob
 * Buffer (the SSH wire-format `string(algo) string(keydata)`); defensively
 * also accept the legacy `{ hash }` object shape.
 */
export function keyFingerprint(key) {
  const blob = Buffer.isBuffer(key) ? key : (key && key.hash);
  if (!blob) throw new Error("host key missing (hostVerifier received no key blob)");
  return createHash("sha256").update(blob).digest("base64");
}

/** Build a wire-shaped host-key blob for tests: `string(algo) + string(32 bytes)`. */
export function makeKeyBlob(algo, seed) {
  const algoBuf = Buffer.from(algo, "utf8");
  const data = Buffer.alloc(32, seed || 1);
  const blob = Buffer.alloc(4 + algoBuf.length + 4 + data.length);
  blob.writeUInt32BE(algoBuf.length, 0);
  algoBuf.copy(blob, 4);
  blob.writeUInt32BE(data.length, 4 + algoBuf.length);
  data.copy(blob, 8 + algoBuf.length);
  return blob;
}

/** Storage key for a host:port pair (the unit known_hosts is addressed by). */
export function knownHostKey(host, port) {
  return `${host}:${port ?? 22}`;
}

/**
 * Pure verdict for a host-key check, decoupled from ssh2 so it is unit-testable.
 *
 * @param {object} args
 * @param {"accept-new"|"verify"|"off"} args.mode
 * @param {object|undefined} args.known   stored record ({ fingerprint } or undefined)
 * @param {string} args.presentedFingerprint  fingerprint of the key the server presented
 * @param {string} [args.algorithm]          algorithm name (persisted on first-seen)
 * @returns {{accept: boolean, reason?: string, record?: {fingerprint, algorithm}, expected?: string, got?: string}}
 */
export function decideHostKey({ mode, known, presentedFingerprint, algorithm }) {
  if (mode === "off") return { accept: true };

  if (mode === "verify") {
    if (!known) return { accept: false, reason: "unseen-host" };
    if (known.fingerprint !== presentedFingerprint) {
      return { accept: false, reason: "host-key-mismatch", expected: known.fingerprint, got: presentedFingerprint };
    }
    return { accept: true };
  }

  // accept-new (default): trust on first use, reject on change.
  if (!known) return { accept: true, record: { fingerprint: presentedFingerprint, algorithm } };
  if (known.fingerprint !== presentedFingerprint) {
    return { accept: false, reason: "host-key-mismatch", expected: known.fingerprint, got: presentedFingerprint };
  }
  return { accept: true };
}

/**
 * Adapter over a dsh-storage-domain table (get/put/delete/entries) that
 * addresses known hosts by host:port. Pure delegation — no caching, so the
 * table remains the single source of truth and reconnects see fresh state.
 */
export class KnownHosts {
  constructor(table) {
    this.table = table;
  }

  get(host, port) {
    return this.table.get(knownHostKey(host, port));
  }

  async record(host, port, { fingerprint, algorithm }) {
    const key = knownHostKey(host, port);
    const now = new Date().toISOString();
    const previous = this.table.get(key);
    await this.table.put(key, {
      host,
      port: port ?? 22,
      algorithm,
      fingerprint,
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now
    });
  }

  forget(host, port) {
    return this.table.delete(knownHostKey(host, port));
  }

  list() {
    return [...this.table.entries()].map(([key, value]) => ({ key, ...value }));
  }
}
