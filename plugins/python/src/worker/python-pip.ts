import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { rootCertificates } from 'node:tls'

/**
 * Shared pip invocation for every managed-Python subprocess in this app.
 *
 * The released runtime archive deliberately ships no PEM files, so the pip
 * vendored inside it has no usable CA bundle. Both the install path and the
 * environment diagnostics must therefore point pip and `requests` at a bundle
 * this process writes from Node's own trusted roots — otherwise a healthy
 * environment reports as a certificate failure. Keeping the bootstrap in one
 * place is what stops the two paths from drifting apart again.
 */
let caFile: Promise<string> | undefined

/** A PEM bundle of Node's trusted roots, written once per desktop process. */
export function publicCAFile(): Promise<string> {
  return caFile ??= (async () => {
    const path = join(tmpdir(), `zerowall-public-ca-${process.pid}-${randomUUID()}.pem`)
    await writeFile(path, rootCertificates.join('\n'))
    return path
  })()
}

/**
 * pip argv plus the `-c` bootstrap that runs it. `certificateFile` is handed to
 * pip's vendored certifi because `pip install` resolves the public index over
 * its own vendored TLS stack, which reads that value rather than the
 * environment.
 */
export function pipInvocation(args: string[], paths: string[], certificateFile: string): { argv: string[]; bootstrap: string } {
  const reportIndex = args.indexOf('--report')
  // `--report` was chosen to be a stable plan artifact path; the pip log belongs
  // beside it so a failed resolution stays diagnosable.
  const diagnostic = reportIndex >= 0 && args[reportIndex + 1] ? ['--log', `${args[reportIndex + 1]}.log`] : []
  const argv = ['pip', '--isolated', '--disable-pip-version-check', '--no-input', '--timeout', '120', '--retries', '8', '--resume-retries', '8', ...diagnostic, ...args]
  // The embeddable interpreter ignores PYTHONPATH: insert validated snapshot paths explicitly.
  const bootstrap = `import sys,runpy\nsys.path[:0]=${JSON.stringify(paths)}\nimport pip._vendor.certifi\npip._vendor.certifi.where=lambda: ${JSON.stringify(certificateFile)}\nsys.argv=${JSON.stringify(argv)}\nrunpy.run_module('pip',run_name='__main__')`
  return { argv, bootstrap }
}
