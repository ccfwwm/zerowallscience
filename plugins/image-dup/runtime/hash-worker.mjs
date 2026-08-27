import { Jimp } from 'jimp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

// ============================================================
// 感知哈希核心（与 Client canvas 版逐字一致）
// 统一输入：{ w, h, data: Uint8Array(RGBA) }
// ============================================================

function rgbaToGray(data) {
  const n = (data.length / 4) | 0;
  const g = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    g[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }
  return g;
}

function grayToGrid(src, sw, sh, tw, th) {
  const out = new Float64Array(tw * th);
  for (let ty = 0; ty < th; ty++) {
    const y0 = Math.floor((ty * sh) / th);
    const y1 = Math.max(y0 + 1, Math.ceil(((ty + 1) * sh) / th));
    for (let tx = 0; tx < tw; tx++) {
      const x0 = Math.floor((tx * sw) / tw);
      const x1 = Math.max(x0 + 1, Math.ceil(((tx + 1) * sw) / tw));
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        const base = y * sw;
        for (let x = x0; x < x1; x++) { sum += src[base + x]; n++; }
      }
      out[ty * tw + tx] = sum / n;
    }
  }
  return out;
}

function rgbaToGrayDown(data, w, h, tw, th) {
  const out = new Float64Array(tw * th);
  for (let ty = 0; ty < th; ty++) {
    const y0 = Math.floor((ty * h) / th);
    const y1 = Math.max(y0 + 1, Math.ceil(((ty + 1) * h) / th));
    for (let tx = 0; tx < tw; tx++) {
      const x0 = Math.floor((tx * w) / tw);
      const x1 = Math.max(x0 + 1, Math.ceil(((tx + 1) * w) / tw));
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        const base = y * w;
        for (let x = x0; x < x1; x++) {
          const o = (base + x) * 4;
          sum += 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
          n++;
        }
      }
      out[ty * tw + tx] = sum / n;
    }
  }
  return out;
}

function flipH(g, w, h) {
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = g[y * w + (w - 1 - x)];
  return out;
}
function flipV(g, w, h) {
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = g[(h - 1 - y) * w + x];
  return out;
}
function rot90(g, w, h) {
  const nw = h, nh = w;
  const out = new Float64Array(nw * nh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * nh + (h - 1 - y)] = g[y * w + x];
  return { g: out, w: nw, h: nh };
}
function rot180(g, w, h) {
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = g[(h - 1 - y) * w + (w - 1 - x)];
  return out;
}
function rot270(g, w, h) {
  const nw = h, nh = w;
  const out = new Float64Array(nw * nh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[(w - 1 - x) * nh + y] = g[y * w + x];
  return { g: out, w: nw, h: nh };
}

function aHash(g, w, h) {
  const grid = grayToGrid(g, w, h, 8, 8);
  let sum = 0;
  for (let i = 0; i < 64; i++) sum += grid[i];
  const mean = sum / 64;
  let bits = 0n;
  for (let i = 0; i < 64; i++) if (grid[i] >= mean) bits |= (1n << BigInt(i));
  return bits;
}
function dHashH(g, w, h) {
  const grid = grayToGrid(g, w, h, 9, 8);
  let bits = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (grid[y * 9 + x] < grid[y * 9 + x + 1]) bits |= (1n << BigInt(y * 8 + x));
  }
  return bits;
}
function pHash(g, w, h) {
  const N = 32;
  const grid = grayToGrid(g, w, h, N, N);
  const coeffs = new Float64Array(64);
  for (let u = 0; u < 8; u++) {
    const cu = u === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
    for (let v = 0; v < 8; v++) {
      const cv = v === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
      let s = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        s += grid[y * N + x] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
      }
      coeffs[u * 8 + v] = cu * cv * s;
    }
  }
  const sorted = Array.from(coeffs).sort((a, b) => a - b);
  const median = (sorted[31] + sorted[32]) / 2;
  let bits = 0n;
  for (let i = 0; i < 64; i++) if (coeffs[i] > median) bits |= (1n << BigInt(i));
  return bits;
}

const MAX_WORK = 1024;
function computeHashes(w, h, data) {
  let gw = w, gh = h, gray;
  if (w * h > MAX_WORK * MAX_WORK) {
    const s = Math.sqrt((MAX_WORK * MAX_WORK) / (w * h));
    gw = Math.max(8, Math.floor(w * s));
    gh = Math.max(8, Math.floor(h * s));
    gray = rgbaToGrayDown(data, w, h, gw, gh);
  } else {
    gray = rgbaToGray(data);
  }
  const g64 = grayToGrid(gray, gw, gh, 64, 64);
  const dH = dHashH(g64, 64, 64);
  const dH_hf = dHashH(flipH(g64, 64, 64), 64, 64);
  const dH_vf = dHashH(flipV(g64, 64, 64), 64, 64);
  const r90 = rot90(g64, 64, 64);
  const dH_r90 = dHashH(r90.g, r90.w, r90.h);
  const dH_r180 = dHashH(rot180(g64, 64, 64), 64, 64);
  const r270 = rot270(g64, 64, 64);
  const dH_r270 = dHashH(r270.g, r270.w, r270.h);
  const aH = aHash(g64, 64, 64);
  const pH = pHash(g64, 64, 64);
  return { dH, dH_hf, dH_vf, dH_r90, dH_r180, dH_r270, aH, pH, w, h };
}

function popcount64(x) {
  let n = 0;
  while (x > 0n) { x &= (x - 1n); n++; }
  return n;
}
const hamming = (a, b) => popcount64(a ^ b);
const hex64 = (x) => x.toString(16).padStart(16, '0');

function comparePair(A, B, threshold) {
  const cands = [
    [hamming(A.dH, B.dH), '重复/近重复'],
    [hamming(A.dH, B.dH_hf), '水平翻转'],
    [hamming(A.dH, B.dH_vf), '垂直翻转'],
    [hamming(A.dH, B.dH_r90), '旋转 90°/270°'],
    [hamming(A.dH, B.dH_r180), '旋转 180°'],
    [hamming(A.dH, B.dH_r270), '旋转 90°/270°'],
    [hamming(A.aH, B.aH), '重复/近重复'],
    [hamming(A.pH, B.pH), '缩放/重压缩'],
  ];
  let best = null;
  for (const [d, label] of cands) {
    if (best === null || d < best.d) best = { d, label };
  }
  return {
    distance: best.d,
    similarity: Math.round((1 - best.d / 64) * 1000) / 1000,
    transform: best.label,
    suspicious: best.d <= threshold,
  };
}

// ============================================================
// copy-move（单图内局部重复）检测：分块 aHash + 偏移聚类
// ============================================================
function detectCopyMove(w, h, data) {
  const MAX = 384, B = 16, S = 16, MIN_VAR = 16, MIN_MATCHES = 5, RMS_T = 6, MEAN_T = 10;
  let gw = w, gh = h, gray;
  if (w * h > MAX * MAX) {
    const s = Math.sqrt((MAX * MAX) / (w * h));
    gw = Math.max(16, Math.floor(w * s));
    gh = Math.max(16, Math.floor(h * s));
    gray = rgbaToGrayDown(data, w, h, gw, gh);
  } else {
    gray = rgbaToGray(data);
  }
  const blocks = [];
  for (let y = 0; y + B <= gh; y += S) {
    for (let x = 0; x + B <= gw; x += S) {
      const vals = new Float64Array(B * B);
      let sum = 0;
      for (let by = 0; by < B; by++) for (let bx = 0; bx < B; bx++) {
        const v = gray[(y + by) * gw + (x + bx)];
        vals[by * B + bx] = v; sum += v;
      }
      const mean = sum / (B * B);
      let varSum = 0;
      for (let i = 0; i < vals.length; i++) { const d = vals[i] - mean; varSum += d * d; }
      if (varSum / vals.length < MIN_VAR) continue;
      blocks.push({ x, y, mean, g8: grayToGrid(vals, B, B, 8, 8) });
    }
  }
  const matches = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const dx = blocks[j].x - blocks[i].x, dy = blocks[j].y - blocks[i].y;
      if (Math.abs(dx) + Math.abs(dy) < B) continue;
      if (Math.abs(blocks[i].mean - blocks[j].mean) > MEAN_T) continue;
      const ga = blocks[i].g8, gb = blocks[j].g8;
      let s2 = 0;
      for (let k = 0; k < 64; k++) { const d = ga[k] - gb[k]; s2 += d * d; }
      const rms = Math.sqrt(s2 / 64);
      if (rms <= RMS_T) matches.push({ a: blocks[i], b: blocks[j], rms });
    }
  }
  const groups = new Map();
  for (const m of matches) {
    const dx = m.b.x - m.a.x, dy = m.b.y - m.a.y;
    const key = Math.round(dx / S) + ':' + Math.round(dy / S);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  const regions = [];
  for (const list of groups.values()) {
    if (list.length < MIN_MATCHES) continue;
    let ax0 = 1e9, ay0 = 1e9, ax1 = -1, ay1 = -1, bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
    let minR = 999;
    for (const m of list) {
      ax0 = Math.min(ax0, m.a.x); ay0 = Math.min(ay0, m.a.y);
      ax1 = Math.max(ax1, m.a.x + B); ay1 = Math.max(ay1, m.a.y + B);
      bx0 = Math.min(bx0, m.b.x); by0 = Math.min(by0, m.b.y);
      bx1 = Math.max(bx1, m.b.x + B); by1 = Math.max(by1, m.b.y + B);
      if (m.rms < minR) minR = m.rms;
    }
    regions.push({
      ax: round4(ax0 / gw), ay: round4(ay0 / gh), aw: round4((ax1 - ax0) / gw), ah: round4((ay1 - ay0) / gh),
      bx: round4(bx0 / gw), by: round4(by0 / gh), bw: round4((bx1 - bx0) / gw), bh: round4((by1 - by0) / gh),
      matches: list.length,
      conf: Math.round((1 - minR / 255) * 1000) / 1000,
    });
  }
  regions.sort((a, b) => b.matches - a.matches);
  return { width: gw, height: gh, regions: regions.slice(0, 20) };
}
function round4(x) { return Math.round(x * 10000) / 10000; }

