import http from 'node:http'
import dgram from 'node:dgram'
import { randomBytes } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  LibraryFileTooLargeError,
  createLibraryFileStore,
  maxLibraryFileBytes,
} from './library-file-store.mjs'
import { StaleTeamDataError, UnsafeTeamDataMutationError, createTeamStore } from './team-store.mjs'

const defaultPort = Number(process.env.CREWFLOW_PORT || 8787)
const defaultHost = process.env.CREWFLOW_HOST || '0.0.0.0'
const defaultAccessKey = process.env.CREWFLOW_ACCESS_KEY || ''
const defaultDiscoveryPort = Number(process.env.CREWFLOW_DISCOVERY_PORT || 8788)
export function defaultServerDataDir({
  platform = process.platform,
  homeDir = os.homedir(),
  env = process.env,
} = {}) {
  if (env.CREWFLOW_DATA_DIR) return env.CREWFLOW_DATA_DIR
  if (platform === 'win32') return path.win32.join(env.APPDATA || path.win32.join(homeDir, 'AppData', 'Roaming'), 'CrewFlow Server')
  if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support', 'CrewFlow Server')
  return path.join(homeDir, '.crewflow-server')
}

const defaultDataDir = defaultServerDataDir()

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-CrewFlow-Key, X-CrewFlow-File-Name, X-CrewFlow-Mime-Type',
    'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

function requestAccessKey(request, url) {
  return request.headers['x-crewflow-key'] || url.searchParams.get('key') || ''
}

function hasValidAccessKey(request, url, accessKey) {
  if (!accessKey) return true
  return requestAccessKey(request, url) === accessKey
}

