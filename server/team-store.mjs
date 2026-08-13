import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { backup as backupDatabase, DatabaseSync } from 'node:sqlite'

const databaseSchemaVersion = '1'
const singletonKey = '__value__'
const retainedChangeRevisions = 20_000
const retainedDailyBackups = 14

export const arrayTeamDataCollections = [
  'projects',
  'tasks',
  'calendarItems',
  'financeRecords',
  'staffMembers',
  'accounts',
  'holidayItems',
]

export const mapTeamDataCollections = ['financeLedger']
export const singletonTeamDataCollections = ['workflowOptions']
export const teamDataCollections = [
  ...arrayTeamDataCollections,
  ...mapTeamDataCollections,
  ...singletonTeamDataCollections,
]

const arrayCollectionSet = new Set(arrayTeamDataCollections)
const mapCollectionSet = new Set(mapTeamDataCollections)
const singletonCollectionSet = new Set(singletonTeamDataCollections)
const collectionSet = new Set(teamDataCollections)

export function emptyTeamData() {
  return {
    version: 'project-flow-v1',
    revision: 0,
    projects: [],
    tasks: [],
    calendarItems: [],
    financeRecords: [],
    financeLedger: {},
    staffMembers: [],
    accounts: [
      {
        id: 'zk',
        password: '123456',
        role: 'controller',
        userName: '',
        label: '总控',
        title: '',
      },
    ],
    holidayItems: [],
    workflowOptions: {
      projectTypes: [],
      customerGroups: {},
      customerFieldLabels: {
        primary: '客户省份',
        secondary: '客户单位',
      },
      taskWorkTypes: ['策划', '文案', '拍摄', '剪辑', '后期', '包装', '设计', 'AI', '外包', '行政', '配音', '配乐', '三维', '版权素材', '调色'],
      nodeStatuses: ['未开始', '进行中', '等甲方反馈', '等内部确认', '需修改', '已确认', '已完成', '暂停'],
      staffTags: [
        '管理员',
        '技术总监',
        '导演',
        '全盘负责人',
        '项目负责人',
        '项目经理',
        '策划',
        '文案',
        '拍摄',
        '剪辑',
        '后期',
        '特效包装',
        '包装',
        '平面设计',
        '设计',
        '财务',
        '行政',
        '助理',
        '配音',
        '配乐',
        '三维',
        '版权素材',
        '调色',
      ],
      workflowStages: [
        '需求对接',
        '方案/脚本',
        '拍摄计划',
        '拍摄执行',
        '素材整理',
        '粗剪',
        '精剪',
        '包装/调色',
        '内部审核',
        '甲方审核',
        '修改执行',
        '终版确认',
        '成片交付',
        '归档完成',
      ],
    },
    updatedAt: new Date().toISOString(),
  }
}

export class StaleTeamDataError extends Error {
  constructor({ expectedRevision, currentData }) {
    super('Team data has changed. Reload before saving again.')
    this.name = 'StaleTeamDataError'
    this.code = 'STALE_DATA'
    this.expectedRevision = expectedRevision
    this.currentData = currentData
  }
}

export class UnsafeTeamDataMutationError extends Error {
  constructor({ collection, currentData }) {
    super(`Refusing to delete every ${collection} record in one request.`)
    this.name = 'UnsafeTeamDataMutationError'
    this.code = 'UNSAFE_DATA_CHANGE'
    this.collection = collection
    this.currentData = currentData
  }
}

export function normalizeTeamData(data) {
  const fallback = emptyTeamData()
  const workflowOptions = data?.workflowOptions && typeof data.workflowOptions === 'object' ? data.workflowOptions : {}

  return {
    ...fallback,
    ...data,
    projects: Array.isArray(data?.projects) ? data.projects : fallback.projects,
    tasks: Array.isArray(data?.tasks) ? data.tasks : fallback.tasks,
    calendarItems: Array.isArray(data?.calendarItems) ? data.calendarItems : fallback.calendarItems,
    financeRecords: Array.isArray(data?.financeRecords) ? data.financeRecords : fallback.financeRecords,
    financeLedger: data?.financeLedger && typeof data.financeLedger === 'object' ? data.financeLedger : fallback.financeLedger,
    staffMembers: Array.isArray(data?.staffMembers) ? data.staffMembers : fallback.staffMembers,
    accounts: Array.isArray(data?.accounts) && data.accounts.length > 0 ? data.accounts : fallback.accounts,
    holidayItems: Array.isArray(data?.holidayItems) ? data.holidayItems : fallback.holidayItems,
    workflowOptions: {
      ...fallback.workflowOptions,
      ...workflowOptions,
    },
    revision: Number.isInteger(data?.revision) && data.revision >= 0 ? data.revision : fallback.revision,
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : fallback.updatedAt,
  }
}