// ============================================================
// 目录扫描
// ============================================================
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff', '.gif', '.webp', '.avif', '.heic', '.heif', '.jp2', '.j2k', '.svg']);

let _sharpMod = null;
async function getSharp() {
  if (_sharpMod === null) {
    try { const m = await import('sharp'); _sharpMod = m.default || m; } catch (e) { _sharpMod = false; }
  }
  return _sharpMod || null;
}

// 解码任意常见格式：jimp 优先（PNG/JPEG/BMP/GIF/TIFF），失败时用 sharp（WebP/AVIF/HEIC/JPEG2000/SVG 等）
async function decodeAny(bytes) {
  try { return await Jimp.read(Buffer.from(bytes)); } catch (e) {}
  try {
    const sharp = await getSharp();
    if (!sharp) return null;
    const { data, info } = await sharp(Buffer.from(bytes)).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const n = info.width * info.height * 4;
    if (!info.width || !info.height || data.length < n) return null;
    const img = new Jimp({ width: info.width, height: info.height, color: 0x000000 });
    img.bitmap.data.set(new Uint8Array(data.buffer, data.byteOffset, n));
    return img;
  } catch (e) { return null; }
}
async function decodeAnyFile(p) {
  try { return await decodeAny(await fs.readFile(p)); } catch (e) { return null; }
}

async function walkFiles(dir, recursive, out) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (recursive) await walkFiles(full, recursive, out); }
    else if (ent.isFile() && IMG_EXT.has(path.extname(ent.name).toLowerCase())) out.push(full);
  }
}

function drawDashedRect(img, x, y, w, h, color, t) {
  const th = Math.max(1, t || 3);
  const set = (px, py) => { for (let a = 0; a < th; a++) for (let b = 0; b < th; b++) { try { img.setPixelColor(color, Math.round(px + a), Math.round(py + b)); } catch (e) {} } };
  for (let i = 0; i < w; i++) { if (Math.floor(i / 9) % 2 === 0) { set(x + i, y); set(x + i, y + h - 1); } }
  for (let j = 0; j < h; j++) { if (Math.floor(j / 9) % 2 === 0) { set(x, y + j); set(x + w - 1, y + j); } }
}

async function jpegDataUrl(img) { let b64 = await img.getBase64('image/jpeg'); return b64.indexOf('data:') === 0 ? b64 : 'data:image/jpeg;base64,' + b64; }

async function makeCropComposite(aImg, bImg, region) {
  const cropAt = (img, r) => {
    const w = img.bitmap.width, h = img.bitmap.height;
    const x = Math.max(0, Math.floor(r.ax * w)), y = Math.max(0, Math.floor(r.ay * h));
    const cw = Math.max(10, Math.floor(r.aw * w)), ch = Math.max(10, Math.floor(r.ah * h));
    return img.clone().crop({ x, y, w: Math.min(cw, w - x), h: Math.min(ch, h - y) });
  };
  const ca = cropAt(aImg, region), cb = cropAt(bImg, region);
  const H = 260;
  const wa = Math.max(20, Math.round(ca.bitmap.width * H / ca.bitmap.height));
  const wb = Math.max(20, Math.round(cb.bitmap.width * H / cb.bitmap.height));
  const CW = 420, CH = 250;
  ca.resize({ w: CW, h: CH }); cb.resize({ w: CW, h: CH });
  const P = 16, GAP = 26;
  const out = new Jimp({ width: CW * 2 + GAP + P * 2, height: CH + P * 2, color: 0xffffff });
  out.composite(ca, P, P); out.composite(cb, P + CW + GAP, P);
  drawDashedRect(out, P, P, CW, CH, 0xE53935, 4);
  drawDashedRect(out, P + CW + GAP, P, CW, CH, 0x1E88E5, 4);
  return await jpegDataUrl(out);
}
async function loadImg(src) {
  const img = src.path ? await decodeAnyFile(src.path) : await decodeAny(dataUrlToBuffer(src.dataUrl));
  if (!img) throw new Error('无法解码（格式不支持）');
  return img;
}

