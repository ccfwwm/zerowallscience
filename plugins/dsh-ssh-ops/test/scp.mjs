import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { scpCommand, scpDownload, scpUpload } from "../src/scp.js";

function mockChannel(onWrite) {
  const stream = new EventEmitter();
  stream.writes = [];
  stream.write = (data) => {
    const chunk = Buffer.from(data);
    stream.writes.push(chunk);
    onWrite?.(chunk, stream);
    return true;
  };
  stream.close = () => stream.emit("close");
  return stream;
}

// Remote paths are shell-quoted and SCP protocol control characters are banned.
assert.equal(scpCommand("f", "/tmp/a'b.txt"), "scp -f -- '/tmp/a'\\''b.txt'");
assert.throws(() => scpCommand("f", "/tmp/a\nb"), /line breaks/);
assert.throws(() => scpCommand("x", "/tmp/a"), /unsupported/);

// Upload: server ACKs channel open, file header, and final NUL marker.
{
  let writes = 0;
  const stream = mockChannel((_chunk, channel) => {
    writes += 1;
    if (writes === 1 || writes === 3) queueMicrotask(() => channel.emit("data", Buffer.from([0])));
  });
  queueMicrotask(() => stream.emit("data", Buffer.from([0])));
  const data = Buffer.from([0, 255, 1, 128]);
  const result = await scpUpload(stream, "/tmp/blob.bin", data);
  assert.equal(result.bytes, data.length);
  assert.equal(stream.writes[0].toString(), "C0644 4 blob.bin\n");
  assert.deepEqual(stream.writes[1], data);
  assert.deepEqual(stream.writes[2], Buffer.from([0]));
}

// Download: one header followed by arbitrary binary chunks returns exact bytes.
{
  const data = Buffer.from([0, 255, 1, 128]);
  let requested = false;
  const stream = mockChannel((chunk, channel) => {
    if (!requested && chunk.equals(Buffer.from([0]))) {
      requested = true;
      queueMicrotask(() => {
        channel.emit("data", Buffer.from("C0644 4 blob.bin\n", "utf8"));
        channel.emit("data", data.subarray(0, 2));
        channel.emit("data", Buffer.concat([data.subarray(2), Buffer.from([0])]));
      });
    }
  });
  const result = await scpDownload(stream, 1024);
  assert.equal(result.truncated, false);
  assert.equal(result.bytes, 4);
  assert.deepEqual(result.data, data);
  assert.deepEqual(stream.writes, [Buffer.from([0]), Buffer.from([0]), Buffer.from([0])]);
}

// The sender receives an explicit protocol error before an oversized file is
// transferred, so the browser never accumulates it in memory.
{
  const stream = mockChannel((chunk, channel) => {
    if (chunk.equals(Buffer.from([0]))) queueMicrotask(() => channel.emit("data", Buffer.from("C0644 9 big.bin\n")));
  });
  const result = await scpDownload(stream, 4);
  assert.equal(result.truncated, true);
  assert.equal(result.bytes, 9);
  assert.equal(stream.writes.at(-1).toString(), "\x01file exceeds configured download limit\n");
}

// Remote failure ACKs surface their message instead of hanging the channel.
{
  const stream = mockChannel();
  queueMicrotask(() => stream.emit("data", Buffer.from("\x01permission denied\n")));
  await assert.rejects(() => scpUpload(stream, "/tmp/a", Buffer.from("x")), /permission denied/);
}

console.log("scp legacy protocol: all cases passed");
