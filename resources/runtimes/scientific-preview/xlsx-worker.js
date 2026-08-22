/* SheetJS runs in a dedicated worker so a large workbook cannot block the UI. */
importScripts("/vendor-runtime/xlsx.mini.min.js");

const MAX_CELLS = 20_000;
const MAX_ROWS = 10_000;
const MAX_COLS = 256;
const MAX_MERGES = 4_096;

function displayText(cell) {
  if (typeof cell?.w === "string") return cell.w;
  try {
    return XLSX.utils.format_cell(cell);
  } catch (_) {
    return cell?.v == null ? "" : String(cell.v);
  }
}

function sheetPreview(workbook, name, state) {
  const sheet = workbook.Sheets[name];
  const range = sheet?.["!ref"]
    ? XLSX.utils.decode_range(sheet["!ref"])
    : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  const originalRows = Math.max(1, range.e.r + 1);
  const originalCols = Math.max(1, range.e.c + 1);
  const rows = Math.min(originalRows, MAX_ROWS);
  const cols = Math.min(originalCols, MAX_COLS);
  const cells = [];

  for (const ref of Object.keys(sheet || {})) {
    if (ref.startsWith("!")) continue;
    if (state.cells >= MAX_CELLS) {
      state.truncated = true;
      break;
    }
    let position;
    try {
      position = XLSX.utils.decode_cell(ref);
    } catch (_) {
      continue;
    }
    if (position.r >= rows || position.c >= cols) {
      state.truncated = true;
      continue;
    }
    const cell = sheet[ref];
    const preview = {
      row: position.r,
      col: position.c,
      text: displayText(cell),
    };
    if (typeof cell?.f === "string") preview.formula = cell.f;
    if (typeof cell?.l?.Target === "string") preview.hyperlink = cell.l.Target;
    cells.push(preview);
    state.cells += 1;
  }

  const merges = (sheet?.["!merges"] || []).slice(0, MAX_MERGES).map((merge) => ({
    startRow: merge.s.r,
    startCol: merge.s.c,
    endRow: Math.min(merge.e.r, rows - 1),
    endCol: Math.min(merge.e.c, cols - 1),
  })).filter((merge) => merge.startRow < rows && merge.startCol < cols);
  if ((sheet?.["!merges"] || []).length > MAX_MERGES) state.truncated = true;
  if (rows < originalRows || cols < originalCols) state.truncated = true;

  return { name, rows, cols, originalRows, originalCols, cells, merges };
}

self.onmessage = ({ data }) => {
  try {
    const workbook = XLSX.read(data, {
      type: "array",
      cellFormula: true,
      cellText: true,
      cellDates: true,
      dense: false,
    });
    const state = { cells: 0, truncated: false };
    const sheets = workbook.SheetNames.map((name) => sheetPreview(workbook, name, state));
    self.postMessage({ ok: true, workbook: { sheets, truncated: state.truncated } });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
