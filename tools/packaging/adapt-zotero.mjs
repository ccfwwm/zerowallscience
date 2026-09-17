import { zoteroDispatch } from './zotero-dispatch.mjs'
import { ZeroWallZoteroDetails } from './zotero-live.mjs'
import { ZeroWallZoteroAuthorization } from './zotero-authorization.mjs'

// Zotero 0.8.4 was compiled against a newer commands API under the same rc.2
// version. The pinned Harness registers commands by name and has no
// CommandDefinitionId brand. Preserve the command and omit that newer field.
export function adaptZoteroCommand(source) {
  const importLine = "import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand';"
  const field = "            definitionId: CommandDefinitionId('dsh-zotero/status'),"
  if (!source.includes('CommandDefinitionId')) return source
  if (!source.includes(importLine) || !source.includes(field)) {
    throw new Error('Unrecognized Zotero command registration; review the pinned DSH adapter.')
  }
  return source.replace(importLine, '').replace(field, '')
}

// Progressive Tools exposes lazily dispatched Zotero calls beneath a
// tool_dispatch root. The upstream Sources tab already walks those nested
// calls when collecting records, but its memo signature only watches roots
// whose own name starts with zotero_. Make the signature use the same walk so
// a nested call appearing or settling invalidates the memoized workspace.
export function adaptZoteroClient(source) {
  const original = `function sessionSignatureOf(snapshot) {
  if (snapshot === void 0) return "";
  const running = [];
  const order = [];
  for (const { key, root } of visibleToolRoots(snapshot)) {
    if (!isZoteroRoot(root)) continue;
    order.push(key);
    if (!isSettledTool(root)) running.push(root.callId);
  }
  return JSON.stringify({ order, running });
}`
  const adapted = `function sessionSignatureOf(snapshot) {
  if (snapshot === void 0) return "";
  const running = [];
  const order = [];
  const seen = /* @__PURE__ */ new Set();
  const visit = (block, key, depth) => {
    if (depth > MAX_SUBCALL_DEPTH) return;
    if (isZoteroRoot(block) && !seen.has(block.callId)) {
      seen.add(block.callId);
      order.push(\`${'${key}'}:${'${block.callId}'}\`);
      if (!isSettledTool(block)) running.push(block.callId);
    }
    for (const child of block.subCalls) visit(child, key, depth + 1);
  };
  for (const { key, root } of visibleToolRoots(snapshot)) {
    visit(root, key, 1);
  }
  return JSON.stringify({ order, running });
}`
  if (!source.includes(adapted) && !source.includes(original)) {
    throw new Error('Unrecognized Zotero Sources tab signature; review the pinned client adapter.')
  }
  source = source.replace(original, adapted)
  if (source.includes('function zoteroDispatch(block)')) return adaptZoteroActions(source)
  const replacements = [
    ['function callNameOf(block) {', 'function callNameOf(block) {\n  const dispatch = zoteroDispatch(block);\n  if (dispatch) return dispatch.name;'],
    ['function metaOf(block) {', 'function metaOf(block) {\n  const dispatch = zoteroDispatch(block);\n  if (dispatch) return dispatch.meta;'],
    ['function argsOf(block) {', 'function argsOf(block) {\n  const dispatch = zoteroDispatch(block);\n  if (dispatch) return dispatch.args;'],
    ['() => collectZoteroCalls(chat), [signature]', '() => collectZoteroCalls(chat), [chat, signature]'],
  ]
  for (const [before, after] of replacements) {
    if (!source.includes(before)) throw new Error('Unrecognized Zotero dispatch consumer; review the pinned client adapter.')
    source = source.replace(before, after)
  }
  return adaptZoteroActions(source.replace('function callNameOf(block) {', `${zoteroDispatch.toString()}\nfunction callNameOf(block) {`))
}

function replaceRequired(source, before, after) {
  if (!source.includes(before)) throw new Error(`Unrecognized Zotero integration marker: ${before.slice(0, 100)}`)
  return source.replace(before, after)
}

