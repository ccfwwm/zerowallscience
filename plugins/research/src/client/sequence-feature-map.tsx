import React from 'react'
import type { SequenceFeature } from '../host/sequence.js'

const colors = ['#187e9c', '#975ac2', '#bf6619', '#388243', '#b94470', '#4666af']
function arc(start: number, end: number, length: number, radius: number): string {
  const point = (position: number): [number, number] => {
    const angle = position / length * 2 * Math.PI - Math.PI / 2
    return [220 + radius * Math.cos(angle), 185 + radius * Math.sin(angle)]
  }
  // A full circle needs two SVG arcs; include the complete last base.
  const a = point(start - 1), b = point(end)
  if (end - start + 1 >= length) { const opposite = point(length / 2); return `M ${a.join(' ')} A ${radius} ${radius} 0 1 1 ${opposite.join(' ')} A ${radius} ${radius} 0 1 1 ${a.join(' ')}` }
  return `M ${a.join(' ')} A ${radius} ${radius} 0 ${end - start + 1 > length / 2 ? 1 : 0} 1 ${b.join(' ')}`
}

/** Geometry represents each stored feature segment, including origin-spanning
 * joins. Selecting a feature selects its bounds; it does not splice exons. */
export function SequenceFeatureMap({ length, name, mode, features, selection, onSelect }: {
  length: number; name: string; mode: 'linear' | 'circular'; features: SequenceFeature[]; selection: [number, number]; onSelect: (start: number, end: number) => void
}): JSX.Element {
  const circular = mode === 'circular'
  return <div aria-label="序列注释图谱">
    <svg role="img" aria-label={`${name} ${circular ? '环形' : '线性'}图谱`} viewBox={circular ? '0 0 440 365' : '0 0 800 185'} style={{ width: '100%', maxHeight: 365 }}>
      {circular ? <><circle cx={220} cy={185} r={118} fill="none" stroke="currentColor" opacity={0.35} /><text x={220} y={181} textAnchor="middle" fill="currentColor">{name.slice(0, 28)}</text><text x={220} y={204} textAnchor="middle" fill="currentColor">{length.toLocaleString()} bp</text><text x={220} y={27} textAnchor="middle" fill="currentColor">1</text><path d={arc(selection[0], selection[1], length, 106)} fill="none" stroke="#edaa2c" strokeWidth={5} /></>
        : <><line x1={25} y1={100} x2={775} y2={100} stroke="currentColor" opacity={0.35} /><text x={25} y={170} fill="currentColor">1</text><text x={775} y={170} textAnchor="end" fill="currentColor">{length.toLocaleString()} bp</text><rect x={25 + (selection[0] - 1) / length * 750} y={95} width={Math.max(1, (selection[1] - selection[0] + 1) / length * 750)} height={10} fill="#edaa2c" /></>}
      {features.map((feature, index) => <g key={index} role="button" tabIndex={0} aria-label={`选择注释 ${feature.label ?? feature.type} ${feature.location}`} onClick={() => onSelect(feature.start, feature.end)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(feature.start, feature.end) } }} style={{ cursor: 'pointer' }}>
        <title>{feature.label ?? feature.type} · {feature.type} · {feature.location} · {feature.strand === 1 ? '+' : feature.strand === -1 ? '−' : '混合链'}</title>
        {feature.segments.map((segment, part) => circular
          ? <path key={part} d={arc(segment.start, segment.end, length, 124 + index % 4 * 8)} fill="none" stroke={colors[index % colors.length]} strokeWidth={6} opacity={0.9} />
          : <rect key={part} x={25 + (segment.start - 1) / length * 750} y={segment.strand === -1 ? 110 + index % 3 * 13 : 70 - index % 3 * 13} width={Math.max(1, (segment.end - segment.start + 1) / length * 750)} height={10} fill={colors[index % colors.length]} />)}
      </g>)}
    </svg>
    <p>图中按原始分段显示注释；颜色区分注释，线性图上下轨分别为正、负链。点击选择外边界区间，多外显子与跨原点注释不会自动拼接或翻译。</p>
    <div style={{ maxHeight: 190, overflow: 'auto' }}><table><thead><tr><th>注释</th><th>类型</th><th>位置与方向</th></tr></thead><tbody>{features.map((feature, index) => <tr key={index}><td><button type="button" onClick={() => onSelect(feature.start, feature.end)}>{feature.label ?? feature.type}</button></td><td>{feature.type}</td><td>{feature.location}</td></tr>)}</tbody></table></div>
  </div>
}