function crossMatch(a, b) {
  const scales = [1.0, 0.66, 0.5, 0.4, 0.33, 0.25, 0.2];
  const B = 48, S = 24, RMS_T = 9, MEAN_T = 16, K = 3;
  const regions = [];
  const blocksA = a._blk || (a._blk = extractBlocks(a.gray, a.w, a.h, B, S, 18));
  const cacheB = b._sc || (b._sc = new Map());
  let bytes = b._scBytes || 0;
  for (const s of scales) {
    let bw, bh, bg, bs;
    if (s === 1.0) {
      bw = b.w; bh = b.h; bg = b.gray;
      bs = b._blk || (b._blk = extractBlocks(bg, bw, bh, B, S, 18));
    } else {
      let grid = cacheB.get(s);
      if (grid) { bw = grid.bw; bh = grid.bh; bg = grid.bg; }
      else {
        bw = Math.max(16, Math.floor(b.w * s));
        bh = Math.max(16, Math.floor(b.h * s));
        bg = grayToGrid(b.gray, b.w, b.h, bw, bh);
        const nb = bg.length * 8;
        if (bytes + nb <= 96 * 1024 * 1024) { cacheB.set(s, { bg, bw, bh }); bytes += nb; b._scBytes = bytes; }
      }
      bs = extractBlocks(bg, bw, bh, B, S, 18);
    }
    const buckets = new Map();
    for (const bb of bs) {
      const key = Math.round(bb.mean / 8);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(bb);
    }
    const groups = new Map();
    for (const ba of blocksA) {
      const k = Math.round(ba.mean / 8);
      let best = null;
      for (let dk = -2; dk <= 2; dk++) {
        const lst = buckets.get(k + dk);
        if (!lst) continue;
        for (const bb of lst) {
          if (Math.abs(ba.mean - bb.mean) > MEAN_T) continue;
          const r = blockRms(ba.g8, bb.g8);
          if (r <= RMS_T && (best === null || r < best.r)) best = { bb, r };
        }
      }
      if (best) {
        const key = Math.round((best.bb.x - ba.x) / S) + ':' + Math.round((best.bb.y - ba.y) / S);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ ba, bb: best.bb, r: best.r });
      }
    }
    for (const list of groups.values()) {
      if (list.length < K) continue;
      let ax0 = 1e9, ay0 = 1e9, ax1 = -1, ay1 = -1, bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1, minR = 999;
      for (const m of list) {
        ax0 = Math.min(ax0, m.ba.x); ay0 = Math.min(ay0, m.ba.y); ax1 = Math.max(ax1, m.ba.x + B); ay1 = Math.max(ay1, m.ba.y + B);
        bx0 = Math.min(bx0, m.bb.x); by0 = Math.min(by0, m.bb.y); bx1 = Math.max(bx1, m.bb.x + B); by1 = Math.max(by1, m.bb.y + B);
        if (m.r < minR) minR = m.r;
      }
      let totalIn = 0;
      for (const ba of blocksA) { if (ba.x >= ax0 && ba.x < ax1 && ba.y >= ay0 && ba.y < ay1) totalIn++; }
      const ratio = list.length / Math.max(1, totalIn);
      if (ratio < 0.5) continue;
      const rw = ax1 - ax0, rh = ay1 - ay0, rw2 = bx1 - bx0, rh2 = by1 - by0;
      const g1 = new Float64Array(rw * rh); for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) g1[y * rw + x] = a.gray[(ay0 + y) * a.w + (ax0 + x)];
      const g2 = new Float64Array(rw2 * rh2); for (let y = 0; y < rh2; y++) for (let x = 0; x < rw2; x++) g2[y * rw2 + x] = bg[(by0 + y) * bw + (bx0 + x)];
      const regionRms = blockRms(grayToGrid(g1, rw, rh, 16, 16), grayToGrid(g2, rw2, rh2, 16, 16));
      if (regionRms > 9) continue;
      const dA = dHashH(grayToGrid(g1, rw, rh, 32, 32), 32, 32);
      const dB = dHashH(grayToGrid(g2, rw2, rh2, 32, 32), 32, 32);
      if (popcount64(dA ^ dB) > 40) continue;
      regions.push({ scale: s, ax: round4(ax0 / a.w), ay: round4(ay0 / a.h), aw: round4((ax1 - ax0) / a.w), ah: round4((ay1 - ay0) / a.h), bx: round4(bx0 / bw), by: round4(by0 / bh), bw: round4((bx1 - bx0) / bw), bh: round4((by1 - by0) / bh), matches: list.length, conf: Math.round((1 - minR / 255) * 1000) / 1000 });
    }
  }
  regions.sort((x, y) => y.matches - x.matches);
  const top = regions[0] || null;
  return { scale: top ? top.scale : null, matches: top ? top.matches : 0, conf: top ? top.conf : 0, regions: regions.slice(0, 2) };
}
async function scanDir(dir, opts) {
  const threshold = isNaN(parseInt(opts.threshold, 10)) ? 8 : parseInt(opts.threshold, 10);
  const thumb = opts.thumb == null ? 180 : parseInt(opts.thumb, 10);
  const limit = isNaN(parseInt(opts.limit, 10)) ? 1000 : parseInt(opts.limit, 10);
  const recursive = !!opts.recursive;
  const copyMove = opts.copyMove !== false;
  const crossImage = opts.crossImage !== false;
  const relName = (fp) => { const r = path.relative(dir, fp); return r.split(path.sep).join('/'); };
  const files = [];
  await walkFiles(dir, recursive, files);
  files.sort();
  const capped = files.slice(0, limit);

  const items = [];
  const skipped = [];
  const grayItems = [];
  for (const fp of capped) {
    try {
      const st = await fs.stat(fp);
      if (st.size > 25 * 1024 * 1024) { skipped.push({ name: relName(fp), error: '文件超过 25MB，已跳过' }); continue; }
      const img = await decodeAnyFile(fp);
      if (!img) { skipped.push({ name: relName(fp), error: '无法解码（格式不支持）' }); continue; }
      const { width, height, data } = img.bitmap;
      const hashes = computeHashes(width, height, data);
      const wg = toGrayC(data, width, height, 384);
      let cmRegions = [];
      if (copyMove) { try { cmRegions = detectCopyMove(width, height, data).regions; } catch (e) {} }
      let thumbData = null;
      if (thumb > 0) {
        try {
          const t = img.clone();
          t.scaleToFit({ w: thumb, h: thumb });
          const b64 = await jpegDataUrl(t);
          thumbData = 'data:image/jpeg;base64,' + b64;
        } catch (e) { thumbData = null; }
      }
      items.push({
        name: relName(fp), path: fp, w: width, h: height,
        dH: hex64(hashes.dH), dH_hf: hex64(hashes.dH_hf), dH_vf: hex64(hashes.dH_vf),
        dH_r90: hex64(hashes.dH_r90), dH_r180: hex64(hashes.dH_r180), dH_r270: hex64(hashes.dH_r270),
        aH: hex64(hashes.aH), pH: hex64(hashes.pH),
        cmRegions, cmCount: cmRegions.length, thumb: thumbData, _h: hashes,
      });
      if (crossImage !== false) {
        try { const wg = toGrayC(data, width, height, 384); grayItems.push({ name: relName(fp), path: fp, gray: wg.gray, w: wg.w, h: wg.h }); } catch (e) {}
      }
    } catch (e) {
      skipped.push({ name: relName(fp), error: String(e && e.message || e).slice(0, 200) });
    }
  }

  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const c = comparePair(items[i]._h, items[j]._h, threshold);
      if (c.suspicious) pairs.push({ a: items[i].name, b: items[j].name, distance: c.distance, similarity: c.similarity, transform: c.transform });
    }
  }
  pairs.sort((p, q) => p.distance - q.distance);

  let crossPairs = [];
  if (crossImage !== false && grayItems.length >= 2) {
    for (let i = 0; i < grayItems.length; i++) {
      for (let j = i + 1; j < grayItems.length; j++) {
        try {
          const r = crossMatch(grayItems[i], grayItems[j]);
          if (r.matches >= 5 && r.conf >= 0.95) crossPairs.push({ a: grayItems[i].name, b: grayItems[j].name, scale: r.scale, matches: r.matches, conf: r.conf, regions: r.regions });
        } catch (e) {}
      }
    }
    crossPairs.sort((x, y) => y.matches - x.matches);
    for (const cp of crossPairs) {
      try {
        const gi = grayItems.find((g) => g.name === cp.a), gj = grayItems.find((g) => g.name === cp.b); if (!gi || !gj) continue;
        const imgA = await loadImg(gi), imgB = await loadImg(gj);
        cp.crop = await makeCropComposite(imgA, imgB, cp.regions[0]);
      } catch (e) {}
    }
  }

  const clean = items.map(({ _h, _g, _blk, _sc, _scBytes, ...rest }) => rest);
  const copyMoveList = clean.filter((it) => it.cmCount > 0).map((it) => ({ name: it.name, path: it.path, regions: it.cmRegions }));
  const folderOf = (nm) => { const i = nm.indexOf('/'); return i < 0 ? '.' : nm.slice(0, i); };
  const folderMap = new Map();
  for (const it of items) {
    const f = folderOf(it.name);
    const e = folderMap.get(f) || { name: f, count: 0, innerPairs: 0, crossPairs: 0 };
    e.count++;
    folderMap.set(f, e);
  }
  for (const p of pairs) {
    const fa = folderOf(p.a), fb = folderOf(p.b);
    if (fa === fb) { const e = folderMap.get(fa); if (e) e.innerPairs++; }
    else { const ea = folderMap.get(fa), eb = folderMap.get(fb); if (ea) ea.crossPairs++; if (eb) eb.crossPairs++; }
  }
  const folderSummary = [...folderMap.values()].sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
  return {
    ok: true,
    algorithm: 'aHash+dHash(6变换)+pHash + copyMove(分块) + crossImage(跨图复用)',
    format: 'dir', root: dir,
    total: clean.length, scanned: files.length, capped: files.length > limit,
    threshold,
    pairs,
    crossPairs,
    copyMove: copyMoveList,
    files: clean,
    skipped,
    folderSummary,
  };
}

// ============================================================
// 自检
// ============================================================
function synthRGBA(w, h, seed) {
  const data = new Uint8Array(w * h * 4);
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const v = Math.floor(40 + 160 * ((x / w) * 0.5 + (y / h) * 0.5));
    data[o] = v; data[o + 1] = Math.floor(v * 0.8); data[o + 2] = Math.floor(v * 0.6); data[o + 3] = 255;
  }
  for (let k = 0; k < 6; k++) {
    const bx = Math.floor(rnd() * (w - 40)), by = Math.floor(rnd() * (h - 30));
    const bw = 20 + Math.floor(rnd() * 60), bh = 8 + Math.floor(rnd() * 22);
    const gv = 30 + Math.floor(rnd() * 200);
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const o = (y * w + x) * 4;
      data[o] = gv; data[o + 1] = gv; data[o + 2] = gv;
    }
  }
  return data;
}
function transformRGBA(data, w, h, t) {
  const out = new Uint8Array(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sx = x, sy = y;
    if (t === 'hf') sx = w - 1 - x;
    else if (t === 'vf') sy = h - 1 - y;
    else if (t === 'r180') { sx = w - 1 - x; sy = h - 1 - y; }
    const so = (sy * w + sx) * 4, do_ = (y * w + x) * 4;
    out[do_] = data[so]; out[do_ + 1] = data[so + 1]; out[do_ + 2] = data[so + 2]; out[do_ + 3] = 255;
  }
  return out;
}

async function selftest() {
  const W = 200, H = 150;
  const base = synthRGBA(W, H, 12345);
  const other = synthRGBA(W, H, 99999);
  const variants = { base, hf: transformRGBA(base, W, H, 'hf'), vf: transformRGBA(base, W, H, 'vf'), r180: transformRGBA(base, W, H, 'r180'), other };
  const HASH = {};
  for (const [k, d] of Object.entries(variants)) HASH[k] = computeHashes(W, H, d);
  const rep = [];
  const chk = (a, b, expect) => {
    const c = comparePair(HASH[a], HASH[b], 8);
    rep.push(`${a} vs ${b}: dist=${c.distance} ${c.transform} suspicious=${c.suspicious} (expect ${expect})`);
  };
  chk('base', 'hf', true); chk('base', 'vf', true); chk('base', 'r180', true); chk('base', 'base', true); chk('base', 'other', false);

  const r90 = new Uint8Array(W * H * 4);
  const r90w = H, r90h = W;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const so = (y * W + x) * 4, do_ = (x * r90w + (H - 1 - y)) * 4;
    r90[do_] = base[so]; r90[do_ + 1] = base[so + 1]; r90[do_ + 2] = base[so + 2]; r90[do_ + 3] = 255;
  }
  const c90 = comparePair(HASH.base, computeHashes(r90w, r90h, r90), 8);
  rep.push(`base vs r90: dist=${c90.distance} ${c90.transform} suspicious=${c90.suspicious} (expect true)`);

  // copy-move uses a non-repetitive control image. A smooth gradient is not a
  // valid negative sample because translated blocks are intentionally alike.
  const control = new Uint8Array(W * H * 4);
  let noise = 0x9e3779b9;
  for (let i = 0; i < W * H; i++) {
    noise = (noise * 1664525 + 1013904223) >>> 0;
    const o = i * 4, value = noise & 255;
    control[o] = value; control[o + 1] = (noise >>> 8) & 255; control[o + 2] = (noise >>> 16) & 255; control[o + 3] = 255;
  }
  const cm = new Uint8Array(control);
  const srcX = 32, srcY = 32, rw = 64, rh = 48, dstX = 112, dstY = 80;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const so = ((srcY + y) * W + (srcX + x)) * 4, do_ = ((dstY + y) * W + (dstX + x)) * 4;
    cm[do_] = control[so]; cm[do_ + 1] = control[so + 1]; cm[do_ + 2] = control[so + 2]; cm[do_ + 3] = 255;
  }
  const cmRes = detectCopyMove(W, H, cm);
  const cmCtrl = detectCopyMove(W, H, control);
  rep.push(`copy-move duplicated: regions=${cmRes.regions.length} (expect >=1)`);
  rep.push(`copy-move control: regions=${cmCtrl.regions.length} (expect 0)`);

  const ok = cmRes.regions.length >= 1 && cmCtrl.regions.length === 0;
  console.log(JSON.stringify({ ok, selftest: true, results: rep }, null, 2));
  if (!ok) process.exitCode = 1;
}

