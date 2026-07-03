import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createTeamStore } from './team-store.mjs'

const defaultPort = Number(process.env.CREWFLOW_PORT || 8787)
const defaultHost = process.env.CREWFLOW_HOST || '0.0.0.0'
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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

async function readRequestJson(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createCrewFlowServer({ store }) {
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
          dataFile: store.dataFile,
          updatedAt: data.updatedAt,
        })
        return
      }

      if (request.method === 'GET' && url.pathname === '/api/app-data') {
        sendJson(response, 200, await store.read())
        return
      }

      if (request.method === 'PUT' && url.pathname === '/api/app-data') {
        const payload = await readRequestJson(request)
        sendJson(response, 200, await store.write(payload))
        return
      }

      sendJson(response, 404, { ok: false, error: 'Not found' })
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : 'Server error' })
    }
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = createTeamStore({ dataDir: defaultDataDir })
  const server = createCrewFlowServer({ store })

  server.listen(defaultPort, defaultHost, () => {
    console.log(`CrewFlow Server listening on http://${defaultHost}:${defaultPort}`)
    console.log(`Data file: ${store.dataFile}`)
  })
}
