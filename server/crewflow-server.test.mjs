import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createCrewFlowServer, defaultServerDataDir } from './crewflow-server.mjs'
import { createTeamStore } from './team-store.mjs'

async function withServer(t, callback) {
  const dir = await mkdtemp(path.join(tmpdir(), 'crewflow-http-'))
  const store = createTeamStore({ dataDir: dir, autoBackup: false })
  const server = createCrewFlowServer({ store })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  })

  const { port } = server.address()
  await callback(`http://127.0.0.1:${port}`)
}

async function withSecuredServer(t, callback) {
  const dir = await mkdtemp(path.join(tmpdir(), 'crewflow-http-secure-'))
  const store = createTeamStore({ dataDir: dir, autoBackup: false })
  const server = createCrewFlowServer({ store, accessKey: 'team-secret' })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  })

  const { port } = server.address()
  await callback(`http://127.0.0.1:${port}`)
}

test('server reports health and data file metadata', async (t) => {
  await withServer(t, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.name, 'CrewFlow Server')
    assert.match(body.dataFile, /crewflow-team\.db$/)
    assert.equal(body.storageEngine, 'sqlite')
    assert.equal(body.incrementalSync, true)
  })
})

test('server reads and merges app data', async (t) => {
  await withServer(t, async (baseUrl) => {
    const saveResponse = await fetch(`${baseUrl}/api/app-data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projects: [{ id: '001', name: 'Team Project' }] }),
    })
    const saved = await saveResponse.json()

    assert.equal(saveResponse.status, 200)
    assert.equal(saved.projects[0].name, 'Team Project')

    const readResponse = await fetch(`${baseUrl}/api/app-data`)
    const data = await readResponse.json()

    assert.equal(readResponse.status, 200)
    assert.equal(data.projects[0].name, 'Team Project')
    assert.equal(data.accounts[0].id, 'zk')
  })
})

test('server rejects app data access without the configured access key', async (t) => {
  await withSecuredServer(t, async (baseUrl) => {
    const readResponse = await fetch(`${baseUrl}/api/app-data`)
    assert.equal(readResponse.status, 401)

    const saveResponse = await fetch(`${baseUrl}/api/app-data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projects: [{ id: '001', name: 'Blocked Project' }] }),
    })
    assert.equal(saveResponse.status, 401)

    const changesResponse = await fetch(`${baseUrl}/api/app-data/changes?since=0`)
    assert.equal(changesResponse.status, 401)
  })
})

test('server accepts app data access with the configured access key', async (t) => {
  await withSecuredServer(t, async (baseUrl) => {
    const saveResponse = await fetch(`${baseUrl}/api/app-data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CrewFlow-Key': 'team-secret' },
      body: JSON.stringify({ projects: [{ id: '001', name: 'Secured Project' }] }),
    })
    const saved = await saveResponse.json()

    assert.equal(saveResponse.status, 200)
    assert.equal(saved.projects[0].name, 'Secured Project')

    const readResponse = await fetch(`${baseUrl}/api/app-data`, {
      headers: { 'X-CrewFlow-Key': 'team-secret' },
    })
    const data = await readResponse.json()

    assert.equal(readResponse.status, 200)
    assert.equal(data.projects[0].name, 'Secured Project')
  })
})

test('server rejects stale app data writes', async (t) => {
  await withServer(t, async (baseUrl) => {
    const firstResponse = await fetch(`${baseUrl}/api/app-data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projects: [{ id: '001', name: 'First Project' }] }),
    })
    const firstData = await firstResponse.json()

    assert.equal(firstResponse.status, 200)
    assert.equal(firstData.revision, 1)

    const staleResponse = await fetch(`${baseUrl}/api/app-data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 0,
        projects: [{ id: '001', name: 'Stale Project' }],
      }),
    })
    const staleData = await staleResponse.json()

    assert.equal(staleResponse.status, 409)
    assert.equal(staleData.code, 'STALE_DATA')
    assert.equal(staleData.current.revision, 1)
  })
})

test('server saves and returns granular team data changes', async (t) => {
  await withServer(t, async (baseUrl) => {
    const initialResponse = await fetch(`${baseUrl}/api/app-data`)
    const initialData = await initialResponse.json()
    const saveResponse = await fetch(`${baseUrl}/api/app-data/changes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: initialData.revision,
        version: initialData.version,
        mutations: [
          {
            collection: 'projects',
            operation: 'upsert',
            key: 'P-1',
            position: 0,
            value: { id: 'P-1', name: 'Incremental Project' },
          },
        ],
      }),
    })
    const saved = await saveResponse.json()

    assert.equal(saveResponse.status, 200)
    assert.equal(saved.revision, initialData.revision + 1)
    assert.equal(saved.changes.length, 1)
    assert.equal(saved.changes[0].key, 'P-1')

    const changesResponse = await fetch(`${baseUrl}/api/app-data/changes?since=${initialData.revision}`)
    const changes = await changesResponse.json()
    assert.equal(changesResponse.status, 200)
    assert.equal(changes.resetRequired, false)
    assert.equal(changes.changes[0].value.name, 'Incremental Project')

    const dataResponse = await fetch(`${baseUrl}/api/app-data`)
    const data = await dataResponse.json()
    assert.equal(data.projects[0].name, 'Incremental Project')
  })
})

test('default server data directory follows host platform conventions', () => {
  assert.equal(
    defaultServerDataDir({ platform: 'darwin', homeDir: '/Users/example', env: {} }),
    '/Users/example/Library/Application Support/CrewFlow Server',
  )
  assert.equal(
    defaultServerDataDir({ platform: 'win32', homeDir: 'C:\\Users\\apple', env: { APPDATA: 'C:\\Users\\apple\\AppData\\Roaming' } }),
    'C:\\Users\\apple\\AppData\\Roaming\\CrewFlow Server',
  )
})
