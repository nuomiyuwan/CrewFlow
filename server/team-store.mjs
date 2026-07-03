import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export function emptyTeamData() {
  return {
    version: 'project-flow-v1',
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

function normalizeTeamData(data) {
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
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : fallback.updatedAt,
  }
}

export function createTeamStore({ dataDir }) {
  const dataFile = path.join(dataDir, 'crewflow-team-data.json')
  let writeQueue = Promise.resolve()

  async function read() {
    try {
      const raw = await readFile(dataFile, 'utf8')
      return normalizeTeamData(JSON.parse(raw))
    } catch {
      return emptyTeamData()
    }
  }

  async function write(partialData) {
    writeQueue = writeQueue.then(async () => {
      const currentData = await read()
      const nextData = normalizeTeamData({
        ...currentData,
        ...partialData,
        updatedAt: new Date().toISOString(),
      })
      const tempFile = `${dataFile}.tmp`

      await mkdir(dataDir, { recursive: true })
      await writeFile(tempFile, JSON.stringify(nextData, null, 2), 'utf8')
      await rename(tempFile, dataFile)

      return nextData
    })

    return writeQueue
  }

  return {
    dataFile,
    read,
    write,
  }
}
