import { createHash } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { devNull, tmpdir } from 'node:os'
import { appendFile, copyFile, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { rootCertificates } from 'node:tls'
import { mirrorArgs, resolveMirror, sanitizePythonTlsEnvironment, type MirrorConfig } from './python-mirror.js'

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function run(executable: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; logPath?: string }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd: options.cwd, env: options.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''; let settled = false
    let logWrites = options.logPath ? writeFile(options.logPath, '') : Promise.resolve()
    const log = (chunk: Buffer) => { if (options.logPath) logWrites = logWrites.then(() => appendFile(options.logPath!, chunk)).catch(() => undefined) }
    const finish = async (error?: Error, result?: { stdout: string; stderr: string }) => {
      if (settled) return
      settled = true; clearTimeout(timer)
      await logWrites
      error ? reject(error) : accept(result!)
    }
    const timer = setTimeout(() => {
      const error = new Error('Python 源码构建超时；现有环境未切换。')
      if (process.platform === 'win32' && child.pid) {
        execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10_000 }, () => { child.kill(); void finish(error) })
      } else { child.kill(); void finish(error) }
    }, options.timeoutMs)
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-256_000); log(chunk) })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-64_000); log(chunk) })
    child.once('error', error => finish(error))
    child.once('exit', code => code === 0
      ? finish(undefined, { stdout, stderr })
      : finish(new Error((stderr || stdout || `Python 构建进程退出码 ${code}`).replace(/https?:\/\/[^\s]+/gu, '[package-url]').slice(-8000)))
    )
  })
}

async function copyBuildInterpreter(sourceExecutable: string, destination: string): Promise<string> {
  const sourceRoot = dirname(resolve(sourceExecutable))
  const destinationRoot = join(destination, 'interpreter')
  await mkdir(destinationRoot, { recursive: true })
  // Python's embeddable distribution is intentionally constrained by python312._pth.
  // pip creates temporary venv interpreters under its build tracker; those interpreters
  // then cannot resolve the base runtime's extension modules (notably _socket/_ssl).
  // Give only the disposable build runtime a conventional Python layout. Never alter
  // the managed runtime or the user's active interpreter.
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(exe|dll|pyd|zip)$/iu.test(entry.name)) continue
    await copyFile(join(sourceRoot, entry.name), join(destinationRoot, entry.name))
  }
  const executable = join(destinationRoot, basename(sourceExecutable))
  await stat(executable)
  const pythonZip = (await readdir(destinationRoot)).find(name => /^python\d+\.zip$/iu.test(name))
  if (!pythonZip) {
    // Also accept a conventional user-selected Windows Python installation.
    await cp(join(sourceRoot, 'Lib'), join(destinationRoot, 'Lib'), {
      recursive: true,
      filter: path => !['site-packages', '__pycache__'].includes(basename(path)),
    })
  }
  // Without an _pth file CPython uses its regular zip/Lib/DLL path discovery. The
  // embeddable distribution stores extension modules beside python.exe, so this
  // makes them visible to venv subprocesses without exposing application paths.
  await mkdir(join(destinationRoot, 'Lib'), { recursive: true })
  for (const directory of ['DLLs', 'include', 'libs']) {
    if (await stat(join(sourceRoot, directory)).then(entry => entry.isDirectory(), () => false)) {
      await cp(join(sourceRoot, directory), join(destinationRoot, directory), { recursive: true })
    }
  }
  return executable
}

async function inspectWheel(executable: string, sitePackages: string, wheelPath: string, env: NodeJS.ProcessEnv): Promise<{ name: string; version: string }> {
  const code = `import sys,zipfile,email.parser,json\nsys.path.insert(0,sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2]) as z:\n names=[n for n in z.namelist() if n.endswith('.dist-info/METADATA')]\n if len(names)!=1: raise ValueError('wheel must contain one METADATA')\n m=email.parser.Parser().parsestr(z.read(names[0]).decode('utf-8'))\n print(json.dumps({'name':m['Name'],'version':m['Version']}))`
  const result = await run(executable, ['-I', '-B', '-c', code, sitePackages, wheelPath], { cwd: dirname(wheelPath), env, timeoutMs: 30_000 })
  return JSON.parse(result.stdout.trim()) as { name: string; version: string }
}

