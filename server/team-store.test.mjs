import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createTeamStore, emptyTeamData } from './team-store.mjs'

test('team store creates empty CrewFlow data when no file exists', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'crewflow-store-'))

  try {
    const store = createTeamStore({ dataDir: dir })
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
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('team store serializes partial writes and preserves existing fields', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'crewflow-store-'))

  try {
    const store = createTeamStore({ dataDir: dir })

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
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
