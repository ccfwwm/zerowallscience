import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { downloadArchive } from './python-archive.js'
import { checkPythonCancellation, operationSpawn as spawn } from './python-operation.js'
import { sanitizePythonTlsEnvironment } from './python-mirror.js'
import type { PythonDependencyManifest } from './python-dependency-manifest.js'

const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/gu, '-')
export function mayUseFallbackWheel(error: unknown): boolean {
  return !/CANCELLED|AbortError|aborted|SHA-256|signature|签名|校验失败|锁定信息.*不匹配/iu.test(String(error))
}
/** The signed document has already been verified by the caller. Revalidate
 * bytes and the actual wheel metadata before pip sees this resource. */
export async function prepareFallbackWheel(root: string, executable: string, manifest: PythonDependencyManifest, name: string, fetcher: typeof fetch = fetch) {
  checkPythonCancellation()
  const wheel = manifest.fallbackWheels?.find(item => normalize(item.name) === normalize(name))
  if (!wheel) throw new Error('PYTHON_FALLBACK_UNAVAILABLE: 没有匹配的签名 wheel：' + name)
  const path = join(root, 'downloads', 'fallback-wheels', wheel.sha256, wheel.filename)
  await downloadArchive({ url: wheel.url, size: wheel.size, sha256: wheel.sha256, path, fetcher: (url, options) => fetcher(url, { ...options, redirect: 'error' }) })
  const code = `import sys,zipfile,email.parser,json,re
from pip._vendor.packaging.tags import sys_tags,parse_tag
from pip._vendor.packaging.utils import parse_wheel_filename
path,name,version,tags=sys.argv[1:]; norm=lambda s:re.sub(r'[-_.]+','-',s).lower()
fn,fv,build,ft=parse_wheel_filename(path.replace('\\\\','/').split('/')[-1])
with zipfile.ZipFile(path) as z:
 if z.testzip() is not None: raise ValueError('wheel CRC mismatch')
 metadata=[n for n in z.namelist() if n.endswith('.dist-info/METADATA')]
 wheels=[n for n in z.namelist() if n.endswith('.dist-info/WHEEL')]
 if len(metadata)!=1 or len(wheels)!=1: raise ValueError('wheel metadata missing')
 m=email.parser.Parser().parsestr(z.read(metadata[0]).decode()); w=email.parser.Parser().parsestr(z.read(wheels[0]).decode())
 actual=set(t for item in w.get_all('Tag',[]) for t in parse_tag(item)); expected=set(t for item in json.loads(tags) for t in parse_tag(item))
 if norm(m['Name'])!=norm(name) or m['Version']!=version or norm(str(fn))!=norm(name) or str(fv)!=version: raise ValueError('wheel identity mismatch')
 if actual!=expected or actual!=set(ft) or not actual.intersection(sys_tags()): raise ValueError('wheel tags incompatible')
`
  await new Promise<void>((accept, reject) => {
    const child = spawn(executable, ['-I', '-B', '-c', code, path, wheel.name, wheel.version, JSON.stringify(wheel.tags)], { windowsHide: true, env: sanitizePythonTlsEnvironment(), stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''; child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000) })
    const timer = setTimeout(() => child.kill(), 30_000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? accept() : reject(new Error('PYTHON_FALLBACK_INVALID: ' + stderr)) })
  })
  checkPythonCancellation()
  return { name: wheel.name, version: wheel.version, url: pathToFileURL(path).href, hash: wheel.sha256, sourceArchiveSha256: wheel.sourceArchiveSha256 }
}
