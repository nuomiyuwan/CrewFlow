import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import dgram from 'node:dgram'
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
const discoveryPort = Number(process.env.CREWFLOW_DISCOVERY_PORT || 8788)

function defaultServiceDataDir({
  platform = process.platform,
  homeDir = os.homedir(),
  env = process.env,
} = {}) {
  if (env.CREWFLOW_DATA_DIR) return env.CREWFLOW_DATA_DIR
  if (platform === 'win32') return path.win32.join(env.APPDATA || path.win32.join(homeDir, 'AppData', 'Roaming'), 'CrewFlow Server')
  if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support', 'CrewFlow Server')
  return path.join(homeDir, '.crewflow-server')
}

function normalizeAccessKey(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function serviceAccessKeyPath(options = {}) {
  return path.join(defaultServiceDataDir(options), 'access-key.txt')
}

export function serviceRuntimeMetadataPath(options = {}) {
  return path.join(defaultServiceDataDir(options), 'service-runtime.json')
}

export function serviceStatePath(options = {}) {
  return path.join(defaultServiceDataDir(options), 'service-state.json')
}

export async function readServiceRuntimeMetadata(options = {}) {
  try {
    const value = JSON.parse(await readFile(serviceRuntimeMetadataPath(options), 'utf8'))
    if (!value || typeof value !== 'object') return null
    return {
      executable: typeof value.executable === 'string' ? value.executable : '',
      appVersion: typeof value.appVersion === 'string' ? value.appVersion : '',
      platform: typeof value.platform === 'string' ? value.platform : '',
      mode: typeof value.mode === 'string' ? value.mode : '',
      installedAt: typeof value.installedAt === 'string' ? value.installedAt : '',
    }
  } catch {
    return null
  }
}

export async function writeServiceRuntimeMetadata(runtime, options = {}) {
  const metadataPath = serviceRuntimeMetadataPath(options)
  await mkdir(path.dirname(metadataPath), { recursive: true })
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        executable: runtime.executable,
        appVersion: typeof options.appVersion === 'string' ? options.appVersion : '',
        platform: options.platform ?? process.platform,
        mode: typeof runtime.mode === 'string' ? runtime.mode : '',
        installedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

export async function readServiceState(options = {}) {
  try {
    const value = JSON.parse(await readFile(serviceStatePath(options), 'utf8'))
    if (!value || typeof value !== 'object') return null
    return {
      enabled: value.enabled === true,
      hostMode: value.hostMode === 'app' ? 'app' : '',
      legacyCleanupComplete: value.legacyCleanupComplete === true,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    }
  } catch {
    return null
  }
}

export async function writeServiceState(patch = {}, options = {}) {
  const statePath = serviceStatePath(options)
  const temporaryPath = `${statePath}.${process.pid}.tmp`
  const current = await readServiceState(options)
  const next = {
    enabled: patch.enabled ?? current?.enabled ?? false,
    hostMode: patch.hostMode ?? current?.hostMode ?? '',
    legacyCleanupComplete: patch.legacyCleanupComplete ?? current?.legacyCleanupComplete ?? false,
    updatedAt: new Date().toISOString(),
  }
  await mkdir(path.dirname(statePath), { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, statePath)
  return next
}

export async function readOrCreateAccessKey(options = {}) {
  const providedKey = normalizeAccessKey(options.accessKey)
  if (providedKey) return providedKey

  const explicitKey = normalizeAccessKey((options.env ?? process.env).CREWFLOW_ACCESS_KEY)
  if (explicitKey) return explicitKey

  const keyPath = serviceAccessKeyPath(options)
  try {
    const savedKey = normalizeAccessKey(await readFile(keyPath, 'utf8'))
    if (savedKey) return savedKey
  } catch {
    // Create the key below when the file does not exist or cannot be read.
  }

  const accessKey = randomBytes(24).toString('base64url')
  await mkdir(path.dirname(keyPath), { recursive: true })
  await writeFile(keyPath, `${accessKey}\n`, 'utf8')
  return accessKey
}

export function serviceRuntime({
  appExecutablePath = process.env.CREWFLOW_APP_EXECUTABLE,
  nodePath = process.execPath,
  serverScript = defaultServerScript,
} = {}) {
  if (appExecutablePath) {
    return {
      mode: 'app',
      executable: appExecutablePath,
      args: [serverScript],
      env: { ELECTRON_RUN_AS_NODE: '1' },
      processMatch: '*crewflow-server.mjs*',
    }
  }

  return {
    mode: 'node',
    executable: nodePath,
    args: [serverScript],
    env: {},
    processMatch: '*crewflow-server.mjs*',
  }
}

function ipv4Parts(address) {
  const parts = String(address).split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return parts
}

function isPrivateLanIPv4(address) {
  const parts = ipv4Parts(address)
  if (!parts) return false
  const [first, second] = parts
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
}

function isCarrierGradeNatIPv4(address) {
  const parts = ipv4Parts(address)
  if (!parts) return false
  const [first, second] = parts
  return first === 100 && second >= 64 && second <= 127
}

function isLinkLocalIPv4(address) {
  const parts = ipv4Parts(address)
  if (!parts) return false
  return parts[0] === 169 && parts[1] === 254
}

function networkAdapterGroup(interfaceName, address) {
  const name = String(interfaceName).toLowerCase()

  if (/^(en|eth|wlan|wi-fi|wifi|ethernet)/.test(name)) return 0
  if (/^(utun|tun|tap|ppp|ipsec|wg|tailscale|zt|zerotier)/.test(name) || isCarrierGradeNatIPv4(address)) return 2
  if (/^(vmnet|vboxnet|docker|bridge|br-|awdl|llw)/.test(name)) return 3
  if (isPrivateLanIPv4(address)) return 1
  return 4
}

function describeNetworkAdapter(interfaceName, address) {
  const group = networkAdapterGroup(interfaceName, address)
  if (group === 0 || group === 1) return '局域网网卡'
  if (group === 2 || group === 3) return 'VPN/虚拟网卡'
  return '其他网卡'
}

function networkAdapterPriority(interfaceName, address, index) {
  const group = networkAdapterGroup(interfaceName, address)
  let priority = group * 1000 + index

  if (isLinkLocalIPv4(address)) priority += 300
  if (isPrivateLanIPv4(address)) priority -= 80
  if (String(address).startsWith('192.168.')) priority -= 20
  if (/^(en0|eth0|wlan0)$/i.test(interfaceName)) priority -= 10

  return priority
}

export function localTeamServerCandidates({ interfaces = os.networkInterfaces(), port: serverPort = port } = {}) {
  const candidates = []

  Object.entries(interfaces).forEach(([interfaceName, items = []]) => {
    items.forEach((item, index) => {
      if (item.family !== 'IPv4' || item.internal || !item.address) return
      candidates.push({
        url: `http://${item.address}:${serverPort}`,
        address: item.address,
        interfaceName,
        kind: describeNetworkAdapter(interfaceName, item.address),
        priority: networkAdapterPriority(interfaceName, item.address, index),
      })
    })
  })

  candidates.sort((first, second) => {
    if (first.priority !== second.priority) return first.priority - second.priority
    if (first.interfaceName !== second.interfaceName) return first.interfaceName.localeCompare(second.interfaceName)
    return first.address.localeCompare(second.address)
  })

  candidates.push({
    url: `http://127.0.0.1:${serverPort}`,
    address: '127.0.0.1',
    interfaceName: 'localhost',
    kind: '本机测试',
    priority: 9999,
  })

  const seenUrls = new Set()
  return candidates.filter((candidate) => {
    if (seenUrls.has(candidate.url)) return false
    seenUrls.add(candidate.url)
    return true
  })
}

export function localTeamStableUrl({ hostname = os.hostname(), port: serverPort = port } = {}) {
  const cleanHostname = String(hostname || '').trim().replace(/\.$/, '')
  if (!cleanHostname || !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(cleanHostname)) return ''
  const stableHostname = cleanHostname.includes('.') ? cleanHostname : `${cleanHostname}.local`
  return `http://${stableHostname}:${serverPort}`
}

function ipv4BroadcastAddress(address, netmask) {
  const addressParts = ipv4Parts(address)
  const netmaskParts = ipv4Parts(netmask)
  if (!addressParts || !netmaskParts) return ''
  return addressParts.map((part, index) => (part & netmaskParts[index]) | (255 ^ netmaskParts[index])).join('.')
}

export function localTeamDiscoveryTargets(interfaces = os.networkInterfaces()) {
  const targets = new Set(['255.255.255.255'])
  Object.entries(interfaces).forEach(([interfaceName, items = []]) => {
    items.forEach((item) => {
      if (item.family !== 'IPv4' || item.internal || !item.address || networkAdapterGroup(interfaceName, item.address) > 1) return
      const broadcast = ipv4BroadcastAddress(item.address, item.netmask)
      if (broadcast) targets.add(broadcast)
    })
  })
  return [...targets]
}

function isAddressOnLocalDiscoveryNetwork(address, interfaces) {
  const remoteParts = ipv4Parts(address)
  if (!remoteParts) return false
  return Object.entries(interfaces).some(([interfaceName, items = []]) => items.some((item) => {
    if (item.family !== 'IPv4' || item.internal || !item.address || networkAdapterGroup(interfaceName, item.address) > 1) return false
    const localParts = ipv4Parts(item.address)
    const netmaskParts = ipv4Parts(item.netmask)
    if (!localParts || !netmaskParts) return false
    return remoteParts.every((part, index) => (part & netmaskParts[index]) === (localParts[index] & netmaskParts[index]))
  }))
}

export function discoverLocalTeamServers({
  interfaces = os.networkInterfaces(),
  port: targetPort = discoveryPort,
  timeoutMs = 1800,
} = {}) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4')
    const nonce = randomBytes(12).toString('hex')
    const hosts = new Map()
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        return resolve([...hosts.values()])
      }
      resolve([...hosts.values()])
    }
    const timer = setTimeout(finish, Math.max(500, Math.min(Number(timeoutMs) || 1800, 4000)))

    socket.on('message', (message, remote) => {
      try {
        const payload = JSON.parse(message.toString('utf8'))
        const servicePort = Number(payload.servicePort)
        if (payload.type !== 'crewflow-host' || payload.nonce !== nonce || !Number.isInteger(servicePort) || servicePort <= 0 || servicePort > 65535 || !isAddressOnLocalDiscoveryNetwork(remote.address, interfaces)) return
        const serverUrl = `http://${remote.address}:${servicePort}`
        hosts.set(serverUrl, {
          serverUrl,
          stableUrl: localTeamStableUrl({ hostname: payload.hostName, port: servicePort }),
          hostName: String(payload.hostName || remote.address).slice(0, 120),
          name: String(payload.name || 'CrewFlow Server').slice(0, 120),
        })
      } catch {
        return
      }
    })
    socket.once('error', finish)
    socket.bind(0, '0.0.0.0', () => {
      socket.setBroadcast(true)
      const message = Buffer.from(JSON.stringify({ type: 'crewflow-discover', version: 1, nonce }))
      localTeamDiscoveryTargets(interfaces).forEach((target) => socket.send(message, targetPort, target, () => undefined))
    })
  })
}