async function readRequestJson(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function readRequestBytes(request, maxBytes = maxLibraryFileBytes) {
  const declaredLength = Number(request.headers['content-length']) || 0
  if (declaredLength > maxBytes) throw new LibraryFileTooLargeError()

  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) throw new LibraryFileTooLargeError()
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function requestHeaderText(request, name, maxLength) {
  const value = request.headers[name]
  return typeof value === 'string' ? decodeURIComponent(value).trim().slice(0, maxLength) : ''
}

function libraryFileIdFromPath(pathname) {
  const match = /^\/api\/library-files\/([A-Za-z0-9_-]{1,120})$/.exec(pathname)
  return match?.[1] ?? ''
}

function cleanPresenceText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function createCrewFlowServer({ store, accessKey = defaultAccessKey, presenceTtlMs = 25_000, libraryFilesDir = '' } = {}) {
  const presenceConnections = new Map()
  const pairingRequests = new Map()
  const libraryFileStore = createLibraryFileStore({
    directory: libraryFilesDir || path.join(store?.dataDir || path.dirname(store?.dataFile || defaultDataDir), 'library-files'),
  })

  const presenceSnapshot = () => {
    const now = Date.now()
    for (const [clientId, connection] of presenceConnections.entries()) {
      if (now - connection.lastSeenAt > presenceTtlMs) presenceConnections.delete(clientId)
    }

    const membersByAccount = new Map()
    for (const connection of presenceConnections.values()) {
      const current = membersByAccount.get(connection.accountId)
      if (current) {
        current.connections += 1
        current.lastSeenAt = Math.max(current.lastSeenAt, connection.lastSeenAt)
        if (connection.lastSeenAt >= current.lastSeenAt) {
          current.name = connection.name
          current.role = connection.role
        }
      } else {
        membersByAccount.set(connection.accountId, {
          accountId: connection.accountId,
          name: connection.name,
          role: connection.role,
          lastSeenAt: connection.lastSeenAt,
          connections: 1,
        })
      }
    }

    return {
      ok: true,
      members: [...membersByAccount.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
      updatedAt: now,
    }
  }

  const pairingSnapshot = () => {
    const now = Date.now()
    for (const [requestId, request] of pairingRequests.entries()) {
      if (request.expiresAt <= now) pairingRequests.delete(requestId)
    }
    return [...pairingRequests.values()]
      .filter((request) => request.status === 'pending')
      .map(({ requestToken: _requestToken, ...request }) => request)
      .sort((left, right) => left.createdAt - right.createdAt)
  }

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'OPTIONS') {
        sendJson(response, 204, {})
        return
      }

      const url = new URL(request.url || '/', 'http://localhost')

      const libraryFileId = libraryFileIdFromPath(url.pathname)
      if (libraryFileId) {
        if (!hasValidAccessKey(request, url, accessKey)) {
          sendJson(response, 401, { ok: false, error: 'Invalid CrewFlow access key' })
          return
        }

        if (request.method === 'PUT') {
          try {
            const data = await readRequestBytes(request)
            const metadata = await libraryFileStore.write(libraryFileId, data, {
              fileName: requestHeaderText(request, 'x-crewflow-file-name', 240),
              mimeType: requestHeaderText(request, 'x-crewflow-mime-type', 160),
            })
            sendJson(response, 200, { ok: true, ...metadata })
          } catch (error) {
            if (error instanceof LibraryFileTooLargeError) {
              sendJson(response, 413, { ok: false, error: '资料文件不能超过 200MB' })
              return
            }
            throw error
          }
          return
        }

        if (request.method === 'GET') {
          try {
            const { data, metadata } = await libraryFileStore.read(libraryFileId)
            response.writeHead(200, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, Content-Type',
              'Content-Type': metadata.mimeType || 'application/octet-stream',
              'Content-Length': data.byteLength,
              'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(metadata.fileName)}`,
            })
            response.end(data)
          } catch (error) {
            if (error?.code === 'ENOENT') {
              sendJson(response, 404, { ok: false, error: '资料文件不存在' })
              return
            }
            throw error
          }
          return
        }

        if (request.method === 'DELETE') {
          await libraryFileStore.remove(libraryFileId)
          sendJson(response, 200, { ok: true })
          return
        }
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        const storage = store.info ? await store.info() : await store.read()
        const serverAddress = server.address()
        sendJson(response, 200, {
          ok: true,
          name: 'CrewFlow Server',
          hostName: os.hostname(),
          port: typeof serverAddress === 'object' && serverAddress ? serverAddress.port : defaultPort,
          requiresKey: Boolean(accessKey),
          dataFile: storage.dataFile || store.dataFile,
          legacyDataFile: storage.legacyDataFile || store.legacyDataFile,
          backupDirectory: storage.backupDirectory || store.backupDirectory,
          migrationBackup: storage.migrationBackup || store.migrationBackup,
          storageEngine: storage.storageEngine || store.storageEngine || 'json',
          schemaVersion: storage.schemaVersion || 0,
          incrementalSync: Boolean(store.supportsIncrementalSync),
          migrationError: storage.migrationError || store.migrationError || '',
          updatedAt: storage.updatedAt,
          revision: storage.revision,
        })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/pairing/requests') {
        const body = await readRequestJson(request)
        const clientId = cleanPresenceText(body.clientId, 120)
        const clientName = cleanPresenceText(body.clientName, 120)
        const requestToken = cleanPresenceText(body.requestToken, 160)
        if (!clientId || !clientName || requestToken.length < 20) {
          sendJson(response, 400, { ok: false, error: '连接申请信息不完整' })
          return
        }

        const now = Date.now()
        pairingSnapshot()
        if (pairingRequests.size >= 50) {
          const oldestRequest = [...pairingRequests.values()].sort((left, right) => left.createdAt - right.createdAt)[0]
          if (oldestRequest) pairingRequests.delete(oldestRequest.id)
        }
        for (const [requestId, item] of pairingRequests.entries()) {
          if (item.clientId === clientId) pairingRequests.delete(requestId)
        }
        const requestId = randomBytes(16).toString('hex')
        const pairingRequest = {
          id: requestId,
          clientId,
          clientName,
          requestToken,
          status: 'pending',
          createdAt: now,
          expiresAt: now + 2 * 60 * 1000,
        }
        pairingRequests.set(requestId, pairingRequest)
        sendJson(response, 202, { ok: true, requestId, status: pairingRequest.status, expiresAt: pairingRequest.expiresAt })
        return
      }

      if (request.method === 'GET' && url.pathname === '/api/pairing/requests') {
        if (!hasValidAccessKey(request, url, accessKey)) {
          sendJson(response, 401, { ok: false, error: 'Invalid CrewFlow access key' })
          return
        }
        sendJson(response, 200, { ok: true, requests: pairingSnapshot(), updatedAt: Date.now() })
        return
      }

      const pairingDecisionMatch = /^\/api\/pairing\/requests\/([a-f0-9]{32})\/(approve|reject)$/.exec(url.pathname)
      if (request.method === 'POST' && pairingDecisionMatch) {
        if (!hasValidAccessKey(request, url, accessKey)) {
          sendJson(response, 401, { ok: false, error: 'Invalid CrewFlow access key' })
          return
        }
        pairingSnapshot()
        const pairingRequest = pairingRequests.get(pairingDecisionMatch[1])
        if (!pairingRequest) {
          sendJson(response, 404, { ok: false, error: '连接申请已失效' })
          return
        }
        pairingRequest.status = pairingDecisionMatch[2] === 'approve' ? 'approved' : 'rejected'
        pairingRequest.expiresAt = Date.now() + 60 * 1000
        sendJson(response, 200, { ok: true, status: pairingRequest.status })
        return
      }

      const pairingStatusMatch = /^\/api\/pairing\/status\/([a-f0-9]{32})$/.exec(url.pathname)
      if (request.method === 'GET' && pairingStatusMatch) {
        pairingSnapshot()
        const pairingRequest = pairingRequests.get(pairingStatusMatch[1])
        const requestToken = cleanPresenceText(url.searchParams.get('token'), 160)
        if (!pairingRequest || !requestToken || requestToken !== pairingRequest.requestToken) {
          sendJson(response, 404, { ok: false, error: '连接申请不存在' })
          return
        }
        const serverAddress = server.address()
        const payload = {
          ok: true,
          status: pairingRequest.status,
          hostName: os.hostname(),
          port: typeof serverAddress === 'object' && serverAddress ? serverAddress.port : defaultPort,
        }
        sendJson(response, 200, pairingRequest.status === 'approved' ? { ...payload, accessKey } : payload)
        return
      }

      if (url.pathname === '/api/presence') {
        if (!hasValidAccessKey(request, url, accessKey)) {
          sendJson(response, 401, { ok: false, error: 'Invalid CrewFlow access key' })
          return
        }

        if (request.method === 'GET') {
          sendJson(response, 200, presenceSnapshot())
          return
        }

        if (request.method === 'PUT') {
          const payload = await readRequestJson(request)
          const clientId = cleanPresenceText(payload.clientId, 120)
          const accountId = cleanPresenceText(payload.accountId, 120)
          if (!clientId || !accountId) {
            sendJson(response, 400, { ok: false, error: 'clientId and accountId are required' })
            return
          }

          presenceConnections.set(clientId, {
            accountId,
            name: cleanPresenceText(payload.name, 80) || accountId,
            role: cleanPresenceText(payload.role, 32) || 'member',
            lastSeenAt: Date.now(),
          })
          sendJson(response, 200, presenceSnapshot())
          return
        }

        if (request.method === 'DELETE') {
          const payload = await readRequestJson(request)
          const clientId = cleanPresenceText(payload.clientId, 120)
          if (clientId) presenceConnections.delete(clientId)
          sendJson(response, 200, presenceSnapshot())
          return
        }
      }

      if (request.method === 'GET' && url.pathname === '/api/app-data') {
        if (!hasValidAccessKey(request, url, accessKey)) {
          sendJson(response, 401, { ok: false, error: 'Invalid CrewFlow access key' })
          return
        }
        sendJson(response, 200, await store.read())
        return
      }

      if (request.method === 'GET' && url.pathname === '/api/app-data/changes') {
        if (!hasValidAccessKey(request, url, accessKey)) {
          sendJson(response, 401, { ok: false, error: 'Invalid CrewFlow access key' })
          return
        }
        if (!store.supportsIncrementalSync || !store.changesSince) {
          sendJson(response, 404, { ok: false, error: 'Incremental sync is not available' })
          return
        }
        const sinceRevision = Number(url.searchParams.get('since'))
        sendJson(response, 200, store.changesSince(sinceRevision))
        return
      }

      if (request.method === 'PUT' && url.pathname === '/api/app-data/changes') {
        if (!hasValidAccessKey(request, url, accessKey)) {
          sendJson(response, 401, { ok: false, error: 'Invalid CrewFlow access key' })
          return
        }
        if (!store.supportsIncrementalSync || !store.mutate) {
          sendJson(response, 404, { ok: false, error: 'Incremental sync is not available' })
          return
        }
        const payload = await readRequestJson(request)
        try {
          sendJson(
            response,
            200,
            await store.mutate(Array.isArray(payload.mutations) ? payload.mutations : [], {
              expectedRevision: payload.baseRevision,
              version: payload.version,
            }),
          )
        } catch (error) {
          if (error instanceof StaleTeamDataError || error instanceof UnsafeTeamDataMutationError) {
            sendJson(response, 409, {
              ok: false,
              code: error.code,
              error: error.message,
              expectedRevision: error.expectedRevision,
              current: error.currentData,
            })
            return
          }
          throw error
        }
        return
      }

      if (request.method === 'PUT' && url.pathname === '/api/app-data') {
        if (!hasValidAccessKey(request, url, accessKey)) {
          sendJson(response, 401, { ok: false, error: 'Invalid CrewFlow access key' })
          return
        }
        const payload = await readRequestJson(request)
        const { baseRevision, ...partialData } = payload
        try {
          sendJson(response, 200, await store.write(partialData, { expectedRevision: baseRevision }))
        } catch (error) {
          if (error instanceof StaleTeamDataError || error instanceof UnsafeTeamDataMutationError) {
            sendJson(response, 409, {
              ok: false,
              code: error.code,
              error: error.message,
              expectedRevision: error.expectedRevision,
              current: error.currentData,
            })
            return
          }
          throw error
        }
        return
      }

      sendJson(response, 404, { ok: false, error: 'Not found' })
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : 'Server error' })
    }
  })

  server.on('close', () => {
    presenceConnections.clear()
    store.close?.()
  })
  return server
}

