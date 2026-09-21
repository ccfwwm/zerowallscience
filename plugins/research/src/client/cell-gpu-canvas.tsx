import { useEffect, useRef, useState } from 'react'
import { CellWebGlRenderer, type CellPlotData } from './cell-webgl.js'
import type { CellCamera } from '../shared/cell-camera.js'

export function CellGpuCanvas({ data, camera, onMode }: { data: CellPlotData; camera: CellCamera; onMode: (mode: 'webgl'|'unavailable') => void }): JSX.Element {
  const canvas=useRef<HTMLCanvasElement>(null); const renderer=useRef<CellWebGlRenderer>(); const latest=useRef({data,camera}); latest.current={data,camera}
  const [epoch,setEpoch]=useState(0)
  useEffect(()=>{
    const element=canvas.current!
    const lost=(event: Event) => { event.preventDefault(); renderer.current?.dispose(); renderer.current=undefined; onMode('unavailable') }
    const restored=() => setEpoch(n=>n+1)
    element.addEventListener('webglcontextlost',lost); element.addEventListener('webglcontextrestored',restored)
    try { renderer.current=new CellWebGlRenderer(element); renderer.current.upload(latest.current.data); renderer.current.draw(latest.current.camera); onMode('webgl') } catch { renderer.current?.dispose(); renderer.current=undefined; onMode('unavailable') }
    const resize=typeof ResizeObserver==='undefined' ? undefined : new ResizeObserver(()=>renderer.current?.draw(latest.current.camera))
    resize?.observe(element)
    return ()=>{ resize?.disconnect(); element.removeEventListener('webglcontextlost',lost); element.removeEventListener('webglcontextrestored',restored); renderer.current?.dispose(); renderer.current=undefined }
  },[epoch,onMode])
  useEffect(()=>{renderer.current?.upload(data);renderer.current?.draw(camera)},[data])
  useEffect(()=>{renderer.current?.draw(camera)},[camera])
  return <canvas ref={canvas} aria-hidden="true" data-cell-renderer="webgl" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}} />
}