/** Build one hash-locked sdist into a disposable output directory with pip's PEP 517 build isolation enabled. */
export async function buildPythonSourceWheel(options: {
  executable: string
  sitePackages: string
  archivePath: string
  archiveSha256: string
  outputDirectory: string
  mirror: MirrorConfig
}): Promise<{ wheelPath: string }> {
  if (!/^[a-f0-9]{64}$/u.test(options.archiveSha256)) throw new Error('源码归档 SHA-256 格式无效。')
  const archivePath = resolve(options.archivePath); const outputDirectory = resolve(options.outputDirectory)
  const archive = await readFile(archivePath)
  if (sha256(archive) !== options.archiveSha256) throw new Error('源码归档 SHA-256 校验失败，已拒绝运行构建脚本。')
  await mkdir(outputDirectory, { recursive: true })
  // Keep pip's nested build-env/overlay/site-packages paths short on Windows.
  // A plan's UUID + source-build UUID + wheel directory can otherwise exceed
  // MAX_PATH before a backend even starts. This is a fresh, owned scratch root;
  // only the checked wheel and durable log are copied back to the plan cache.
  const workDirectory = await mkdtemp(join(tmpdir(), 'zwpy-'))
  const output = join(workDirectory, 'dist'); await mkdir(output)
  const temporary = join(workDirectory, 'tmp'); await mkdir(temporary)
  const source = join(workDirectory, basename(archivePath))
  await writeFile(source, archive, { flag: 'wx' })
  const mirror = resolveMirror(options.mirror)
  const tlsEnv = sanitizePythonTlsEnvironment()
  const certificate = join(workDirectory, 'ca.pem')
  const configuredCA = tlsEnv.REQUESTS_CA_BUNDLE ?? tlsEnv.SSL_CERT_FILE ?? tlsEnv.PIP_CERT ?? tlsEnv.CURL_CA_BUNDLE
  await writeFile(certificate, configuredCA ? await readFile(configuredCA) : rootCertificates.join('\n'))
  const bootstrap = `import runpy,sys\nsys.path.insert(0,${JSON.stringify(resolve(options.sitePackages))})\nimport pip._vendor.certifi\npip._vendor.certifi.where=lambda: ${JSON.stringify(certificate)}\nsys.argv=['pip','--isolated','--disable-pip-version-check','--no-input','wheel','--verbose','--timeout','30','--retries','2','--cert',${JSON.stringify(certificate)},'--no-deps','--no-cache-dir','--wheel-dir',${JSON.stringify(output)},*${JSON.stringify(mirrorArgs(mirror))},${JSON.stringify(source)}]\nrunpy.run_module('pip',run_name='__main__')`
  const env: NodeJS.ProcessEnv = { ...sanitizePythonTlsEnvironment(tlsEnv, certificate), PYTHONNOUSERSITE: '1', PIP_CONFIG_FILE: devNull, PIP_DISABLE_PIP_VERSION_CHECK: '1', PIP_NO_INPUT: '1', TEMP: temporary, TMP: temporary, TMPDIR: temporary }
  for (const key of Object.keys(env)) {
    if (/^PYTHON/iu.test(key) && key !== 'PYTHONNOUSERSITE') delete env[key]
    if (/^PIP_/iu.test(key) && !['PIP_CERT', 'PIP_CONFIG_FILE', 'PIP_DISABLE_PIP_VERSION_CHECK', 'PIP_NO_INPUT'].includes(key)) delete env[key]
  }
  env.PIP_DEFAULT_TIMEOUT = '30'; env.PIP_RETRIES = '2'
  try {
    const buildPython = await copyBuildInterpreter(options.executable, workDirectory)
    await run(buildPython, ['-I', '-B', '-c', bootstrap], { cwd: workDirectory, env, timeoutMs: 30 * 60_000, logPath: join(outputDirectory, 'build.log') })
    const entries = await readdir(output)
    const wheels = entries.filter(name => extname(name).toLowerCase() === '.whl')
    if (wheels.length !== 1) throw new Error(`源码构建应生成一个 wheel，实际生成 ${wheels.length} 个。`)
    const wheelPath = join(output, wheels[0]!)
    const metadata = await inspectWheel(buildPython, options.sitePackages, wheelPath, env)
    if (!metadata.name || !metadata.version) throw new Error('源码构建产物缺少有效的包名或版本。')
    const wheelStat = await stat(wheelPath)
    if (!wheelStat.isFile() || wheelStat.size < 100) throw new Error('源码构建产物为空或无效。')
    // Keep the final wheel directly under the caller's confined directory, then
    // remove the disposable interpreter and build tracker before returning.
    const finalWheel = join(outputDirectory, wheels[0]!)
    await copyFile(wheelPath, finalWheel)
    await rm(workDirectory, { recursive: true, force: true })
    return { wheelPath: finalWheel }
  } catch (error) {
    await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}
