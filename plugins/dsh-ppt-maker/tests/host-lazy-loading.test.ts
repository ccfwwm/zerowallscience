import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const heavy = /^(?:@office-kit\/(?:pptx|pptx-preview)(?:\/|$)|@deepseek-ai\/libreoffice-kit(?:\/|$)|fontkit$|subset-font$)/u

/** Inspect actual shipped JavaScript, including generated shared chunks. */
function closure(entries: string[], includeDynamic = false) {
  const files = new Set<string>(), external = new Set<string>()
  const queue = entries.map(entry => resolve(root, entry))
  while (queue.length) {
    const file = queue.pop()!
    if (files.has(file)) continue
    assert(existsSync(file), `Missing runtime chunk: ${file}`)
    files.add(file)
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const specifiers: string[] = []
    const visit = (node: ts.Node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text)
      } else if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const required = ts.isIdentifier(node.expression) && /^(?:require|__require)$/u.test(node.expression.text)
        if (required || (includeDynamic && node.expression.kind === ts.SyntaxKind.ImportKeyword)) specifiers.push(node.arguments[0].text)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) {
        const target = resolve(dirname(file), specifier)
        const rel = relative(root, target)
        assert(!rel.startsWith('..') && !isAbsolute(rel), `Runtime import escapes package: ${specifier}`)
        queue.push(target)
      } else external.add(specifier)
    }
  }
  return { files, external }
}

describe('published Host implementation boundary', () => {
  it('keeps heavy Office modules outside the complete startup static import closure', () => {
    const entries = ['plugin/index.mjs', 'plugin/host/routes.mjs', 'plugin/host/store.mjs']
    const eager = closure(entries)
    expect([...eager.external].filter(specifier => heavy.test(specifier))).toEqual([])
    const complete = closure(entries, true)
    expect(complete.files.size).toBeGreaterThan(eager.files.size)
    for (const dependency of ['@office-kit/pptx', '@office-kit/pptx-preview', '@deepseek-ai/libreoffice-kit']) {
      expect(complete.external.has(dependency), `The lazy ${dependency} implementation must remain packaged`).toBe(true)
    }
    for (const file of complete.files) {
      if (file.endsWith('.js')) expect(dirname(file)).toBe(resolve(root, 'lib'))
    }
    const chunkName = /^chunk-[A-Z0-9]+\.js$/u
    expect(readdirSync(resolve(root, 'lib')).filter(name => chunkName.test(name)).sort()).toEqual(
      [...complete.files].map(file => basename(file)).filter(name => chunkName.test(name)).sort()
    )
  })

  it('opens projects without Office imports, then loads real chunks for tool and panel exports', async () => {
    // Use native Node to exercise the built entry/chunks, not Vite source
    // transforms. Deny the actual imports so a static-closure regression fails
    // even if it arrives through an indirect resolver or startup callback.
    const source = `
      import assert from 'node:assert/strict';
      import { registerHooks } from 'node:module';
      import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
      import { Readable } from 'node:stream';
      import { tmpdir } from 'node:os';
      import path from 'node:path';
      import { pathToFileURL } from 'node:url';
      const cwd = await mkdtemp(path.join(tmpdir(), 'ppt-lazy-built-'));
      const runtime = path.join(cwd, 'package');
      await Promise.all(['lib', 'plugin', 'skills', 'docs', 'package.json'].map(entry =>
        cp(path.join(${JSON.stringify(root)}, entry), path.join(runtime, entry), { recursive: true, dereference: true })));
      const manifest = JSON.parse(await readFile(path.join(runtime, 'package.json'), 'utf8'));
      for (const dependency of Object.keys(manifest.dependencies)) {
        const target = path.join(runtime, 'node_modules', dependency);
        await mkdir(path.dirname(target), { recursive: true });
        await symlink(await realpath(path.join(${JSON.stringify(root)}, 'node_modules', dependency)), target,
          process.platform === 'win32' ? 'junction' : 'dir');
      }
      process.env.DSH_HOME = path.join(cwd, '.host');
      const denied = ${heavy.toString()};
      const guard = registerHooks({ resolve(specifier, context, next) {
        assert(!denied.test(specifier), 'Office loaded during lightweight work: ' + specifier);
        return next(specifier, context);
      }});
      const warnings = [], events = new Map(), tools = new Map(), disposers = [];
      try {
        const plugin = await import(pathToFileURL(path.join(runtime, 'lib/index.js')).href);
        assert.equal(plugin.PACKAGE_ROOT, runtime);
        let handler;
        plugin.apply({
          tools: { register(def) { tools.set(def.name, def); return () => tools.delete(def.name); } },
          sessions: { get: () => ({ header: { cwd } }) },
          skills: { register(def) { assert(def.content.includes('ppt')); return () => {}; } },
          webServer: { register(spec) { handler = spec.handler; return () => {}; } },
          on(event, callback) { events.set(event, callback); return () => events.delete(event); },
          effect(fn) { const off = fn(); if (off) disposers.push(off); },
          logger: { warn: message => warnings.push(message) }
        });
        assert.equal(tools.size, 0);
        events.get('tools/result')({ name: 'skill', arguments: { name: 'ppt-maker' } }, { isError: false });
        assert.deepEqual([...tools.keys()].sort(), ${JSON.stringify(['ppt_create', 'ppt_themes', 'ppt_edit', 'ppt_undo', 'ppt_redo', 'ppt_render', 'ppt_export', 'ppt_check', 'ppt_import', 'ppt_open', 'ppt_patch'].sort())});
        for (const tool of tools.values()) {
          assert.equal(tool.parameters.type, 'object');
          assert.equal(typeof tool.execute, 'function');
        }
        const exec = { agent: { session: { id: 'built-startup' } } };
        const result = await tools.get('ppt_create').execute({ dir: 'deck', title: 'Lazy Office' }, exec);
        assert.equal(result.ok, true);
        assert.equal(typeof handler, 'function');
        const store = await import(pathToFileURL(path.join(runtime, 'plugin/host/store.mjs')).href);
        assert.equal(store.pendingOpenRequests('built-startup').length, 1);
        assert.deepEqual(warnings, []);
        guard.deregister();
        assert.equal((await tools.get('ppt_edit').execute({ dir: 'deck', ops: [{ op: 'add_page',
          page: 'pages/01.page', content: { elements: [] } }] }, exec)).ok, true);
        const exported = await tools.get('ppt_export').execute({ dir: 'deck', out: 'tool.pptx', skipCheck: true }, exec);
        assert.equal(exported.ok, true, JSON.stringify(exported));
        assert.equal((await readFile(path.join(cwd, 'tool.pptx'))).subarray(0, 2).toString(), 'PK');
        const req = Readable.from([Buffer.from(JSON.stringify({ sessionId: 'built-startup', key: store.activeKey('built-startup') }))]);
        Object.assign(req, { method: 'POST', url: '/ppt-maker/api/export', headers: { host: 'localhost', 'content-type': 'application/json' } });
        let status, bytes;
        await handler(req, { writeHead(code) { status = code; }, end(body) { bytes = body; } });
        assert.equal(status, 200, String(bytes));
        assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), 'PK');
      } finally {
        for (const off of disposers.reverse()) off();
        await rm(cwd, { recursive: true, force: true });
      }
    `
    await expect(promisify(execFile)(process.execPath, ['--input-type=module', '--eval', source], { cwd: root, timeout: 20000 })).resolves.toMatchObject({ stderr: '' })
  })
})
