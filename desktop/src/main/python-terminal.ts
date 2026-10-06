import { dirname, join, relative, isAbsolute } from 'node:path'

export interface PythonTerminalLaunch {
  cwd: string
  args: string[]
  env: NodeJS.ProcessEnv
}

/** Start an interactive interpreter in a new Windows console. Values containing
 * paths are supplied through the child environment so paths with spaces or
 * shell metacharacters are not interpolated into cmd.exe source. */
export function createPythonTerminalLaunch(runtimeRoot: string, executable: string, baseEnv: NodeJS.ProcessEnv): PythonTerminalLaunch {
  const relativeExecutable = relative(runtimeRoot, executable)
  if (!relativeExecutable || relativeExecutable.startsWith('..') || isAbsolute(relativeExecutable)) throw new Error('Python executable must be inside the managed runtime.')
  const executableDirectory = dirname(executable)
  const scriptsDirectory = join(executableDirectory, 'Scripts')
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    ZEROWALL_PYTHON_ROOT: runtimeRoot,
    ZEROWALL_PYTHON_EXECUTABLE: executable,
    PYTHONNOUSERSITE: '1',
    PATH: [executableDirectory, scriptsDirectory, baseEnv.PATH].filter(Boolean).join(';'),
  }
  delete env.PYTHONHOME
  delete env.PYTHONPATH
  return {
    cwd: executableDirectory,
    args: ['/D', '/K', 'title ZeroWall Science Python && cd /d "%ZEROWALL_PYTHON_ROOT%" && "%ZEROWALL_PYTHON_EXECUTABLE%"'],
    env,
  }
}