function dataUrlToBuffer(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('非 base64 data URL');
  return Buffer.from(m[2], 'base64');
}

function matchAcross(dataA, wA, hA, dataB, wB, hB) {
  const MAX = 384, B = 32, S = 16, RMS_T = 8, MEAN_T = 14, K = 3;
  const a = toGrayC(dataA, wA, hA, MAX), b = toGrayC(dataB, wB, hB, MAX);
  const scales = [1.0, 0.66, 0.5];
  const regions = [];
  for (const s of scales) {
    let bw, bh, bg;
    if (s === 1.0) { bw = b.w; bh = b.h; bg = b.gray; }
    else { bw = Math.max(16, Math.floor(b.w * s)); bh = Math.max(16, Math.floor(b.h * s)); bg = grayToGrid(b.gray, b.w, b.h, bw, bh); }
    const bs = extractBlocks(bg, bw, bh, B, S, 16);
    const blocksA = extractBlocks(a.gray, a.w, a.h, B, S, 16);
    const groups = new Map();
    for (const ba of blocksA) {
      let best = null;
      for (const bb of bs) {
        if (Math.abs(ba.mean - bb.mean) > MEAN_T) continue;
        const r = blockRms(ba.g8, bb.g8);
        if (r <= RMS_T && (best === null || r < best.r)) best = { bb, r };
      }
      if (best) {
        const dx = best.bb.x - ba.x, dy = best.bb.y - ba.y;
        const key = Math.round(dx / S) + ':' + Math.round(dy / S);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ ba, bb: best.bb, r: best.r });
      }
    }
    for (const list of groups.values()) {
      if (list.length < K) continue;
      let ax0 = 1e9, ay0 = 1e9, ax1 = -1, ay1 = -1, bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1, minR = 999;
      for (const m of list) {
        ax0 = Math.min(ax0, m.ba.x); ay0 = Math.min(ay0, m.ba.y); ax1 = Math.max(ax1, m.ba.x + B); ay1 = Math.max(ay1, m.ba.y + B);
        bx0 = Math.min(bx0, m.bb.x); by0 = Math.min(by0, m.bb.y); bx1 = Math.max(bx1, m.bb.x + B); by1 = Math.max(by1, m.bb.y + B);
        if (m.r < minR) minR = m.r;
      }
      let totalIn = 0;
      for (const ba of blocksA) { if (ba.x >= ax0 && ba.x < ax1 && ba.y >= ay0 && ba.y < ay1) totalIn++; }
      const ratio = list.length / Math.max(1, totalIn);
      if (ratio < 0.5) continue;
      const rw = ax1 - ax0, rh = ay1 - ay0, rw2 = bx1 - bx0, rh2 = by1 - by0;
      const g1 = new Float64Array(rw * rh); for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) g1[y * rw + x] = a.gray[(ay0 + y) * a.w + (ax0 + x)];
      const g2 = new Float64Array(rw2 * rh2); for (let y = 0; y < rh2; y++) for (let x = 0; x < rw2; x++) g2[y * rw2 + x] = bg[(by0 + y) * bw + (bx0 + x)];
      const regionRms = blockRms(grayToGrid(g1, rw, rh, 16, 16), grayToGrid(g2, rw2, rh2, 16, 16));
      if (regionRms > 9) continue;
      const dA = dHashH(grayToGrid(g1, rw, rh, 32, 32), 32, 32);
      const dB = dHashH(grayToGrid(g2, rw2, rh2, 32, 32), 32, 32);
      if (popcount64(dA ^ dB) > 40) continue;
      regions.push({ scale: s, ax: round4(ax0 / a.w), ay: round4(ay0 / a.h), aw: round4((ax1 - ax0) / a.w), ah: round4((ay1 - ay0) / a.h), bx: round4(bx0 / bw), by: round4(by0 / bh), bw: round4((bx1 - bx0) / bw), bh: round4((by1 - by0) / bh), matches: list.length, conf: Math.round((1 - minR / 255) * 1000) / 1000 });
    }
  }
  regions.sort((x, y) => y.matches - x.matches);
  return { a: { w: a.w, h: a.h }, b: { w: b.w, h: b.h }, regions: regions.slice(0, 8) };
}
function toGrayC(data, w, h, MAX) {
  if (w * h > MAX * MAX) { const s = Math.sqrt((MAX * MAX) / (w * h)); const gw = Math.max(16, Math.floor(w * s)), gh = Math.max(16, Math.floor(h * s)); return { gray: grayToGrid(rgbaToGray(data), w, h, gw, gh), w: gw, h: gh }; }
  return { gray: rgbaToGray(data), w, h };
}
function extractBlocks(gray, w, h, B, S, minVar) {
  const blocks = [];
  for (let y = 0; y + B <= h; y += S) for (let x = 0; x + B <= w; x += S) {
    const vals = new Float64Array(B * B); let sum = 0;
    for (let by = 0; by < B; by++) for (let bx = 0; bx < B; bx++) { const v = gray[(y + by) * w + (x + bx)]; vals[by * B + bx] = v; sum += v; }
    const mean = sum / (B * B); let vs = 0; for (let i = 0; i < vals.length; i++) { const d = vals[i] - mean; vs += d * d; }
    if (vs / vals.length < minVar) continue;
    blocks.push({ x, y, mean, g8: grayToGrid(vals, B, B, 8, 8) });
  }
  return blocks;
}
function blockRms(a, b) { let s = 0; for (let i = 0; i < 64; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s / 64); }

async function scanPair(a, b, opts) {
  const thumb = opts.thumb == null ? 200 : opts.thumb;
  const load = async (src) => {
    const img = src.dataUrl ? await Jimp.read(dataUrlToBuffer(src.dataUrl)) : await Jimp.read(src.path);
    return { name: src.name || (src.path ? path.basename(src.path) : 'image'), img };
  };
  const A = await load(a), B = await load(b);
  const res = matchAcross(A.img.bitmap.data, A.img.bitmap.width, A.img.bitmap.height, B.img.bitmap.data, B.img.bitmap.width, B.img.bitmap.height);
  const thumbFor = async (img) => { try { const t = img.clone(); t.scaleToFit({ w: thumb, h: thumb }); return await jpegDataUrl(t); } catch (e) { return null; } };
  return { ok: true, a: { name: A.name, thumb: await thumbFor(A.img) }, b: { name: B.name, thumb: await thumbFor(B.img) }, regions: res.regions, scale: res.regions.length ? res.regions[0].scale : null };
}

function inlineFromBuffer(buf) {
  const is = Buffer.from(buf).toString('latin1');
  const results = [];
  let pos = 0;
  while (true) {
    const bi = is.indexOf('BI', pos);
    if (bi < 0) break;
    if (bi > 0 && !/[\s\r\n\0]/.test(is[bi - 1])) { pos = bi + 2; continue; }
    const idRel = is.indexOf('ID', bi + 2);
    if (idRel < 0 || (idRel > 0 && !/[\s\r\n\0]/.test(is[idRel - 1]))) { pos = bi + 2; continue; }
    const hdr2 = is.slice(bi + 2, idRel);
    const w = parseInt((hdr2.match(/\/W\s+(\d+)/) || [])[1] || 0, 10);
    const h = parseInt((hdr2.match(/\/H\s+(\d+)/) || [])[1] || 0, 10);
    const cs = ((hdr2.match(/\/CS\s+(\/(\w+))/) || [])[2] || 'RGB');
    const bpc = parseInt((hdr2.match(/\/BPC\s+(\d+)/) || [])[1] || 8, 10);
    if (!w || !h || hdr2.indexOf('/W') < 0) { pos = bi + 2; continue; }
    const ch = cs.indexOf('Gray') >= 0 ? 1 : cs.indexOf('CMYK') >= 0 ? 4 : 3;
    const n = w * h * ch * (bpc / 8) | 0;
    let ds2 = idRel + 2;
    while (ds2 < is.length && (is[ds2] === ' ' || is[ds2] === '\r' || is[ds2] === '\n')) ds2++;
    if (n > 0 && ds2 + n <= is.length) results.push({ w, h, ch, bpc, raw: buf.subarray(ds2, ds2 + n) });
    pos = idRel + 2;
  }
  return results;
}

