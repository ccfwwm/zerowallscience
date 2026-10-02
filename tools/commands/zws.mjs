#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const packaged = existsSync(resolve(import.meta.dirname, '../app.asar/package.json'))
const root = packaged ? resolve(import.meta.dirname, '../app.asar') : resolve(import.meta.dirname, '../..')
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
const argv = process.argv.slice(2)
const dataOption = argv.indexOf('--user-data')
const override = dataOption < 0 ? process.env.ZEROWALL_USER_DATA_DIR : argv.splice(dataOption, 2)[1]
const existingRoaming = join(process.env.APPDATA || homedir(), 'zerowall-science')
const home = override ? resolve(override) : existsSync(existingRoaming) ? existingRoaming : join(process.env.LOCALAPPDATA || homedir(), 'zerowall-science')
const [group, command, ...args] = argv

const HELP = {
  usage: 'zws <command> [options]',
  commands: {
    version: '显示 ZeroWall Science 和 DSH 版本',
    doctor: '检查 Host、profile、插件兼容性和运行状态',
    update: '检查桌面更新（不会自动安装）',
    extensions: '扩展中心状态与 catalog 检查',
    plugin: 'list/add/remove/update/rollback/repair/enable/disable/check',
    skill: 'list/import/remove/update/rollback/enable/disable/check',
    mcp: 'list/add/remove/update/rollback/start/stop/restart/logs/check',
    env: 'list/set/delete/check（敏感值通过 stdin 提供）',
    python: 'status/install/update/rollback（按需管理 Python 环境）',
  },
  examples: [
    'zws plugin list',
    'zws plugin update <id>',
    'zws skill import <directory>',
    'zws mcp list',
    'zws extensions check',
  ],
}

function help(scope) {
  if (!scope || ['help', '--help', '-h'].includes(scope)) return HELP
  const descriptions = {
    plugin: 'zws plugin list|add|remove|update|rollback|repair|enable|disable|check <id>',
    skill: 'zws skill list|import|remove|update|rollback|enable|disable|check <id>',
    mcp: 'zws mcp list|add|remove|update|rollback|start|stop|restart|logs|check <id>',
    extensions: 'zws extensions status|check',
    env: 'zws env list|set|delete|check <name>',
    python: 'zws python status|install|update|rollback',
  }
  return { usage: descriptions[scope] ?? HELP.usage, command: scope, description: HELP.commands[scope] ?? '未知命令' }
}

async function invoke(operation, args = []) {
  const endpoint = JSON.parse(await readFile(join(home, 'command-endpoint.json'), 'utf8').catch(() => { throw new Error('请先启动 ZeroWall Science，或使用 --user-data 指定正在运行的 profile。') }))
  return new Promise((accept, reject) => {
    const socket = createConnection(endpoint.address)
    let response = ''
    socket.setTimeout(600_000, () => { socket.destroy(); reject(new Error('管理操作超时')) })
    socket.on('error', reject)
    socket.on('connect', () => socket.write(JSON.stringify({ token: endpoint.token, operation, args }) + '\n'))
    socket.on('data', chunk => { response += chunk; if (response.length > 4 * 1024 ** 2) { socket.destroy(); reject(new Error('响应超出限制')) } })
    socket.on('end', () => {
      try { const value = JSON.parse(response); if (!value.ok) throw new Error(value.error); accept(value.result) } catch (error) { reject(error) }
    })
  })
}

async function stdin() {
  if (process.stdin.isTTY) throw new Error('请通过标准输入提供数据，避免密钥写入命令历史。')
  let value = ''
  for await (const chunk of process.stdin) { value += chunk; if (value.length > 65536) throw new Error('输入超出限制') }
  return value.trimEnd()
}

