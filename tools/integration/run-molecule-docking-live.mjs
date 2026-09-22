import { execFileSync,spawn } from 'node:child_process'
if(!process.argv.includes('--run'))throw new Error('Pass --run to execute the public receptor/ethanol live acceptance.')
// Keep the configured server credential only in memory and the test child environment.
const source='from pathlib import Path\nx=dict(line.split("=",1) for line in Path("/etc/rdatalinux-r-platform/platform.env").read_text().splitlines() if "=" in line and not line.startswith("#"))\nprint(x["R_PLATFORM_MCP_KEY"].strip("\\\"\'"))\n'
const token=execFileSync('ssh',['rdatalinux','python3','-'],{encoding:'utf8',input:source,windowsHide:true}).trim()
if(!token)throw new Error('Configured rmcp credential is unavailable.')
const command=process.platform==='win32'?'pnpm.cmd':'pnpm'
const child=spawn(command,['--filter','@zerowallscience/plugin-research','exec','vitest','run','--config','../../vitest.plugins.config.ts','test/molecule-docking-live.integration.spec.ts'],{shell:process.platform==='win32',stdio:'inherit',windowsHide:true,env:{...process.env,R_PLATFORM_MCP_AUTHORIZATION:`Bearer ${token}`,ZEROWALL_LIVE_DOCKING:'1'}})
child.on('exit',code=>{process.exitCode=code??1})