export function adaptZoteroActions(source) {
  if (!source.includes('function ZeroWallZoteroAuthorization(')) {
    source = replaceRequired(source, 'function ZoteroSettingsSection(props) {', `${ZeroWallZoteroAuthorization.toString()}\nfunction ZoteroSettingsSection(props) {`)
    source = replaceRequired(source, '/* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ZoteroSettingsForm, { t, state, actions: props }),', 'require("react").createElement(ZeroWallZoteroAuthorization, { t, dirty: state.dirty }),\n      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ZoteroSettingsForm, { t, state, actions: props }),')
  }
  if (source.includes('function ZeroWallZoteroDetails(')) return source
  source = replaceRequired(source, 'function SourceOverview({ item, t, setDraft }) {', `${ZeroWallZoteroDetails.toString()}\nfunction SourceOverview({ item, t, setDraft }) {`)
  source = replaceRequired(source,
    'function SourcesTab({ status, t, useSession, useChat, inputActions }) {',
    'function SourcesTab({ status, t, useSession, useChat, inputActions, openView }) {')
  source = replaceRequired(source, 'const setDraft = inputActions?.setDraft.bind(inputActions);', `const setDraft = inputActions === undefined ? undefined : (text) => {
    inputActions.setDraft(text);
    openView("chat", "");
    requestAnimationFrame(() => inputActions.focus?.());
  };`)
  const start = source.indexOf('      setDraft !== void 0 &&', source.indexOf('setDraft(askDraftOf(item.ref, t));'))
  const end = source.indexOf('      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(\n        CopyButton,', start)
  if (start < 0 || end < 0) throw new Error('Unrecognized Zotero export action')
  source = source.slice(0, start) + source.slice(end)
  source = replaceRequired(source, '    item.provenance === "mismatch" &&', '    (0, import_jsx_runtime10.jsx)(ZeroWallZoteroDetails, { item, t }, item.ref),\n    item.provenance === "mismatch" &&')
  const exportsStart = source.indexOf('function SourceExports({ item, t }) {')
  const exportsEnd = source.indexOf('// src/client/components/workspace/SourceInspector.tsx', exportsStart)
  if (exportsStart < 0 || exportsEnd < 0) throw new Error('Unrecognized Zotero export panel')
  source = source.slice(0, exportsStart) + `function SourceExports({ item, t }) {
    return (0, import_jsx_runtime15.jsxs)("div", { className: workspace_default.panel, children: [
      (0, import_jsx_runtime15.jsx)(ZeroWallZoteroDetails, { item, t, exportOnly: true }, item.ref),
      item.exports.length > 0 && (0, import_jsx_runtime15.jsx)(ExportSections, { exports: item.exports, t })
    ] });
  }\n\n` + source.slice(exportsEnd)
  source = source.replaceAll('...externalHrefProps(url2),', `...externalHrefProps(url2), onClick: (event) => {
    if (url2.startsWith("zotero://") && window.zerowallDesktop?.openZotero) {
      event.preventDefault();
      void window.zerowallDesktop.openZotero(url2);
    }
  },`)
  return source
}

export function adaptZoteroRemote(source) {
  if (!source.includes('async localAuthorization(request)')) {
    source = replaceRequired(source, '    async status() {', `    async localAuthorization(request) {
        const { localAuthorization } = await import('@dsh-external/zotero-harvest');
        return JSON.stringify(await localAuthorization(this.ctx, request.action));
    }
    async status() {`)
  }
  if (source.includes('async itemDetail(request)')) return source
  source = "import { parseSupportedRef } from './tools/validate.js';\n" + source
  return replaceRequired(source, '    async status() {', `    async itemDetail(request) {
        const service = this.ctx.get('zotero');
        if (!service) throw new Error('Zotero service unavailable');
        return JSON.stringify(await service.get({ ref: parseSupportedRef(request.ref, ['item']), include: new Set(), fields: 'standard' }));
    }
    async exportCitation(request) {
        const service = this.ctx.get('zotero');
        if (!service) throw new Error('Zotero service unavailable');
        return JSON.stringify(await service.export({ refs: [parseSupportedRef(request.ref, ['item'])], format: request.format,
          style: service.config.defaultStyle, locale: service.config.defaultLocale }));
    }
    async status() {`)
}

