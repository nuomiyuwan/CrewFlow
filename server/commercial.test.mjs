import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { createQuoteWorkbookBuffer } from '../electron/quote-export.cjs'
import { emptyCommercialRecord, makeQuote, newWorkLine, quoteLineTotal, validateWorkStatement, validateQuote } from '../src/commercial-model.ts'
import { createTeamStore } from './team-store.mjs'

test('work evidence preserves unknown quantities and quote snapshots separate cost from price', () => {
  const record = emptyCommercialRecord('p1')
  const line = newWorkLine('video', { id: 't1', projectId: 'p1', workType: '剪辑', title: '项目 剪辑', assignee: '制作人员', due: '2026-09-20' })
  record.statement.lines.push(line)
  assert.equal(line.quantity, null)
  assert.equal(line.start, '')
  assert.match(validateWorkStatement(record.statement), /数量待补充/)
  Object.assign(line, { quantity: 3.5, unit: '分钟', days: 4, cost: 976 })
  assert.equal(validateWorkStatement(record.statement), '')
  record.statement.status = 'confirmed'
  record.statement.revision = 2
  const quote = makeQuote({ id: 'p1', name: '项目', client: '客户' }, record.statement)
  assert.equal(quote.lines[0].price, null)
  assert.equal(quote.lines[0].cost, undefined)
  assert.match(validateQuote(quote), /单价待补充/)
  quote.lines[0].price = 3500
  assert.equal(quoteLineTotal(quote.lines[0]), 12250)
  record.statement.lines[0].quantity = 8
  assert.equal(quote.source.lines[0].quantity, 3.5)
  assert.equal(validateQuote(quote), '')
})

test('quote workbook calculates person-days and minutes, with category subtotals and no internal costs', async () => {
  const payload = {
    title: '制作报价单', customer: '测试客户', issuer: '测试单位', date: '2026-09-24',
    lines: [
      { category: '项目人员', name: '摄影师', price: 2000, quantity: 2, days: 2, unit: '人天', cost: 123456, note: '' },
      { category: '项目人员', name: '配音', price: 500, quantity: 3.5, days: 8, unit: '分钟', note: '' },
      { category: '后期制作', name: '包装', price: 220, quantity: 91, days: null, unit: '秒', note: '' },
      { category: '后期制作', name: '附赠', price: 0, quantity: 1, unit: '项', note: '' },
    ],
  }
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await createQuoteWorkbookBuffer(payload))
  const sheet = workbook.getWorksheet('报价单')
  assert.equal(sheet.getCell('H5').value.result, 8000)
  assert.equal(sheet.getCell('H6').value.result, 1750)
  assert.equal(sheet.getCell('H7').value.result, 9750)
  assert.equal(sheet.getCell('H8').value.result, 20020)
  assert.equal(sheet.getCell('H11').value.result, 29770)
  assert.equal(sheet.getCell('F6').value, '/')
  assert.ok(!JSON.stringify(sheet.getSheetValues()).includes('123456'))
  await assert.rejects(createQuoteWorkbookBuffer({ ...payload, lines: [{ ...payload.lines[0], days: null }] }), /天数/)
  await assert.rejects(createQuoteWorkbookBuffer({ ...payload, lines: [{ ...payload.lines[0], price: null }] }), /单价/)
})

test('team store persists commercial records and rejects concurrent changes to the same record', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'crewflow-commercial-'))
  let store
  try {
    store = createTeamStore({ dataDir: dir, autoBackup: false })
    const empty = await store.read()
    assert.deepEqual(empty.commercialRecords, [])
    const record = emptyCommercialRecord('p1')
    await store.write({ projects: [{ id: 'p1', name: '测试项目' }], commercialRecords: [record], workflowOptions: { commercialEnabled: true } })
    const saved = await store.read()
    assert.equal(saved.workflowOptions.commercialEnabled, true)
    assert.deepEqual(saved.commercialRecords, [record])
    await store.write({ tasks: [{ id: 't1', projectId: 'p1', title: '任务' }] })
    assert.deepEqual((await store.read()).commercialRecords, [record])
    store.close()
    store = createTeamStore({ dataDir: dir, autoBackup: false })
    assert.deepEqual((await store.read()).commercialRecords, [record])
    const baseline = await store.read()
    const next = { ...record, updatedAt: '2026-09-24T10:00:00.000Z' }
    await store.mutate([{ collection: 'commercialRecords', operation: 'upsert', key: 'p1', value: next }], { expectedRevision: baseline.revision })
    await assert.rejects(store.mutate([{ collection: 'commercialRecords', operation: 'upsert', key: 'p1', value: { ...record, updatedAt: 'other edit' } }], { expectedRevision: baseline.revision }), (error) => error.code === 'STALE_DATA')
    assert.deepEqual((await store.read()).commercialRecords, [next])
  } finally {
    store?.close()
    await rm(dir, { recursive: true, force: true })
  }
})