export function startCrewFlowServer({
  dataDir = defaultDataDir,
  host = defaultHost,
  port = defaultPort,
  accessKey = defaultAccessKey,
  onReady = ({ store }) => {
    console.log(`CrewFlow Server listening on http://${host}:${port}`)
    console.log(`Data file: ${store.dataFile}`)
  },
} = {}) {
  const store = createTeamStore({ dataDir })
  const server = createCrewFlowServer({ store, accessKey })
  const shutdown = () => {
    server.close(() => process.exit(0))
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  server.once('close', () => {
    process.removeListener('SIGINT', shutdown)
    process.removeListener('SIGTERM', shutdown)
  })

  let discoverySocket = null
  const closeDiscoverySocket = () => {
    if (!discoverySocket) return
    try {
      discoverySocket.close()
    } catch {
      discoverySocket = null
      return
    }
    discoverySocket = null
  }
  server.once('close', closeDiscoverySocket)
  server.listen(port, host, () => {
    const serverAddress = server.address()
    const servicePort = typeof serverAddress === 'object' && serverAddress ? serverAddress.port : Number(port)
    discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    discoverySocket.on('message', (message, remote) => {
      try {
        const payload = JSON.parse(message.toString('utf8'))
        if (payload.type !== 'crewflow-discover' || !payload.nonce) return
        const reply = Buffer.from(JSON.stringify({
          type: 'crewflow-host',
          version: 1,
          nonce: String(payload.nonce).slice(0, 80),
          name: 'CrewFlow Server',
          hostName: os.hostname(),
          servicePort,
        }))
        discoverySocket.send(reply, remote.port, remote.address, () => undefined)
      } catch {
        return
      }
    })
    discoverySocket.once('error', closeDiscoverySocket)
    discoverySocket.bind(defaultDiscoveryPort, '0.0.0.0')
    onReady({ server, store, host, port: servicePort })
  })
  return { server, store }
}

if (typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startCrewFlowServer()
}
