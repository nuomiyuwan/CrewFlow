import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createCrewFlowServer, defaultServerDataDir } from './crewflow-server.mjs'
import { createTeamStore } from './team-store.mjs'

async function withServer(t, callback) {
  const dir = await mkdtemp(path.join(tmpdir(), 'crewflow-http-'))
  const store = createTeamStore({ dataDir: dir })
  const server = createCrewFlowServer({ store })

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
    assert.match(body.dataFile, /crewflow-team-data\.json$/)
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

test('default server data directory follows host platform conventions', () => {
  assert.equal(
    defaultServerDataDir({ platform: 'darwin', homeDir: '/Users/apple', env: {} }),
    '/Users/apple/Library/Application Support/CrewFlow Server',
  )
  assert.equal(
    defaultServerDataDir({ platform: 'win32', homeDir: 'C:\\Users\\apple', env: { APPDATA: 'C:\\Users\\apple\\AppData\\Roaming' } }),
    'C:\\Users\\apple\\AppData\\Roaming\\CrewFlow Server',
  )
})