function rawToJimp2(raw, w, h, ch, bpc) {
  bpc = bpc || 8;
  const n = w * h;
  const rgba = new Uint8Array(n * 4);
  const max = Math.pow(2, bpc) - 1;
  const sample = (i, c) => {
    if (bpc === 8) return raw[i * ch + c];
    if (bpc === 16) return raw[(i * ch + c) * 2];
    const bit = (i * ch + c) * bpc;
    const v = (raw[bit >> 3] >> (8 - bpc - (bit & 7))) & max;
    return Math.round(v * 255 / max);
  };
  for (let i = 0; i < n; i++) {
    if (ch === 4) {
      const c = sample(i, 0), m = sample(i, 1), y = sample(i, 2), k = sample(i, 3);
      rgba[i * 4] = 255 - Math.min(255, c + k);
      rgba[i * 4 + 1] = 255 - Math.min(255, m + k);
      rgba[i * 4 + 2] = 255 - Math.min(255, y + k);
    } else if (ch === 1) {
      const v = sample(i, 0);
      rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v;
    } else {
      rgba[i * 4] = sample(i, 0); rgba[i * 4 + 1] = sample(i, 1); rgba[i * 4 + 2] = sample(i, 2);
    }
    rgba[i * 4 + 3] = 255;
  }
  const img = new Jimp({ width: w, height: h, color: 0x000000 });
  img.bitmap.data.set(rgba);
  return img;
}

function applyPredictor(raw, parms, w, h, ch, bpc) {
  if (!parms) return raw;
  const P = parms.Predictor ? parms.Predictor.v : 1;
  if (!P || P === 1) return raw;
  const colors = parms.Colors ? parms.Colors.v : ch;
  const columns = parms.Columns ? parms.Columns.v : w;
  const pBpc = parms.BitsPerComponent ? parms.BitsPerComponent.v : bpc;
  const bpp = Math.max(1, Math.ceil((colors * pBpc) / 8));
  const rowLen = Math.ceil((columns * pBpc) / 8);
  const buf = Buffer.from(raw);
  if (P === 2) {
    const rows = Math.floor(buf.length / rowLen);
    for (let r = 0; r < rows; r++) {
      const base = r * rowLen;
      for (let k = bpp; k < rowLen; k++) buf[base + k] = (buf[base + k] + buf[base + k - bpp]) & 255;
    }
    return buf;
  }
  if (P >= 10) {
    const stride = rowLen + 1;
    const rows = Math.min(h, Math.max(0, Math.floor(buf.length / stride)));
    for (let r = 0; r < rows; r++) {
      const o = r * stride;
      const ft = buf[o];
      const prev = r > 0 ? o - stride : 0;
      for (let k = 1; k <= rowLen; k++) {
        const a = k - 1 >= bpp ? buf[o + k - bpp] : 0;
        const b = prev ? buf[prev + k] : 0;
        const c = k - 1 >= bpp && prev ? buf[prev + k - bpp] : 0;
        let v = buf[o + k];
        if (ft === 1) v = (v + a) & 255;
        else if (ft === 2) v = (v + b) & 255;
        else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
        else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
        buf[o + k] = v;
      }
    }
    const out = Buffer.alloc(rows * rowLen);
    for (let r = 0; r < rows; r++) buf.copy(out, r * rowLen, r * stride + 1, r * stride + 1 + rowLen);
    return out;
  }
  return raw;
}

function ascii85Decode(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\r' || s[i] === '\n' || s[i] === '\0')) i++;
    if (i >= s.length) break;
    if (s[i] === 'z') { out.push(0, 0, 0, 0); i++; continue; }
    if (s[i] === '~') break;
    let v = 0, got = 0;
    while (i < s.length && got < 5) {
      const c = s.charCodeAt(i);
      if (c >= 33 && c <= 117) { v = v * 85 + (c - 33); got++; i++; }
      else break;
    }
    const pad = 5 - got;
    for (let k = 0; k < pad && got > 0; k++) v = v * 85 + 84;
    v >>>= 0;
    const b = [(v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
    for (let k = 0; k < 4 - (got === 0 ? 4 : pad); k++) out.push(b[k]);
  }
  return Buffer.from(out);
}

function asciiHexDecode(s) {
  const clean = s.replace(/[\s\0]/g, '');
  const out = [];
  let i = 0;
  while (i < clean.length && clean[i] !== '>') {
    const hi = parseInt(clean[i], 16);
    const lo = i + 1 < clean.length && clean[i + 1] !== '>' ? parseInt(clean[i + 1], 16) : 0;
    out.push((isNaN(hi) ? 0 : hi) * 16 + (isNaN(lo) ? 0 : lo));
    i += 2;
  }
  return Buffer.from(out);
}

function runLengthDecode(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const n = buf[i++];
    if (n === 128) break;
    if (n < 128) { const cnt = n + 1; for (let k = 0; k < cnt && i < buf.length; k++) out.push(buf[i++]); }
    else { const cnt = 257 - n; const b = i < buf.length ? buf[i++] : 0; for (let k = 0; k < cnt; k++) out.push(b); }
  }
  return out;
}
export function pdfObjSegments(buf) {
  const s = Buffer.from(buf).toString('latin1');
  const re = /(\d+)\s+0\s+obj\b/g;
  const pos = [];
  let m;
  while ((m = re.exec(s)) !== null) pos.push({ num: +m[1], p: m.index });
  const segs = [];
  for (let k = 0; k < pos.length; k++) segs.push({ num: pos[k].num, s: pos[k].p, e: k + 1 < pos.length ? pos[k + 1].p : buf.length });
  return { s, segs };
}

function dictOf(segText, from) {
  const i = segText.indexOf('<<', from);
  if (i < 0) return null;
  let depth = 0, j = i;
  const n = segText.length;
  while (j < n - 1) {
    if (segText[j] === '<' && segText[j + 1] === '<') { depth++; j += 2; }
    else if (segText[j] === '>' && segText[j + 1] === '>') { depth--; j += 2; if (depth === 0) break; }
    else j++;
  }
  if (depth !== 0) return null;
  return { text: segText.slice(i + 2, j - 2), end: j };
}

function tokDictOf(text) {
  const toks = [];
  let i = 0;
  const n = text.length;
  const ws = (c) => c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\0';
  const skipWs = () => { while (i < n && ws(text[i])) i++; };
  const readValue = () => {
    skipWs();
    if (i >= n) return null;
    const c = text[i];
    if (c === '/') {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_.-]/.test(text[j])) j++;
      const v = text.slice(i + 1, j);
      i = j;
      return { t: 'name', v };
    }
    if (c === '[') {
      i++;
      const arr = [];
      while (true) {
        skipWs();
        if (i >= n) break;
        if (text[i] === ']') { i++; break; }
        const el = readValue();
        if (el) arr.push(el); else i++;
      }
      return { t: 'array', v: arr };
    }
    if (c === '<' && text[i + 1] === '<') {
      i += 2;
      const d = {};
      while (true) {
        skipWs();
        if (i >= n) break;
        if (text[i] === '>' && text[i + 1] === '>') { i += 2; break; }
        const key = readValue();
        if (!key || key.t !== 'name') { i++; continue; }
        const val = readValue();
        if (!val) break;
        d[key.v] = val;
      }
      return { t: 'dict', v: d };
    }
    if (c === '(') {
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === ')') break;
        j++;
      }
      i = j + 1;
      return { t: 'str' };
    }
    if (c === '<' && text[i + 1] !== '<') {
      let j = i + 1;
      while (j < n && text[j] !== '>') j++;
      i = j + 1;
      return { t: 'hex' };
    }
    if (c >= '0' && c <= '9') {
      const rm = /^(\d+)\s+(\d+)\s+R/.exec(text.slice(i, i + 64));
      if (rm && rm.index === 0) {
        i += rm[0].length;
        return { t: 'ref', num: +rm[1], gen: +rm[2] };
      }
      let j = i;
      while (j < n && ((text[j] >= '0' && text[j] <= '9') || text[j] === '.' || text[j] === '-' || text[j] === '+')) j++;
      const v = parseFloat(text.slice(i, j));
      i = j;
      return { t: 'num', v };
    }
    i++;
    return null;
  };
  while (true) {
    skipWs();
    if (i >= n) break;
    const key = readValue();
    if (!key || key.t !== 'name') continue;
    const val = readValue();
    if (!val) break;
    toks.push([key, val]);
  }
  const out = {};
  for (const [k, v] of toks) out[k.v] = v;
  return out;
}

