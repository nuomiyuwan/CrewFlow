import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(serverDir, '..')
const defaultServerScript = path.join(serverDir, 'crewflow-server.mjs')
const command = process.argv[2] || 'status'
const serviceLabel = 'local.crewflow.server'
const taskName = 'CrewFlow Server'
const port = process.env.CREWFLOW_PORT || '8787'
const host = process.env.CREWFLOW_HOST || '0.0.0.0'

export function serviceRuntime({
  appExecutablePath = process.env.CREWFLOW_APP_EXECUTABLE,
  nodePath = process.execPath,
  serverScript = defaultServerScript,
} = {}) {
  if (appExecutablePath) {
    return {
      mode: 'app',
      executable: appExecutablePath,
      args: ['--team-server'],
      processMatch: '*--team-server*',
    }
  }

  return {
    mode: 'node',
    executable: nodePath,
    args: [serverScript],
    processMatch: '*crewflow-server.mjs*',
  }
}

export function localTeamServerUrls({ interfaces = os.networkInterfaces(), port: serverPort = port } = {}) {
  const urls = []

  Object.values(interfaces).forEach((items = []) => {
    items.forEach((item) => {
      if (item.family !== 'IPv4' || item.internal || !item.address) return
      urls.push(`http://${item.address}:${serverPort}`)
    })
  })

  urls.push(`http://127.0.0.1:${serverPort}`)
  return Array.from(new Set(urls))
}

function commandWorkingDirectory(runtime) {
  return runtime.mode === 'app' ? path.dirname(runtime.executable) : projectRoot
}

function escapePlistValue(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function quoteWindowsArgument(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: options.stdio ?? 'inherit',
    shell: false,
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
  })

  if (result.status !== 0 && !options.allowFailure) {
    const stderr = result.stderr ? result.stderr.toString('utf8').trim() : ''
    const detail = stderr ? `: ${stderr}` : ''
    throw new Error(`${cmd} ${args.join(' ')} failed${detail}`)
  }

  return result
}

async function macInstall(options = {}) {
  const runtime = serviceRuntime(options)
  const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents')
  const logsDir = path.join(os.homedir(), 'Library', 'Logs', 'CrewFlow Server')
  const plistPath = path.join(launchAgentsDir, `${serviceLabel}.plist`)
  const programArguments = [runtime.executable, ...runtime.args]
    .map((item) => `    <string>${escapePlistValue(item)}</string>`)
    .join('\n')
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${serviceLabel}</string>
  <key>ProgramArguments</key>
  <array>
${programArguments}
  </array>
  <key>WorkingDirectory</key>
  <string>${escapePlistValue(commandWorkingDirectory(runtime))}</string>
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
  <string>${escapePlistValue(path.join(logsDir, 'server.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapePlistValue(path.join(logsDir, 'server-error.log'))}</string>
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

async function windowsInstall(options = {}) {
  const runtime = serviceRuntime(options)
  const logsDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'CrewFlow Server', 'logs')
  const scriptDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'CrewFlow Server')
  const cmdPath = path.join(scriptDir, 'start-crewflow-server.cmd')
  const commandLine = [
    quoteWindowsArgument(runtime.executable),
    ...runtime.args.map(quoteWindowsArgument),
    '>>',
    quoteWindowsArgument(path.join(logsDir, 'server.log')),
    '2>>',
    quoteWindowsArgument(path.join(logsDir, 'server-error.log')),
  ].join(' ')

  await mkdir(logsDir, { recursive: true })
  await mkdir(scriptDir, { recursive: true })
  await writeFile(
    cmdPath,
    `@echo off\r\nset CREWFLOW_HOST=${host}\r\nset CREWFLOW_PORT=${port}\r\ncd /d "${commandWorkingDirectory(runtime)}"\r\n${commandLine}\r\n`,
    'utf8',
  )
  run('schtasks', ['/Create', '/TN', taskName, '/TR', `"${cmdPath}"`, '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/F'])
  run('schtasks', ['/Run', '/TN', taskName], { allowFailure: true })
  console.log(`CrewFlow Server task installed: ${taskName}`)
}

function windowsStopProcess(options = {}) {
  const runtime = serviceRuntime(options)
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '${runtime.processMatch}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { allowFailure: true })
}

function windowsStart() {
  run('schtasks', ['/Run', '/TN', taskName])
}

function windowsStop(options = {}) {
  windowsStopProcess(options)
}

function windowsStatus(options = {}) {
  const runtime = serviceRuntime(options)
  run('schtasks', ['/Query', '/TN', taskName, '/V', '/FO', 'LIST'], { allowFailure: true })
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '${runtime.processMatch}' } | Select-Object ProcessId,CommandLine`
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { allowFailure: true })
}

function windowsUninstall(options = {}) {
  windowsStopProcess(options)
  run('schtasks', ['/Delete', '/TN', taskName, '/F'], { allowFailure: true })
}

export async function manageCrewFlowService(action, options = {}) {
  const platform = options.platform ?? process.platform
  if (!['install', 'start', 'stop', 'restart', 'status', 'uninstall'].includes(action)) {
    throw new Error('Usage: node server/service-manager.mjs install|start|stop|restart|status|uninstall')
  }

  if (platform === 'darwin') {
    if (action === 'install') await macInstall(options)
    if (action === 'start') macStart()
    if (action === 'stop') macStop()
    if (action === 'restart') {
      macStop()
      await macInstall(options)
    }
    if (action === 'status') macStatus()
    if (action === 'uninstall') macStop()
    return
  }

  if (platform === 'win32') {
    if (action === 'install') await windowsInstall(options)
    if (action === 'start') windowsStart()
    if (action === 'stop') windowsStop(options)
    if (action === 'restart') {
      windowsStop(options)
      windowsStart()
    }
    if (action === 'status') windowsStatus(options)
    if (action === 'uninstall') windowsUninstall(options)
    return
  }

  throw new Error(`Unsupported platform for service install: ${platform}`)
}

async function main() {
  await manageCrewFlowService(command)
}

if (typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
