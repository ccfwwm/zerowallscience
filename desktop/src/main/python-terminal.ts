import { dirname, join, relative, isAbsolute } from 'node:path'

export interface PythonTerminalLaunch {
  cwd: string
  args: string[]
  env: NodeJS.ProcessEnv
}

export function managedPythonTerminalPaths(
  info: { runtimeRoot?: unknown; executable?: unknown } | null | undefined,
  fallbackRuntimeRoot: string,
): { runtimeRoot: string; executable: string } {
  const runtimeRoot = typeof info?.runtimeRoot === 'string' && info.runtimeRoot.trim() ? info.runtimeRoot : fallbackRuntimeRoot
  const executable = typeof info?.executable === 'string' && info.executable.trim() ? info.executable : join(runtimeRoot, 'python.exe')
  return { runtimeRoot, executable }
}

function powerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/** Start an interactive interpreter in a new Windows console. Quote paths as
 * PowerShell literals instead of depending on environment-variable expansion;
 * this keeps the launch reliable when a parent process has a sparse env. */
export function createPythonTerminalLaunch(runtimeRoot: string, executable: string, baseEnv: NodeJS.ProcessEnv): PythonTerminalLaunch {
  const relativeExecutable = relative(runtimeRoot, executable)
  if (!relativeExecutable || relativeExecutable.startsWith('..') || isAbsolute(relativeExecutable)) throw new Error('Python executable must be inside the managed runtime.')
  const executableDirectory = dirname(executable)
  const scriptsDirectory = join(executableDirectory, 'Scripts')
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    PYTHONNOUSERSITE: '1',
    PATH: [executableDirectory, scriptsDirectory, baseEnv.PATH].filter(Boolean).join(';'),
  }
  delete env.PYTHONHOME
  delete env.PYTHONPATH
  return {
    cwd: executableDirectory,
    args: [
      '-NoLogo',
      '-NoExit',
      '-Command',
      `$ErrorActionPreference = 'Stop'; Set-Location -LiteralPath ${powerShellLiteral(runtimeRoot)}; & ${powerShellLiteral(executable)}`,
    ],
    env,
  }
}
