/** Browser-side image compression for prompt attachments.
 *
 *  Raster images (png/jpg/webp) are scaled so the longest edge ≤ maxDim and
 *  re-encoded as JPEG at the given quality. SVG and GIF pass through unchanged
 *  (SVG is vector text, GIF would lose frames). If the source is already small
 *  enough the original bytes are returned to avoid a lossy re-encode.
 *
 *  Used by the Composer to shrink pasted / dropped images BEFORE they enter the
 *  prompt payload — large PNGs (several MB) previously caused the gateway to
 *  reject the request with 413 "Request payload is too large". */

export interface CompressedImage {
  /** Output MIME, usually `image/jpeg`; svg/gif keep their original MIME. */
  mime: string;
  /** Base64-encoded bytes (no `data:…` prefix). */
  base64: string;
  /** Suggested display name, e.g. `pasted.jpg`. */
  filename: string;
}

/** Formats that should not be re-encoded: SVG is vector text, GIF may be
 *  animated — both are typically small enough as-is. */
const PASSTHROUGH = new Set(["image/svg+xml", "image/gif"]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compress a raster image blob for prompt attachment.
 *
 * @param blob       Raw image bytes.
 * @param hintName   Original or suggested file name (used to derive the output
 *                   name, e.g. `pasted.png` → `pasted.jpg`).
 * @param opts.maxDim        Longest-edge pixel cap (default 1920).
 * @param opts.quality       JPEG quality 0..1 (default 0.85).
 * @param opts.sizeSkipBytes If the blob is smaller than this AND fits within
 *                           maxDim, skip re-encoding (default 400 KB).
 */
export async function compressImage(
  blob: Blob,
  hintName: string,
  opts?: { maxDim?: number; quality?: number; sizeSkipBytes?: number },
): Promise<CompressedImage> {
  // SVG / GIF — return unchanged.
  if (PASSTHROUGH.has(blob.type)) {
    return { mime: blob.type, base64: await blobToBase64(blob), filename: hintName };
  }

  const maxDim = opts?.maxDim ?? 1920;
  const quality = opts?.quality ?? 0.85;
  const sizeSkip = opts?.sizeSkipBytes ?? 400_000;

  // Decode to get dimensions.
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    // Environment doesn't support createImageBitmap (e.g. jsdom in tests) or
    // the blob isn't a decodable image — return original bytes.
    return { mime: blob.type, base64: await blobToBase64(blob), filename: hintName };
  }

  const { width: w, height: h } = bmp;

  // Already small enough — skip lossy re-encode.
  if (blob.size <= sizeSkip && Math.max(w, h) <= maxDim) {
    bmp.close();
    return { mime: blob.type, base64: await blobToBase64(blob), filename: hintName };
  }

  // Compute target dimensions (proportional).
  const longest = Math.max(w, h);
  const scale = longest > maxDim ? maxDim / longest : 1;
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);

  // Draw onto an OffscreenCanvas (or regular canvas) and encode as JPEG.
  let jpegBlob: Blob | null = null;
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const oc = new OffscreenCanvas(tw, th);
      const ctx = oc.getContext("2d");
      if (ctx) {
        ctx.drawImage(bmp, 0, 0, tw, th);
        jpegBlob = await oc.convertToBlob({ type: "image/jpeg", quality });
      }
    } else if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(bmp, 0, 0, tw, th);
        jpegBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
      }
    }
  } catch {
    // Canvas operations can fail in constrained environments.
  } finally {
    bmp.close();
  }

  if (!jpegBlob) {
    // Fallback: return original blob.
    return { mime: blob.type, base64: await blobToBase64(blob), filename: hintName };
  }

  const outName = replaceExt(hintName, "jpg");
  return { mime: "image/jpeg", base64: await blobToBase64(jpegBlob), filename: outName };
}

// ---------------------------------------------------------------------------
// Shared utility — exported so Composer.tsx can reuse instead of its own copy.
// ---------------------------------------------------------------------------

/** Blob → base64 string (no data-URI prefix). Uses FileReader to avoid the
 *  call-stack limit that spreading into btoa hits on large buffers. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Replace the extension in `name` with `ext`. `pasted.png` → `pasted.jpg`. */
function replaceExt(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}.${ext}` : `${name}.${ext}`;
}