export function teamRecordKey(collection, value) {
  if (!value || typeof value !== 'object') throw new Error(`Invalid ${collection} record`)

  const key =
    collection === 'financeRecords'
      ? value.projectId
      : collection === 'calendarItems'
        ? value.id ?? `${value.projectId}-${value.day}-${value.time}-${value.title}-${value.type}-${value.owner}`
        : value.id

  if (typeof key !== 'string' || !key.trim()) throw new Error(`Missing key for ${collection} record`)
  return key
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function fileTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL,
      record_key TEXT NOT NULL,
      sort_order REAL NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      updated_revision INTEGER NOT NULL,
      PRIMARY KEY (collection, record_key)
    );

    CREATE INDEX IF NOT EXISTS records_collection_order
      ON records (collection, sort_order, record_key);

    CREATE TABLE IF NOT EXISTS change_log (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      revision INTEGER NOT NULL,
      collection TEXT NOT NULL,
      record_key TEXT NOT NULL,
      operation TEXT NOT NULL,
      position INTEGER,
      payload TEXT
    );

    CREATE INDEX IF NOT EXISTS change_log_revision
      ON change_log (revision, sequence);
  `)
}

function configureDatabase(database) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
  `)
  database.enableDefensive?.(true)
}

function metadataValue(database, key) {
  return database.prepare('SELECT value FROM metadata WHERE key = ?').get(key)?.value
}