export function pdfObjDicts(buf) {
  const { s, segs } = pdfObjSegments(buf);
  const byNum = new Map();
  for (const seg of segs) {
    const t = s.slice(seg.s, seg.e);
    if (t.indexOf('<<') < 0 && t.indexOf('[') < 0) continue;
    const d = dictOf(t, 0);
    let dict = null;
    let raw = null;
    const si = d ? t.indexOf('stream', d.end) : -1;
    if (si >= 0) {
      let ds = si + 6;
      while (ds < t.length && (t[ds] === '\r' || t[ds] === '\n')) ds++;
      const len = dict && dict.Length && dict.Length.t === 'num' ? dict.Length.v : 0;
      if (len > 0 && ds + len <= t.length) raw = buf.subarray(seg.s + ds, seg.s + ds + len);
      else {
        const ei = s.indexOf('endstream', seg.s + ds);
        raw = buf.subarray(seg.s + ds, ei < 0 ? seg.e : ei);
      }
    }
    if (d) dict = tokDictOf(d.text);
    byNum.set(seg.num, { d: dict, raw, s: seg.s, e: seg.e, segText: t });
  }
  // object streams: decompress and index embedded objects
  for (const o of byNum.values()) {
    if (!o.d || !o.d.Type || o.d.Type.t !== 'name' || o.d.Type.v !== 'ObjStm' || !o.raw) continue;
    let inf;
    try { inf = zlib.inflateSync(Buffer.from(o.raw)); } catch (e) { continue; }
    const n = o.d.N && o.d.N.t === 'num' ? o.d.N.v : 0;
    const first = o.d.First && o.d.First.t === 'num' ? o.d.First.v : 0;
    if (!n || n <= 0 || first <= 0 || first >= inf.length) continue;
    const hdr = inf.toString('latin1');
    const rm = /(\d+)\s+(\d+)/g;
    const pairs = [];
    let mm;
    while ((mm = rm.exec(hdr)) !== null && pairs.length < n * 2) { pairs.push(+mm[1], +mm[2]); }
    const all = inf.toString('latin1');
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      const onum = pairs[i], off = pairs[i + 1];
      let endOff = inf.length - first;
      for (let k = i + 3; k < pairs.length; k += 2) {
        if (pairs[k] > off) { endOff = pairs[k]; break; }
      }
      const start = first + off;
      if (start >= inf.length) continue;
      const endPos = Math.min(inf.length, first + endOff);
      const objText = all.slice(start, endPos);
      let dd = null;
      const d2 = dictOf(objText, 0);
      if (d2) dd = tokDictOf(d2.text);
      if (!byNum.has(onum)) byNum.set(onum, { d: dd, raw: null, segText: objText, embedded: true });
    }
  }
  return byNum;
}

export function pdfPageImageNums(buf) {
  const byNum = pdfObjDicts(buf);
  const tk = (tok) => tok && tok.t === 'name' ? tok.v : null;
  const rn = (tok) => tok && tok.t === 'ref' ? tok.num : null;
  let root = null;
  for (const o of byNum.values()) if (o.d && tk(o.d.Type) === 'Pages' && !rn(o.d.Parent)) { root = o; break; }
  const order = [];
  const walk = (o) => {
    if (!o || !o.d) return;
    if (tk(o.d.Type) === 'Page') { order.push(o); return; }
    const kids = o.d.Kids;
    if (kids && kids.t === 'array') for (const k of kids.v) if (k.t === 'ref') walk(byNum.get(k.num));
  };
  if (root) walk(root);
  if (!order.length) for (const o of byNum.values()) if (o.d && tk(o.d.Type) === 'Page') order.push(o);
  const pageLists = [];
  const inlineByPage = [];
  const addXObjectTo = (resTok, map) => {
    let xo = resTok && resTok.t === 'dict' ? resTok.v.XObject : resTok && resTok.t === 'ref' ? ((byNum.get(resTok.num) || {}).d || {}).XObject : null;
    if (xo && xo.t === 'dict') for (const [kk, vv] of Object.entries(xo.v)) if (vv.t === 'ref') map.set(kk, vv.num);
  };
  for (const pg of order) {
    let res = null;
    let node = pg;
    for (let d = 0; d < 8; d++) {
      if (node && node.d.Resources) { res = node.d.Resources; break; }
      const p = node && rn(node.d.Parent);
      node = p ? byNum.get(p) : null;
    }
    const nameMap = new Map();
    addXObjectTo(res, nameMap);
    const pageList = [];
    const pageInline = [];
    const collect = (content, map, depth) => {
      if (depth > 8 || !content) return;
      const refs = content.t === 'array' ? content.v.filter(x => x.t === 'ref').map(x => x.num) : content.t === 'ref' ? [content.num] : [];
      for (const cn of refs) {
        const co = byNum.get(cn);
        if (!co || !co.raw) continue;
        let data;
        try {
          const fl = co.d.Filter;
          const isFlate = fl && (fl.t === 'name' ? fl.v === 'FlateDecode' : fl.t === 'array' ? fl.v.some(x => x.t === 'name' && x.v === 'FlateDecode') : false);
          data = isFlate ? zlib.inflateSync(Buffer.from(co.raw)) : Buffer.from(co.raw);
        } catch (e) { continue; }
        for (const ii of inlineFromBuffer(data)) pageInline.push(ii);
        const cs = data.toString('latin1');
        const rm = /\/([A-Za-z0-9_-]+)\s+Do/g;
        let mm;
        while ((mm = rm.exec(cs)) !== null) {
          const tgt = map.get(mm[1]);
          if (tgt === undefined) continue;
          const tgo = byNum.get(tgt);
          if (!tgo) continue;
          const st = tk(tgo.d.Subtype);
          if (st === 'Image') pageList.push(tgt);
          else if (st === 'Form') {
            const fmap = new Map(map);
            addXObjectTo(tgo.d.Resources, fmap);
            collect({ t: 'ref', num: tgt }, fmap, depth + 1);
          }
        }
      }
    };
    collect(pg.d.Contents, nameMap, 0);
    pageLists.push(pageList);
    inlineByPage.push(pageInline);
  }
  return { pageLists, inlineByPage };
}

function parsePdfArray(text) {
  const open = text.indexOf('[');
  if (open < 0) return null;
  let j = open + 1, dep = 1;
  const n = text.length;
  while (j < n && dep > 0) { if (text[j] === '[') dep++; else if (text[j] === ']') dep--; j++; }
  const inner = text.slice(open + 1, j - 1);
  const items = [];
  const rm = /(\/\w+)|(\d+)\s+(\d+)\s+R|(\d+\.?\d*)/g;
  let mm;
  while ((mm = rm.exec(inner)) !== null) {
    if (mm[1]) items.push({ t: 'name', v: mm[1].slice(1) });
    else if (mm[2] !== undefined) items.push({ t: 'ref', num: +mm[2], gen: +mm[3] });
    else items.push({ t: 'num', v: parseFloat(mm[4]) });
  }
  return { t: 'array', v: items };
}

function resolveColorCh(cs, s, byNum, depth) {
  if (depth > 4 || !cs) return null;
  if (cs.t === 'name') {
    const v = cs.v;
    if (v === 'DeviceRGB' || v === 'CalRGB' || v === 'Lab') return 3;
    if (v === 'DeviceGray' || v === 'CalGray') return 1;
    if (v === 'DeviceCMYK') return 4;
    if (v === 'Indexed') return 1;
    return null;
  }
  if (cs.t === 'ref') {
    const seg = byNum.get(cs.num);
    if (!seg) return null;
    const segText = seg.segText || '';
    if (!segText) return null;
    const d = dictOf(segText, 0);
    if (d) {
      const dd = tokDictOf(d.text);
      if (dd.N && dd.N.t === 'num') return dd.N.v === 4 ? 4 : dd.N.v === 1 ? 1 : 3;
      if (dd.ICCBased) return resolveColorCh(dd.ICCBased, s, byNum, depth + 1);
      if (dd.Base) return resolveColorCh(dd.Base, s, byNum, depth + 1);
    }
    const arr = parsePdfArray(segText);
    if (arr) return resolveColorCh(arr, s, byNum, depth + 1);
    return null;
  }
  if (cs.t === 'array') {
    const head = cs.v[0] && cs.v[0].t === 'name' ? cs.v[0].v : null;
    const ref = cs.v[1] && cs.v[1].t === 'ref' ? cs.v[1] : null;
    if (head === 'ICCBased') {
      if (ref) {
        const seg = byNum.get(ref.num);
        if (seg) {
          const d = dictOf(s.slice(seg.s, seg.e), 0);
          if (d) {
            const dd = tokDictOf(d.text);
            if (dd.N && dd.N.t === 'num') return dd.N.v === 4 ? 4 : dd.N.v === 1 ? 1 : 3;
          }
        }
      }
      return 3;
    }
    if (head === 'Indexed') return 1;
    if (head === 'DeviceN' || head === 'Separation') return 4;
    if (head === 'DeviceRGB' || head === 'Lab') return 3;
    if (head === 'DeviceGray') return 1;
    return null;
  }
  return null;
}

