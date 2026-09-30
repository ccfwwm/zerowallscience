import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function commandPathWorker() {
  return (await readFile(resolve(import.meta.dirname, '../../deepseek-harness/apps/desktop/scripts/command-path.ps1'), 'utf8'))
    .replaceAll('Software\\DeepSeekHarness\\Command', 'Software\\ZeroWallScience\\Command')
    .replaceAll('Global\\DeepSeekHarness.Command.', 'Global\\ZeroWallScience.Command.')
    .replace('(@($directory) + $kept)', '($kept + @($directory))')
}
