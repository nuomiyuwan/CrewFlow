import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { StaleTeamDataError, createTeamStore } from './team-store.mjs'

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
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
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

export function createCrewFlowServer({ store, accessKey = defaultAccessKey } = {}) {
  return http.createServer(async (request, response) => {
    try {
      if (request.method === 'OPTIONS') {
        sendJson(response, 204, {})
        return
      }

      const url = new URL(request.url || '/', 'http://localhost')

      if (request.method === 'GET' && url.pathname === '/health') {
        const data = await store.read()
        sendJson(response, 200, {
          ok: true,
          name: 'CrewFlow Server',
          requiresKey: Boolean(accessKey),
          dataFile: store.dataFile,
          updatedAt: data.updatedAt,
          revision: data.revision,
        })
        return
      }

      if (request.method === 'GET' && url.pathname === '/api/app-data') {
        if (!hasValidAccessKey(request, url, accessKey)) {
          sendJson(response, 401, { ok: false, error: 'Invalid CrewFlow access key' })
          return
        }
        sendJson(response, 200, await store.read())
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
          if (error instanceof StaleTeamDataError) {
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

  server.listen(port, host, () => onReady({ server, store, host, port }))
  return { server, store }
}

if (typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startCrewFlowServer()
}
