import { FileUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { RESEARCH_TOOL_DESCRIPTORS } from './tool-descriptors.js'
import type { ScienceToolId } from '../shared/workbench.js'
import styles from './viewer-landing.module.css'

type Tool = Exclude<ScienceToolId, 'home'>

export function ViewerLanding({ tool, status, message, onPickFile, assetPicker, onOpen }: {
  tool: Tool
  status: string
  message?: string
  onPickFile?: () => void
  assetPicker?: ReactNode
  onOpen?: { label: string; action: () => void; disabled?: boolean }
}): JSX.Element {
  const descriptor = RESEARCH_TOOL_DESCRIPTORS.find(item => item.id === tool)!
  return <div className={styles.landing} data-research-landing={tool} role="status">
    <div className={styles.art}><img src={descriptor.image} alt="" /></div>
    <div className={styles.body}>
      <span className={styles.kicker}>{descriptor.title}</span>
      <h2>{status === '未选择文件' ? tool === 'brainglobe' ? '打开脑图谱，开始查看' : '打开文件，开始查看' : status}</h2>
      <p>{message || descriptor.description}</p>
      <div className={styles.actions}>
        {onPickFile && <button type="button" className={styles.primary} onClick={onPickFile}><FileUp size={18} />选择文件</button>}
        {onOpen && <button type="button" className={styles.primary} onClick={onOpen.action} disabled={onOpen.disabled}>{onOpen.label}</button>}
        {assetPicker}
      </div>
    </div>
  </div>
}
