/**
 * Send messages via WeChat iLink API.
 * Ported from wechat-opencode (MIT) — https://github.com/pan17/wechat-opencode
 */

import crypto from "node:crypto";
import { sendMessage, getUploadUrl } from "./api.js";
import { encryptAesEcb, uploadToCdn } from "./media.js";
import {
  MessageType,
  MessageState,
  MessageItemType,
  UploadMediaType,
  type CDNMedia,
  type MessageItem,
} from "./types.js";

export interface WeixinSendOpts {
  baseUrl: string;
  token?: string;
  contextToken?: string;
  /**
   * Number of retries on transient network failures for the underlying
   * `sendMessage` API call. Default: 2 (3 total attempts). Set to 0 to
   * disable retry for paths that are already best-effort.
   */
  retries?: number;
}

export async function sendTextMessage(
  to: string,
  text: string,
  opts: WeixinSendOpts,
): Promise<string> {
  const clientId = `wechat-acp-${crypto.randomUUID()}`;
  await sendMessage({
    baseUrl: opts.baseUrl,
    token: opts.token,
    retries: opts.retries ?? 2,
    body: {
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: clientId,
        message_type: MessageType.BOT,
        message_state: MessageState.FINISH,
        ...(opts.contextToken ? { context_token: opts.contextToken } : {}),
        item_list: [{ type: 1, text_item: { text: sanitizeWeChatText(text) } }],
      },
    },
  });
  return clientId;
}

export interface SendMediaOpts extends WeixinSendOpts {
  cdnBaseUrl: string;
  fileName?: string;
  mimeType?: string;
  thumbBuffer?: Buffer;
}

/**
 * Send a media message (image/file/video/voice) to a WeChat user.
 *
 * Flow:
 * 1. Generate 16-byte AES key
 * 2. Call getUploadUrl with AES key (server encrypts upload_param with it)
 * 3. Encrypt file content with AES-128-ECB
 * 4. Upload encrypted content to CDN using server-returned upload_param
 * 5. Send message with CDN media reference
 */
export async function sendMediaMessage(
  to: string,
  mediaType: 1 | 2 | 3 | 4, // IMAGE=1, VIDEO=2, FILE=3, VOICE=4
  buffer: Buffer,
  opts: SendMediaOpts,
): Promise<string> {
  const clientId = crypto.randomBytes(16).toString("hex"); // 32-char hex, like openclaw-weixin
  const rawSize = buffer.length;
  const rawMd5 = crypto.createHash("md5").update(buffer).digest("hex");

  // Step 1: Generate a 16-byte AES key
  const aesKey = crypto.randomBytes(16);
  const aesKeyHex = aesKey.toString("hex");

  // Step 2: Get upload URL from server (server encrypts it with our AES key)
  // filesize should be the encrypted file size (with PKCS7 padding)
  const encryptedSize = Math.ceil((rawSize + 1) / 16) * 16;

  const uploadResp = await getUploadUrl({
    baseUrl: opts.baseUrl,
    token: opts.token,
    body: {
      filekey: clientId,
      media_type: mediaType,
      to_user_id: to,
      rawsize: rawSize,
      rawfilemd5: rawMd5,
      filesize: encryptedSize,
      no_need_thumb: !opts.thumbBuffer,
      aeskey: aesKeyHex,
    },
  });

  if (!uploadResp.upload_param) {
    throw new Error("getUploadUrl: missing upload_param in response");
  }

  // Step 3: Upload to CDN (uploadToCdn handles encryption internally)
  const uploadUrl = uploadResp.upload_full_url
    ?? `${opts.cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(uploadResp.upload_param!)}&filekey=${encodeURIComponent(clientId)}`;

  const encryptQueryParam = await uploadToCdn({
    buffer,
    uploadParam: uploadResp.upload_param!,
    aesKey,
    filekey: clientId,
    cdnBaseUrl: opts.cdnBaseUrl,
    uploadUrl,
  });

  // Step 5: Build CDNMedia reference
  // base64-encode the hex string (32 chars → 44 char base64), not raw bytes
  const aesKeyBase64 = Buffer.from(aesKeyHex).toString("base64");

  const cdnMedia: CDNMedia = {
    encrypt_query_param: encryptQueryParam,
    aes_key: aesKeyBase64,
    encrypt_type: 1,
  };

  // Step 7: Handle thumb if provided
  let thumbCdnMedia: CDNMedia | undefined;
  if (opts.thumbBuffer && uploadResp.thumb_upload_param) {
    const thumbAesKey = crypto.randomBytes(16);
    const thumbAesKeyHex = thumbAesKey.toString("hex");

    const encryptedThumb = encryptAesEcb(opts.thumbBuffer, thumbAesKey);
    const thumbEncryptQueryParam = await uploadToCdn({
      buffer: encryptedThumb,
      uploadParam: uploadResp.thumb_upload_param,
      aesKey: thumbAesKey,
      filekey: `${clientId}_thumb`,
      cdnBaseUrl: opts.cdnBaseUrl,
    });

    thumbCdnMedia = {
      encrypt_query_param: thumbEncryptQueryParam,
      aes_key: Buffer.from(thumbAesKeyHex).toString("base64"),
    };
  }

  // Step 7: Construct message item based on media type
  let itemList: MessageItem[];
  switch (mediaType) {
    case UploadMediaType.IMAGE:
      itemList = [{
        type: MessageItemType.IMAGE,
        image_item: {
          media: cdnMedia,
          aeskey: cdnMedia.aes_key,
          url: cdnMedia.encrypt_query_param,
          mid_size: encryptedSize,
        },
      }];
      break;
    case UploadMediaType.VIDEO:
      itemList = [{
        type: MessageItemType.VIDEO,
        video_item: {
          media: cdnMedia,
          thumb_media: thumbCdnMedia,
          video_size: encryptedSize,
        },
      }];
      break;
    case UploadMediaType.FILE:
      itemList = [{
        type: MessageItemType.FILE,
        file_item: {
          media: cdnMedia,
          file_name: opts.fileName ?? "file",
          len: String(rawSize),
        },
      }];
      break;
    case UploadMediaType.VOICE:
      itemList = [{
        type: MessageItemType.VOICE,
        voice_item: {
          media: cdnMedia,
        },
      }];
      break;
    default:
      throw new Error(`Unsupported media type: ${mediaType}`);
  }

  // Step 8: Send the message
  await sendMessage({
    baseUrl: opts.baseUrl,
    token: opts.token,
    retries: opts.retries ?? 2,
    body: {
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: clientId,
        message_type: MessageType.BOT,
        message_state: MessageState.FINISH,
        ...(opts.contextToken ? { context_token: opts.contextToken } : {}),
        item_list: itemList,
      },
    },
  });

  return clientId;
}

