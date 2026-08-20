import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { StaleTeamDataError, UnsafeTeamDataMutationError, createTeamStore } from './team-store.mjs'

const defaultPort = Number(process.env.CREWFLOW_PORT || 8787)
const defaultHost = process.env.CREWFLOW_HOST || '0.0.0.0'
const defaultAccessKey = process.env.CREWFLOW_ACCESS_KEY || ''
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
    'Access-Control-Allow-Headers': 'Content-Type, X-CrewFlow-Key',
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

function cleanPresenceText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function createCrewFlowServer({ store, accessKey = defaultAccessKey, presenceTtlMs = 25_000 } = {}) {
  const presenceConnections = new Map()

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

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'OPTIONS') {
        sendJson(response, 204, {})
        return
      }

      const url = new URL(request.url || '/', 'http://localhost')

      if (request.method === 'GET' && url.pathname === '/health') {
        const storage = store.info ? await store.info() : await store.read()
        sendJson(response, 200, {
          ok: true,
          name: 'CrewFlow Server',
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

  server.listen(port, host, () => onReady({ server, store, host, port }))
  return { server, store }
}

if (typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startCrewFlowServer()
}
