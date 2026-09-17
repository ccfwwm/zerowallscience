export function ZeroWallZoteroAuthorization({ t, dirty }) {
  const React = require('react');
  const h = React.createElement;
  const zh = t('title') === 'Zotero' && t('groupConnection') === '连接';
  const label = (cn, en) => zh ? cn : en;
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState('');
  const request = async action => {
    const response = await fetch('/api/zotero/localAuthorization', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'zotero/localAuthorization', payload: { args: { request: { action } } } }),
    });
    const body = await response.json();
    if (!response.ok || !body.result?.ok) throw new Error(body.result?.error?.message || 'Zotero authorization failed');
    return JSON.parse(body.result.value);
  };
  React.useEffect(() => {
    let alive = true;
    request('status').then(value => { if (alive) { setStatus(value); setError(''); } }, reason => { if (alive) setError(reason.message); });
    return () => { alive = false; };
  }, [dirty]);
  async function authorize() {
    setBusy(true); setError('');
    try { setStatus(await request(status?.authorized ? 'renew' : 'authorize')); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  return h('section', { 'data-zotero-authorization': true, style: { margin: '20px 0', padding: 16, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8 } },
    h('h3', null, label('本机 Zotero 入库授权', 'Local Zotero write authorization')),
    h('p', null, label('自动向本机 Zotero 请求授权并安全保存凭证，无需填写 API Key。请保持 Zotero 运行，并在弹窗中选择“始终允许”以便后续自动入库。', 'Request authorization from local Zotero and securely store the credential. No API key entry is needed. Keep Zotero running and choose Always Allow in its prompt for future saves.')),
    h('p', { role: 'status' }, busy ? label('正在等待 Zotero 授权，请查看 Zotero 窗口…', 'Waiting for authorization in the Zotero window…') : status?.authorized ? (status.remember ? label('已保存本机授权', 'Local authorization saved') : label('已获取单次授权，下一次写入后失效', 'One-time authorization ready; consumed by the next write')) : label('尚未获取入库授权', 'Write authorization not yet acquired')),
    error && h('p', { role: 'alert' }, error),
    dirty && h('p', null, label('请先保存上面的 Zotero 配置，再获取授权。', 'Save the Zotero settings before requesting authorization.')),
    h('button', { type: 'button', disabled: busy || dirty, onClick: authorize, className: ZoteroSettingsSection_default.save }, status?.authorized ? label('重新获取本机授权', 'Renew local authorization') : label('自动获取本机授权', 'Get local authorization')));
}