/**
 * Replace unpaired UTF-16 surrogates. iLink `sendmessage` rejects them with
 * `ret=-1 invalid request`; a truncated emoji in `/status` is the usual source.
 */
export function sanitizeWeChatText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text[i]! + text[i + 1]!;
        i++;
      } else {
        out += "\uFFFD";
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      out += "\uFFFD";
    } else {
      out += text[i]!;
    }
  }
  return out;
}

/**
 * Split one outbound body into WeChat-sized segments.
 *
 * The old implementation chopped at the byte-window boundary (`lastIndexOf`
 * of a newline below `maxLen`, else a hard cut). That is destructive for the
 * two constructs WeChat renders natively, because their meaning lives in
 * their delimiters:
 *
 *   - a fenced code block cut in half loses its closing fence, so the
 *     remainder renders as ordinary prose (and a stray fence swallows the
 *     rest of the message into a code block);
 *   - a GFM table cut in half loses its header + separator row, so every
 *     continuation row is an invalid table and renders as raw pipes.
 *
 * So fences and tables are atomic units: never cut inside one. When a unit
 * alone exceeds the budget it is split while repeating its own delimiters —
 * the fence line for a code block, header + separator for a table — so each
 * segment is still independently valid markdown.
 *
 * Break preference inside plain prose: blank line, then newline, then space,
 * then a hard cut. A candidate break is only accepted at ≥55% of the budget,
 * otherwise a single early newline would emit a two-word first chunk and
 * spend one of WeChat's ten messages on it.
 *
 * The budget counts CODE POINTS, not UTF-16 units: an emoji costs 2 units but
 * occupies one WeChat character cell, so unit-counting under-fills every
 * message that contains emoji. When the text needs more than one segment each
 * one is prefixed `（i/n）`, and that prefix is charged to the same budget —
 * otherwise the prefix is what pushes a "full" segment over the limit.
 *
 * @param text - the message body (already markdown-formatted for WeChat).
 * @param maxLen - per-segment budget in code points.
 * @returns one or more segments; a single segment is returned unprefixed.
 */