function setMetadataValue(database, key, value) {
  database
    .prepare('INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value))
}

function databaseRevision(database) {
  const revision = Number(metadataValue(database, 'revision'))
  return Number.isInteger(revision) && revision >= 0 ? revision : 0
}

function databaseUpdatedAt(database) {
  return metadataValue(database, 'updated_at') || new Date(0).toISOString()
}

function readCollectionRows(database, collection) {
  return database
    .prepare('SELECT record_key, payload FROM records WHERE collection = ? ORDER BY sort_order, record_key')
    .all(collection)
}

function readDatabaseData(database) {
  const fallback = emptyTeamData()
  const data = {
    ...fallback,
    version: metadataValue(database, 'data_version') || fallback.version,
    revision: databaseRevision(database),
    updatedAt: databaseUpdatedAt(database),
  }

  for (const collection of arrayTeamDataCollections) {
    data[collection] = readCollectionRows(database, collection).map((row) => JSON.parse(row.payload))
  }

  data.financeLedger = Object.fromEntries(
    readCollectionRows(database, 'financeLedger').map((row) => [row.record_key, JSON.parse(row.payload)]),
  )

  const workflowRow = database
    .prepare('SELECT payload FROM records WHERE collection = ? AND record_key = ?')
    .get('workflowOptions', singletonKey)
  data.workflowOptions = workflowRow ? JSON.parse(workflowRow.payload) : fallback.workflowOptions

  return normalizeTeamData(data)
}

function insertSeedData(database, rawData, migration = {}) {
  const data = normalizeTeamData(rawData)
  const insertRecord = database.prepare(
    'INSERT INTO records (collection, record_key, sort_order, payload, updated_revision) VALUES (?, ?, ?, ?, ?)',
  )

  database.exec('BEGIN IMMEDIATE')
  try {
    setMetadataValue(database, 'schema_version', databaseSchemaVersion)
    setMetadataValue(database, 'data_version', data.version)
    setMetadataValue(database, 'revision', data.revision)
    setMetadataValue(database, 'updated_at', data.updatedAt)
    setMetadataValue(database, 'change_floor_revision', data.revision)
    if (migration.sourceFile) setMetadataValue(database, 'migration_source', migration.sourceFile)
    if (migration.backupFile) setMetadataValue(database, 'migration_backup', migration.backupFile)
    if (migration.migratedAt) setMetadataValue(database, 'migrated_at', migration.migratedAt)

    for (const collection of arrayTeamDataCollections) {
      const seenKeys = new Set()
      data[collection].forEach((value, index) => {
        const key = teamRecordKey(collection, value)
        if (seenKeys.has(key)) throw new Error(`Duplicate ${collection} key: ${key}`)
        seenKeys.add(key)
        insertRecord.run(collection, key, index * 1024, JSON.stringify(value), data.revision)
      })
    }

    Object.entries(data.financeLedger).forEach(([key, value], index) => {
      insertRecord.run('financeLedger', key, index * 1024, JSON.stringify(value), data.revision)
    })
    insertRecord.run('workflowOptions', singletonKey, 0, JSON.stringify(data.workflowOptions), data.revision)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function verifySeededData(database, rawData) {
  const expected = normalizeTeamData(rawData)
  const actual = readDatabaseData(database)

  for (const collection of arrayTeamDataCollections) {
    if (!jsonEqual(actual[collection], expected[collection])) throw new Error(`SQLite migration verification failed for ${collection}`)
  }
  if (!jsonEqual(actual.financeLedger, expected.financeLedger)) throw new Error('SQLite migration verification failed for financeLedger')
  if (!jsonEqual(actual.workflowOptions, expected.workflowOptions)) throw new Error('SQLite migration verification failed for workflowOptions')
  if (actual.revision !== expected.revision) throw new Error('SQLite migration verification failed for revision')

  const integrity = database.prepare('PRAGMA integrity_check').get()?.integrity_check
  if (integrity !== 'ok') throw new Error(`SQLite integrity check failed: ${integrity || 'unknown error'}`)
}

function uniqueMigrationBackup(backupDirectory) {
  const baseName = `crewflow-team-data-before-sqlite-${fileTimestamp()}`
  let candidate = path.join(backupDirectory, `${baseName}.json`)
  let suffix = 1

  while (existsSync(candidate)) {
    candidate = path.join(backupDirectory, `${baseName}-${suffix}.json`)
    suffix += 1
  }
  return candidate
}

function initializeSqliteDatabase({ databaseFile, legacyDataFile, backupDirectory }) {
  if (existsSync(databaseFile)) {
    const database = new DatabaseSync(databaseFile)
    createSchema(database)
    if (metadataValue(database, 'schema_version') !== databaseSchemaVersion) {
      database.close()
      throw new Error('Unsupported or incomplete CrewFlow SQLite database')
    }
    configureDatabase(database)
    return { database, migrationBackup: metadataValue(database, 'migration_backup') || '' }
  }

  mkdirSync(path.dirname(databaseFile), { recursive: true })
  const migratingFile = `${databaseFile}.migrating-${process.pid}-${Date.now()}`
  const hasLegacyData = existsSync(legacyDataFile)
  let sourceData = emptyTeamData()
  let migrationBackup = ''

  if (hasLegacyData) {
    const raw = readFileSync(legacyDataFile, 'utf8')
    sourceData = normalizeTeamData(JSON.parse(raw))
    mkdirSync(backupDirectory, { recursive: true })
    migrationBackup = uniqueMigrationBackup(backupDirectory)
    copyFileSync(legacyDataFile, migrationBackup)
  }

  let migratingDatabase
  try {
    migratingDatabase = new DatabaseSync(migratingFile)
    createSchema(migratingDatabase)
    insertSeedData(migratingDatabase, sourceData, {
      sourceFile: hasLegacyData ? legacyDataFile : '',
      backupFile: migrationBackup,
      migratedAt: new Date().toISOString(),
    })
    verifySeededData(migratingDatabase, sourceData)
    migratingDatabase.close()
    migratingDatabase = null
    renameSync(migratingFile, databaseFile)
  } catch (error) {
    if (migratingDatabase?.isOpen) migratingDatabase.close()
    rmSync(migratingFile, { force: true })
    throw error
  }

  const database = new DatabaseSync(databaseFile)
  configureDatabase(database)
  return { database, migrationBackup }
}

function recordPosition(database, collection, key) {
  const rows = database
    .prepare('SELECT record_key FROM records WHERE collection = ? ORDER BY sort_order, record_key')
    .all(collection)
  return rows.findIndex((row) => row.record_key === key)
}

function sortOrderForPosition(database, collection, requestedPosition) {
  const rows = database
    .prepare('SELECT sort_order FROM records WHERE collection = ? ORDER BY sort_order, record_key')
    .all(collection)
  const position = Math.max(0, Math.min(Number.isInteger(requestedPosition) ? requestedPosition : rows.length, rows.length))

  if (rows.length === 0) return 0
  if (position === 0) return Number(rows[0].sort_order) - 1024
  if (position === rows.length) return Number(rows[rows.length - 1].sort_order) + 1024

  const before = Number(rows[position - 1].sort_order)
  const after = Number(rows[position].sort_order)
  if (after - before > 0.000001) return (before + after) / 2

  const orderedKeys = database
    .prepare('SELECT record_key FROM records WHERE collection = ? ORDER BY sort_order, record_key')
    .all(collection)
  const updateOrder = database.prepare('UPDATE records SET sort_order = ? WHERE collection = ? AND record_key = ?')
  orderedKeys.forEach((row, index) => updateOrder.run(index * 1024, collection, row.record_key))
  return sortOrderForPosition(database, collection, position)
}

function mutationsForPartialData(currentData, partialData) {
  const nextData = normalizeTeamData({ ...currentData, ...partialData })
  const mutations = []

  for (const collection of arrayTeamDataCollections) {
    if (!hasOwn(partialData, collection)) continue
    const currentByKey = new Map(currentData[collection].map((value) => [teamRecordKey(collection, value), value]))
    const nextByKey = new Map(nextData[collection].map((value) => [teamRecordKey(collection, value), value]))

    for (const key of currentByKey.keys()) {
      if (!nextByKey.has(key)) mutations.push({ collection, operation: 'delete', key })
    }
    nextData[collection].forEach((value, position) => {
      const key = teamRecordKey(collection, value)
      const currentValue = currentByKey.get(key)
      if (!currentValue || !jsonEqual(currentValue, value)) {
        mutations.push({ collection, operation: 'upsert', key, value, position: currentValue ? undefined : position })
      }
    })
  }

  if (hasOwn(partialData, 'financeLedger')) {
    const currentLedger = currentData.financeLedger
    const nextLedger = nextData.financeLedger
    for (const key of Object.keys(currentLedger)) {
      if (!hasOwn(nextLedger, key)) mutations.push({ collection: 'financeLedger', operation: 'delete', key })
    }
    Object.entries(nextLedger).forEach(([key, value]) => {
      if (!hasOwn(currentLedger, key) || !jsonEqual(currentLedger[key], value)) {
        mutations.push({ collection: 'financeLedger', operation: 'upsert', key, value })
      }
    })
  }

  if (hasOwn(partialData, 'workflowOptions') && !jsonEqual(currentData.workflowOptions, nextData.workflowOptions)) {
    mutations.push({ collection: 'workflowOptions', operation: 'set', key: singletonKey, value: nextData.workflowOptions })
  }

  return { mutations, version: nextData.version }
}

function normalizeMutation(mutation) {
  if (!mutation || typeof mutation !== 'object' || !collectionSet.has(mutation.collection)) {
    throw new Error('Invalid team data mutation collection')
  }

  if (arrayCollectionSet.has(mutation.collection)) {
    if (mutation.operation === 'delete') {
      if (typeof mutation.key !== 'string' || !mutation.key) throw new Error('Invalid team data delete mutation')
      return { collection: mutation.collection, operation: 'delete', key: mutation.key }
    }
    if (mutation.operation !== 'upsert') throw new Error('Invalid team data array mutation')
    const key = teamRecordKey(mutation.collection, mutation.value)
    if (mutation.key && mutation.key !== key) throw new Error('Team data mutation key does not match its record')
    return {
      collection: mutation.collection,
      operation: 'upsert',
      key,
      value: mutation.value,
      position: Number.isInteger(mutation.position) ? mutation.position : undefined,
    }
  }

  if (mapCollectionSet.has(mutation.collection)) {
    if (typeof mutation.key !== 'string' || !mutation.key) throw new Error('Invalid team data map mutation key')
    if (mutation.operation === 'delete') return { collection: mutation.collection, operation: 'delete', key: mutation.key }
    if (mutation.operation !== 'upsert' || !mutation.value || typeof mutation.value !== 'object') {
      throw new Error('Invalid team data map mutation')
    }
    return { collection: mutation.collection, operation: 'upsert', key: mutation.key, value: mutation.value }
  }

  if (singletonCollectionSet.has(mutation.collection)) {
    if (mutation.operation !== 'set' || !mutation.value || typeof mutation.value !== 'object') {
      throw new Error('Invalid team data singleton mutation')
    }
    return { collection: mutation.collection, operation: 'set', key: singletonKey, value: mutation.value }
  }

  throw new Error('Unsupported team data mutation')
}

function assertNoBulkCollectionClear(database, mutations) {
  for (const collection of arrayTeamDataCollections) {
    const collectionMutations = mutations.filter((mutation) => mutation.collection === collection)
    if (collectionMutations.length === 0) continue

    const existingKeys = database
      .prepare('SELECT record_key FROM records WHERE collection = ?')
      .all(collection)
      .map((row) => row.record_key)
    if (existingKeys.length < 2) continue

    const deletedKeys = new Set(
      collectionMutations
        .filter((mutation) => mutation.operation === 'delete')
        .map((mutation) => mutation.key),
    )
    const retainedKeys = existingKeys.filter((key) => !deletedKeys.has(key))
    const replacementCount = collectionMutations.filter((mutation) => mutation.operation === 'upsert').length

    if (retainedKeys.length === 0 && replacementCount === 0) {
      throw new UnsafeTeamDataMutationError({
        collection,
        currentData: readDatabaseData(database),
      })
    }
  }
}

function createSqliteTeamStore({ dataDir, autoBackup = true }) {
  const dataFile = path.join(dataDir, 'crewflow-team.db')
  const legacyDataFile = path.join(dataDir, 'crewflow-team-data.json')
  const backupDirectory = path.join(dataDir, 'backups')
  const { database, migrationBackup } = initializeSqliteDatabase({ databaseFile: dataFile, legacyDataFile, backupDirectory })
  let writeQueue = Promise.resolve()

  function info() {
    return {
      storageEngine: 'sqlite',
      schemaVersion: Number(metadataValue(database, 'schema_version')),
      dataFile,
      legacyDataFile,
      backupDirectory,
      migrationBackup: metadataValue(database, 'migration_backup') || migrationBackup,
      revision: databaseRevision(database),
      updatedAt: databaseUpdatedAt(database),
    }
  }

  async function read() {
    return readDatabaseData(database)
  }

  function changesSince(sinceRevision) {
    const currentRevision = databaseRevision(database)
    const floorRevision = Number(metadataValue(database, 'change_floor_revision') || 0)
    if (!Number.isInteger(sinceRevision) || sinceRevision < floorRevision || sinceRevision > currentRevision) {
      return {
        revision: currentRevision,
        updatedAt: databaseUpdatedAt(database),
        resetRequired: true,
        changes: [],
      }
    }

    const changes = database
      .prepare(
        `SELECT sequence, revision, collection, record_key, operation, position, payload
         FROM change_log
         WHERE revision > ?
         ORDER BY revision, sequence`,
      )
      .all(sinceRevision)
      .map((row) => ({
        sequence: Number(row.sequence),
        revision: Number(row.revision),
        collection: row.collection,
        key: row.record_key,
        operation: row.operation,
        position: row.position === null ? undefined : Number(row.position),
        value: row.payload === null ? undefined : JSON.parse(row.payload),
      }))

    return {
      revision: currentRevision,
      updatedAt: databaseUpdatedAt(database),
      resetRequired: false,
      changes,
    }
  }

  async function ensureDailyBackup() {
    const today = localDateKey()
    if (metadataValue(database, 'last_daily_backup') === today) return

    await mkdir(backupDirectory, { recursive: true })
    const backupFile = path.join(backupDirectory, `crewflow-team-${today}.db`)
    if (!existsSync(backupFile)) await backupDatabase(database, backupFile)
    setMetadataValue(database, 'last_daily_backup', today)

    const backupFiles = (await readdir(backupDirectory))
      .filter((fileName) => /^crewflow-team-\d{4}-\d{2}-\d{2}\.db$/.test(fileName))
      .sort()
    for (const fileName of backupFiles.slice(0, Math.max(0, backupFiles.length - retainedDailyBackups))) {
      await rm(path.join(backupDirectory, fileName), { force: true })
    }
  }

  function performMutations(rawMutations, { expectedRevision, version } = {}) {
    const currentRevision = databaseRevision(database)
    const mutations = rawMutations.map(normalizeMutation)
    if (mutations.length > 50_000) throw new Error('Too many team data mutations in one request')
    if (
      Number.isInteger(expectedRevision) &&
      expectedRevision >= 0 &&
      expectedRevision !== currentRevision
    ) {
      const changeFloorRevision = Number(metadataValue(database, 'change_floor_revision') || 0)
      const cannotVerifyChanges = expectedRevision > currentRevision || expectedRevision < changeFloorRevision
      const overlapsNewerChanges = !cannotVerifyChanges && mutations.some((mutation) => {
        const currentRecord = database
          .prepare('SELECT updated_revision FROM records WHERE collection = ? AND record_key = ?')
          .get(mutation.collection, mutation.key)
        if (currentRecord && Number(currentRecord.updated_revision) > expectedRevision) return true

        return Boolean(
          database
            .prepare(
              `SELECT 1 FROM change_log
               WHERE revision > ? AND collection = ? AND record_key = ?
               LIMIT 1`,
            )
            .get(expectedRevision, mutation.collection, mutation.key),
        )
      })

      if (cannotVerifyChanges || overlapsNewerChanges) {
        throw new StaleTeamDataError({ expectedRevision, currentData: readDatabaseData(database) })
      }
    }

    assertNoBulkCollectionClear(database, mutations)

    const nextRevision = currentRevision + 1
    const updatedAt = new Date().toISOString()
    const selectRecord = database.prepare(
      'SELECT payload FROM records WHERE collection = ? AND record_key = ?',
    )
    const insertRecord = database.prepare(
      `INSERT INTO records (collection, record_key, sort_order, payload, updated_revision)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(collection, record_key) DO UPDATE SET
         payload = excluded.payload,
         updated_revision = excluded.updated_revision`,
    )
    const deleteRecord = database.prepare('DELETE FROM records WHERE collection = ? AND record_key = ?')
    const insertChange = database.prepare(
      `INSERT INTO change_log (revision, collection, record_key, operation, position, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    const appliedChanges = []

    database.exec('BEGIN IMMEDIATE')
    try {
      for (const mutation of mutations) {
        const currentRow = selectRecord.get(mutation.collection, mutation.key)

        if (mutation.operation === 'delete') {
          if (!currentRow) continue
          deleteRecord.run(mutation.collection, mutation.key)
          insertChange.run(nextRevision, mutation.collection, mutation.key, 'delete', null, null)
          appliedChanges.push({
            revision: nextRevision,
            collection: mutation.collection,
            key: mutation.key,
            operation: 'delete',
          })
          continue
        }

        const payload = JSON.stringify(mutation.value)
        if (currentRow?.payload === payload) continue
        const isNewRecord = !currentRow
        const position = isNewRecord && arrayCollectionSet.has(mutation.collection)
          ? Math.max(0, mutation.position ?? Number.MAX_SAFE_INTEGER)
          : undefined
        const sortOrder = isNewRecord
          ? sortOrderForPosition(database, mutation.collection, position)
          : 0

        insertRecord.run(mutation.collection, mutation.key, sortOrder, payload, nextRevision)
        const actualPosition = isNewRecord && arrayCollectionSet.has(mutation.collection)
          ? recordPosition(database, mutation.collection, mutation.key)
          : undefined
        const operation = singletonCollectionSet.has(mutation.collection) ? 'set' : 'upsert'
        insertChange.run(nextRevision, mutation.collection, mutation.key, operation, actualPosition ?? null, payload)
        appliedChanges.push({
          revision: nextRevision,
          collection: mutation.collection,
          key: mutation.key,
          operation,
          position: actualPosition,
          value: mutation.value,
        })
      }

      if (appliedChanges.length === 0) {
        database.exec('ROLLBACK')
        return {
          revision: currentRevision,
          updatedAt: databaseUpdatedAt(database),
          resetRequired: false,
          changes: [],
        }
      }

      setMetadataValue(database, 'data_version', typeof version === 'string' && version ? version : metadataValue(database, 'data_version'))
      setMetadataValue(database, 'revision', nextRevision)
      setMetadataValue(database, 'updated_at', updatedAt)

      const pruneThrough = nextRevision - retainedChangeRevisions
      const currentFloor = Number(metadataValue(database, 'change_floor_revision') || 0)
      if (pruneThrough > currentFloor) {
        database.prepare('DELETE FROM change_log WHERE revision <= ?').run(pruneThrough)
        setMetadataValue(database, 'change_floor_revision', pruneThrough)
      }
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }

    return {
      revision: nextRevision,
      updatedAt,
      resetRequired: false,
      changes: appliedChanges,
    }
  }

  function queueMutationWork(work) {
    writeQueue = writeQueue.then(
      async () => {
        if (autoBackup) await ensureDailyBackup().catch(() => undefined)
        return work()
      },
      async () => {
        if (autoBackup) await ensureDailyBackup().catch(() => undefined)
        return work()
      },
    )
    return writeQueue
  }

  async function mutate(mutations, options = {}) {
    return queueMutationWork(() => performMutations(mutations, options))
  }

  async function write(partialData, options = {}) {
    return queueMutationWork(() => {
      const currentData = readDatabaseData(database)
      const { mutations, version } = mutationsForPartialData(currentData, partialData)
      performMutations(mutations, { expectedRevision: options.expectedRevision, version })
      return readDatabaseData(database)
    })
  }

  function close() {
    if (!database.isOpen) return
    database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    database.close()
  }

  return {
    storageEngine: 'sqlite',
    supportsIncrementalSync: true,
    dataFile,
    legacyDataFile,
    backupDirectory,
    migrationBackup,
    info,
    read,
    write,
    mutate,
    changesSince,
    ensureDailyBackup,
    close,
  }
}

function createLegacyJsonTeamStore({ dataDir, migrationError = '' }) {
  const dataFile = path.join(dataDir, 'crewflow-team-data.json')
  const databaseFile = path.join(dataDir, 'crewflow-team.db')
  const backupDirectory = path.join(dataDir, 'backups')
  let writeQueue = Promise.resolve()

  async function read() {
    try {
      const raw = await readFile(dataFile, 'utf8')
      return normalizeTeamData(JSON.parse(raw))
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyTeamData()
      throw error
    }
  }

  async function write(partialData, options = {}) {
    const performWrite = async () => {
      const currentData = await read()
      if (
        Number.isInteger(options.expectedRevision) &&
        options.expectedRevision >= 0 &&
        options.expectedRevision !== currentData.revision
      ) {
        throw new StaleTeamDataError({
          expectedRevision: options.expectedRevision,
          currentData,
        })
      }
      const nextData = normalizeTeamData({
        ...currentData,
        ...partialData,
        revision: currentData.revision + 1,
        updatedAt: new Date().toISOString(),
      })
      const tempFile = `${dataFile}.tmp`

      await mkdir(dataDir, { recursive: true })
      await writeFile(tempFile, JSON.stringify(nextData, null, 2), 'utf8')
      await rename(tempFile, dataFile)

      return nextData
    }

    writeQueue = writeQueue.then(performWrite, performWrite)

    return writeQueue
  }

  async function info() {
    const data = await read()
    return {
      storageEngine: 'json',
      schemaVersion: 0,
      dataFile,
      databaseFile,
      legacyDataFile: dataFile,
      backupDirectory,
      migrationError,
      revision: data.revision,
      updatedAt: data.updatedAt,
    }
  }

  return {
    storageEngine: 'json',
    supportsIncrementalSync: false,
    dataFile,
    legacyDataFile: dataFile,
    backupDirectory,
    migrationError,
    info,
    read,
    write,
  }
}

export function createTeamStore({ dataDir, autoBackup = true }) {
  const databaseFile = path.join(dataDir, 'crewflow-team.db')
  const legacyDataFile = path.join(dataDir, 'crewflow-team-data.json')
  const databaseAlreadyExists = existsSync(databaseFile)

  try {
    return createSqliteTeamStore({ dataDir, autoBackup })
  } catch (error) {
    if (databaseAlreadyExists) throw error

    if (existsSync(legacyDataFile)) {
      JSON.parse(readFileSync(legacyDataFile, 'utf8'))
    }
    return createLegacyJsonTeamStore({
      dataDir,
      migrationError: error instanceof Error ? error.message : 'SQLite migration failed',
    })
  }
}
