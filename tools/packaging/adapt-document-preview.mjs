/** Add diagnostics around the native lazy Excel renderer in the curated rc.2 copy. */
export function adaptDocumentPreview(source, version) {
  if (version !== '0.2.0-rc.2') throw new Error('Native Excel diagnostics require the reviewed DSH rc.2 bundle.')
  const lazy = 'const LoadedExcelBody = (0, react.lazy)(async () => ({ default: (await require.async("./client.excel.js")).ExcelBody }));'
  const entry = 'function LazyExcelBody(props) {'
  if (source.split(lazy).length !== 2 || source.split(entry).length !== 2) throw new Error('Native Excel diagnostics anchors changed.')
  const load = lazy.replace('const LoadedExcelBody = ', '').slice(0, -1)
  return source.replace(lazy, lazy.replace('const ', 'let ')).replace(entry, `
class ZeroWallExcelBoundary extends react.Component {
  constructor(props) { super(props); this.state = { error: null, attempt: 0, sha: 'calculating' }; }
  static getDerivedStateFromError(error) { return { error: String(error && error.message || error) }; }
  componentDidMount() {
    const data = this.props.content && this.props.content.data;
    if (data && globalThis.crypto && crypto.subtle) crypto.subtle.digest('SHA-256', data).then(hash => { if (!this.disposed) this.setState({ sha: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('') }); }).catch(() => {});
  }
  componentWillUnmount() { this.disposed = true; }
  render() {
    if (!this.state.error) return (0, react_jsx_runtime.jsx)(ZeroWallLoadedExcelBody, { ...this.props, key: this.state.attempt });
    const switchViewer = mode => window.dispatchEvent(new CustomEvent('zerowall:viewer-switch', { detail: { address: this.props.resourceAddress, mode } }));
    return react.createElement('div', { role: 'alert', style: { padding: 16 } },
      react.createElement('p', null, 'Excel preview failed (lazy chunk / Worker / FortuneSheet rendering): ' + this.state.error),
      react.createElement('p', null, 'SHA-256: ' + this.state.sha),
      react.createElement('button', { onClick: () => { LoadedExcelBody = ${load}; this.setState({ error: null, attempt: this.state.attempt + 1 }); } }, 'Retry'),
      react.createElement('button', { onClick: () => switchViewer('universal') }, 'Universal viewer'),
      react.createElement('button', { onClick: () => switchViewer('office-pdf') }, 'Office to PDF'));
  }
}
function LazyExcelBody(props) { return (0, react_jsx_runtime.jsx)(ZeroWallExcelBoundary, props); }
function ZeroWallLoadedExcelBody(props) {`)
}

export function adaptExcelChunk(source, version) {
  if (version !== '0.2.0-rc.2') throw new Error('Excel Worker diagnostics require reviewed DSH rc.2.')
  const error = 'if ("error" in state) return'
  const success = 'const hasFormulas = state.value.sheets.some('
  if (source.split(error).length !== 2 || source.split(success).length !== 2) throw new Error('Excel diagnostics anchors changed.')
  const resize = /const observer = new ResizeObserver\(\(\) => \{\s*window\.dispatchEvent\(new Event\("resize"\)\);\s*\}\);/u
  if (!resize.test(source) || source.split('observer.disconnect();').length !== 2) throw new Error('Excel resize anchors changed.')
  const menus = ['cellContextMenu: ["copy"]', 'headerContextMenu: []', 'sheetTabContextMenu: []', 'filterContextMenu: []']
  if (menus.some(anchor => source.split(anchor).length !== 2)) throw new Error('Excel menu anchors changed.')
  const body = 'function ExcelBody({ content, format, limits, t, loading }) {'
  if (source.split(body).length !== 2) throw new Error('Excel body anchor changed.')
  const highlight = /\(0, react\.useLayoutEffect\)\(function\(\) \{\s*if \(!context\.allowEdit\) setContext\(function\(ctx\) \{\s*var flowdata = getFlowdata\(ctx\);\s*if \(!import_lodash\.default\.isNil\(flowdata\) && ctx\.forceFormulaRef\) createRangeHightlight\(ctx, getCellValue\(row_index, col_index, flowdata, "f"\)\);\s*\}\);/u
  if (!highlight.test(source)) throw new Error('Excel readonly formula highlight anchor changed.')
  // FortuneSheet effects compare menu props by identity. Pane/resource updates
  // must not recreate these arrays or synchronously feed resize back into rendering.
  return source.replace(body, body + '\nconst stableMenus = (0, react.useMemo)(() => ({ cell: ["copy"], header: [], sheet: [], filter: [] }), []);')
    // The read-only CellInput layout effect runs on every context update. An
    // unchanged formula must not recreate its reference ranges and update context.
    .replace(highlight, `var readonlyHighlight = (0, react.useRef)();
      (0, react.useLayoutEffect)(function() {
        if (!context.allowEdit && context.forceFormulaRef) {
          var flowdata = getFlowdata(context);
          if (!import_lodash.default.isNil(flowdata)) {
            var formula = getCellValue(row_index, col_index, flowdata, "f");
            var key = JSON.stringify([context.currentSheetId, row_index, col_index, formula]);
            if (readonlyHighlight.current !== key) {
              readonlyHighlight.current = key;
              setContext(function(ctx) { createRangeHightlight(ctx, formula); });
            }
          }
        } else readonlyHighlight.current = undefined;`)
    .replace(menus[0], 'cellContextMenu: stableMenus.cell')
    .replace(menus[1], 'headerContextMenu: stableMenus.header')
    .replace(menus[2], 'sheetTabContextMenu: stableMenus.sheet')
    .replace(menus[3], 'filterContextMenu: stableMenus.filter')
    .replace(resize, `let resizeFrame; let previousWidth = -1; let previousHeight = -1;
      const observer = new ResizeObserver(entries => {
        const rect = entries[0] && entries[0].contentRect; if (!rect) return;
        const width = Math.round(rect.width); const height = Math.round(rect.height);
        if (width <= 0 || height <= 0 || width === previousWidth && height === previousHeight) return;
        previousWidth = width; previousHeight = height;
        if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => { resizeFrame = undefined; window.dispatchEvent(new Event('resize')); });
      });`)
    .replace('observer.disconnect();', 'observer.disconnect(); if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);')
    .replace(error, 'if ("error" in state) throw new Error("Excel Worker parsing: " + state.error);\n' + error)
    .replace(success, `if (!state.value.sheets.length) throw new Error('Excel workbook has no displayable worksheets.');\n${success}`)
    .replace('"data-excel-preview": true,', `"data-excel-preview": true,
      "data-excel-diagnostics": JSON.stringify(state.value.sheets.map(sheet => ({ name: sheet.name, rows: sheet.row, columns: sheet.column, cells: sheet.celldata && sheet.celldata.length }))),`)
}