async function run() {
  if (['help', '--help', '-h'].includes(group)) return help(command)
  if (['help', '--help', '-h'].includes(command)) return help(group)
  if (['version', '--version', '-v'].includes(group)) return { applicationVersion: version }
  if (group === 'doctor') {
    const status = await invoke('profile.doctor').then(profile => ({ host: 'ready', ...profile }), () => ({ host: 'unavailable' }))
    return { applicationVersion: version, profile: home, ...status }
  }
  if (group === 'update') return invoke('update')
  if (group === 'extensions') {
    if (command === 'status') return invoke('resource.catalog.status')
    if (command === 'check') return invoke('resource.catalog.status')
    throw new Error('用法：zws extensions status|check')
  }
  const catalogIndex = args.indexOf('--catalog')
  const catalog = catalogIndex >= 0 ? args.splice(catalogIndex, 2)[1] : undefined
  const aliases = { wechat: 'dsh-wechat', 'plugin-wechat': 'dsh-wechat', notification: '@dingyi222666/dsh-session-notification', science: '@zerowallscience/dsh-bundle-science' }
  const qualified = id => aliases[id] ?? (id?.startsWith('@') || id?.startsWith('dsh-') ? id : `@zerowallscience/${id?.startsWith('plugin-') ? id : `plugin-${id}`}`)
  if (group === 'plugin') {
    if (command === 'list') return invoke('resource.plugin.list')
    if (command === 'check') return invoke('resource.catalog.check', ['plugin', catalog])
    if (command === 'rollback') return args[0] ? invoke('resource.plugin.rollback', [qualified(args[0])]) : invoke('resource.rollback')
    if (command === 'update' && args[0]) return invoke('resource.plugin.update', [qualified(args[0]), catalog])
    if (command === 'update' && !args[0]) return invoke('resource.update', ['plugin', catalog])
    if (['enable', 'disable'].includes(command) && args[0]) return invoke(`resource.plugin.${command}`, [qualified(args[0])])
    if (command === 'add' && args[0] && !args[0].endsWith('.tgz') && !args[0].includes(':')) return invoke('resource.plugin', [qualified(args[0]), catalog])
    if ((catalog || command === 'update') && ['add', 'update'].includes(command) && args[0]) return invoke('resource.plugin', [qualified(args[0]), catalog])
    if (args[0] && !args[0].endsWith('.tgz') && !args[0].includes(':')) args[0] = qualified(args[0])
    const commands = { list: 'list', add: 'add', remove: 'remove', update: 'update', repair: 'install', enable: 'enable', disable: 'disable' }
    if (!Object.hasOwn(commands, command)) throw new Error('插件操作支持 list/add/remove/update/repair/enable/disable')
    return invoke('plugin.run', [commands[command], ...args])
  }
  if (group === 'python' && ['status', 'install', 'update', 'rollback'].includes(command)) return invoke(`python.${command}`, catalog ? [catalog] : [])
  if (group === 'env') {
    if (['list', 'check'].includes(command)) return invoke(`env.${command}`)
    if (command === 'set' && args[0]) return invoke('env.set', [args[0], await stdin()])
    if (command === 'delete' && args[0]) return invoke('env.delete', [args[0]])
  }
  if (group === 'skill') {
    if (command === 'check') return invoke('resource.catalog.check', ['skill', catalog])
    if (command === 'rollback' && args[0]) return invoke('resource.skill.rollback', [args[0]])
    if (command === 'update' && args[0] && !catalog) {
      // A directory is an explicit local Skill refresh. An id is a signed
      // catalog resource lookup; keep both forms compatible.
      return existsSync(resolve(args[0]))
        ? invoke('skill.update', [{ sourcePath: resolve(args[0]) }])
        : invoke('resource.skill.update', [args[0]])
    }
    if (command === 'update' && !args[0]) return invoke('resource.update', ['skill', catalog])
    if (catalog && command === 'update' && args[0]) return invoke('resource.import', ['skill', args[0], catalog])
    if (command === 'list') return invoke('skill.list')
    if (['import', 'update'].includes(command) && args[0]) return invoke(`skill.${command}`, [{ sourcePath: resolve(args[0]) }])
    if (['enable', 'disable'].includes(command) && args[0]) return invoke(`skill.${command}`, [args[0], command === 'enable'])
    if (command === 'remove' && args[0]) return invoke('skill.remove', [args[0]])
  }
  if (group === 'mcp') {
    if (command === 'check') return invoke('resource.catalog.check', ['mcp', catalog])
    if (command === 'rollback' && args[0]) return invoke('resource.mcp.rollback', [args[0]])
    if (command === 'add' && args[0]) return invoke('resource.import', ['mcp', args[0], catalog])
    if (command === 'list') return invoke('mcp.list')
    if (command === 'add') return invoke('mcp.add', [JSON.parse(await stdin())])
    if (['enable', 'disable', 'stop', 'start'].includes(command) && args[0]) return invoke(`mcp.${['enable', 'start'].includes(command) ? 'enable' : 'disable'}`, [{ id: args[0], changes: { enabled: ['enable', 'start'].includes(command) } }])
    if (command === 'update' && args[0] && !catalog) return invoke('resource.mcp.update', [args[0]])
    if (command === 'update' && !args[0]) return invoke('resource.update', ['mcp', catalog])
    if (catalog && command === 'update' && args[0]) return invoke('resource.import', ['mcp', args[0], catalog])
    if (['update', 'restart', 'remove'].includes(command) && args[0]) return invoke(`mcp.${command}`, [args[0]])
    if (command === 'logs') return invoke('mcp.logs', args)
  }
  throw new Error('用法：zws version|doctor|update；zws plugin|skill|mcp|env|python <操作>。')
}
try { console.log(JSON.stringify((await run()) ?? { ok: true }, null, 2)) } catch (error) { console.error(error.message); process.exitCode = 1 }
