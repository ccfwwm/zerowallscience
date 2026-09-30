import { zoteroDispatch } from './zotero-dispatch.mjs'
import { ZeroWallZoteroDetails } from './zotero-live.mjs'
import { decodeZoteroAuthorizationResponse, ZeroWallZoteroAuthorization } from './zotero-authorization.mjs'

// dsh-zotero 0.11.0 was published before the 0.2.0-rc.2 release and pins
// every DSH peer to 0.1.7-rc.2. The source package remains untouched; this
// adapter updates only the curated production copy used by ZeroWall.
export function adaptZoteroManifest(source) {
  const manifest = JSON.parse(source)
  const runtimeRange = '^0.1.7-rc.2 || ^0.2.0-rc.2'
  if (manifest.name !== 'dsh-zotero' || manifest.version !== '0.11.0') {
    throw new Error('Unexpected Zotero manifest identity; review the pinned runtime adapter.')
  }
  if (manifest.engines?.dsh !== undefined) manifest.engines.dsh = runtimeRange
  if (manifest.dsh?.engines?.dsh !== undefined) manifest.dsh.engines.dsh = runtimeRange
  if (manifest.dsh?.harnessRange !== undefined) manifest.dsh.harnessRange = runtimeRange
  if (manifest.peerDependencies && typeof manifest.peerDependencies === 'object') {
    for (const [name, range] of Object.entries(manifest.peerDependencies)) {
      if (name.startsWith('@deepseek-ai/dsh') && typeof range === 'string' && range === '0.1.7-rc.2') {
        manifest.peerDependencies[name] = runtimeRange
      }
    }
  }
  if (manifest.dsh?.compatibility?.dshReleases) {
    manifest.dsh.compatibility.dshReleases['0.2.0-rc.2'] = 'compatible'
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}

// Zotero 0.11.0 is compiled against the rc.2 commands API. Older releases were
// compiled against a newer commands API under the same rc.2
// version. The pinned Harness registers commands by name and has no
// CommandDefinitionId brand. Preserve the command and omit that newer field.
export function adaptZoteroCommand(source) {
  if (!source.includes('CommandDefinitionId')) return source
  const importLine = /^import \{ CommandDefinitionId \} from '@deepseek-ai\/dsh-commands(?:\/brand)?';\r?\n/m
  const field = /^\s*definitionId: CommandDefinitionId\('dsh-zotero\/status'\),\r?\n/m
  if (!importLine.test(source) || !field.test(source)) {
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
  // 0.11.x already contains the nested-call walk and the session signature
  // tracks call paths. Applying the 0.8.x patch would both fail to match and
  // risk replacing the upstream reducer with an older implementation.
  const modernSourcesTab = source.includes('function visitVisibleZoteroCalls(snapshot, visit)')
    && source.includes('order.push({ callId: block.callId, path });')
  // 0.11.x already has the correct nested-call traversal and session
  // signature. It still needs the ZeroWall dispatch projection below so
  // progressive-tools results (tool_dispatch/lit_save) reach the native
  // workspace reducer. Do not return before that projection is installed.
  if (modernSourcesTab) {
    if (source.includes('function zoteroDispatch(block)')) return adaptZoteroActions(source)
    const modernReplacements = [
      ['function callNameOf(block) {', 'function callNameOf(block) {\n  const dispatch = zoteroDispatch(block);\n  if (dispatch) return dispatch.name;'],
      ['function metaOf(block) {', 'function metaOf(block) {\n  const dispatch = zoteroDispatch(block);\n  if (dispatch) return dispatch.meta;'],
      ['function argsOf(block) {', 'function argsOf(block) {\n  const dispatch = zoteroDispatch(block);\n  if (dispatch) return dispatch.args;'],
    ]
    for (const [before, after] of modernReplacements) {
      if (!source.includes(before)) throw new Error('Unrecognized Zotero dispatch consumer; review the pinned client adapter.')
      source = source.replace(before, after)
    }
    return adaptZoteroActions(source.replace('function callNameOf(block) {', `${zoteroDispatch.toString()}\nfunction callNameOf(block) {`))
  }
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
  if (!source.includes('function decodeZoteroAuthorizationResponse(response)')) {
    source = replaceRequired(source, 'function ZoteroSettingsSection(props) {', `${decodeZoteroAuthorizationResponse.toString()}\nfunction ZoteroSettingsSection(props) {`)
  }
  if (!source.includes('function ZeroWallZoteroAuthorization(')) {
    source = replaceRequired(source, 'function ZoteroSettingsSection(props) {', `${ZeroWallZoteroAuthorization.toString()}\nfunction ZoteroSettingsSection(props) {`)
    const settings = source.match(/(\/\* @__PURE__ \*\/ \(0, import_jsx_runtime\d+\.jsx\)\(ZoteroSettingsForm, \{ t, state, actions: props \}\),)/u)
    if (!settings) throw new Error('Unrecognized Zotero settings form marker; review the pinned client adapter.')
    source = source.replace(settings[1], `require("react").createElement(ZeroWallZoteroAuthorization, { t, dirty: state.dirty }),\n    ${settings[1]}`)
  }
  if (source.includes('function ZeroWallZoteroDetails(')) return source
  source = replaceRequired(source, 'function SourceOverview({ item, t, setDraft }) {', `${ZeroWallZoteroDetails.toString()}\nfunction SourceOverview({ item, t, setDraft }) {`)
  source = replaceRequired(source,
    'function SourcesTab({ status, t, useSession, useChat, inputActions }) {',
    'function SourcesTab({ status, t, useSession, useChat, inputActions, openView }) {')
  const setDraft = 'const setDraft = (0, import_react11.useMemo)(\n    () => inputActions === void 0 ? void 0 : inputActions.setDraft.bind(inputActions),\n    [inputActions]\n  );'
  if (source.includes(setDraft)) {
    source = source.replace(setDraft, `const setDraft = (0, import_react11.useMemo)(() => inputActions === void 0 ? void 0 : (text) => {
    inputActions.setDraft(text);
    openView?.("chat", "");
    requestAnimationFrame(() => inputActions.focus?.());
  }, [inputActions, openView]);`)
  } else {
    throw new Error('Unrecognized Zotero Sources tab draft marker; review the pinned client adapter.')
  }
  const mismatch = source.match(/(\s*)(item\.provenance === "mismatch" &&)/u)
  if (!mismatch) throw new Error('Unrecognized Zotero source overview marker; review the pinned client adapter.')
  const overviewRuntime = source.match(/function SourceOverview[\s\S]*?import_jsx_runtime(\d+)\.jsxs/u)?.[1] ?? '11'
  source = source.replace(mismatch[0], `${mismatch[1]}(0, import_jsx_runtime${overviewRuntime}.jsx)(ZeroWallZoteroDetails, { item, t }, item.ref),${mismatch[1]}${mismatch[2]}`)
  const exportsStart = source.indexOf('function SourceExports({ item, t }) {')
  const exportsEnd = source.indexOf('// src/client/components/workspace/SourceInspector.tsx', exportsStart)
  if (exportsStart < 0 || exportsEnd < 0) throw new Error('Unrecognized Zotero export panel')
  const exportsRuntime = source.match(/function SourceExports[\s\S]*?import_jsx_runtime(\d+)\.jsx/u)?.[1] ?? '16'
  source = source.slice(0, exportsStart) + `function SourceExports({ item, t }) {
    return (0, import_jsx_runtime${exportsRuntime}.jsxs)("div", { className: workspace_default.panel, children: [
      (0, import_jsx_runtime${exportsRuntime}.jsx)(ZeroWallZoteroDetails, { item, t, exportOnly: true }, item.ref),
      item.exports.length > 0 && (0, import_jsx_runtime${exportsRuntime}.jsx)(ExportSections, { exports: item.exports, t })
    ] });
  }\n\n` + source.slice(exportsEnd)
  source = source.replaceAll('...externalHrefProps(url),', `...externalHrefProps(url), onClick: (event) => {
    if (url.startsWith("zotero://") && window.zerowallDesktop?.openZotero) {
      event.preventDefault();
      void window.zerowallDesktop.openZotero(url);
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
  // 0.11.x moved all host invocation descriptors to status-codec.js. Keep
  // contract.js structural-only and let adaptZoteroStatusCodec add the
  // ZeroWall endpoints at the actual registration site.
  if (!source.includes('export const ZOTERO_INVOCATIONS = [')) return source
  if (!source.includes("method: 'localAuthorization'")) {
    source = replaceRequired(source, 'export const ZOTERO_INVOCATIONS = [', `export const ZOTERO_INVOCATIONS = [{
      id: 'dsh-zotero#zotero/localAuthorization', service: 'zoteroRemote', namespace: ZOTERO_SETTINGS_NAMESPACE,
      method: 'localAuthorization', invocation: { kind: 'direct' },
      parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-zotero#localAuthorizationRequest', create: () => z.object({ action: z.enum(['status', 'authorize', 'renew']) }).strict() } }],
      result: { mode: 'strict', typeSymbol: 'dsh-zotero#localAuthorizationJson', create: () => z.string() }
    },`)
  }
  if (source.includes("method: 'itemDetail'")) return source
  const descriptor = (method, schema) => `{
    id: 'dsh-zotero#zotero/${method}', service: 'zoteroRemote', namespace: ZOTERO_SETTINGS_NAMESPACE,
    method: '${method}', invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-zotero#${method}Request', create: () => ${schema} } }],
    result: { mode: 'strict', typeSymbol: 'dsh-zotero#${method}Json', create: () => z.string() }
  },`
  return replaceRequired(source, 'export const ZOTERO_INVOCATIONS = [', 'export const ZOTERO_INVOCATIONS = [\n' +
    descriptor('itemDetail', 'z.object({ ref: z.string().min(1).max(2048) }).strict()') +
    descriptor('exportCitation', "z.object({ ref: z.string().min(1).max(2048), format: z.enum(['bibtex', 'ris', 'csljson', 'citation', 'bibliography']) }).strict()"))
}

export function adaptZoteroStatusCodec(source) {
  if (source.includes("method: 'localAuthorization'")) return source
  const marker = 'export const ZOTERO_INVOCATIONS = ['
  if (!source.includes(marker)) throw new Error('Unrecognized Zotero status codec invocation marker; review the pinned adapter.')
  const descriptors = `export const ZOTERO_INVOCATIONS = [
  {
    id: 'dsh-zotero#zotero/localAuthorization', service: 'zoteroRemote', namespace: 'zotero',
    method: 'localAuthorization', invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-zotero#localAuthorizationRequest', create: () => z.object({ action: z.enum(['status', 'authorize', 'renew']) }).strict() } }],
    result: { mode: 'strict', typeSymbol: 'dsh-zotero#localAuthorizationJson', create: () => z.string() },
  },
  {
    id: 'dsh-zotero#zotero/itemDetail', service: 'zoteroRemote', namespace: 'zotero',
    method: 'itemDetail', invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-zotero#itemDetailRequest', create: () => z.object({ ref: z.string().min(1).max(2048) }).strict() } }],
    result: { mode: 'strict', typeSymbol: 'dsh-zotero#itemDetailJson', create: () => z.string() },
  },
  {
    id: 'dsh-zotero#zotero/exportCitation', service: 'zoteroRemote', namespace: 'zotero',
    method: 'exportCitation', invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-zotero#exportCitationRequest', create: () => z.object({ ref: z.string().min(1).max(2048), format: z.enum(['bibtex', 'ris', 'csljson', 'citation', 'bibliography']) }).strict() } }],
    result: { mode: 'strict', typeSymbol: 'dsh-zotero#exportCitationJson', create: () => z.string() },
  },`
  return source.replace(marker, descriptors)
}

// Zotero's Local API omits annotation rows from a bare attachment /children
// request. The attachment-level traversal must request itemType=annotation;
// the parent item traversal remains unfiltered so notes and attachments stay
// visible.
export function adaptZoteroItemGraph(source) {
  if (source.includes('fetchAnnotationChildren') && source.includes('loadItemGraph')) return source
  const original = "annotations: (await options.fetchChildren(key)).filter((candidate) => itemTypeOf(candidate) === 'annotation'),"
  const adapted = "annotations: (await (options.fetchAnnotationChildren ?? options.fetchChildren)(key)).filter((candidate) => itemTypeOf(candidate) === 'annotation'),"
  if (source.includes(adapted)) return source
  if (!source.includes(original)) {
    throw new Error('Unrecognized Zotero annotation graph traversal; review the pinned item-graph adapter.')
  }
  return source.replace(original, adapted)
}

export function adaptZoteroDetail(source) {
  if (source.includes('fetchAnnotationChildren') && source.includes('loadChildRows')) return source
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
