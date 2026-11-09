/** Desktop-only omissions from already installed production npm packages. */

/**
 * Identify build, diagnostic and other-platform files omitted from the immutable Desktop runtime.
 * Unrecognized assets and target runtime binaries are retained. Paths name the copied
 * node_modules tree, including nested package containers.
 * @param path - Path relative to the production node_modules directory.
 * @param target - Platform and architecture of the Electron Node runtime.
 * @param officeEngine - Engine selected from the installed kit manifest.
 * @returns Omission reason, or undefined when the entry must be copied.
 */
export function desktopRuntimeFileExclusion(
  path: string, target: { platform: NodeJS.Platform; arch: string }, officeEngine: string,
): string | undefined {
  const parts = path.split(/[\\/]/u)
  if (parts.some(part => ['.bin', '.pnpm', '.modules.yaml', '.pnpm-workspace-state-v1.json'].includes(part))) {
    return 'package-manager metadata'
  }
  const file = parts.at(-1)!
  if (file === '.gitkeep') return 'Git directory placeholder'
  if (/\.(?:[cm]?[jt]s|css)\.map$/u.test(file)) return 'source map'
  if (/\.d\.[cm]?ts$/u.test(file)) return 'TypeScript declaration'
  if (/\.tsbuildinfo$/u.test(file)) return 'TypeScript build cache'
  const packageParts = parts.slice(parts.lastIndexOf('node_modules') + 1)
  const nameParts = packageParts[0]?.startsWith('@') ? 2 : 1
  const name = packageParts.slice(0, nameParts).join('/')
  const entry = packageParts.slice(nameParts).join('/')
  if (name === 'zod' && /^(?:src|(?:v3|v4)\/(?:tests|benchmarks))(?:\/|$)/u.test(entry)) return 'Zod source and development fixtures'
  if (name === 'react-icons' && entry && !/^(?:lib(?:\/|$)|package\.json$|LICENSE|README)/u.test(entry)) return 'icon sets compiled into the sidebar client'
  if (name === 'figlet' && /^(?:fonts|importable-fonts)\//u.test(entry) && !/\/(?:Big|Standard)\.(?:flf|js)$/u.test(entry)) return 'unused CLI banner fonts'
  if (['@zerowall/dsh-plugin-skills', '@zerowall/dsh-pptcreate'].includes(name) && /^(?:test|tests|workflow-tests|coverage)(?:\/|$)/u.test(entry)) return 'plugin development fixtures'
  if (name === '@zerowall/dsh-plugin-python' && /^resources\/runtime\/wheels(?:\/|$)/u.test(entry)) return 'Python extensions downloaded after launch'
  if (name === '@zerowall/dsh-pptcreate' && entry.endsWith('.onnx')) return 'OCR models downloaded after launch'
  if (name.startsWith('@deepseek-ai/libreoffice-kit-')) {
    if (name !== `@deepseek-ai/libreoffice-kit-${officeEngine}`) return 'LibreOffice other platform'
  }
  if (name === 'fs-ext' && /^build\/(?:Release|Debug)\/(?:obj(?:\/|$)|fs_ext\.(?:exp|lib|pdb|iobj|ipdb)$)/u.test(entry)) {
    return 'fs-ext compiler output'
  }
  if (name === 'fs-ext' && /^build\/(?:binding\.sln|config\.gypi|fs_ext\.vcxproj(?:\.filters)?)$/u.test(entry)) {
    return 'fs-ext build configuration'
  }
  if (name === '@mixmark-io/domino' && (entry === 'test' || entry.startsWith('test/'))) return 'Domino test fixtures'
  if (name === '@mixmark-io/domino' && (entry === '.yarn' || entry.startsWith('.yarn/'))) return 'Domino development tooling'
  if (name === 'node-pty' && target.platform !== 'win32' && /^third_party\/conpty(?:\/|$)/u.test(entry)) {
    return 'node-pty Windows ConPTY sources'
  }
  const conptyArch = /^third_party\/conpty\/.*\/win10-(arm64|x64)(?:\/|$)/u.exec(entry)?.[1]
  if (name === 'node-pty' && target.platform === 'win32' && conptyArch && conptyArch !== target.arch) return 'ConPTY other architecture'
  if (name === 'node-pty' && entry.startsWith('prebuilds/')) {
    const platform = packageParts[nameParts + 1]
    if (platform !== undefined && platform !== `${target.platform}-${target.arch}`) return 'node-pty other platform'
    if (file.endsWith('.pdb')) return 'node-pty debug symbols'
  }
  if (name === '@koromix/koffi-win32-x64' && entry === 'win32_x64/koffi.lib') return 'Koffi import library'
  return undefined
}