export function localTeamServerUrls(options = {}) {
  return localTeamServerCandidates(options).map((candidate) => candidate.url)
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
  const accessKey = await readOrCreateAccessKey(options)
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
    <key>CREWFLOW_ACCESS_KEY</key>
    <string>${escapePlistValue(accessKey)}</string>
${Object.entries(runtime.env)
  .map(
    ([key, value]) => `    <key>${escapePlistValue(key)}</key>
    <string>${escapePlistValue(value)}</string>`,
  )
  .join('\n')}
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
  await writeServiceRuntimeMetadata(runtime, options)
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

export function hasLegacyWindowsService(options = {}) {
  if ((options.platform ?? process.platform) !== 'win32') return false
  const query = run('schtasks', ['/Query', '/TN', taskName], { allowFailure: true, stdio: 'ignore' })
  if (query.error) throw query.error
  return query.status === 0
}

export async function cleanupLegacyWindowsService(options = {}) {
  if ((options.platform ?? process.platform) !== 'win32') return false
  if (hasLegacyWindowsService(options)) {
    run('schtasks', ['/End', '/TN', taskName], { allowFailure: true, stdio: 'ignore' })
    const deletion = run('schtasks', ['/Delete', '/TN', taskName, '/F'], { allowFailure: true, stdio: 'ignore' })
    if (deletion.error || deletion.status !== 0) throw deletion.error || new Error('旧团队服务任务删除失败')
  }
  await rm(path.join(defaultServiceDataDir(options), 'start-crewflow-server.cmd'), { force: true })
  return true
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
    if (action === 'stop' || action === 'uninstall') await cleanupLegacyWindowsService(options)
    if (action === 'uninstall') {
      await writeServiceState({ enabled: false, hostMode: 'app', legacyCleanupComplete: true }, options)
    }
    if (action === 'status') {
      const state = await readServiceState(options)
      console.log(state?.enabled ? 'CrewFlow App 托管服务已启用' : 'CrewFlow App 托管服务未启用')
    }
    if (action === 'install' || action === 'start' || action === 'restart') {
      throw new Error('请在 CrewFlow App 中开启团队服务')
    }
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
