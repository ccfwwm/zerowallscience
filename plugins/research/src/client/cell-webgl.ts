import type { CellCamera } from '../shared/cell-camera.js'
import type { CellPreview } from '../shared/types.js'
import type { CellSelectionResult } from '../shared/cell-selection.js'

export interface CellPlotData {
  positions: Float32Array; colors: Float32Array; count: number
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  groups: string[]; expressionRange?: [number,number]
}
const PALETTE = [[.145,.388,.922],[.851,.467,.024],[.02,.588,.412],[.863,.149,.149],[.486,.227,.929],[.031,.569,.698],[.745,.094,.365],[.302,.486,.059]]

export function prepareCellPlot(preview: CellPreview, groupBy: string, selection?: CellSelectionResult): CellPlotData {
  const points = preview.embedding?.points ?? []
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity
  for (const p of points) { minX = Math.min(minX,p.x); maxX = Math.max(maxX,p.x); minY = Math.min(minY,p.y); maxY = Math.max(maxY,p.y) }
  if (!points.length) { minX = minY = -1; maxX = maxY = 1 }
  const positions = new Float32Array(points.length*2); const colors = new Float32Array(points.length*4)
  const expressions = new Map(preview.expression?.values.map(v => [v.index,v.value])); let low = Infinity; let high = -Infinity
  for (const value of expressions.values()) { low = Math.min(low,value); high = Math.max(high,value) }
  const groups = new Map<string,number>(); const cells = new Map(preview.cells.map(c => [c.index,c]))
  const selected = new Set(selection?.previewIndices)
  for (let i=0; i<points.length; i++) {
    const p = points[i]!
    positions[2*i] = maxX === minX ? 0 : 2*(p.x-minX)/(maxX-minX)-1
    positions[2*i+1] = maxY === minY ? 0 : 2*(p.y-minY)/(maxY-minY)-1
    let rgb = PALETTE[0]!
    if (groupBy) {
      const key = JSON.stringify(p.group ?? cells.get(p.index)?.obs[groupBy] ?? null)
      if (!groups.has(key)) groups.set(key,groups.size)
      rgb = PALETTE[groups.get(key)!%PALETTE.length]!
    }
    const expression = expressions.get(p.index)
    if (expression !== undefined) { const t = high === low ? .5 : (expression-low)/(high-low); rgb = [t,.2+.6*t,1-t] }
    colors.set([rgb[0]!,rgb[1]!,rgb[2]!,selection && !selected.has(p.index) ? .12 : .8],4*i)
  }
  return { positions,colors,count:points.length,bounds:{minX,maxX,minY,maxY},groups:[...groups.keys()],...(expressions.size ? { expressionRange:[low,high] as [number,number] } : {}) }
}

const VERTEX = 'attribute vec2 position; attribute vec4 color; uniform vec3 camera; uniform float size; varying vec4 vColor; void main(){ gl_Position=vec4(position*camera.x+camera.yz,0.0,1.0); gl_PointSize=size; vColor=color; }'
const FRAGMENT = 'precision mediump float; varying vec4 vColor; void main(){ if(distance(gl_PointCoord,vec2(0.5))>0.5)discard; gl_FragColor=vColor; }'

/** One GPU upload per data change; camera interactions only change uniforms. */
export class CellWebGlRenderer {
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  private position: WebGLBuffer
  private color: WebGLBuffer
  private count = 0
  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { alpha:true,antialias:false,premultipliedAlpha:false })
    if (!gl) throw new Error('WebGL unavailable')
    this.gl = gl
    const shaders: WebGLShader[] = []
    const shader = (kind: number, source: string): WebGLShader => {
      const s = gl.createShader(kind)
      if (!s) throw new Error('WebGL shader allocation failed')
      shaders.push(s); gl.shaderSource(s,source); gl.compileShader(s)
      if (!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'WebGL shader compilation failed')
      return s
    }
    const program = gl.createProgram(); const position = gl.createBuffer(); const color = gl.createBuffer()
    if (!program || !position || !color) { gl.deleteProgram(program); gl.deleteBuffer(position); gl.deleteBuffer(color); throw new Error('WebGL allocation failed') }
    try {
      gl.attachShader(program,shader(gl.VERTEX_SHADER,VERTEX)); gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FRAGMENT)); gl.linkProgram(program)
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'WebGL program link failed')
    } catch(error) { gl.deleteProgram(program); gl.deleteBuffer(position); gl.deleteBuffer(color); throw error }
    finally { for (const s of shaders) gl.deleteShader(s) }
    this.program=program; this.position=position; this.color=color
  }
  upload(data: CellPlotData): void {
    const gl=this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER,this.position); gl.bufferData(gl.ARRAY_BUFFER,data.positions,gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER,this.color); gl.bufferData(gl.ARRAY_BUFFER,data.colors,gl.STATIC_DRAW)
    this.count=data.count
  }
  draw(camera: CellCamera): void {
    const gl=this.gl; const box=this.canvas.getBoundingClientRect(); const dpr=Math.min(window.devicePixelRatio || 1,2)
    const width=Math.max(1,Math.round(box.width*dpr)); const height=Math.max(1,Math.round(box.height*dpr))
    if(this.canvas.width!==width || this.canvas.height!==height) { this.canvas.width=width; this.canvas.height=height }
    gl.disable(gl.SCISSOR_TEST); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT)
    gl.viewport(Math.round(width*24/520),Math.round(height*24/280),Math.round(width*472/520),Math.round(height*232/280))
    gl.scissor(Math.round(width*24/520),Math.round(height*24/280),Math.round(width*472/520),Math.round(height*232/280)); gl.enable(gl.SCISSOR_TEST)
    gl.useProgram(this.program); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA)
    for(const [name,buffer,size] of [['position',this.position,2],['color',this.color,4]] as const) {
      const attribute=gl.getAttribLocation(this.program,name); gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute,size,gl.FLOAT,false,0,0)
    }
    gl.uniform3f(gl.getUniformLocation(this.program,'camera'),camera.zoom,camera.panX,camera.panY)
    gl.uniform1f(gl.getUniformLocation(this.program,'size'),3*dpr)
    gl.drawArrays(gl.POINTS,0,this.count)
  }
  dispose(): void { this.gl.deleteBuffer(this.position); this.gl.deleteBuffer(this.color); this.gl.deleteProgram(this.program) }
}
