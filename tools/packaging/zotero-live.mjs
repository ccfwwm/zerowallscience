// Serialized into the curated Zotero client. All requests stay on the Host's
// authenticated origin; the Host owns Zotero configuration and provenance.
export function ZeroWallZoteroDetails({ item, t, exportOnly = false }) {
  const React = require('react');
  const h = React.createElement;
  const zh = t('panelOverview') === '概览';
  const label = (cn, en) => zh ? cn : en;
  const [state, setState] = React.useState({ ref: item.ref, loading: true });
  const [retry, setRetry] = React.useState(0);
  const [format, setFormat] = React.useState('bibtex');
  const [exported, setExported] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState('');
  const epoch = React.useRef(0);
  async function rpc(method, request, signal) {
    const response = await fetch('/api/zotero/' + method, {
      method: 'POST', credentials: 'same-origin', signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'zotero/' + method, payload: { args: { request } } }),
    });
    const body = await response.json();
    if (!response.ok || body.result?.ok !== true) throw new Error(body.result?.error?.message || body.error?.message || 'Zotero request failed');
    return JSON.parse(body.result.value);
  }
  React.useEffect(() => {
    const abort = new AbortController();
    epoch.current++;
    setState({ ref: item.ref, loading: true });
    setExported(null); setFeedback(''); setBusy(false);
    if (!exportOnly) rpc('itemDetail', { ref: item.ref }, abort.signal).then(
      detail => { if (!abort.signal.aborted) setState({ ref: item.ref, detail }); },
      error => { if (!abort.signal.aborted) setState({ ref: item.ref, error: String(error.message) }); },
    );
    return () => { abort.abort(); epoch.current++; };
  }, [item.ref, retry, exportOnly]);
  const button = (text, onClick, disabled = false) => h('button', { type: 'button', className: workspace_default.action, onClick, disabled }, text);
  const generate = async () => {
    const ticket = ++epoch.current;
    setBusy(true); setFeedback(''); setExported(null);
    try {
      const result = await rpc('exportCitation', { ref: item.ref, format });
      if (ticket !== epoch.current) return;
      const raw = result.text ?? result.citations?.map(row => row.text).join('\n') ?? '';
      const text = ['citation', 'bibliography'].includes(format)
        ? new DOMParser().parseFromString(raw, 'text/html').body.textContent : raw;
      if (!text?.trim()) throw new Error(label('Zotero 未返回引用内容', 'Zotero returned no citation text'));
      setExported({ text, format });
    } catch (error) { if (ticket === epoch.current) setFeedback(label('导出失败：', 'Export failed: ') + error.message); }
    finally { if (ticket === epoch.current) setBusy(false); }
  };
  const detail = state.ref === item.ref ? state.detail : undefined;
  const field = (name, value) => value ? h('div', { key: name, style: { marginBottom: 8 } }, h('strong', null, name + '：'), value) : null;
  return h('section', { 'data-zotero-live': item.ref, style: { fontSize: 13, lineHeight: 1.8, overflowWrap: 'anywhere' } },
    !exportOnly && h(React.Fragment, null,
      (state.loading || state.ref !== item.ref) && h('p', { role: 'status' }, label('正在从 Zotero 读取文献详情…', 'Loading item details from Zotero…')),
      state.error && h('div', { role: 'alert' }, label('读取失败：', 'Could not load: ') + state.error, ' ', button(label('重试', 'Retry'), () => setRetry(n => n + 1))),
      detail && h('div', { 'data-zotero-metadata': true },
        field(label('标题', 'Title'), detail.title),
        field(label('作者', 'Authors'), detail.creators?.join('; ')),
        field(label('日期', 'Date'), detail.date ?? detail.year),
        field(label('期刊', 'Publication'), detail.venue), field('DOI', detail.doi),
        field('URL', detail.url), field(label('类型', 'Type'), detail.itemType),
        field(label('标签', 'Tags'), detail.tags?.join(', ')),
        field(label('分类', 'Collections'), detail.collections?.map(row => row.name).join(' / ')),
        h('strong', null, label('摘要', 'Abstract')),
        h('p', { style: { whiteSpace: 'pre-wrap', marginTop: 4 } }, detail.abstract || label('这篇文献在 Zotero 中未保存摘要。', 'No abstract is stored for this item in Zotero.')),
        detail.abstractTruncated && h('p', null, label('摘要过长，已按配置截断。', 'Abstract truncated to the configured limit.')),
      )),
    h('div', { style: { borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: 12, marginTop: 16 } },
      h('div', { className: workspace_default.actionRow },
        h('select', { 'aria-label': label('引用格式', 'Citation format'), value: format, disabled: busy, onChange: e => setFormat(e.target.value) },
          ['bibtex', 'ris', 'csljson', 'citation', 'bibliography'].map(value => h('option', { key: value, value }, value))),
        button(busy ? label('正在导出…', 'Exporting…') : t('exportCitation'), generate, busy),
      ),
      feedback && h('p', { role: 'status' }, feedback),
      exported && h('div', { 'data-zotero-export': exported.format },
        h('div', { className: workspace_default.actionRow },
          button(label('复制引用', 'Copy citation'), async () => {
            const ok = await require('@deepseek-ai/dsh-client-ui-primitives').writeClipboard(exported.text);
            setFeedback(ok ? t('copied') : label('复制失败，请重试', 'Copy failed. Please retry.'));
          }),
          button(label('下载引用', 'Download citation'), async () => {
            const name = 'zotero-' + item.ref.split('/').pop().split('?')[0] + '.' + ({ bibtex: 'bib', ris: 'ris', csljson: 'json' }[exported.format] ?? 'txt');
            if (window.zerowallDesktop?.saveTextFile) {
              const ok = await window.zerowallDesktop.saveTextFile({ name, text: exported.text });
              setFeedback(ok ? label('引用已保存', 'Citation saved') : label('未保存引用', 'Citation not saved'));
              return;
            }
            const url = URL.createObjectURL(new Blob([exported.text], { type: 'text/plain;charset=utf-8' }));
            const anchor = document.createElement('a'); anchor.href = url;
            anchor.download = name;
            document.body.appendChild(anchor); anchor.click(); anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
          })),
        h('pre', { style: { whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' } }, exported.text))),
  );
}
