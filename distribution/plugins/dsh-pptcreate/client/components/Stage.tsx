/**
 * Stage：画布——PptdView 把页 AST 直接渲染成 DOM，ElementOverlay 盖透明选择框。
 *
 * 历史：旧版用「GET /thumb 光栅化 PNG」做底图，要点按钮、等 libreoffice 冷启动、
 * 还有 px:pt 系数错位（靠右元素视觉偏移）。现在底图就是 DOM（PptdView），
 * 打开即渲染、与选择框同坐标系、恒清晰（矢量）。
 *
 * 坐标系：deck.size（pt）为逻辑坐标。ElementOverlay 作为 PptdView 的 overlay 传进
 * 逻辑画布内部，随整体 scale 缩放——所以 overlay 里的元素直接用 pt 坐标即可对齐。
 *
 * 交互：
 *   - 单击覆盖层元素 → store.actions.setSelection([elementId])（同时触发右栏展开）。
 *   - 双击文本元素 → 就地编辑（TextEditor 顶在该元素位置）。
 *   - 点画布空白 → 取消选择（右栏随之收起）。
 */
import * as React from 'react'
import type { PptStore } from '../store'
import { PptdView, type PptdElement, type PptdPage } from './PptdView'
import { TextEditor } from './TextEditor'
import { deckTheme } from '../render/resolve'

export function Stage({ store }: { store: PptStore }) {
  const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [moving, setMoving] = React.useState<{ id: string; bounds: [number,number,number,number] } | null>(null)
  const regionStart = React.useRef<[number, number] | null>(null)
  const [referenceRegion, setReferenceRegion] = React.useState<[number, number, number, number] | null>(null)

  // Stage 挂载或翻页时主动拉页 AST；确保 PptdView 与 ElementOverlay 有几何可用
  React.useEffect(() => {
    if (state.activeKey) void store.actions.ensurePageLoaded()
  }, [state.activeKey, state.currentPage, store])

  // 在翻页或切工程时退出编辑态
  React.useEffect(() => {
    setEditing(null)
    setMoving(null)
    setReferenceRegion(null)
  }, [state.activeKey, state.currentPage])

  const logicalPoint = (event: React.PointerEvent<HTMLDivElement>): [number, number] | null => {
    const canvas = event.currentTarget.querySelector<HTMLElement>('.pptd-canvas')
    const rect = canvas?.getBoundingClientRect()
    if (!rect?.width || !rect.height || !state.deck) return null
    return [Math.max(0, Math.min(size[0], (event.clientX - rect.left) * size[0] / rect.width)),
      Math.max(0, Math.min(size[1], (event.clientY - rect.top) * size[1] / rect.height))]
  }

  if (!state.activeKey) return <div className="ppt-stage ppt-stage-empty" />

  const size = (state.deck?.size ?? [960, 540]) as [number, number]
  const theme = deckTheme(state.deck)
  const page = (state.currentPageData ?? null) as PptdPage | null
  const elements = Array.isArray(page?.elements) ? (page!.elements as PptdElement[]) : []
  const movingElement = moving ? elements.find(element => element.elementId === moving.id) : undefined
  const displayElements = moving && movingElement?.bounds ? elements.map(element => {
    if (!element.bounds || (element !== movingElement && (!movingElement.reconstructionGroup || element.reconstructionGroup !== movingElement.reconstructionGroup))) return element
    const [x,y,w,h] = element.bounds
    return { ...element, bounds: [x+moving.bounds[0]-movingElement.bounds![0],y+moving.bounds[1]-movingElement.bounds![1],w,h] as [number,number,number,number] }
  }) : elements

  return (
    <div className="ppt-stage" data-page={state.currentPage + 1}
      onPointerDownCapture={event => {
        if (!event.shiftKey || event.button !== 0) return
        const point = logicalPoint(event)
        if (!point) return
        event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
        regionStart.current = point; setReferenceRegion([point[0], point[1], 0, 0])
      }}
      onPointerMoveCapture={event => {
        if (!regionStart.current) return
        const point = logicalPoint(event); if (!point) return
        const [x, y] = regionStart.current
        setReferenceRegion([Math.min(x, point[0]), Math.min(y, point[1]), Math.abs(point[0]-x), Math.abs(point[1]-y)])
      }}
      onPointerUpCapture={event => {
        if (!regionStart.current) return
        const point = logicalPoint(event), start = regionStart.current; regionStart.current = null
        if (!point) { setReferenceRegion(null); return }
        const region: [number, number, number, number] = [Math.min(start[0],point[0]),Math.min(start[1],point[1]),Math.abs(point[0]-start[0]),Math.abs(point[1]-start[1])]
        if (region[2] < 4 || region[3] < 4) { setReferenceRegion(null); return }
        setReferenceRegion(region)
      }}>
      <PptdView
        page={page ? { ...page, elements: displayElements } : null}
        size={size}
        theme={theme}
        resolveMedia={(src) => store.actions.mediaUrl(src)}
        className="ppt-stage-pptd"
        overlay={
          <>
            <ElementOverlay
              elements={displayElements}
              selection={state.selection}
              onSelect={(ids) => store.actions.setSelection(ids)}
              onEnterEdit={(elementId) => setEditing(elementId)}
              onMove={(elementId, bounds) => { void store.actions.updateElement(elementId, { bounds }) }}
              onPreview={setMoving}
            />
            {referenceRegion ? <div className="ppt-reference-region" style={{ left: referenceRegion[0], top: referenceRegion[1], width: referenceRegion[2], height: referenceRegion[3] }}>
              <button type="button" className="ppt-reference-region-action" onPointerDown={event => event.stopPropagation()}
                onClick={event => { event.stopPropagation(); void store.actions.referencePage(state.currentPage, [], referenceRegion) }}>引用选区</button>
            </div> : null}
            {editing ? <TextEditor store={store} elementId={editing} onDone={() => setEditing(null)} /> : null}
          </>
        }
      />
    </div>
  )
}

