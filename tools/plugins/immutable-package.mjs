import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, readFile, writeFile, lstat, mkdir, link, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { list } from 'tar'
import ts from 'typescript'

function normalizedJavaScript(bytes, file) {
  const source = ts.createSourceFile(file, bytes.toString('utf8').replaceAll('\r\n', '\n'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  assert.equal(source.parseDiagnostics.length, 0, `Invalid bundled JavaScript: ${file}`)
  const result = ts.transform(source, [context => {
    const visit = node => {
      // CSS compiler dictionaries contain only unique string keys and string
      // values. Their property order is nondeterministic across native builds.
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && node.name.text.endsWith('_module_css_default') && ts.isObjectLiteralExpression(node.initializer)) {
        const props = node.initializer.properties
        const key = prop => ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined
        if (props.every(prop => ts.isPropertyAssignment(prop) && key(prop) && ts.isStringLiteral(prop.initializer))
          && new Set(props.map(key)).size === props.length) {
          return context.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type,
            context.factory.updateObjectLiteralExpression(node.initializer, [...props].sort((a, b) => key(a).localeCompare(key(b)))))
        }
      }
      return ts.visitEachChild(node, visit, context)
    }
    return node => ts.visitNode(node, visit)
  }])
  try { return ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(result.transformed[0]) }
  finally { result.dispose() }
}

export async function packageFiles(path) {
  const files = new Map()
  await list({ file: path, onReadEntry(entry) {
    if (entry.type === 'Directory') return entry.resume()
    assert.equal(entry.type, 'File', 'Plugin archives must contain physical regular files')
    assert(!files.has(entry.path), `Duplicate archive entry: ${entry.path}`)
    const parts = []
    files.set(entry.path, undefined)
    entry.on('data', bytes => parts.push(bytes))
    entry.on('end', () => files.set(entry.path, Buffer.concat(parts)))
  } })
  return files
}

/** Same ID and version retain the first archive; meaningful changes need a bump. */
export async function verifyImmutablePackage(candidate, baseline) {
  const [before, after] = await Promise.all([packageFiles(baseline), packageFiles(candidate)])
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'Same-version plugin file set changed; bump the component version')
  const normalizedFiles = []
  for (const [file, original] of before) {
    const next = after.get(file)
    if (original.equals(next)) continue
    if (file.endsWith('.tsbuildinfo') || file.endsWith('.map')) {
      normalizedFiles.push(file)
      continue
    }
    if (/\.(?:md|txt|json|ya?ml)$/u.test(file)
      && original.toString('utf8').replaceAll('\r\n', '\n') === next.toString('utf8').replaceAll('\r\n', '\n')) {
      normalizedFiles.push(file)
      continue
    }
    assert(/\.(?:cjs|mjs|js)$/u.test(file), `Same-version plugin content changed: ${file}; bump the component version`)
    assert.equal(normalizedJavaScript(next, file), normalizedJavaScript(original, file),
      `Same-version plugin executable content changed: ${file}; bump the component version`)
    normalizedFiles.push(file)
  }
  const bytes = await readFile(baseline)
  return { baseline, preserved: true, normalizedFiles, sha256: createHash('sha256').update(bytes).digest('hex') }
}

export async function preserveImmutablePackage(candidate, baseline) {
  const receipt = await verifyImmutablePackage(candidate, baseline)
  await copyFile(baseline, candidate)
  return receipt
}

/** Validate before publishing; never replace an existing component archive. */
export async function commitImmutablePackage(candidate, destination, baseline) {
  const receipt = baseline ? await verifyImmutablePackage(candidate, baseline) : {}
  const source = baseline ?? candidate
  const bytes = await readFile(source)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const verifyExisting = async () => {
    const info = await lstat(destination)
    assert(info.isFile() && !info.isSymbolicLink(), `Immutable plugin destination is not a physical file: ${destination}`)
    assert.equal(createHash('sha256').update(await readFile(destination)).digest('hex'), sha256,
      `Immutable plugin destination already contains different bytes: ${destination}; investigate and bump the component version`)
  }
  try {
    await verifyExisting()
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await mkdir(dirname(destination), { recursive: true })
    const pending = join(dirname(destination), `.pending-${randomUUID()}.tgz`)
    try {
      await writeFile(pending, bytes, { flag: 'wx' })
      // A hard link creates the final name atomically and fails if it exists.
      // The pending file shares the destination filesystem even with external
      // history/cache roots, so concurrent publication cannot overwrite bytes.
      try { await link(pending, destination) } catch (error) { if (error.code !== 'EEXIST') throw error }
      await verifyExisting()
    } finally { await unlink(pending).catch(error => { if (error.code !== 'ENOENT') throw error }) }
  }
  return { ...receipt, path: destination, size: bytes.length, sha256 }
}
