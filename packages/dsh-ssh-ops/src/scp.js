/**
 * Minimal SCP legacy-protocol helpers. They deliberately support one regular
 * file only: directory traversal and metadata preservation remain SFTP jobs.
 */
import { shellQuote } from "./safety.js";

const CONTROL_CHAR_RE = /[\0\r\n]/;

export function scpCommand(direction, remotePath) {
  if (typeof remotePath !== "string" || remotePath.length === 0 || CONTROL_CHAR_RE.test(remotePath)) {
    throw new Error("SCP remote path must be non-empty and contain no NUL or line breaks");
  }
  if (direction !== "f" && direction !== "t") throw new Error(`unsupported SCP direction: ${direction}`);
  return `scp -${direction} -- ${shellQuote(remotePath)}`;
}

export function scpFileName(remotePath) {
  const name = remotePath.replace(/\/+$/, "").split("/").at(-1);
  if (!name || name === "." || name === ".." || CONTROL_CHAR_RE.test(name)) {
    throw new Error("SCP upload requires a complete remote file path");
  }
  return name;
}

class ScpReader {
  constructor(stream, timeoutMs = 30000) {
    this.chunks = [];
    this.waiters = [];
    this.failure = null;
    this.closed = false;
    this.timer = setTimeout(() => this.finish(new Error("SCP transfer timed out")), timeoutMs);
    stream.on("data", (chunk) => this.push(Buffer.from(chunk)));
    stream.on("error", (error) => this.finish(error));
    stream.on("close", () => this.finish());
  }

  push(chunk) {
    if (this.closed || chunk.length === 0) return;
    this.chunks.push(chunk);
    this.flush();
  }

  finish(error = null) {
    if (this.closed) return;
    this.closed = true;
    this.failure = error;
    clearTimeout(this.timer);
    this.flush();
  }

  available() {
    return this.chunks.reduce((total, chunk) => total + chunk.length, 0);
  }

  take(count) {
    if (this.available() < count) return null;
    const out = Buffer.allocUnsafe(count);
    let offset = 0;
    while (offset < count) {
      const chunk = this.chunks[0];
      const use = Math.min(chunk.length, count - offset);
      chunk.copy(out, offset, 0, use);
      offset += use;
      if (use === chunk.length) this.chunks.shift();
      else this.chunks[0] = chunk.subarray(use);
    }
    return out;
  }

  read(count) {
    return new Promise((resolve, reject) => {
      const waiter = { count, resolve, reject };
      this.waiters.push(waiter);
      this.flush();
    });
  }

  async line() {
    const bytes = [];
    while (true) {
      const byte = await this.read(1);
      if (byte[0] === 10) return Buffer.concat(bytes).toString("utf8");
      bytes.push(byte);
      if (bytes.length > 8192) throw new Error("SCP protocol line is too long");
    }
  }

  flush() {
    while (this.waiters.length > 0) {
      const waiter = this.waiters[0];
      const data = this.take(waiter.count);
      if (data) {
        this.waiters.shift();
        waiter.resolve(data);
        continue;
      }
      if (this.closed) {
        this.waiters.shift();
        waiter.reject(this.failure ?? new Error("SCP channel closed unexpectedly"));
        continue;
      }
      break;
    }
  }
}

async function expectAck(reader) {
  const code = (await reader.read(1))[0];
  if (code === 0) return;
  if (code === 1 || code === 2) throw new Error((await reader.line()).trim() || "remote SCP rejected the transfer");
  throw new Error(`invalid SCP acknowledgement byte: ${code}`);
}

async function readFileHeader(reader, stream) {
  while (true) {
    const line = await reader.line();
    if (line.startsWith("T")) {
      // Preserve neither timestamps nor modes, but acknowledge optional SCP
      // timestamp records so a normal OpenSSH sender can continue.
      stream.write(Buffer.from([0]));
      continue;
    }
    const match = /^C([0-7]{4}) ([0-9]+) ([^\r\n]+)$/.exec(line);
    if (!match) throw new Error(`unsupported SCP file header: ${line}`);
    return { size: Number(match[2]), name: match[3] };
  }
}

export async function scpUpload(stream, remotePath, data) {
  const reader = new ScpReader(stream);
  try {
    await expectAck(reader);
    const name = scpFileName(remotePath);
    stream.write(Buffer.from(`C0644 ${data.length} ${name}\n`, "utf8"));
    await expectAck(reader);
    stream.write(data);
    stream.write(Buffer.from([0]));
    await expectAck(reader);
    return { bytes: data.length };
  } finally {
    reader.finish();
  }
}

export async function scpDownload(stream, maxBytes) {
  const reader = new ScpReader(stream);
  try {
    // scp -f waits for the client to request the first entry.
    stream.write(Buffer.from([0]));
    const header = await readFileHeader(reader, stream);
    if (!Number.isSafeInteger(header.size)) throw new Error("SCP file size is invalid");
    if (header.size > maxBytes) {
      stream.write(Buffer.from("\x01file exceeds configured download limit\n", "utf8"));
      try { stream.close(); } catch {}
      return { bytes: header.size, data: Buffer.alloc(0), truncated: true };
    }
    stream.write(Buffer.from([0]));
    const data = await reader.read(header.size);
    await expectAck(reader);
    stream.write(Buffer.from([0]));
    return { bytes: header.size, data, truncated: false };
  } finally {
    reader.finish();
  }
}