/**
 * 透明选择框：每元素一个绝对定位的 div，单击 setSelection([id])、双击 onEnterEdit。
 * 坐标与 PptdView 逻辑画布同系（pt），随整体 scale——因此天然与渲染元素对齐。
 * 双击后组件就地卸载（TextEditor 直接顶在这个位置）。
 */
function ElementOverlay({
  elements,
  selection,
  onSelect,
  onEnterEdit,
  onMove,
  onPreview,
}: {
  elements: PptdElement[]
  selection: { page: number; ids: string[] } | null
  onSelect: (ids: string[]) => void
  onEnterEdit: (elementId: string) => void
  onMove: (elementId: string, bounds: [number,number,number,number]) => void
  onPreview: (value: { id: string; bounds: [number,number,number,number] } | null) => void
}) {
  const drag = React.useRef<{ id: string; start: [number,number]; bounds: [number,number,number,number]; latest: [number,number,number,number]; scale: number; moved: boolean } | null>(null)
  const selectedId = selection && selection.ids.length ? selection.ids[0] : null
  return (
    // 容器接收「点空白」→ 取消选择；元素框自己 stopPropagation，不会误触取消。
    // 容器要 pointer-events:auto 才收得到空白点击（样式里 overlay 默认 none，这里覆盖）。
    <div
      className="ppt-overlay ppt-overlay-active"
      aria-hidden={false}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect([])
      }}
    >
      {elements.map((el) => {
        const id = el.elementId
        const bounds = el.bounds
        if (!id || !bounds || bounds.length !== 4) return null
        const [x, y, w, h] = bounds
        const isSel = selectedId === id
        const isText = el.elementType === 'text'
        return (
          <div
            key={id}
            role="button"
            tabIndex={0}
            aria-pressed={isSel}
            data-element-id={id}
            data-element-type={el.elementType || ''}
            className={`ppt-element${isSel ? ' ppt-element-on' : ''}${isText ? ' ppt-element-text' : ''}`}
            style={{ left: x, top: y, width: w, height: h }}
            onPointerDown={event => {
              if(event.button!==0 || event.shiftKey || !isSel) return
              const rect=event.currentTarget.getBoundingClientRect()
              if (!rect.width || bounds[2] <= 0) return
              drag.current={id,start:[event.clientX,event.clientY],bounds:[...bounds],latest:[...bounds],scale:rect.width/bounds[2],moved:false}
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={event => {
              const active=drag.current;if(!active || active.id!==id)return
              const dx=(event.clientX-active.start[0])/active.scale,dy=(event.clientY-active.start[1])/active.scale
              if(Math.abs(dx)+Math.abs(dy)>3)active.moved=true
              if(active.moved){
                active.latest=[Math.max(0,active.bounds[0]+dx),Math.max(0,active.bounds[1]+dy),active.bounds[2],active.bounds[3]]
                onPreview({id,bounds:active.latest})
              }
            }}
            onPointerUp={event => {
              const active=drag.current;if(!active || active.id!==id)return
              drag.current=null
              if(active.moved){event.stopPropagation();onMove(id,active.latest)}
              onPreview(null)
            }}
            onPointerCancel={() => { drag.current=null;onPreview(null) }}
            onClick={(e) => {
              e.stopPropagation()
              onSelect([id])
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              if (isText) onEnterEdit(id)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSelect([id])
            }}
          />
        )
      })}
    </div>
  )
}