export function splitText(text: string, maxLen: number): string[] {
  const limit = Number.isFinite(maxLen) && maxLen >= 1 ? Math.floor(maxLen) : 1;
  if (codePointLength(text) <= limit) return [text];

  // A FIXED prefix width, decided from the limit alone. The content split
  // depends on the budget the prefix leaves, so sizing the pass with one
  // prefix and then numbering the pieces with a longer one would hand some
  // of them more than they were measured with and drift the count (the
  // `（3/2）` failure). `min(limit, 8)` covers `（i/n）` up to `（1/99）` while
  // never charging more than half of any realistic message.
  const width = Math.min(limit, 8);
  // A limit too narrow to carry a prefix at all stays unnumbered rather than
  // emitting a segment that overruns the gateway limit.
  if (limit <= width + 3) return packSegments(text, () => "", limit);
  const sized = packSegments(text, () => " ".repeat(width), limit);
  const total = sized.length;
  if (total <= 1) return packSegments(text, () => "", limit);
  return packSegments(text, (index) => `（${index + 1}/${total}）`.padEnd(width, " "), limit);
}

/** The `（i/n）` index prefix for one segment of a multi-segment body. */
type PrefixFn = (index: number) => string;

/** Count code points without materialising an array of them. */
function codePointLength(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    count++;
  }
  return count;
}

/**
 * One addressable unit of the message. A fence or a table keeps its own
 * line structure so the packer can split it while repeating the delimiters
 * that make it render.
 */
type SegmentBlock =
  | { kind: "text"; text: string }
  | { kind: "fence"; fence: string; body: string; close: string }
  | { kind: "table"; header: string; separator: string; rows: string[] };

/** Longest run of fence characters at the start of a line, 0 when none. */
function fenceRun(line: string): number {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  return match ? match[1]!.length : 0;
}

/** True when `row` looks like a GFM table row (pipes at both ends). */
function tableRowShapes(row: string): boolean {
  const trimmed = row.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length >= 2;
}

/** True when `row` is a GFM separator row (`| --- | :--: |`). */
function isTableSeparatorRow(row: string): boolean {
  if (!tableRowShapes(row)) return false;
  const inner = row.trim().slice(1, -1);
  if (inner.length === 0) return false;
  for (const cell of inner.split("|")) {
    if (!/^:?-{1,}:?$/.test(cell.trim())) return false;
  }
  return true;
}

/**
 * Classify the block starting at line `start`: a fence, a GFM table, or
 * plain prose. Returns the consumed line count (≥1) and, for a non-text
 * block, the structured lines the packer needs.
 */
function readBlock(
  lines: string[],
  start: number,
): { end: number; block: SegmentBlock } {
  const line = lines[start]!;

  const fence = fenceRun(line);
  if (fence > 0) {
    const marker = line.trimStart()[0]!;
    // A fence closes only on a line of the same marker, at least as long,
    // with nothing but whitespace after it. An unclosed fence (a streamed
    // message caught mid-block) runs to the end of the text.
    let close = -1;
    for (let i = start + 1; i < lines.length; i++) {
      const candidate = lines[i]!;
      const run = fenceRun(candidate);
      if (run >= fence && candidate.trimStart()[0] === marker && candidate.trim() === candidate.trimStart().slice(0, run)) {
        close = i;
        break;
      }
    }
    const last = close === -1 ? lines.length - 1 : close;
    return {
      end: last,
      block: {
        kind: "fence",
        fence: line,
        body: lines.slice(start + 1, last).join("\n"),
        // Reopen with a matching fence even when the original never closed.
        close: close === -1 ? marker.repeat(fence) : lines[close]!,
      },
    };
  }

  if (tableRowShapes(line) && start + 1 < lines.length && isTableSeparatorRow(lines[start + 1]!)) {
    let end = start + 1;
    while (end + 1 < lines.length && tableRowShapes(lines[end + 1]!)) end += 1;
    return {
      end,
      block: {
        kind: "table",
        header: line,
        separator: lines[start + 1]!,
        rows: lines.slice(start + 2, end + 1),
      },
    };
  }

  return { end: start, block: { kind: "text", text: line } };
}

