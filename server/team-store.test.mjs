import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createTeamStore, emptyTeamData } from './team-store.mjs'

test('team store creates empty CrewFlow data when no file exists', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'crewflow-store-'))

  try {
    const store = createTeamStore({ dataDir: dir, autoBackup: false })
    const data = await store.read()

    assert.deepEqual(data.projects, [])
    assert.deepEqual(data.tasks, [])
    assert.deepEqual(data.calendarItems, [])
    assert.deepEqual(data.financeRecords, [])
    assert.deepEqual(data.financeLedger, {})
    assert.deepEqual(data.staffMembers, [])
    assert.equal(data.accounts[0].id, 'zk')
    assert.ok(data.workflowOptions.taskWorkTypes.includes('剪辑'))
    assert.ok(data.workflowOptions.nodeStatuses.includes('已完成'))
    assert.ok(data.workflowOptions.workflowStages.includes('成片交付'))
    assert.ok(data.workflowOptions.staffTags.includes('项目负责人'))
    assert.deepEqual(data.workflowOptions.projectTypes, [])
    assert.deepEqual(data.workflowOptions.customerGroups, {})
    assert.equal(store.storageEngine, 'sqlite')
    assert.match(store.dataFile, /crewflow-team\.db$/)
    store.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('team store serializes partial writes and preserves existing fields', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'crewflow-store-'))

  try {
    const store = createTeamStore({ dataDir: dir, autoBackup: false })

    await Promise.all([
      store.write({ projects: [{ id: '001', name: 'Project A' }] }),
      store.write({ tasks: [{ id: 'task-1', projectId: '001', title: 'Task A' }] }),
      store.write({
        workflowOptions: {
          projectTypes: ['企业服务'],
          customerGroups: {
            华北: ['样例客户'],
          },
        },
      }),
    ])

    const data = await store.read()

    assert.equal(data.projects.length, 1)
    assert.equal(data.projects[0].name, 'Project A')
    assert.equal(data.tasks.length, 1)
    assert.equal(data.tasks[0].title, 'Task A')
    assert.deepEqual(data.accounts, emptyTeamData().accounts)
    assert.deepEqual(data.workflowOptions.projectTypes, ['企业服务'])
    assert.deepEqual(data.workflowOptions.customerGroups, { 华北: ['样例客户'] })
    assert.match(data.updatedAt, /^\d{4}-\d{2}-\d{2}T/)
    store.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('team store migrates legacy JSON into SQLite and preserves a source backup', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'crewflow-store-migration-'))
  const legacyFile = path.join(dir, 'crewflow-team-data.json')
  const legacyData = {
    ...emptyTeamData(),
    revision: 42,
    projects: [{ id: 'P-1', name: 'Migration Project' }],
    tasks: [{ id: 'T-1', projectId: 'P-1', title: 'Migration Task' }],
    calendarItems: [{ id: 'C-1', projectId: 'P-1', day: 22, time: '7月22日', title: '交付', type: '交付', owner: '负责人' }],
    financeRecords: [{ projectId: 'P-1', contractAmount: 100 }],
    financeLedger: { 'P-1': { payments: [], invoices: [], outsourcing: [], followUps: [] } },
    staffMembers: [{ id: 'S-1', name: '成员' }],
    accounts: [{ id: 'account-1', password: 'secret', role: 'member', userName: '成员', label: '成员', title: '' }],
    holidayItems: [{ id: 'H-1', date: '2026-07-22', name: '测试', type: '休' }],
  }
  const legacyJson = JSON.stringify(legacyData, null, 2)

  try {
    await writeFile(legacyFile, legacyJson, 'utf8')
    const store = createTeamStore({ dataDir: dir, autoBackup: false })
    const migrated = await store.read()
    const info = store.info()

    assert.equal(store.storageEngine, 'sqlite')
    assert.equal(migrated.revision, 42)
    assert.equal(migrated.projects[0].name, 'Migration Project')
    assert.equal(migrated.tasks[0].title, 'Migration Task')
    assert.equal(migrated.financeLedger['P-1'].payments.length, 0)
    assert.equal(await readFile(legacyFile, 'utf8'), legacyJson)
    assert.match(info.migrationBackup, /crewflow-team-data-before-sqlite-.*\.json$/)
    assert.equal(await readFile(info.migrationBackup, 'utf8'), legacyJson)
    store.close()

    const reopenedStore = createTeamStore({ dataDir: dir, autoBackup: false })
    const reopened = await reopenedStore.read()
    assert.equal(reopened.projects[0].name, 'Migration Project')
    assert.equal(reopened.revision, 42)
    reopenedStore.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('team store records granular changes and creates a daily database backup', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'crewflow-store-changes-'))

  try {
    const store = createTeamStore({ dataDir: dir })
    const seeded = await store.write({
      projects: [{ id: 'P-1', name: 'Project A' }],
      tasks: [{ id: 'T-1', projectId: 'P-1', title: 'Task A', status: '未开始' }],
    })
    const response = await store.mutate(
      [
        {
          collection: 'tasks',
          operation: 'upsert',
          key: 'T-1',
          value: { id: 'T-1', projectId: 'P-1', title: 'Task A', status: '制作中' },
        },
      ],
      { expectedRevision: seeded.revision, version: seeded.version },
    )
    const changes = store.changesSince(seeded.revision)
    const data = await store.read()

    assert.equal(response.revision, seeded.revision + 1)
    assert.equal(changes.resetRequired, false)
    assert.equal(changes.changes.length, 1)
    assert.equal(changes.changes[0].collection, 'tasks')
    assert.equal(changes.changes[0].key, 'T-1')
    assert.equal(data.tasks[0].status, '制作中')
    assert.ok((await readdir(store.backupDirectory)).some((fileName) => /^crewflow-team-\d{4}-\d{2}-\d{2}\.db$/.test(fileName)))

    await assert.rejects(
      store.mutate([{ collection: 'projects', operation: 'delete', key: 'P-1' }], { expectedRevision: seeded.revision }),
      (error) => error?.code === 'STALE_DATA',
    )
    store.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('team store rejects a request that clears an entire non-empty collection', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'crewflow-store-safety-'))

  try {
    const store = createTeamStore({ dataDir: dir, autoBackup: false })
    const seeded = await store.write({
      projects: [
        { id: 'P-1', name: 'Project A' },
        { id: 'P-2', name: 'Project B' },
      ],
    })

    await assert.rejects(
      store.write({ projects: [] }, { expectedRevision: seeded.revision }),
      (error) => error?.code === 'UNSAFE_DATA_CHANGE',
    )

    const data = await store.read()
    assert.deepEqual(data.projects.map((project) => project.id), ['P-1', 'P-2'])
    assert.equal(data.revision, seeded.revision)
    store.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('team store keeps using valid legacy JSON when SQLite migration cannot be verified', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'crewflow-store-fallback-'))
  const legacyFile = path.join(dir, 'crewflow-team-data.json')
  const legacyData = {
    ...emptyTeamData(),
    projects: [
      { id: 'duplicate', name: 'First Copy' },
      { id: 'duplicate', name: 'Second Copy' },
    ],
  }

  try {
    await writeFile(legacyFile, JSON.stringify(legacyData, null, 2), 'utf8')
    const store = createTeamStore({ dataDir: dir, autoBackup: false })
    const data = await store.read()
    const info = await store.info()

    assert.equal(store.storageEngine, 'json')
    assert.equal(data.projects.length, 2)
    assert.match(info.migrationError, /Duplicate projects key/)
    assert.equal((await readdir(dir)).includes('crewflow-team.db'), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