export function adaptZoteroContract(source) {
  if (!source.includes("method: 'localAuthorization'")) {
    source = replaceRequired(source, 'export const ZOTERO_INVOCATIONS = [', `export const ZOTERO_INVOCATIONS = [{
      id: 'dsh-zotero#zotero/localAuthorization', service: 'zoteroRemote', namespace: ZOTERO_SETTINGS_NAMESPACE,
      method: 'localAuthorization', invocation: { kind: 'direct' },
      parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-zotero#localAuthorizationRequest', schema: z.object({ action: z.enum(['status', 'authorize', 'renew']) }).strict() } }],
      result: { mode: 'strict', typeSymbol: 'dsh-zotero#localAuthorizationJson', schema: z.string() }
    },`)
  }
  if (source.includes("method: 'itemDetail'")) return source
  const descriptor = (method, schema) => `{
    id: 'dsh-zotero#zotero/${method}', service: 'zoteroRemote', namespace: ZOTERO_SETTINGS_NAMESPACE,
    method: '${method}', invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-zotero#${method}Request', schema: ${schema} } }],
    result: { mode: 'strict', typeSymbol: 'dsh-zotero#${method}Json', schema: z.string() }
  },`
  return replaceRequired(source, 'export const ZOTERO_INVOCATIONS = [', 'export const ZOTERO_INVOCATIONS = [\n' +
    descriptor('itemDetail', 'z.object({ ref: z.string().min(1).max(2048) }).strict()') +
    descriptor('exportCitation', "z.object({ ref: z.string().min(1).max(2048), format: z.enum(['bibtex', 'ris', 'csljson', 'citation', 'bibliography']) }).strict()"))
}

// Zotero's Local API omits annotation rows from a bare attachment /children
// request. The attachment-level traversal must request itemType=annotation;
// the parent item traversal remains unfiltered so notes and attachments stay
// visible.
export function adaptZoteroItemGraph(source) {
  const original = "annotations: (await options.fetchChildren(key)).filter((candidate) => itemTypeOf(candidate) === 'annotation'),"
  const adapted = "annotations: (await (options.fetchAnnotationChildren ?? options.fetchChildren)(key)).filter((candidate) => itemTypeOf(candidate) === 'annotation'),"
  if (source.includes(adapted)) return source
  if (!source.includes(original)) {
    throw new Error('Unrecognized Zotero annotation graph traversal; review the pinned item-graph adapter.')
  }
  return source.replace(original, adapted)
}

export function adaptZoteroDetail(source) {
  const attachmentCall = 'const rows = await fetchChildRows(deps, ref.key, library, serverId, signal);'
  const adaptedAttachmentCall = 'const rows = await fetchChildRows(deps, ref.key, library, serverId, signal, true);'
  const graphCall = 'fetchChildren: (childKey) => fetchChildRows(deps, childKey, library, serverId, signal),'
  const adaptedGraphCall = `${graphCall}\n        fetchAnnotationChildren: (childKey) => fetchChildRows(deps, childKey, library, serverId, signal, true),`
  const functionHeader = 'async function fetchChildRows(deps, key, library, serverId, signal) {'
  const adaptedFunctionHeader = 'async function fetchChildRows(deps, key, library, serverId, signal, annotationsOnly = false) {'
  const request = "const children = await deps.client.getJson(`${prefix}/items/${key}/children`, undefined, {"
  const adaptedRequest = "const children = await deps.client.getJson(`${prefix}/items/${key}/children`, annotationsOnly ? new URLSearchParams({ itemType: 'annotation' }) : undefined, {"

  const alreadyAdapted = source.includes(adaptedAttachmentCall)
    && source.includes(adaptedGraphCall)
    && source.includes(adaptedFunctionHeader)
    && source.includes(adaptedRequest)
  if (alreadyAdapted) return source
  for (const marker of [attachmentCall, graphCall, functionHeader, request]) {
    if (!source.includes(marker)) {
      throw new Error('Unrecognized Zotero Local API child traversal; review the pinned detail adapter.')
    }
  }
  return source
    .replace(attachmentCall, adaptedAttachmentCall)
    .replace(graphCall, adaptedGraphCall)
    .replace(functionHeader, adaptedFunctionHeader)
    .replace(request, adaptedRequest)
}