/** Slice one plain text into the blocks above, joining prose line by line. */
function segmentBlocks(text: string): SegmentBlock[] {
  const lines = text.split("\n");
  const blocks: SegmentBlock[] = [];
  let pending: string[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    // Strip the separator newlines that belong BETWEEN blocks. Without this
    // the newline run sits at the head of a block, so a hard cut just after
    // it strands `\n\n` at the end of the previous segment and the leading
    // blank line shows up as a rendered gap in the next WeChat message.
    // Separators are already carried by the segment boundary.
    const joined = pending.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
    if (joined.length > 0) blocks.push({ kind: "text", text: joined });
    pending = [];
  };
  let i = 0;
  while (i < lines.length) {
    const { end, block } = readBlock(lines, i);
    if (block.kind === "text") {
      pending.push(block.text);
    } else {
      flush();
      blocks.push(block);
    }
    i = end + 1;
  }
  flush();
  return blocks;
}

/**
 * Pack blocks into segments. `prefixFor` supplies the per-segment prefix
 * (`（i/n）` on the numbered pass, "" on the sizing pass) and every prefix
 * costs the same number of code points, which is charged against `limit`.
 */
function packSegments(text: string, prefixFor: PrefixFn, limit: number): string[] {
  const fixed = codePointLength(prefixFor(0));
  const available = limit - fixed;
  /** Untagged pieces; the prefix is added once the index is known. */
  const pieces: string[] = [];
  let current: string[] = [];

  const emit = () => {
    if (current.length > 0) pieces.push(current.join("\n"));
    // Truncate in place: reassigning `current` here would leave the loop
    // writing into the array this closure captured, and the accumulator
    // would never actually drain.
    current.length = 0;
  };

  for (const block of segmentBlocks(text)) {
    const encoded = encodeBlock(block);
    let currentLen = codePointLength(current.join("\n"));
    const currentCost = current.length > 0 ? currentLen + 1 : 0;
    const encodedLen = codePointLength(encoded);

    // Join a block that still fits.
    if (current.length > 0 && currentCost + encodedLen <= available) {
      current.push(encoded);
      continue;
    }
    // `available` can only be non-positive when the caller pairs an absurd
    // prefix with a tiny limit: take the block whole then, because
    // over-length beats dropping content.
    if (available <= 0 || encodedLen <= available) {
      if (current.length > 0) emit();
      current.push(encoded);
      continue;
    }

    // Over budget, so the block has to be cut.
    const min = Math.ceil(available * 0.55);
    // A block whose WHOLE body is short is worth keeping in one piece: the
    // split would emit its head as a message of its own and strand the small
    // remainder (the `rest` half of a short two-line paragraph) at the head
    // of the next one. It still cannot be parked as one segment when the
    // accumulator is too full to take it — that is the over-length bug — so
    // it is hard-cut in place instead.
    if (codePointLength(encoded) < min) {
      const hard = block.kind === "text"
        ? splitPlain(block.text, available)
        : splitPlain(encoded, available);
      if (hard.length === 1) {
        if (current.length > 0) emit();
        current.push(encoded);
      } else {
        if (current.length > 0) emit();
        current.push(hard[0]!);
        for (const piece of hard.slice(1)) pieces.push(piece);
      }
      continue;
    }

    const split = block.kind === "text"
      ? splitPlain(block.text, available)
      : splitAtomic(block, available);
    for (let i = 0; i < split.length; i++) {
      const piece = split[i]!;
      const isLast = i === split.length - 1;
      const pieceLen = codePointLength(piece);
      const isTail = current.length > 0 && currentLen + 1 + pieceLen <= available;
      // A piece that is not the last one and is too small to stand alone
      // waits for its successor: emitting it would spend a whole WeChat
      // message on a fragment, which is the tiny-chunk problem the 55% break
      // threshold exists to prevent — it just moves to the segment end.
      if (!isLast && pieceLen < min && isTail) {
        current.push(piece);
        currentLen = codePointLength(current.join("\n"));
        continue;
      }
      if (current.length > 0) emit();
      current.push(piece);
      currentLen = pieceLen;
    }
  }

  emit();
  return pieces.map((piece, index) => prefixFor(index) + piece);
}
/** Serialise one block back to markdown for length accounting and output. */
function encodeBlock(block: SegmentBlock): string {
  switch (block.kind) {
    case "text":
      return block.text;
    case "fence":
      return `${block.fence}\n${block.body}\n${block.close}`;
    case "table":
      return [block.header, block.separator, ...block.rows].join("\n");
  }
}

/**
 * Split a block that must stay self-delimiting: a code fence re-emits its
 * fence lines, a table re-emits its header + separator row. Never produces
 * an empty segment, so the closing delimiter is never a message on its own
 * unless the body is genuinely empty.
 */