export function parsePdfObjects(buf) {
  const { s, segs } = pdfObjSegments(buf);
  const byNum = pdfObjDicts(buf);
  const images = [];
  const maskNums = new Set();
  const inlineImgs = [];
  const filterCnt = {};
  for (const seg of segs) {
    const t = s.slice(seg.s, seg.e);
    if (t.indexOf('/Type') < 0 && t.indexOf('/Subtype') < 0 && t.indexOf('/Filter') < 0) continue;
    const d = dictOf(t, 0);
    if (!d) continue;
    const dict = tokDictOf(d.text);
    if (dict.Subtype && dict.Subtype.t === 'name' && dict.Subtype.v === 'Image') {
      const fl = dict.Filter;
      const filters = fl ? (fl.t === 'name' ? [fl.v] : fl.t === 'array' ? fl.v.filter(x => x.t === 'name').map(x => x.v) : []) : [];
      if (dict.SMask && dict.SMask.t === 'ref') maskNums.add(dict.SMask.num);
      const w = dict.Width && dict.Width.t === 'num' ? dict.Width.v : 0;
      const h = dict.Height && dict.Height.t === 'num' ? dict.Height.v : 0;
      const len = dict.Length && dict.Length.t === 'num' ? dict.Length.v : 0;
      const si = t.indexOf('stream', d.end);
      if (si < 0) continue;
      let ds = si + 6;
      while (ds < t.length && (t[ds] === '\r' || t[ds] === '\n')) ds++;
      let raw, rawEnd = null;
      const ei = s.indexOf('endstream', seg.s + ds);
      if (ei >= 0) rawEnd = buf.subarray(seg.s + ds, ei);
      if (len > 0 && ds + len <= t.length) raw = buf.subarray(seg.s + ds, seg.s + ds + len);
      else raw = rawEnd || buf.subarray(seg.s + ds, seg.e);
      images.push({ num: seg.num, w, h, bpc: dict.BitsPerComponent && dict.BitsPerComponent.t === 'num' ? dict.BitsPerComponent.v : 8, filters, cs: dict.ColorSpace || null, parms: dict.DecodeParms || null, raw, rawEnd });
      for (const f of filters) filterCnt[f] = (filterCnt[f] || 0) + 1;
    } else if (t.indexOf('FlateDecode') >= 0) {
      const fl = dict.Filter;
      const isFlate = fl && ((fl.t === 'name' && fl.v === 'FlateDecode') || (fl.t === 'array' && fl.v.some(x => x.t === 'name' && x.v === 'FlateDecode')));
      if (!isFlate) continue;
      const len = dict.Length && dict.Length.t === 'num' ? dict.Length.v : 0;
      const si = t.indexOf('stream', d.end);
      if (si < 0) continue;
      let ds = si + 6;
      while (ds < t.length && (t[ds] === '\r' || t[ds] === '\n')) ds++;
      let raw;
      if (len > 0 && ds + len <= t.length) raw = buf.subarray(seg.s + ds, seg.s + ds + len);
      else {
        const ei = s.indexOf('endstream', seg.s + ds);
        raw = buf.subarray(seg.s + ds, ei < 0 ? seg.e : ei);
      }
      try { const inf = zlib.inflateSync(Buffer.from(raw)); for (const ii of inlineFromBuffer(inf)) inlineImgs.push(ii); } catch (e) {}
    }
  }
  const kept = [];
  let rawCount = 0;
  for (const o of images) {
    rawCount++;
    if (maskNums.has(o.num)) continue;
    o.ch = resolveColorCh(o.cs, s, byNum, 0);
    kept.push(o);
  }
  return { images: kept, inlineImages: inlineImgs, masks: maskNums.size, rawCount, filterCnt, objCount: segs.length };
}

export async function decodePdfImg(o) {
  try {
    if (!o.filters || !o.filters.length) return null;
    const filters = o.filters;
    const parmsList = o.parms ? (o.parms.t === 'dict' ? [o.parms.v] : o.parms.t === 'array' ? o.parms.v.map(x => x.t === 'dict' ? x.v : null) : [null]) : [];
    let data = Buffer.from(o.raw);
    let fdParms = null;
    for (let i = filters.length - 1; i >= 0; i--) {
      const f = filters[i];
      if (f === 'FlateDecode') {
        fdParms = parmsList[i] || null;
        try { data = zlib.inflateSync(data); }
        catch (e) {
          const alt = o.rawEnd && o.rawEnd !== o.raw ? Buffer.from(o.rawEnd) : null;
          let full = null;
          if (alt) { try { full = zlib.inflateSync(alt); } catch (e2) {} }
          if (full) { data = full; o.raw = o.rawEnd; }
          else {
            const need = Math.ceil(o.w * o.h * ((o.ch || 3) * (o.bpc || 8)) / 8);
            const partial = await new Promise((resolve) => {
              const inf = zlib.createInflate();
              const chunks = [];
              let settled = false;
              const fin = (v) => { if (!settled) { settled = true; resolve(v); } };
              inf.on('data', (c) => chunks.push(c));
              inf.on('error', () => fin(Buffer.concat(chunks)));
              inf.on('end', () => fin(Buffer.concat(chunks)));
              inf.on('close', () => fin(Buffer.concat(chunks)));
              inf.write(alt || data);
              inf.end();
            });
            if (partial && partial.length >= need * 0.9) data = partial;
            else return null;
          }
        }
      }
      else if (f === 'ASCII85Decode') data = Buffer.from(ascii85Decode(data.toString('latin1')));
      else if (f === 'ASCIIHexDecode') data = Buffer.from(asciiHexDecode(data.toString('latin1')));
      else if (f === 'RunLengthDecode') data = Buffer.from(runLengthDecode(data));
    }
    if (filters.includes('DCTDecode') || filters.includes('JPXDecode')) {
      try { return { img: await Jimp.read(data), w: o.w, h: o.h }; } catch (e) {}
      const alt = await decodeAny(data);
      if (alt) return { img: alt, w: o.w, h: o.h };
      return null;
    }
    if (filters.includes('CCITTFaxDecode')) return null;
    const ch = o.ch || 3;
    const bpc = o.bpc || 8;
    if (!o.w || !o.h || !ch) return null;
    const px = applyPredictor(data, fdParms, o.w, o.h, ch, bpc);
    return { img: rawToJimp2(px, o.w, o.h, ch, bpc), w: o.w, h: o.h };
  } catch (e) { return null; }
}

async function pdfItemFrom(img, order, page, thumb) {
  const { width, height, data } = img.bitmap;
  const hashes = computeHashes(width, height, data);
  const wg = toGrayC(data, width, height, 384);
  let thumbData = null;
  if (thumb > 0) { try { const t = img.clone(); t.scaleToFit({ w: thumb, h: thumb }); thumbData = await jpegDataUrl(t); } catch (e) {} }
  return { name: 'P' + order + (page ? '-第' + page + '页' : ''), path: null, w: width, h: height, page: page || undefined, dH: hex64(hashes.dH), dH_hf: hex64(hashes.dH_hf), dH_vf: hex64(hashes.dH_vf), dH_r90: hex64(hashes.dH_r90), dH_r180: hex64(hashes.dH_r180), dH_r270: hex64(hashes.dH_r270), aH: hex64(hashes.aH), pH: hex64(hashes.pH), cmRegions: [], cmCount: 0, thumb: thumbData, _h: hashes, _g: wg };
}

async function scanPdf(cfg) {
  const threshold = isNaN(parseInt(cfg.threshold, 10)) ? 6 : parseInt(cfg.threshold, 10);
  const thumb = cfg.thumb == null ? 160 : parseInt(cfg.thumb, 10);
  const onlyPainted = cfg.onlyPainted !== false;
  const crossPageOnly = cfg.crossPageOnly === true;
  const bytes = cfg.pdfDataUrl ? Buffer.from(dataUrlToBuffer(cfg.pdfDataUrl)) : await fs.readFile(cfg.pdfPath);
  const parsed = parsePdfObjects(new Uint8Array(bytes));
  const objs = parsed.images;
  const pageInfo = pdfPageImageNums(new Uint8Array(bytes));
  const pageLists = pageInfo.pageLists;
  const inlineByPage = pageInfo.inlineByPage;
  const objByNum = new Map(objs.map(o => [o.num, o]));
  const seen = new Set();
  const ordered = [];
  for (let p = 0; p < pageLists.length; p++) for (const num of pageLists[p]) if (!seen.has(num) && objByNum.has(num)) { seen.add(num); ordered.push({ num, page: p + 1 }); }
  if (!onlyPainted) for (const o of objs) if (!seen.has(o.num)) ordered.push({ num: o.num, page: 0 });
  const ghostExcluded = onlyPainted ? objs.length - seen.size : 0;
  const items = [];
  const skipped = [];
  let order = 0;
  for (const { num, page } of ordered) {
    order++;
    const o = objByNum.get(num);
    try {
      const r = await decodePdfImg(o);
      if (!r) { skipped.push({ name: 'P' + order, error: '无法解码（' + (o.filters.length ? o.filters.join('/') : '无Filter') + '）' }); continue; }
      const item = await pdfItemFrom(r.img, order, page || 0, thumb);
      items.push(item);
    } catch (e) { skipped.push({ name: 'P' + order, error: String(e && e.message || e).slice(0, 120) }); }
  }
  const inlineList = onlyPainted ? [] : parsed.inlineImages;
  for (let p = 0; p < (onlyPainted ? inlineByPage.length : 0); p++) {
    for (const ii of inlineByPage[p]) {
      order++;
      try {
        const r = rawToJimp2(ii.raw, ii.w, ii.h, ii.ch, ii.bpc);
        const item = await pdfItemFrom(r, order, p + 1, thumb);
        items.push(item);
      } catch (e) { skipped.push({ name: 'P' + order, error: String(e && e.message || e).slice(0, 120) }); }
    }
  }
  for (const ii of inlineList) {
    order++;
    try {
      const r = rawToJimp2(ii.raw, ii.w, ii.h, ii.ch, ii.bpc);
      const item = await pdfItemFrom(r, order, 0, thumb);
      items.push(item);
    } catch (e) { skipped.push({ name: 'P' + order, error: String(e && e.message || e).slice(0, 120) }); }
  }
  const pageOfItem = new Map(items.map(it => [it.name, it.page || 0]));
  const keepCrossPage = (p) => {
    if (!crossPageOnly) return true;
    const pa = pageOfItem.get(p.a), pb = pageOfItem.get(p.b);
    return pa > 0 && pb > 0 && pa !== pb;
  };
  const pairs = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const c = comparePair(items[i]._h, items[j]._h, threshold);
    if (c.suspicious) {
      const pr = { a: items[i].name, b: items[j].name, distance: c.distance, similarity: c.similarity, transform: c.transform };
      if (keepCrossPage(pr)) pairs.push(pr);
    }
  }
  pairs.sort((p, q) => p.distance - q.distance);
  let crossPairs = [];
  if (cfg.crossImage !== false && items.length >= 2) {
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      if (A.w < 32 || A.h < 32 || B.w < 32 || B.h < 32) continue;
      const arA = A.w / A.h, arB = B.w / B.h;
      if (Math.max(arA / arB, arB / arA) > 3) continue;
      const big = Math.max(A.w * A.h, B.w * B.h), small = Math.min(A.w * A.h, B.w * B.h);
      if (small * 20 < big) continue;
      try {
        const r = crossMatch(A._g, B._g);
        if (r.matches >= 5 && r.conf >= 0.95) {
          const pr = { a: A.name, b: B.name, scale: r.scale, matches: r.matches, conf: r.conf, regions: r.regions };
          if (keepCrossPage(pr)) crossPairs.push(pr);
        }
      } catch (e) {}
    }
    crossPairs.sort((x, y) => y.matches - x.matches);
  }
  const clean = items.map(({ _h, _g, _blk, _sc, _scBytes, ...rest }) => rest);
  const rawStr = Buffer.from(bytes).toString('latin1');
  const diag = { pages: pageLists.length, imageObjects: objs.length, rawImages: parsed.rawCount, totalObjects: parsed.objCount, inlineImages: parsed.inlineImages.length, masksExcluded: parsed.masks, filters: parsed.filterCnt, hasSubtypeImage: rawStr.indexOf('/Subtype /Image') >= 0, hasBI: rawStr.indexOf('BI') >= 0, hasFlate: rawStr.indexOf('FlateDecode') >= 0, hasObjStm: rawStr.indexOf('/ObjStm') >= 0, hasXRef: rawStr.indexOf('/XRef') >= 0, size: bytes.length };
  return { ok: true, algorithm: 'pdf-extract + aHash/dHash/pHash + crossImage', format: 'pdf', pages: pageLists.length, total: clean.length, threshold, onlyPainted, crossPageOnly, ghostExcluded, pairs, crossPairs, files: clean, skipped, diag };
}

