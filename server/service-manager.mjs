import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(serverDir, '..')
const serverScript = path.join(serverDir, 'crewflow-server.mjs')
const nodePath = process.execPath
const command = process.argv[2] || 'status'
const serviceLabel = 'local.crewflow.server'
const taskName = 'CrewFlow Server'
const port = process.env.CREWFLOW_PORT || '8787'
const host = process.env.CREWFLOW_HOST || '0.0.0.0'

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...options })
  if (result.status !== 0 && !options.allowFailure) process.exit(result.status ?? 1)
  return result
}

async function macInstall() {
  const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents')
  const logsDir = path.join(os.homedir(), 'Library', 'Logs', 'CrewFlow Server')
  const plistPath = path.join(launchAgentsDir, `${serviceLabel}.plist`)
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${serviceLabel}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${serverScript}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectRoot}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CREWFLOW_HOST</key>
    <string>${host}</string>
    <key>CREWFLOW_PORT</key>
    <string>${port}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(logsDir, 'server.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(logsDir, 'server-error.log')}</string>
</dict>
</plist>
`

  await mkdir(launchAgentsDir, { recursive: true })
  await mkdir(logsDir, { recursive: true })
  await writeFile(plistPath, plist, 'utf8')
  run('launchctl', ['bootout', `gui/${process.getuid()}`, plistPath], { allowFailure: true, stdio: 'ignore' })
  run('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath])
  run('launchctl', ['enable', `gui/${process.getuid()}/${serviceLabel}`], { allowFailure: true })
  console.log(`CrewFlow Server installed: ${plistPath}`)
}

function macStart() {
  run('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${serviceLabel}`])
}

function macStop() {
  run('launchctl', ['bootout', `gui/${process.getuid()}/${serviceLabel}`], { allowFailure: true })
}

function macStatus() {
  run('launchctl', ['print', `gui/${process.getuid()}/${serviceLabel}`], { allowFailure: true })
}

async function windowsInstall() {
  const logsDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'CrewFlow Server', 'logs')
  const scriptDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'CrewFlow Server')
  const cmdPath = path.join(scriptDir, 'start-crewflow-server.cmd')
  const commandLine = `"${nodePath}" "${serverScript}" >> "${path.join(logsDir, 'server.log')}" 2>> "${path.join(logsDir, 'server-error.log')}"`

  await mkdir(logsDir, { recursive: true })
  await mkdir(scriptDir, { recursive: true })
  await writeFile(
    cmdPath,
    `@echo off\r\nset CREWFLOW_HOST=${host}\r\nset CREWFLOW_PORT=${port}\r\ncd /d "${projectRoot}"\r\n${commandLine}\r\n`,
    'utf8',
  )
  run('schtasks', ['/Create', '/TN', taskName, '/TR', `"${cmdPath}"`, '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/F'])
  run('schtasks', ['/Run', '/TN', taskName], { allowFailure: true })
  console.log(`CrewFlow Server task installed: ${taskName}`)
}

function windowsStopProcess() {
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*crewflow-server.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { allowFailure: true })
}

function windowsStart() {
  run('schtasks', ['/Run', '/TN', taskName])
}

function windowsStop() {
  windowsStopProcess()
}

function windowsStatus() {
  run('schtasks', ['/Query', '/TN', taskName, '/V', '/FO', 'LIST'], { allowFailure: true })
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*crewflow-server.mjs*' } | Select-Object ProcessId,CommandLine`
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { allowFailure: true })
}

function windowsUninstall() {
  windowsStopProcess()
  run('schtasks', ['/Delete', '/TN', taskName, '/F'], { allowFailure: true })
}

async function main() {
  const platform = process.platform
  if (!['install', 'start', 'stop', 'restart', 'status', 'uninstall'].includes(command)) {
    console.error('Usage: node server/service-manager.mjs install|start|stop|restart|status|uninstall')
    process.exit(1)
  }

  if (platform === 'darwin') {
    if (command === 'install') await macInstall()
    if (command === 'start') macStart()
    if (command === 'stop') macStop()
    if (command === 'restart') {
      macStop()
      await macInstall()
    }
    if (command === 'status') macStatus()
    if (command === 'uninstall') macStop()
    return
  }

  if (platform === 'win32') {
    if (command === 'install') await windowsInstall()
    if (command === 'start') windowsStart()
    if (command === 'stop') windowsStop()
    if (command === 'restart') {
      windowsStop()
      windowsStart()
    }
    if (command === 'status') windowsStatus()
    if (command === 'uninstall') windowsUninstall()
    return
  }

  console.error(`Unsupported platform for service install: ${platform}`)
  process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
