import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

const execute = promisify(execFile)

it('loads physical profile plugins and shared core without consulting historical offline archives', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-fixed-resolution-'))
  try {
    const home = join(root, 'harness'), profile = join(home, 'profiles/web'), runtime = join(root, 'runtime')
    const supply = join(home, 'resources/offline', 'a'.repeat(64), 'profile-runtime.asar')
    async function file(path: string, content: string) { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, content) }
    async function pkg(base: string, id: string, source: string) {
      await file(join(base, 'node_modules', id, 'package.json'), JSON.stringify({ name: id, version: '1.0.0', type: 'module', exports: './index.js' }))
      await file(join(base, 'node_modules', id, 'index.js'), source)
    }
    await file(join(profile, 'package.json'), JSON.stringify({ zerowall: { profileLayout: 3, offlineGeneration: 'a'.repeat(64) } }))
    await file(join(runtime, 'package.json'), '{}')
    await pkg(profile, 'fixture-plugin', 'import { value as nested } from "fixture-private"; import { value as core } from "@deepseek-ai/fixture-core"; import { value as shared } from "fixture-shared"; export const value = [nested, core, shared];')
    await pkg(join(profile, 'node_modules/fixture-plugin'), 'fixture-private', 'export const value = "private-instance";')
    await pkg(runtime, '@deepseek-ai/fixture-core', 'export const value = "current-core";')
    await pkg(join(home, 'profiles'), '@deepseek-ai/fixture-core', 'throw new Error("historical parent core loaded");')
    await file(join(profile, 'node_modules/.zerowall-dependencies/package.json'), '{}')
    await pkg(join(profile, 'node_modules/.zerowall-dependencies'), 'fixture-shared', 'export const value = "fixed-shared";')
    await pkg(supply, 'offline-only-trap', 'export const value = "must-not-load";')
    const script = 'import { value } from "fixture-plugin"; import { createRequire } from "node:module"; const require=createRequire(import.meta.url); let legacy=false; try { await import("offline-only-trap"); legacy=true; } catch(error) { if(error.code!=="ERR_MODULE_NOT_FOUND") throw error; } console.log(JSON.stringify({value,legacy,cjs:require.resolve("fixture-plugin"),cjsValue:require("fixture-plugin").value}));'
    const entry = join(root, 'probe.mjs'); await file(entry, script)
    async function boot() {
      const result = await execute(process.execPath, ['--import', pathToFileURL(resolve('build/runtime-esm-register.mjs')).href, entry], {
        env: { ...process.env, DSH_HOME: home, ZEROWALL_PROFILE_ANCHOR: pathToFileURL(join(profile, 'package.json')).href, ZEROWALL_RUNTIME_ANCHOR: pathToFileURL(join(runtime, 'package.json')).href, NODE_PATH: '' }, windowsHide: true,
      })
      return JSON.parse(result.stdout.trim())
    }
    const expected = { value: ['private-instance', 'current-core', 'fixed-shared'], legacy: false, cjs: join(profile, 'node_modules/fixture-plugin/index.js'), cjsValue: ['private-instance', 'current-core', 'fixed-shared'] }
    expect(await boot()).toEqual(expected)
    await rename(join(home, 'resources/offline'), join(home, 'resources/offline-retained'))
    expect(await boot()).toEqual(expected)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 15_000)