async function scanDataUrls(config) {
  const threshold = isNaN(parseInt(config.threshold, 10)) ? 8 : parseInt(config.threshold, 10);
  const thumb = config.thumb == null ? 180 : parseInt(config.thumb, 10);
  const limit = config.limit == null ? 300 : parseInt(config.limit, 10);
  const copyMove = config.copyMove !== false;
  const crossImage = config.crossImage !== false;
  const files = (config.files || []).slice(0, limit);
  const items = [];
  const skipped = [];
  const grayItems = [];
  for (const f of files) {
    try {
      const img = await decodeAny(dataUrlToBuffer(f.dataUrl));
      if (!img) { skipped.push({ name: f.name, error: '无法解码（格式不支持）' }); continue; }
      const { width, height, data } = img.bitmap;
      const hashes = computeHashes(width, height, data);
      const wg = toGrayC(data, width, height, 384);
      let cmRegions = [];
      if (copyMove) { try { cmRegions = detectCopyMove(width, height, data).regions; } catch (e) {} }
      let thumbData = null;
      if (thumb > 0) {
        try { const t = img.clone(); t.scaleToFit({ w: thumb, h: thumb }); thumbData = await jpegDataUrl(t); } catch (e) {}
      }
      items.push({
        name: f.name, path: null, w: width, h: height,
        dH: hex64(hashes.dH), dH_hf: hex64(hashes.dH_hf), dH_vf: hex64(hashes.dH_vf),
        dH_r90: hex64(hashes.dH_r90), dH_r180: hex64(hashes.dH_r180), dH_r270: hex64(hashes.dH_r270),
        aH: hex64(hashes.aH), pH: hex64(hashes.pH),
        cmRegions, cmCount: cmRegions.length, thumb: thumbData, _h: hashes,
      });
      if (crossImage !== false) {
        try { const wg = toGrayC(data, width, height, 384); grayItems.push({ name: f.name, dataUrl: f.dataUrl, gray: wg.gray, w: wg.w, h: wg.h }); } catch (e) {}
      }
    } catch (e) {
      skipped.push({ name: f.name, error: String(e && e.message || e).slice(0, 200) });
    }
  }
  const pairs = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const c = comparePair(items[i]._h, items[j]._h, threshold);
    if (c.suspicious) pairs.push({ a: items[i].name, b: items[j].name, distance: c.distance, similarity: c.similarity, transform: c.transform });
  }
  pairs.sort((p, q) => p.distance - q.distance);
  const clean = items.map(({ _h, _g, _blk, _sc, _scBytes, ...rest }) => rest);
  const copyMoveList = clean.filter((it) => it.cmCount > 0).map((it) => ({ name: it.name, path: it.path, regions: it.cmRegions }));
  let crossPairs = [];
  if (crossImage !== false && grayItems.length >= 2) {
    for (let i = 0; i < grayItems.length; i++) for (let j = i + 1; j < grayItems.length; j++) {
      try {
        const r = crossMatch(grayItems[i], grayItems[j]);
        if (r.matches >= 5 && r.conf >= 0.95) crossPairs.push({ a: grayItems[i].name, b: grayItems[j].name, scale: r.scale, matches: r.matches, conf: r.conf, regions: r.regions });
      } catch (e) {}
    }
    crossPairs.sort((x, y) => y.matches - x.matches);
    for (const cp of crossPairs) {
      try {
        const gi = grayItems.find((g) => g.name === cp.a), gj = grayItems.find((g) => g.name === cp.b); if (!gi || !gj) continue;
        const imgA = await loadImg(gi), imgB = await loadImg(gj);
        cp.crop = await makeCropComposite(imgA, imgB, cp.regions[0]);
      } catch (e) {}
    }
  }
  return { ok: true, algorithm: 'aHash+dHash(6变换)+pHash + copyMove(分块) + crossImage(跨图复用)', total: clean.length, scanned: files.length, capped: files.length > limit, threshold, pairs, crossPairs, copyMove: copyMoveList, files: clean, skipped };
}

async function scanPathList(config) {
  const files = [];
  for (const source of (config.paths || []).slice(0, config.limit == null ? 300 : config.limit)) {
    const ext = path.extname(source).toLowerCase();
    const mediaType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : ext === '.tif' || ext === '.tiff' ? 'image/tiff' : 'image/jpeg';
    const bytes = await fs.readFile(source);
    files.push({ name: path.basename(source), dataUrl: `data:${mediaType};base64,${bytes.toString('base64')}` });
  }
  return await scanDataUrls({ ...config, files });
}

// ============================================================
async function main() {
  const argv = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const nxt = argv[i + 1];
      if (nxt !== undefined && !nxt.startsWith('--')) { args[key] = nxt; i++; }
      else args[key] = true;
    }
  }
  if (args.selftest) { await selftest(); return; }
  if (args.stdin) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const config = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (config.write) { await fs.writeFile(config.write.path, config.write.content, 'utf8'); process.stdout.write(JSON.stringify({ ok: true, path: config.write.path })); return; }
    let report;
    if (config.pdf) { report = await scanPdf(config.pdf); }
    else if (config.pair) { report = await scanPair(config.pair.a, config.pair.b, { threshold: config.threshold, thumb: config.thumb }); }
    else if (config.paths) { report = await scanPathList(config); }
    else if (config.dir) {
      const t = isNaN(parseInt(config.threshold, 10)) ? 8 : parseInt(config.threshold, 10);
      const thumb = config.thumb == null ? 180 : parseInt(config.thumb, 10);
      const limit = config.limit == null ? 300 : parseInt(config.limit, 10);
      report = await scanDir(config.dir, { threshold: t, thumb, limit, recursive: !!config.recursive, copyMove: config.copyMove !== false, crossImage: config.crossImage !== false });
    } else {
      report = await scanDataUrls(config);
    }
    process.stdout.write(JSON.stringify(report));
    return;
  }
  const dir = args.dir;
  if (!dir) {
    process.stderr.write('usage: node hash-worker.mjs --dir <path> [--threshold 8] [--thumb 256] [--limit 500] [--recursive] [--no-copy-move]\n');
    process.exit(2);
  }
  const threshold = parseInt(args.threshold === undefined ? '8' : args.threshold, 10);
  const thumb = parseInt(args.thumb === undefined ? '256' : args.thumb, 10);
  const limit = parseInt(args.limit === undefined ? '500' : args.limit, 10);
  const recursive = args.recursive !== undefined;
  const copyMove = args['copy-move'] !== undefined;
  const report = await scanDir(dir, {
    threshold: isNaN(threshold) ? 8 : threshold,
    thumb: isNaN(thumb) ? 256 : thumb,
    limit: isNaN(limit) ? 500 : limit,
    recursive,
    copyMove,
  });
  process.stdout.write(JSON.stringify(report));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error(e && e.stack || String(e)); process.exit(1); });
}