function splitAtomic(block: SegmentBlock, budget: number): string[] {
  if (block.kind === "fence") {
    const open = `${block.fence}\n`;
    const close = `\n${block.close}`;
    // A budget too small to hold both delimiters cannot be honoured by any
    // split; emit the whole fence as one (over-length) segment rather than
    // a swarm of delimiters with no body.
    if (budget <= codePointLength(open + close) + 1) return [encodeBlock(block)];
    const inner = Math.max(1, budget - codePointLength(open) - codePointLength(close));
    const chunks = splitPlain(block.body, inner);
    const out: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      // A trailing empty chunk would render as a fence with no body — drop
      // it instead of spending one of WeChat's ten messages on it.
      if (i === chunks.length - 1 && chunks[i] === "") continue;
      // `open` already ends with a newline; a chunk that begins with the
      // newline the break consumed would otherwise open a blank first line.
      out.push(open + chunks[i]!.replace(/^\n/, "") + close);
    }
    return out.length > 0 ? out : [encodeBlock(block)];
  }

  if (block.kind !== "table") throw new Error("splitAtomic: expected a table block");

  // No trailing newline in `head`: the last row is the one that needs a
  // newline BEFORE it, so charging one for a separator that is never
  // followed by a row costs a code point and can reject a table that fits.
  const head = `${block.header}\n${block.separator}`;
  const cost = codePointLength(head);
  // A table is only valid WITH its header and separator, so there is no way
  // to honour a budget that cannot hold them plus one row. Emitting the
  // table whole (one over-length segment) is the least-bad option: splitting
  // it here would produce rows with no header, which renders as raw pipes.
  if (budget <= cost + 1) return [encodeBlock(block)];
  // Never negative: a negative budget makes `splitPlain` return no row at
  // all, and the table then falls back to an invalid split.
  const rowBudget = Math.max(1, budget - cost - 1);
  const rows: string[] = [];
  for (const row of block.rows) {
    // A single row longer than the remaining budget is hard-cut across
    // segments; each piece still carries the repeated header + separator,
    // so every segment stays a valid table. The extra unit pays for the
    // newline between the separator row and the first data row.
    for (const piece of splitPlain(row, rowBudget)) rows.push(piece);
  }
  if (rows.length === 0) return [encodeBlock(block)];
  return rows.map((row) => `${head}\n${row}`);
}

/**
 * Split plain prose at natural boundaries, preferring (in order) a blank
 * line, a newline, a space, then a hard cut. Code points are counted with a
 * code-unit walk, so a hard cut can never land inside a surrogate pair.
 */
function splitPlain(text: string, budget: number): string[] {
  const pieces: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (codePointLength(remaining) <= budget) {
      pieces.push(remaining);
      break;
    }
    const cut = chooseBreak(remaining, budget);
    const chunk = remaining.slice(0, cut.index).replace(/\s+$/, "");
    // A break that landed ON the separator parks it on the next chunk;
    // leading newlines there would render as a blank line at the top of the
    // next WeChat message. Whitespace is the separator, never content.
    const rest = remaining.slice(cut.index).replace(/^\s+/, "");
    if (chunk.length > 0) pieces.push(chunk);
    remaining = rest;
  }
  return pieces;
}

/** Index of the code-unit offset to cut at, at least 55% of the budget in. */
function chooseBreak(text: string, budget: number): { index: number; ok: boolean } {
  // Code-unit boundary of the first `budget` code points. Walking code
  // points (rather than slicing `budget` UTF-16 units) is what keeps a hard
  // cut from landing inside a surrogate pair.
  let hard = 0;
  let seen = 0;
  for (let i = 0; i < text.length && seen < budget; i++) {
    const code = text.charCodeAt(i);
    const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
    const pair = code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
    if (pair) i++;
    seen++;
    hard = i + 1;
  }
  const min = Math.ceil(hard * 0.55);
  for (const needle of ["\n\n", "\n", " "]) {
    // Stay strictly inside the budget: a break character at `hard` would
    // push the chunk one code point over it, and the per-segment limit is
    // what WeChat enforces. The cost is that such a break can survive as
    // leading whitespace — which `splitPlain` strips off the next chunk.
    const index = hard >= needle.length ? text.lastIndexOf(needle, hard - needle.length) : -1;
    if (index > 0 && index >= min) {
      return { index: index + needle.length, ok: true };
    }
  }
  return { index: hard, ok: false };
}
