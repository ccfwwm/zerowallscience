/**
 * Toolbar：顶栏（撤销 / 重做 / 导出 / 刷新）＋冲突 / 外部修改 / 保存态横幅。
 *
 * 「导出 .pptx」：POST /export 一次走完整 build → pptx，宿主保存工程副本，面板触发附件下载。
 * 保存和冲突不影响导出：基准画布加草稿在临时快照中构建。
 */
import * as React from 'react'
import { PPT_REFERENCE_MIME } from '../references'
import type { PptStore } from '../store'
import { ExportGlyph, HistoryGlyph, RedoGlyph, UndoGlyph } from '../icons'

export function Toolbar({
  store,
  historyOpen,
  onShowHistory,
}: {
  store: PptStore
  historyOpen?: boolean
  onShowHistory?: () => void
}) {
  const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot)
  const disabled = !state.activeKey || state.saving
  const reconstruction=state.reconstruction[state.currentPage+1]
  const phases: Record<string,string>={analyzing:'识别',building:'重建',rendering:'渲染',repairing:'修正'}
  const reconstructionLabel=reconstruction
    ? ['queued','processing'].includes(reconstruction.status) ? `处理中 · ${phases[reconstruction.phase??'']??'排队'}`
      : reconstruction.status==='failed'?'处理失败'
      : reconstruction.status==='cancelled'?'已取消'
      : reconstruction.status==='interrupted'?'已中断'
      : reconstruction.qualityStatus==='passed'&&!reconstruction.staleEvidence?'已通过':'待核对'
    : null

  const onExport = async () => {
    await store.actions.exportDeck()
  }

  return (
    <>
      <div className="ppt-toolbar">
        {state.activeKey ? (
          <span className="ppt-toolbar-project">
            <strong>{(state.deck as { title?: string } | null)?.title ?? state.activeKey}</strong>
            {state.deckPages.length ? <span className="ppt-toolbar-meta">{state.deckPages.length} 页</span> : null}
            <span className="ppt-toolbar-meta">{state.exportPreview ? '预览 / 导出' : '第'} {state.exportPreview?.baseRevision ?? state.lastSeenRevision} 版</span>
            {state.draft?.ops.length ? <span className="ppt-toolbar-meta">草稿 {state.draft.ops.length}</span> : null}
            {reconstructionLabel ? <span className="ppt-toolbar-meta" role="status">{reconstructionLabel}{reconstruction?.concurrency?` · 并发 ${reconstruction.concurrency}`:''}{typeof reconstruction?.rasterTexts==='number'&&reconstruction.rasterTexts>0?` · ${reconstruction.rasterTexts} 处文字待拆分`:''}</span> : null}
          </span>
        ) : null}
        <span className="ppt-spacer" />
        <button type="button" className="ppt-btn" disabled={!state.activeKey} draggable
          onDragStart={event => { const target = store.actions.referenceTarget(state.currentPage, state.selection?.ids ?? []); if (target) { event.dataTransfer.setData(PPT_REFERENCE_MIME, JSON.stringify(target)); event.dataTransfer.effectAllowed = 'copy' } }}
          onClick={() => void store.actions.referencePage(state.currentPage, state.selection?.ids ?? [])}
          title="点击或拖入对话，引用当前页面或选中元素">{state.selection?.ids.length ? '引用选中元素' : '引用此页'}</button>
        <button
          type="button"
          className={`ppt-btn${historyOpen ? ' ppt-btn-on' : ''}`}
          disabled={disabled}
          onClick={() => onShowHistory?.()}
          title="版本历史：预览并恢复到任意历史版本（再点一次收起）"
        >
          <HistoryGlyph size={13} /> 历史
        </button>
        <button
          type="button"
          className="ppt-btn"
          disabled={disabled || !state.canUndo}
          onClick={() => void store.actions.undo()}
          title="撤销（先提交草稿再撤）"
        >
          <UndoGlyph size={13} /> 撤销
        </button>
        <button
          type="button"
          className="ppt-btn"
          disabled={disabled || !state.canRedo}
          onClick={() => void store.actions.redo()}
        >
          <RedoGlyph size={13} /> 重做
        </button>
        <button
          type="button"
          className="ppt-btn"
          disabled={!state.activeKey}
          onClick={() => void onExport()}
          title="立即导出当前画布（含草稿），后台任务继续"
        >
          <ExportGlyph size={13} /> 导出 .pptx
        </button>
      </div>
      {state.conflict ? (
        <div className="ppt-banner" data-kind="error">
          和服务端冲突了（服务端已改到 rev {state.conflict.revision}）。
          <button type="button" className="ppt-btn ppt-btn-primary" onClick={() => void store.actions.applyDraft()}>
            重试
          </button>
          <button type="button" className="ppt-btn" onClick={() => void store.actions.resolveConflictTheirs()}>
            采用服务端版本
          </button>
        </div>
      ) : null}
      {state.externalChange ? (
        <div className="ppt-banner">
          外部已修改（rev {state.externalChange.revision}）。
          <button type="button" className="ppt-btn" onClick={() => void store.actions.acceptExternal()}>
            拉取服务端版本（丢弃本地草稿）
          </button>
        </div>
      ) : null}
      {state.error && state.status === 'ready' ? (
        <div className="ppt-banner" data-kind="error">
          {state.error}
        </div>
      ) : null}
    </>
  )
}
