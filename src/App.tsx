import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  CloudSun,
  Download,
  DollarSign,
  Filter,
  FolderOpen,
  FolderKanban,
  HardDrive,
  ImagePlus,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Minimize2,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  Archive,
  Search,
  Send,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import './App.css'
import userGuideMarkdown from '../docs/USER_GUIDE.zh-CN.md?raw'
import {
  bundledChinaHolidayItems,
  chinaHolidayProjectUrl,
  chinaHolidayYearsForRange,
  loadChinaHolidayItems,
  type ChinaHolidayLoadSource,
} from './chinaHolidays'

const ReactMarkdown = lazy(() => import('react-markdown'))

type Role = 'controller' | 'admin' | 'manager' | 'member' | 'finance'
type Section =
  | 'dashboard'
  | 'projects'
  | 'tasks'
  | 'calendar'
  | 'team'
  | 'people'
  | 'archive'
  | 'finance'

type ProjectStatus = 'normal' | 'risk' | 'late' | 'waiting'
type ProjectHealthStatus = Exclude<ProjectStatus, 'late'>
type WorkStatus = string
type TaskStatus = '未开始' | '制作中' | '修改中' | '已完成'
type TaskDateFilter = 'all' | 'today' | 'week' | 'custom'
type AssignmentMode = 'internal' | 'external'
type ProjectFilterStatus = 'all' | 'normal' | 'risk' | 'late' | 'waiting' | 'archived'
type WelcomeGuideContent = {
  eyebrow: string
  title: string
  intro: string
  sections: Array<{
    title: string
    items: string[]
  }>
  note?: string
}

type UserGuideSection = {
  id: string
  title: string
  body: string
}

type UpdateRelease = {
  version: string
  url: string
  notes: string
  source: 'gitcode' | 'github'
  assets: Array<{
    name: string
    url: string
    fallbackUrl?: string
    digest?: string
  }>
}

type UpdateCheckStatus = 'idle' | 'checking' | 'available' | 'up-to-date' | 'error'
type AppUpdateInstallStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'opened'
  | 'error'

type AppUpdateInstallState = {
  status: AppUpdateInstallStatus
  percent: number
  transferred: number
  total: number
  version: string
  fileName: string
  message: string
  canAutoInstall: boolean
}

type WeatherLocation = {
  id: number
  name: string
  admin1: string
  country: string
  latitude: number
  longitude: number
  timezone: string
}

type WeatherSnapshot = {
  locationKey: string
  temperature: number
  apparentTemperature: number
  weatherCode: number
  windSpeed: number
  isDay: boolean
  fetchedAt: number
}

type WeatherStatus = 'idle' | 'loading' | 'ready' | 'error'

type WorkSchedule = {
  start: string
  end: string
}

type Account = {
  id: string
  password: string
  role: Role
  userName: string
  staffId?: string
  label: string
  title: string
}

type StaffMember = {
  id: string
  name: string
  tags: string[]
  accountRole: Role
  status: '在职' | '离职'
  load: number
  risk: number
  tasks: number
}

type TeamServiceInfo = {
  supported: boolean
  platform: string
  running: boolean
  localUrl: string
  connectionUrl: string
  urls: string[]
  urlCandidates?: {
    url: string
    address: string
    interfaceName: string
    kind: string
  }[]
  accessKey?: string
  dataFile?: string
  singleDataFile?: string
  singleDataDirectory?: string
  teamDataFile?: string
  teamDataDirectory?: string
  legacyDataFile?: string
  backupDirectory?: string
  migrationBackup?: string
  storageEngine?: 'sqlite' | 'json'
  schemaVersion?: number
  incrementalSync?: boolean
  migrationError?: string
  accessKeyFile?: string
  accessKeyDirectory?: string
  updatedAt?: string
  message: string
}

type AssistantMode = 'rules' | 'online' | 'local'
type AssistantOnlineProfile = {
  id: string
  onlineBaseUrl: string
  onlineModel: string
  hasApiKey: boolean
}
type AssistantSettings = {
  mode: AssistantMode
  onlineBaseUrl: string
  onlineModel: string
  activeOnlineProfileId: string
  onlineProfiles: AssistantOnlineProfile[]
  localBaseUrl: string
  localModel: string
  localThinking: boolean
  includeProjectContext: boolean
  includeFinanceContext: boolean
  fallbackToRules: boolean
  hasApiKey: boolean
  secureStorageAvailable: boolean
}
type AssistantSettingsDraft = Omit<AssistantSettings, 'hasApiKey' | 'secureStorageAvailable' | 'onlineProfiles'>
type AssistantSettingsPayload = {
  settings: AssistantSettingsDraft
  apiKey?: string
  clearApiKey?: boolean
  saveOnlineProfile?: boolean
}
type AssistantProviderTestResult = {
  ok: boolean
  message: string
  models?: string[]
}
type AssistantCalendarCandidate = {
  projectId: string
  projectName: string
  date: string
  title: string
  owner: string
  source: string
}
type AssistantOperationType =
  | 'create_project'
  | 'update_project'
  | 'assign_task'
  | 'update_task'
  | 'update_weather'
  | 'update_work_schedule'
  | 'navigate'
type AssistantOperation = {
  type: AssistantOperationType
  projectId: string
  projectName: string
  name: string
  path: string
  projectType: string
  client: string
  clientContact: string
  manager: string
  priority: string
  workTypes: string[]
  deliveryDate: string
  taskDue: string
  stage: string
  workStatus: string
  calendarTitle: string
  workType: string
  assignmentMode: AssignmentMode
  assignee: string
  externalNote: string
  taskStatus: string
  taskId: string
  taskTitle: string
  healthStatus: string
  weatherCity: string
  workStart: string
  workEnd: string
  targetSection: string
  source: string
}
type AssistantResponse =
  | { kind: 'message'; message: string; clearPending?: boolean }
  | {
      kind: 'calendar_candidates'
      message: string
      candidates: AssistantCalendarCandidate[]
      openConfirmation?: boolean
      clearPending?: boolean
    }
  | { kind: 'operation'; message: string; operation: AssistantOperation | null; clearPending?: boolean }
type AssistantImageAttachment = {
  id: string
  name: string
  mimeType: string
  size: number
  dataUrl: string
}
type AssistantRequestPayload = {
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    images?: Array<Pick<AssistantImageAttachment, 'name' | 'mimeType' | 'dataUrl'>>
  }>
  context: Record<string, unknown>
  task: 'chat' | 'calendar_extract' | 'operation_extract' | 'assistant_route'
}

type DesktopBridge = {
  platform: string
  arch: string
  minimizeWindow: () => Promise<boolean>
  toggleMaximizeWindow: () => Promise<boolean>
  closeWindow: () => Promise<boolean>
  selectProjectFolder: () => Promise<string | null>
  openProjectFolder: (folderPath: string) => Promise<boolean>
  selectProjectFile: (title: string) => Promise<string | null>
  openProjectFile: (filePath: string) => Promise<boolean>
  loadAppData: () => Promise<AppData | null>
  saveAppData: (data: Partial<AppData>) => Promise<boolean>
  getTeamServiceInfo: () => Promise<TeamServiceInfo>
  installTeamService: () => Promise<TeamServiceInfo>
  restartTeamService: () => Promise<TeamServiceInfo>
  stopTeamService: () => Promise<TeamServiceInfo>
  getAppUpdateState: () => Promise<AppUpdateInstallState>
  checkAppUpdate: () => Promise<UpdateRelease>
  downloadAppUpdate: (payload: {
    version: string
    name: string
    url: string
    fallbackUrl?: string
    digest?: string
  }) => Promise<AppUpdateInstallState>
  installAppUpdate: () => Promise<AppUpdateInstallState>
  onAppUpdateState: (listener: (state: AppUpdateInstallState) => void) => () => void
  copyText: (value: string) => Promise<boolean>
  loadAssistantSettings: () => Promise<AssistantSettings>
  saveAssistantSettings: (payload: AssistantSettingsPayload) => Promise<AssistantSettings>
  deleteAssistantOnlineProfile: (profileId: string) => Promise<AssistantSettings>
  testAssistantProvider: (payload: AssistantSettingsPayload) => Promise<AssistantProviderTestResult>
  requestAssistant: (payload: AssistantRequestPayload) => Promise<AssistantResponse>
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge
  }
}

type Project = {
  id: string
  name: string
  type: string
  client: string
  clientContact?: string
  manager: string
  stage: string
  calendarTitle?: string
  nextMilestone: string
  due: string
  progress: number
  status: ProjectHealthStatus
  healthStatusExplicit?: boolean
  workStatus: WorkStatus
  owner: string
  path: string
  additionalPaths?: string[]
  creatorAccountId?: string
}

type Task = {
  id: string
  title: string
  projectId: string
  project: string
  workType?: string
  assignmentMode?: AssignmentMode
  assignee: string
  due: string
  status: TaskStatus
  note: string
  evidencePath?: string
}

type CalendarItem = {
  id?: string
  date?: string
  isFinalDelivery?: boolean
  completed?: boolean
  projectId: string
  day: number
  time: string
  project: string
  title: string
  type: string
  owner: string
}

type HolidayType = '休' | '班'

type HolidayItem = {
  id: string
  date: string
  name: string
  type: HolidayType
}

type ChinaHolidaySyncState = {
  loading: boolean
  source: ChinaHolidayLoadSource
  updatedAt?: number
  unavailableYears: number[]
}

type NewProjectPayload = {
  name: string
  path: string
  type: string
  client: string
  clientContact: string
  manager: string
  priority: string
  workTypes: string[]
  deliveryDate: string
}

type ProjectSetupDraft = {
  projectId: string
  workTypes: string[]
  deliveryDate: string
}

type AssignmentDraft = {
  workType: string
  mode: AssignmentMode
  assignee: string
  externalNote: string
}

type AssistantNewProjectDraft = Partial<NewProjectPayload>
type AssistantProjectEditDraft = {
  stage?: string
  workStatus?: WorkStatus
  healthStatus?: ProjectHealthStatus
  due?: string
  calendarTitle?: string
  manager?: string
  assignment?: {
    workType: string
    mode: AssignmentMode
    assignee: string
    externalNote: string
    status: TaskStatus
    due?: string
  }
}
type AssistantTaskEditDraft = {
  taskId: string
  status: TaskStatus
}

type FinanceRecord = {
  projectId: string
  contractName: string
  contractAmount: number
  receivedAmount: number
  invoiceAmount: number
  quoteStatus: '已制作' | '待制作' | '需修改'
  quoteFile?: string
  comparisonStatus: '已制作' | '待制作' | '需修改'
  comparisonFile?: string
  clientSettlementStatus: '未结算' | '部分结算' | '已结算'
  contractStatus: '已签订' | '待签订'
  contractFile?: string
  invoiceStatus: '未开票' | '部分开票' | '已开票'
  settlementStatus: '正常' | '待收款' | '逾期' | '待开票'
  nextCollection: string
  nextCollectionDate?: string
  nextCollectionNote?: string
  outsourcedCost: number
  outsourcedInvoiceStatus: '未开票' | '部分开票' | '已开票' | '无需开票'
  outsourcedSettlementStatus: '未结算' | '部分结算' | '已结算'
  payableAmount: number
  payableNote: string
}

type FinanceLedgerEntry = {
  id: string
  date: string
  amount?: number
  title: string
  note: string
  materialFile?: string
}

type FinanceLedger = Record<
  string,
  {
    payments: FinanceLedgerEntry[]
    invoices: FinanceLedgerEntry[]
    outsourcing: FinanceLedgerEntry[]
    followUps: FinanceLedgerEntry[]
  }
>

type FinanceAction = 'payment' | 'invoice'
type DataMode = 'single' | 'team'
type TeamConnectionStatus = 'idle' | 'checking' | 'connected' | 'error'
type TeamPresenceMember = {
  accountId: string
  name: string
  role: Role
  lastSeenAt: number
  connections: number
}
type TeamPresenceResponse = {
  ok: boolean
  members: TeamPresenceMember[]
  updatedAt: number
}
const teamStartupRetryIntervalMs = 2000
const teamPresenceHeartbeatIntervalMs = 8 * 1000
type AppData = {
  version: string
  revision?: number
  projects: Project[]
  tasks: Task[]
  calendarItems: CalendarItem[]
  financeRecords: FinanceRecord[]
  financeLedger: FinanceLedger
  staffMembers?: StaffMember[]
  accounts?: Account[]
  holidayItems?: HolidayItem[]
  workflowOptions?: WorkflowOptions
  updatedAt?: string
}
type CustomerGroups = Record<string, string[]>
type CustomerFieldLabels = {
  primary: string
  secondary: string
}
type WorkflowOptions = {
  taskWorkTypes: string[]
  nodeStatuses: string[]
  workflowStages: string[]
  staffTags: string[]
  projectTypes: string[]
  customerGroups: CustomerGroups
  customerFieldLabels: CustomerFieldLabels
}
type WorkflowOptionCategory = 'taskWorkTypes' | 'nodeStatuses' | 'workflowStages' | 'staffTags' | 'projectTypes'
type WorkflowOptionRename = {
  category: WorkflowOptionCategory
  from: string
  to: string
}
type AppDataLoader = () => Promise<AppData | null>
type AppDataSaver = (data: Partial<AppData>) => Promise<boolean>
type AppDataSliceKey = 'projects' | 'tasks' | 'calendarItems' | 'financeRecords' | 'staffMembers' | 'accounts' | 'holidayItems' | 'workflowOptions'
type TeamDataArrayCollection = Exclude<AppDataSliceKey, 'workflowOptions'>
type TeamDataCollection = AppDataSliceKey | 'financeLedger'
type TeamDataMutation = {
  collection: TeamDataCollection
  operation: 'upsert' | 'delete' | 'set'
  key: string
  value?: unknown
  position?: number
}
type TeamDataChange = TeamDataMutation & {
  revision: number
  sequence?: number
}
type TeamDataChangesResponse = {
  revision: number
  updatedAt: string
  resetRequired: boolean
  changes: TeamDataChange[]
}
type TeamIncrementalCapability = 'unknown' | 'supported' | 'legacy'
type ProjectPlanPayload = {
  id?: string
  date: string
  projectId: string
  title: string
  owner: string
}

type CalendarDragSession = {
  itemKey: string
  pointerId: number
  project: string
  sourceDate: string
  startX: number
  startY: number
  title: string
  x: number
  y: number
  active: boolean
}

type CalendarDragPreview = Pick<CalendarDragSession, 'itemKey' | 'project' | 'sourceDate' | 'title' | 'x' | 'y'>

type CalendarMoveNotice = {
  itemKey: string
  fromDate: string
  toDate: string
  title: string
}

type CalendarDayPopoverState = {
  date: string
  left: number
  top: number
}

type CalendarPopoverDragSession = CalendarDayPopoverState & {
  pointerId: number
  startX: number
  startY: number
}

const taskStatusOptions: TaskStatus[] = ['未开始', '制作中', '修改中', '已完成']
const defaultNodeStatusOptions: WorkStatus[] = ['未开始', '进行中', '等甲方反馈', '等内部确认', '需修改', '已确认', '已完成', '暂停']
const defaultWorkflowStageOptions = [
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
]

const roles: Array<{ id: Role; label: string; description: string }> = [
  { id: 'controller', label: '总控', description: '全局项目、财务和团队' },
  { id: 'admin', label: '管理员', description: '项目、风险和团队管理' },
  { id: 'manager', label: '项目经理', description: '负责项目推进和任务分派' },
  { id: 'member', label: '执行成员', description: '查看和更新个人任务' },
  { id: 'finance', label: '财务', description: '收付款、开票和合同' },
]

const staffMembers: StaffMember[] = []

const defaultProjectTypeOptions: string[] = []
const defaultCustomerGroups: CustomerGroups = {}
const priorityOptions = ['普通', '重要', '紧急']
const defaultTaskWorkOptions = ['策划', '文案', '拍摄', '剪辑', '后期', '包装', '设计', 'AI', '外包', '行政', '配音', '配乐', '三维', '版权素材', '调色']
const defaultStaffTagOptions = [
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
]
const protectedStaffTags = ['项目负责人', '项目经理', '财务', '行政']
const defaultWorkflowOptions: WorkflowOptions = {
  taskWorkTypes: defaultTaskWorkOptions,
  nodeStatuses: defaultNodeStatusOptions,
  workflowStages: defaultWorkflowStageOptions,
  staffTags: defaultStaffTagOptions,
  projectTypes: defaultProjectTypeOptions,
  customerGroups: defaultCustomerGroups,
  customerFieldLabels: {
    primary: '客户省份',
    secondary: '客户单位',
  },
}
const financeStorageVersion = 'finance-ledger-v5'
const projectDataStorageVersion = 'project-flow-v1'
const sessionStorageKey = 'crewflow-session-account'
const welcomeGuideStorageKeyPrefix = 'crewflow-welcome-dismissed'
const dataModeStorageKey = 'crewflow-data-mode'
const teamServerUrlStorageKey = 'crewflow-team-server-url'
const teamAccessKeyStorageKey = 'crewflow-team-access-key'
const teamPresenceClientIdStorageKey = 'crewflow-team-presence-client-id-v1'
const workflowOptionsStorageKey = 'crewflow-workflow-options'
const defaultTeamServerUrl = 'http://127.0.0.1:8787'
const appVersion = import.meta.env.VITE_APP_VERSION || '0.0.0'
const crewFlowGitHubLatestReleaseUrl = 'https://api.github.com/repos/nuomiyuwan/CrewFlow/releases/latest'
const updateCheckCacheKey = 'crewflow-update-check-cache-v2'
const updateCheckIntervalMs = 6 * 60 * 60 * 1000
const defaultAppUpdateInstallState: AppUpdateInstallState = {
  status: 'idle',
  percent: 0,
  transferred: 0,
  total: 0,
  version: '',
  fileName: '',
  message: '',
  canAutoInstall: false,
}
const weatherLocationStorageKey = 'crewflow-local-weather-location-v1'
const weatherCacheStorageKey = 'crewflow-local-weather-cache-v1'
const weatherRefreshIntervalMs = 30 * 60 * 1000
const workScheduleStorageKeyPrefix = 'crewflow-local-work-schedule-v1'
const maxCalendarRangeDays = 90
const legacyLocalStorageKeys = [
  'shby-session-account',
  'shby-project-data-version',
  'shby-projects',
  'shby-tasks',
  'shby-calendar-items',
  'shby-staff-members',
  'shby-accounts',
  'shby-holiday-items',
  'shby-finance-version',
  'shby-finance-records',
  'shby-finance-ledger',
]
const holidayItems: HolidayItem[] = []

const loginAccounts: Account[] = [
  { id: 'zk', password: '123456', role: 'controller', userName: '', label: '总控', title: '' },
]

function parseUserGuideSections(markdown: string): UserGuideSection[] {
  const sections: UserGuideSection[] = []
  let title = '说明与版本'
  let body: string[] = []

  function appendSection() {
    const cleanBody = body
      .filter((line, index) => !(index === 0 && line.startsWith('# ')))
      .join('\n')
      .trim()
    if (cleanBody) {
      sections.push({
        id: `guide-${sections.length}`,
        title,
        body: cleanBody,
      })
    }
  }

  markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((line) => {
      const heading = line.match(/^##\s+(.+)$/)
      if (!heading) {
        body.push(line)
        return
      }

      appendSection()
      title = heading[1].trim()
      body = []
    })

  appendSection()
  return sections
}

const userGuideSections = parseUserGuideSections(userGuideMarkdown)

const welcomeGuides: Record<Role, WelcomeGuideContent> = {
  controller: {
    eyebrow: '首次使用',
    title: '总控使用说明',
    intro: '总控负责 CrewFlow 的初始化、团队数据和全局配置。',
    sections: [
      {
        title: '第一次进入',
        items: [
          '系统默认总控账号：zk，密码：123456。',
          '先在左侧“账号管理”修改总控用户名和密码。',
          '在“工作模式”选择单人模式或团队模式；团队模式需要在一台常驻电脑开启团队服务，再把显示的地址发给其他电脑连接。',
        ],
      },
      {
        title: '基础设置',
        items: [
          '在“人员管理”添加团队成员、设置标签，并到“账号管理”创建成员账号。',
          '在“选项管理”维护项目类型、任务工种、流程节点、人员标签。',
          '完成基础设置后，可在右上角“新建项目”，再进入项目设置交付节点和任务负责人。',
        ],
      },
    ],
    note: '团队模式常用地址格式：http://常驻电脑局域网IP:8787。',
  },
  admin: {
    eyebrow: '使用说明',
    title: '管理员使用说明',
    intro: '管理员负责日常项目推进、团队排期和基础资料维护。',
    sections: [
      {
        title: '日常查看',
        items: [
          '在“首页控制台”查看今日必须处理的项目、任务和交付节点。',
          '在“交付日历”查看项目交付时间和关键节点。',
          '在“团队负载”查看每个人当前任务量和风险集中情况。',
        ],
      },
      {
        title: '项目和团队维护',
        items: [
          '在“项目中心”新建项目、查看项目详情、维护任务和流程进度。',
          '在“人员管理”维护团队成员、人员标签和账号关联。',
          '在“选项管理”维护项目类型、任务工种、流程节点、人员标签。',
        ],
      },
    ],
  },
  manager: {
    eyebrow: '使用说明',
    title: '项目经理使用说明',
    intro: '项目经理负责自己项目的录入、任务拆分和交付跟进。',
    sections: [
      {
        title: '新建和设置项目',
        items: [
          '在“首页控制台”查看自己负责的项目和近期交付节点。',
          '点击右上角“新建项目”，按需录入客户，并填写项目类型、项目路径和交付日期。',
          '项目创建后，在“设置交付和任务”里选择流程节点、任务工种和负责人。',
        ],
      },
      {
        title: '推进项目',
        items: [
          '在“项目中心”查看自己负责的项目详情，跟进任务状态和交付进度。',
          '在“交付日历”查看项目节点，安排当天和本周需要处理的事项。',
          '在“项目归档”查看已经完成和归档的项目。',
        ],
      },
    ],
  },
  member: {
    eyebrow: '使用说明',
    title: '成员使用说明',
    intro: '成员主要查看和更新分配给自己的工作。',
    sections: [
      {
        title: '处理任务',
        items: [
          '在“我的任务”查看分配给自己的任务。',
          '每个任务会显示项目、工种、截止时间和当前状态。',
          '做任务时按实际进度更新状态，例如“制作中”“修改中”“已完成”。',
        ],
      },
      {
        title: '查看节点',
        items: [
          '在“交付日历”查看和自己任务相关的项目节点。',
          '在“项目归档”查看已经完成的项目资料。',
        ],
      },
    ],
  },
  finance: {
    eyebrow: '使用说明',
    title: '财务使用说明',
    intro: '财务主要维护项目商务信息、收款、开票和结算状态。',
    sections: [
      {
        title: '财务结算',
        items: [
          '在“财务结算”查看项目合同金额、已收金额、未收金额和开票状态。',
          '点击项目后，在“项目商务详情”里录入收款、开票和结算情况。',
          '使用“新增收款”“新增开票”记录每次到账和开票信息。',
        ],
      },
      {
        title: '辅助核对',
        items: [
          '在“项目中心”查看项目基础信息和客户信息。',
          '在“交付日历”查看项目交付时间，辅助安排收款和开票节点。',
        ],
      },
    ],
  },
}

const projects: Project[] = []

const tasks: Task[] = []

const calendarItems: CalendarItem[] = []

const financeRecords: FinanceRecord[] = []

const statusLabel: Record<ProjectStatus, string> = {
  normal: '正常',
  risk: '有风险',
  late: '已延期',
  waiting: '等反馈',
}

const statusTone: Record<ProjectStatus, string> = {
  normal: 'ok',
  risk: 'warn',
  late: 'danger',
  waiting: 'wait',
}

const projectHealthOptions: Array<{ value: ProjectHealthStatus; label: string }> = [
  { value: 'normal', label: '正常' },
  { value: 'waiting', label: '等反馈' },
  { value: 'risk', label: '有风险' },
]

const navItems: Array<{ id: Section; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: '首页控制台', icon: LayoutDashboard },
  { id: 'projects', label: '项目中心', icon: FolderKanban },
  { id: 'tasks', label: '我的任务', icon: ListChecks },
  { id: 'calendar', label: '交付日历', icon: CalendarDays },
  { id: 'team', label: '团队负载', icon: Users },
  { id: 'people', label: '人员管理', icon: Users },
  { id: 'archive', label: '项目归档', icon: Archive },
  { id: 'finance', label: '财务结算', icon: DollarSign },
]

const financeNavItems: Array<{ id: Section; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'finance', label: '财务结算', icon: DollarSign },
  { id: 'projects', label: '项目中心', icon: FolderKanban },
  { id: 'calendar', label: '交付日历', icon: CalendarDays },
  { id: 'archive', label: '项目归档', icon: Archive },
]

function navItemsForRole(role: Role) {
  if (role === 'controller') return navItems.map((item) => (item.id === 'tasks' ? { ...item, label: '任务面板' } : item))
  if (role === 'finance') return financeNavItems
  if (role === 'manager') return navItems.filter((item) => item.id !== 'finance' && item.id !== 'team' && item.id !== 'people')
  if (role === 'member') {
    return navItems.filter((item) => item.id !== 'finance' && item.id !== 'team' && item.id !== 'projects' && item.id !== 'people')
  }

  return navItems.filter((item) => item.id !== 'finance')
}

function canRoleCreateProject(role: Role) {
  return role === 'controller' || role === 'admin' || role === 'manager' || role === 'finance'
}

function loadStoredAccountId() {
  try {
    return localStorage.getItem(sessionStorageKey) ?? ''
  } catch {
    return ''
  }
}

function loadOrCreateTeamPresenceClientId() {
  try {
    const saved = localStorage.getItem(teamPresenceClientIdStorageKey)
    if (saved) return saved
    const generated = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(teamPresenceClientIdStorageKey, generated)
    return generated
  } catch {
    return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function welcomeGuideStorageKey(account: Account) {
  return `${welcomeGuideStorageKeyPrefix}-${account.id}-${account.role}`
}

function loadStoredDataMode(): DataMode {
  try {
    return localStorage.getItem(dataModeStorageKey) === 'team' ? 'team' : 'single'
  } catch {
    return 'single'
  }
}

function loadStoredTeamServerUrl() {
  try {
    return localStorage.getItem(teamServerUrlStorageKey) || defaultTeamServerUrl
  } catch {
    return defaultTeamServerUrl
  }
}

function loadStoredTeamAccessKey() {
  try {
    return localStorage.getItem(teamAccessKeyStorageKey) || ''
  } catch {
    return ''
  }
}

function weatherLocationKey(location: WeatherLocation) {
  return `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`
}

function loadStoredWeatherLocation(): WeatherLocation | null {
  try {
    const raw = localStorage.getItem(weatherLocationStorageKey)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<WeatherLocation>
    if (
      typeof value.id !== 'number' ||
      typeof value.name !== 'string' ||
      typeof value.latitude !== 'number' ||
      typeof value.longitude !== 'number'
    ) {
      return null
    }

    return {
      id: value.id,
      name: value.name,
      admin1: typeof value.admin1 === 'string' ? value.admin1 : '',
      country: typeof value.country === 'string' ? value.country : '',
      latitude: value.latitude,
      longitude: value.longitude,
      timezone: typeof value.timezone === 'string' ? value.timezone : 'auto',
    }
  } catch {
    return null
  }
}

function saveStoredWeatherLocation(location: WeatherLocation) {
  try {
    localStorage.setItem(weatherLocationStorageKey, JSON.stringify(location))
  } catch {
    // The in-memory selection still works when storage is unavailable.
  }
}

function loadStoredWeatherSnapshot(location: WeatherLocation | null): WeatherSnapshot | null {
  if (!location) return null

  try {
    const raw = localStorage.getItem(weatherCacheStorageKey)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<WeatherSnapshot>
    if (
      value.locationKey !== weatherLocationKey(location) ||
      typeof value.temperature !== 'number' ||
      typeof value.apparentTemperature !== 'number' ||
      typeof value.weatherCode !== 'number' ||
      typeof value.windSpeed !== 'number' ||
      typeof value.fetchedAt !== 'number'
    ) {
      return null
    }

    return {
      locationKey: value.locationKey,
      temperature: value.temperature,
      apparentTemperature: value.apparentTemperature,
      weatherCode: value.weatherCode,
      windSpeed: value.windSpeed,
      isDay: value.isDay !== false,
      fetchedAt: value.fetchedAt,
    }
  } catch {
    return null
  }
}

function saveStoredWeatherSnapshot(snapshot: WeatherSnapshot) {
  try {
    localStorage.setItem(weatherCacheStorageKey, JSON.stringify(snapshot))
  } catch {
    // Weather remains visible for the current session when storage is unavailable.
  }
}

function workScheduleStorageKey(accountId: string) {
  return `${workScheduleStorageKeyPrefix}-${accountId}`
}

function isClockTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function loadStoredWorkSchedule(accountId: string): WorkSchedule | null {
  if (!accountId) return null

  try {
    const raw = localStorage.getItem(workScheduleStorageKey(accountId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<WorkSchedule>
    if (!isClockTime(value.start) || !isClockTime(value.end) || value.start === value.end) return null
    return { start: value.start, end: value.end }
  } catch {
    return null
  }
}

function saveStoredWorkSchedule(accountId: string, schedule: WorkSchedule) {
  if (!accountId) return
  try {
    localStorage.setItem(workScheduleStorageKey(accountId), JSON.stringify(schedule))
  } catch {
    // The in-memory schedule still works when storage is unavailable.
  }
}

function normalizeTeamServerUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return defaultTeamServerUrl
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  return withProtocol.replace(/\/+$/, '')
}

function teamApiUrl(serverUrl: string, pathname: string) {
  return `${normalizeTeamServerUrl(serverUrl)}${pathname}`
}

function teamServerDisplayHost(serverUrl: string) {
  try {
    const url = new URL(normalizeTeamServerUrl(serverUrl))
    return url.host
  } catch {
    return normalizeTeamServerUrl(serverUrl)
  }
}

function teamServerUrlKey(serverUrl: string) {
  try {
    const url = new URL(normalizeTeamServerUrl(serverUrl))
    return `${url.hostname.toLowerCase()}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`
  } catch {
    return normalizeTeamServerUrl(serverUrl).toLowerCase()
  }
}

function teamServerHostname(serverUrl: string) {
  try {
    return new URL(normalizeTeamServerUrl(serverUrl)).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function isLocalTeamServerUrl(serverUrl: string, teamServiceInfo: TeamServiceInfo | null) {
  const targetKey = teamServerUrlKey(serverUrl)
  const targetHost = teamServerHostname(serverUrl)
  if (targetHost === 'localhost' || targetHost === '127.0.0.1' || targetHost === '::1' || targetHost === '0.0.0.0') return true

  const localUrls = [
    teamServiceInfo?.localUrl,
    teamServiceInfo?.connectionUrl,
    ...(teamServiceInfo?.urls ?? []),
    ...(teamServiceInfo?.urlCandidates?.map((candidate) => candidate.url) ?? []),
  ]

  return localUrls.some((url) => url && teamServerUrlKey(url) === targetKey)
}

function teamRequestHeaders(accessKey: string, hasBody = false) {
  const headers: Record<string, string> = hasBody ? { 'Content-Type': 'application/json' } : {}
  const cleanAccessKey = accessKey.trim()
  if (cleanAccessKey) headers['X-CrewFlow-Key'] = cleanAccessKey
  return headers
}

function versionParts(version: string) {
  return version
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
}

function isNewerVersion(candidate: string, current: string) {
  const candidateParts = versionParts(candidate)
  const currentParts = versionParts(current)
  const length = Math.max(candidateParts.length, currentParts.length)

  for (let index = 0; index < length; index += 1) {
    const difference = (candidateParts[index] ?? 0) - (currentParts[index] ?? 0)
    if (difference !== 0) return difference > 0
  }

  return false
}

function readCachedUpdateRelease(): { checkedAt: number; release: UpdateRelease } | null {
  try {
    const raw = localStorage.getItem(updateCheckCacheKey)
    if (!raw) return null

    const cached = JSON.parse(raw) as { checkedAt?: number; release?: UpdateRelease }
    const checkedAt = cached.checkedAt
    if (typeof checkedAt !== 'number' || !Number.isFinite(checkedAt) || !cached.release?.version || !cached.release.url) return null

    const assets = Array.isArray(cached.release.assets)
      ? cached.release.assets.filter((asset) => asset?.name && asset?.url)
      : []

    return {
      checkedAt,
      release: {
        ...cached.release,
        source: cached.release.source === 'gitcode' ? 'gitcode' : 'github',
        assets,
      },
    }
  } catch {
    return null
  }
}

function cacheUpdateRelease(release: UpdateRelease) {
  try {
    localStorage.setItem(updateCheckCacheKey, JSON.stringify({ checkedAt: Date.now(), release }))
  } catch {
    // Ignore localStorage failures in restricted preview environments.
  }
}

async function fetchLatestCrewFlowRelease() {
  if (window.desktopBridge?.checkAppUpdate) return window.desktopBridge.checkAppUpdate()

  const response = await fetch(crewFlowGitHubLatestReleaseUrl, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error(`版本检查失败：${response.status}`)

  const release = (await response.json()) as {
    tag_name?: string
    html_url?: string
    body?: string
    assets?: Array<{ name?: string; browser_download_url?: string; digest?: string }>
  }
  const version = release.tag_name?.replace(/^v/i, '').trim() ?? ''
  if (!version || !release.html_url) throw new Error('版本检查失败：未找到正式版')

  return {
    version,
    url: release.html_url,
    notes: release.body?.trim() ?? '',
    source: 'github',
    assets: (release.assets ?? [])
      .filter((asset) => asset.name && asset.browser_download_url)
      .map((asset) => ({
        name: asset.name as string,
        url: asset.browser_download_url as string,
        digest: typeof asset.digest === 'string' ? asset.digest : undefined,
      })),
  } satisfies UpdateRelease
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return (await response.json()) as unknown
  } finally {
    window.clearTimeout(timer)
  }
}

async function searchWeatherLocations(query: string): Promise<WeatherLocation[]> {
  const params = new URLSearchParams({
    name: query.trim(),
    count: '8',
    language: 'zh',
    format: 'json',
  })
  const body = (await fetchJsonWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?${params}`)) as {
    results?: Array<Partial<WeatherLocation>>
  }

  return (body.results ?? [])
    .filter(
      (item) =>
        typeof item.id === 'number' &&
        typeof item.name === 'string' &&
        typeof item.latitude === 'number' &&
        typeof item.longitude === 'number',
    )
    .map((item) => ({
      id: item.id as number,
      name: item.name as string,
      admin1: typeof item.admin1 === 'string' ? item.admin1 : '',
      country: typeof item.country === 'string' ? item.country : '',
      latitude: item.latitude as number,
      longitude: item.longitude as number,
      timezone: typeof item.timezone === 'string' ? item.timezone : 'auto',
    }))
}

async function fetchWeatherSnapshot(location: WeatherLocation): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    timezone: 'auto',
    forecast_days: '1',
  })
  const body = (await fetchJsonWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`)) as {
    current?: {
      temperature_2m?: number
      apparent_temperature?: number
      weather_code?: number
      wind_speed_10m?: number
      is_day?: number
    }
  }
  const current = body.current
  if (
    typeof current?.temperature_2m !== 'number' ||
    typeof current.apparent_temperature !== 'number' ||
    typeof current.weather_code !== 'number' ||
    typeof current.wind_speed_10m !== 'number'
  ) {
    throw new Error('天气服务未返回完整数据')
  }

  return {
    locationKey: weatherLocationKey(location),
    temperature: current.temperature_2m,
    apparentTemperature: current.apparent_temperature,
    weatherCode: current.weather_code,
    windSpeed: current.wind_speed_10m,
    isDay: current.is_day !== 0,
    fetchedAt: Date.now(),
  }
}

class TeamDataConflictError extends Error {
  currentData?: AppData
  code?: string

  constructor(message: string, currentData?: AppData, code?: string) {
    super(message)
    this.name = 'TeamDataConflictError'
    this.currentData = currentData
    this.code = code
  }
}

async function fetchTeamAppData(serverUrl: string, accessKey: string) {
  const response = await fetch(teamApiUrl(serverUrl, '/api/app-data'), {
    headers: teamRequestHeaders(accessKey),
  })
  if (!response.ok) throw new Error(`团队数据读取失败：${response.status}`)
  return (await response.json()) as AppData
}

function shouldRetryInitialTeamLoad(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return !/团队数据读取失败：(400|401|403|404)\b/.test(message)
}

async function saveLegacyTeamAppData(serverUrl: string, accessKey: string, data: Partial<AppData>, baseRevision?: number | null) {
  const payload = Number.isInteger(baseRevision) ? { ...data, baseRevision } : data
  const response = await fetch(teamApiUrl(serverUrl, '/api/app-data'), {
    method: 'PUT',
    headers: teamRequestHeaders(accessKey, true),
    body: JSON.stringify(payload),
  })
  if (response.status === 409) {
    const body = (await response.json()) as { current?: AppData; error?: string; code?: string }
    throw new TeamDataConflictError(body.error || '团队数据已被其他电脑更新，请重新同步后再试。', body.current, body.code)
  }
  if (!response.ok) throw new Error(`团队数据保存失败：${response.status}`)
  return (await response.json()) as AppData
}

async function fetchTeamAppDataChanges(serverUrl: string, accessKey: string, sinceRevision: number) {
  const response = await fetch(teamApiUrl(serverUrl, `/api/app-data/changes?since=${encodeURIComponent(sinceRevision)}`), {
    headers: teamRequestHeaders(accessKey),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`团队增量数据读取失败：${response.status}`)
  return (await response.json()) as TeamDataChangesResponse
}

async function saveTeamAppDataChanges(
  serverUrl: string,
  accessKey: string,
  mutations: TeamDataMutation[],
  version: string,
  baseRevision?: number | null,
) {
  const response = await fetch(teamApiUrl(serverUrl, '/api/app-data/changes'), {
    method: 'PUT',
    headers: teamRequestHeaders(accessKey, true),
    body: JSON.stringify({
      baseRevision: Number.isInteger(baseRevision) ? baseRevision : undefined,
      version,
      mutations,
    }),
  })
  if (response.status === 404) return null
  if (response.status === 409) {
    const body = (await response.json()) as { current?: AppData; error?: string; code?: string }
    throw new TeamDataConflictError(body.error || '团队数据已被其他电脑更新，请重新同步后再试。', body.current, body.code)
  }
  if (!response.ok) throw new Error(`团队增量数据保存失败：${response.status}`)
  return (await response.json()) as TeamDataChangesResponse
}

const teamArrayCollections: TeamDataArrayCollection[] = [
  'projects',
  'tasks',
  'calendarItems',
  'financeRecords',
  'staffMembers',
  'accounts',
  'holidayItems',
]

function normalizeTeamAppData(savedData: AppData): AppData {
  return {
    ...savedData,
    version: savedData.version || projectDataStorageVersion,
    projects: (savedData.projects ?? []).map(normalizeProject),
    tasks: (savedData.tasks ?? []).map((task) => ({
      ...task,
      status: normalizeTaskStatus(task.status),
    })),
    calendarItems: savedData.calendarItems ?? [],
    financeRecords: (savedData.financeRecords ?? []).map(normalizeFinanceRecord),
    financeLedger: savedData.financeLedger ?? {},
    staffMembers: (savedData.staffMembers ?? []).map(normalizeStaffMember),
    accounts: mergeStoredAccounts(savedData.accounts ?? loginAccounts),
    holidayItems: (savedData.holidayItems ?? []).map(normalizeHolidayItem),
    workflowOptions: normalizeWorkflowOptions(savedData.workflowOptions),
  }
}

function teamDataRecordKey(collection: TeamDataArrayCollection, value: unknown) {
  const record = value as Record<string, unknown>
  const key =
    collection === 'financeRecords'
      ? record.projectId
      : collection === 'calendarItems'
        ? record.id ?? `${record.projectId}-${record.day}-${record.time}-${record.title}-${record.type}-${record.owner}`
        : record.id

  if (typeof key !== 'string' || !key) throw new Error(`团队数据记录缺少标识：${collection}`)
  return key
}

function createTeamDataMutations(data: Partial<AppData>, baseline: AppData) {
  const mutations: TeamDataMutation[] = []
  const partialRecord = data as unknown as Record<string, unknown>
  const baselineRecord = baseline as unknown as Record<string, unknown>

  teamArrayCollections.forEach((collection) => {
    if (!Object.prototype.hasOwnProperty.call(data, collection)) return
    const currentValues = (baselineRecord[collection] ?? []) as unknown[]
    const nextValues = (partialRecord[collection] ?? []) as unknown[]
    const currentByKey = new Map(currentValues.map((value) => [teamDataRecordKey(collection, value), value]))
    const nextByKey = new Map(nextValues.map((value) => [teamDataRecordKey(collection, value), value]))

    currentByKey.forEach((_value, key) => {
      if (!nextByKey.has(key)) mutations.push({ collection, operation: 'delete', key })
    })
    nextValues.forEach((value, position) => {
      const key = teamDataRecordKey(collection, value)
      const currentValue = currentByKey.get(key)
      if (!currentValue || JSON.stringify(currentValue) !== JSON.stringify(value)) {
        mutations.push({
          collection,
          operation: 'upsert',
          key,
          value,
          position: currentValue ? undefined : position,
        })
      }
    })
  })

  if (Object.prototype.hasOwnProperty.call(data, 'financeLedger')) {
    const currentLedger = baseline.financeLedger ?? {}
    const nextLedger = data.financeLedger ?? {}
    Object.keys(currentLedger).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(nextLedger, key)) {
        mutations.push({ collection: 'financeLedger', operation: 'delete', key })
      }
    })
    Object.entries(nextLedger).forEach(([key, value]) => {
      if (!Object.prototype.hasOwnProperty.call(currentLedger, key) || JSON.stringify(currentLedger[key]) !== JSON.stringify(value)) {
        mutations.push({ collection: 'financeLedger', operation: 'upsert', key, value })
      }
    })
  }

  if (
    Object.prototype.hasOwnProperty.call(data, 'workflowOptions') &&
    JSON.stringify(baseline.workflowOptions) !== JSON.stringify(data.workflowOptions)
  ) {
    mutations.push({
      collection: 'workflowOptions',
      operation: 'set',
      key: '__value__',
      value: normalizeWorkflowOptions(data.workflowOptions),
    })
  }

  return mutations
}

function teamMutationValue(data: AppData, mutation: TeamDataMutation) {
  if (teamArrayCollections.includes(mutation.collection as TeamDataArrayCollection)) {
    const collection = mutation.collection as TeamDataArrayCollection
    return data[collection]?.find((value) => teamDataRecordKey(collection, value) === mutation.key)
  }
  if (mutation.collection === 'financeLedger') return data.financeLedger?.[mutation.key]
  if (mutation.collection === 'workflowOptions') return data.workflowOptions
  return undefined
}

function canReplayTeamMutations(mutations: TeamDataMutation[], baseline: AppData, currentData: AppData) {
  return mutations.every((mutation) => {
    const baselineValue = teamMutationValue(baseline, mutation)
    const currentValue = teamMutationValue(currentData, mutation)
    return JSON.stringify(baselineValue) === JSON.stringify(currentValue)
  })
}

function applyTeamDataChanges(savedData: AppData, response: TeamDataChangesResponse) {
  const nextData = normalizeTeamAppData(savedData)
  const mutableData = nextData as unknown as Record<string, unknown>

  response.changes.forEach((change) => {
    if (teamArrayCollections.includes(change.collection as TeamDataArrayCollection)) {
      const collection = change.collection as TeamDataArrayCollection
      const values = [...((mutableData[collection] ?? []) as unknown[])]
      const currentIndex = values.findIndex((value) => teamDataRecordKey(collection, value) === change.key)

      if (change.operation === 'delete') {
        if (currentIndex >= 0) values.splice(currentIndex, 1)
      } else if (change.value !== undefined) {
        if (currentIndex >= 0) {
          values[currentIndex] = change.value
        } else {
          const position = Math.max(0, Math.min(change.position ?? values.length, values.length))
          values.splice(position, 0, change.value)
        }
      }
      mutableData[collection] = values
      return
    }

    if (change.collection === 'financeLedger') {
      const ledger = { ...(nextData.financeLedger ?? {}) }
      if (change.operation === 'delete') {
        delete ledger[change.key]
      } else if (change.value !== undefined) {
        ledger[change.key] = change.value as FinanceLedger[string]
      }
      nextData.financeLedger = ledger
      return
    }

    if (change.collection === 'workflowOptions' && change.value !== undefined) {
      nextData.workflowOptions = normalizeWorkflowOptions(change.value as WorkflowOptions)
    }
  })

  return normalizeTeamAppData({
    ...nextData,
    revision: response.revision,
    updatedAt: response.updatedAt,
  })
}

async function fetchTeamHealth(serverUrl: string) {
  const response = await fetch(teamApiUrl(serverUrl, '/health'))
  if (!response.ok) throw new Error(`连接失败：${response.status}`)
  return (await response.json()) as Partial<TeamServiceInfo> & { ok?: boolean; name?: string; revision?: number }
}

async function fetchTeamPresence(serverUrl: string, accessKey: string) {
  const response = await fetch(teamApiUrl(serverUrl, '/api/presence'), {
    headers: teamRequestHeaders(accessKey),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`在线成员读取失败：${response.status}`)
  return (await response.json()) as TeamPresenceResponse
}

async function updateTeamPresence(
  serverUrl: string,
  accessKey: string,
  member: Pick<TeamPresenceMember, 'accountId' | 'name' | 'role'> & { clientId: string },
) {
  const response = await fetch(teamApiUrl(serverUrl, '/api/presence'), {
    method: 'PUT',
    headers: teamRequestHeaders(accessKey, true),
    body: JSON.stringify(member),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`在线状态更新失败：${response.status}`)
  return (await response.json()) as TeamPresenceResponse
}

async function leaveTeamPresence(serverUrl: string, accessKey: string, clientId: string) {
  await fetch(teamApiUrl(serverUrl, '/api/presence'), {
    method: 'DELETE',
    headers: teamRequestHeaders(accessKey, true),
    body: JSON.stringify({ clientId }),
    keepalive: true,
  })
}

function clearLegacyLocalStorage() {
  try {
    legacyLocalStorageKeys.forEach((key) => localStorage.removeItem(key))
  } catch {
    // Ignore localStorage failures in restricted preview environments.
  }
}

function App() {
  const isWindowsDesktop = window.desktopBridge?.platform === 'win32'
  const [dataMode, setDataMode] = useState<DataMode>(() => loadStoredDataMode())
  const [teamServerUrl, setTeamServerUrl] = useState(() => loadStoredTeamServerUrl())
  const [teamAccessKey, setTeamAccessKey] = useState(() => loadStoredTeamAccessKey())
  const [teamConnectionStatus, setTeamConnectionStatus] = useState<TeamConnectionStatus>('idle')
  const [teamConnectionMessage, setTeamConnectionMessage] = useState('')
  const [lastTeamSyncAt, setLastTeamSyncAt] = useState<number | null>(null)
  const [teamPresenceMembers, setTeamPresenceMembers] = useState<TeamPresenceMember[] | null>(null)
  const [teamPresenceClientId] = useState(() => loadOrCreateTeamPresenceClientId())
  const [teamServiceInfo, setTeamServiceInfo] = useState<TeamServiceInfo | null>(null)
  const [teamServiceBusy, setTeamServiceBusy] = useState(false)
  const [teamServiceMessage, setTeamServiceMessage] = useState('')
  const [remoteTeamServiceHost, setRemoteTeamServiceHost] = useState('')
  const [showDataModeModal, setShowDataModeModal] = useState(false)
  const [currentAccountId, setCurrentAccountId] = useState(() => loadStoredAccountId())
  const [appProjects, setAppProjects] = useState<Project[]>(() => loadStoredProjects())
  const [appTasks, setAppTasks] = useState<Task[]>(() => loadStoredTasks())
  const [appCalendarItems, setAppCalendarItems] = useState<CalendarItem[]>(() => loadStoredCalendarItems())
  const [assistantCalendarDrafts, setAssistantCalendarDrafts] = useState<ProjectPlanPayload[]>([])
  const [appFinanceRecords, setAppFinanceRecords] = useState<FinanceRecord[]>(() => loadStoredFinanceRecords())
  const [appStaffMembers, setAppStaffMembers] = useState<StaffMember[]>(() => loadStoredStaffMembers())
  const [appAccounts, setAppAccounts] = useState<Account[]>(() => loadStoredAccounts())
  const [appHolidayItems, setAppHolidayItems] = useState<HolidayItem[]>(() => loadStoredHolidayItems())
  const [chinaHolidayItems, setChinaHolidayItems] = useState<HolidayItem[]>(() => {
    const today = new Date()
    return bundledChinaHolidayItems(chinaHolidayYearsForRange(today, addDays(today, maxCalendarRangeDays)))
  })
  const [chinaHolidaySync, setChinaHolidaySync] = useState<ChinaHolidaySyncState>({
    loading: true,
    source: 'bundled',
    unavailableYears: [],
  })
  const [appWorkflowOptions, setAppWorkflowOptions] = useState<WorkflowOptions>(() => loadStoredWorkflowOptions())
  const currentAccount = useMemo(() => appAccounts.find((account) => account.id === currentAccountId) ?? null, [appAccounts, currentAccountId])
  const currentWelcomeGuideKey = currentAccount ? welcomeGuideStorageKey(currentAccount) : ''
  const role = currentAccount?.role ?? 'controller'
  const [section, setSection] = useState<Section>(() => navItemsForRole(loadStoredAccounts().find((account) => account.id === loadStoredAccountId())?.role ?? 'controller')[0]?.id ?? 'dashboard')
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? '')
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [assistantNewProjectDraft, setAssistantNewProjectDraft] = useState<AssistantNewProjectDraft | null>(null)
  const [assistantProjectEditDraft, setAssistantProjectEditDraft] = useState<AssistantProjectEditDraft | null>(null)
  const [assistantTaskEditDraft, setAssistantTaskEditDraft] = useState<AssistantTaskEditDraft | null>(null)
  const [assistantWeatherQuery, setAssistantWeatherQuery] = useState('')
  const [assistantWorkScheduleDraft, setAssistantWorkScheduleDraft] = useState<WorkSchedule | null>(null)
  const [showControllerAccountModal, setShowControllerAccountModal] = useState(false)
  const [showWorkflowOptionsModal, setShowWorkflowOptionsModal] = useState(false)
  const [setupDraft, setSetupDraft] = useState<ProjectSetupDraft | null>(null)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [handoffProject, setHandoffProject] = useState<{ project: Project; personName: string } | null>(null)
  const [dataReady, setDataReady] = useState(false)
  const [loadedDataSourceKey, setLoadedDataSourceKey] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [filterStatus, setFilterStatus] = useState<ProjectFilterStatus>('all')
  const [filterType, setFilterType] = useState('全部类型')
  const [loginAccountId, setLoginAccountId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(false)
  const [showUserGuide, setShowUserGuide] = useState(false)
  const [updateCheckStatus, setUpdateCheckStatus] = useState<UpdateCheckStatus>('idle')
  const [availableUpdate, setAvailableUpdate] = useState<UpdateRelease | null>(null)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [appUpdateInstallState, setAppUpdateInstallState] = useState<AppUpdateInstallState>(defaultAppUpdateInstallState)
  const [weatherLocation, setWeatherLocation] = useState<WeatherLocation | null>(() => loadStoredWeatherLocation())
  const [weatherSnapshot, setWeatherSnapshot] = useState<WeatherSnapshot | null>(() => {
    const location = loadStoredWeatherLocation()
    return loadStoredWeatherSnapshot(location)
  })
  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus>(() => (loadStoredWeatherLocation() ? 'loading' : 'idle'))
  const [weatherError, setWeatherError] = useState('')
  const [workSchedule, setWorkSchedule] = useState<WorkSchedule | null>(() => loadStoredWorkSchedule(currentAccount?.id ?? ''))
  const [showWeatherSettings, setShowWeatherSettings] = useState(false)
  const [showWorkScheduleSettings, setShowWorkScheduleSettings] = useState(false)
  const dataSourceKey = dataMode === 'team' ? `team:${normalizeTeamServerUrl(teamServerUrl)}:${teamAccessKey.trim()}` : 'single'
  const dataSourceReady = dataReady && loadedDataSourceKey === dataSourceKey
  const workspaceRef = useRef<HTMLElement | null>(null)
  const teamDataRevisionRef = useRef<number | null>(null)
  const teamSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const teamSavePendingRef = useRef(0)
  const teamSyncPendingRef = useRef(false)
  const teamResolvedConflictDataRef = useRef<AppData | null>(null)
  const teamServiceInfoRef = useRef<TeamServiceInfo | null>(null)
  const updateCheckPendingRef = useRef(false)
  const weatherRequestIdRef = useRef(0)
  const chinaHolidayRequestIdRef = useRef(0)
  const remoteTeamDataRef = useRef<AppData | null>(null)
  const teamIncrementalCapabilityRef = useRef<TeamIncrementalCapability>('unknown')
  const remoteSliceSnapshotsRef = useRef<Partial<Record<TeamDataCollection, string>>>({})
  const rememberRemoteSlices = useCallback((savedData: AppData) => {
    const normalizedData = normalizeTeamAppData(savedData)
    remoteTeamDataRef.current = normalizedData
    remoteSliceSnapshotsRef.current = {
      projects: JSON.stringify(normalizedData.projects),
      tasks: JSON.stringify(normalizedData.tasks),
      calendarItems: JSON.stringify(normalizedData.calendarItems),
      financeRecords: JSON.stringify(normalizedData.financeRecords),
      financeLedger: JSON.stringify(normalizedData.financeLedger),
      staffMembers: JSON.stringify(normalizedData.staffMembers),
      accounts: JSON.stringify(normalizedData.accounts),
      holidayItems: JSON.stringify(normalizedData.holidayItems),
      workflowOptions: JSON.stringify(normalizedData.workflowOptions),
    }
    teamDataRevisionRef.current = typeof normalizedData.revision === 'number' ? normalizedData.revision : null
  }, [])
  const updateTeamServiceInfoState = useCallback((info: TeamServiceInfo | null) => {
    teamServiceInfoRef.current = info
    setTeamServiceInfo(info)
  }, [])

  const checkForUpdates = useCallback(async (force = false) => {
    if (updateCheckPendingRef.current) return

    const cached = readCachedUpdateRelease()
    if (!force && cached && Date.now() - cached.checkedAt < updateCheckIntervalMs) {
      if (isNewerVersion(cached.release.version, appVersion)) {
        setAvailableUpdate(cached.release)
        setUpdateCheckStatus('available')
      } else {
        setAvailableUpdate(null)
        setUpdateCheckStatus('up-to-date')
      }
      return
    }

    updateCheckPendingRef.current = true
    setUpdateCheckStatus('checking')
    try {
      const release = await fetchLatestCrewFlowRelease()
      cacheUpdateRelease(release)

      if (isNewerVersion(release.version, appVersion)) {
        setAvailableUpdate(release)
        setUpdateCheckStatus('available')
      } else {
        setAvailableUpdate(null)
        setUpdateCheckStatus('up-to-date')
      }
    } catch {
      setUpdateCheckStatus('error')
    } finally {
      updateCheckPendingRef.current = false
    }
  }, [])

  const refreshCurrentWeather = useCallback(async (location: WeatherLocation) => {
    const requestId = weatherRequestIdRef.current + 1
    weatherRequestIdRef.current = requestId
    setWeatherStatus('loading')
    setWeatherError('')

    try {
      const snapshot = await fetchWeatherSnapshot(location)
      if (weatherRequestIdRef.current !== requestId) return
      saveStoredWeatherSnapshot(snapshot)
      setWeatherSnapshot(snapshot)
      setWeatherStatus('ready')
    } catch (error) {
      if (weatherRequestIdRef.current !== requestId) return
      setWeatherStatus('error')
      setWeatherError(error instanceof Error ? error.message : '天气更新失败')
    }
  }, [])

  const refreshChinaHolidays = useCallback(async (forceRefresh = false) => {
    const requestId = chinaHolidayRequestIdRef.current + 1
    chinaHolidayRequestIdRef.current = requestId
    const today = new Date()
    const years = chinaHolidayYearsForRange(today, addDays(today, maxCalendarRangeDays))
    setChinaHolidaySync((current) => ({ ...current, loading: true }))

    try {
      const result = await loadChinaHolidayItems(years, forceRefresh)
      if (chinaHolidayRequestIdRef.current !== requestId) return
      setChinaHolidayItems(result.items)
      setChinaHolidaySync({
        loading: false,
        source: result.source,
        updatedAt: result.updatedAt,
        unavailableYears: result.unavailableYears,
      })
    } catch {
      if (chinaHolidayRequestIdRef.current !== requestId) return
      setChinaHolidaySync((current) => ({ ...current, loading: false }))
    }
  }, [])

  const remoteHostForTeamServer = useCallback((info?: TeamServiceInfo | null) => {
    const localInfo = info === undefined ? teamServiceInfoRef.current : info
    return isLocalTeamServerUrl(teamServerUrl, localInfo) ? '' : teamServerDisplayHost(teamServerUrl)
  }, [teamServerUrl])

  const rememberConnectedTeamHost = useCallback((info?: TeamServiceInfo | null) => {
    setRemoteTeamServiceHost(remoteHostForTeamServer(info))
  }, [remoteHostForTeamServer])
  const markTeamSync = useCallback(() => {
    setLastTeamSyncAt(Date.now())
  }, [])

  const refreshTeamServiceInfo = useCallback(async () => {
    if (!window.desktopBridge?.getTeamServiceInfo) {
      updateTeamServiceInfoState({
        supported: false,
        platform: 'browser',
        running: false,
        localUrl: defaultTeamServerUrl,
        connectionUrl: defaultTeamServerUrl,
        urls: [defaultTeamServerUrl],
        message: '请在 CrewFlow 桌面 App 中开启团队服务',
      })
      setTeamServiceMessage('请在 CrewFlow 桌面 App 中开启团队服务')
      return
    }

    setTeamServiceBusy(true)
    try {
      const info = await window.desktopBridge.getTeamServiceInfo()
      updateTeamServiceInfoState(info)
      setTeamServiceMessage(info.message)
      if (teamConnectionStatus === 'connected') setRemoteTeamServiceHost(remoteHostForTeamServer(info))
      if (info.accessKey && isLocalTeamServerUrl(teamServerUrl, info)) {
        setTeamAccessKey(info.accessKey)
        try {
          localStorage.setItem(teamAccessKeyStorageKey, info.accessKey)
        } catch {
          // Ignore localStorage failures in restricted preview environments.
        }
      }
    } catch (error) {
      setTeamServiceMessage(error instanceof Error ? error.message : '团队服务状态读取失败')
    } finally {
      setTeamServiceBusy(false)
    }
  }, [remoteHostForTeamServer, teamConnectionStatus, teamServerUrl, updateTeamServiceInfoState])

  const shouldSaveSlice = useCallback(
    (key: AppDataSliceKey, value: unknown) => {
      if (dataMode !== 'team') return true
      return remoteSliceSnapshotsRef.current[key] !== JSON.stringify(value)
    },
    [dataMode],
  )
  const applyAppDataToState = useCallback(
    (savedData: AppData) => {
      const normalizedData = normalizeTeamAppData(savedData)
      rememberRemoteSlices(normalizedData)
      const calendarItems = ensureProjectCalendarItems(normalizedData.projects, normalizedData.calendarItems)
      const projects = reconcileProjectTimelines(normalizedData.projects, calendarItems)

      setAppProjects(projects)
      setAppTasks(normalizedData.tasks)
      setAppCalendarItems(calendarItems)
      setAppFinanceRecords(normalizedData.financeRecords)
      setAppStaffMembers(normalizedData.staffMembers ?? [])
      setAppAccounts(normalizedData.accounts ?? loginAccounts)
      setAppHolidayItems(normalizedData.holidayItems ?? [])
      setAppWorkflowOptions(normalizedData.workflowOptions ?? defaultWorkflowOptions)
    },
    [rememberRemoteSlices],
  )
  const loadCurrentAppData = useCallback<AppDataLoader>(async () => {
    if (dataMode === 'team') {
      const savedData = await fetchTeamAppData(teamServerUrl, teamAccessKey)
      rememberRemoteSlices(savedData)
      return savedData
    }
    return window.desktopBridge?.loadAppData?.() ?? null
  }, [dataMode, rememberRemoteSlices, teamAccessKey, teamServerUrl])
  const saveCurrentAppData = useCallback<AppDataSaver>(
    async (data) => {
      if (dataMode === 'team') {
        teamSavePendingRef.current += 1

        const saveTask = async () => {
          try {
            // Effects can update several data slices in one user action. Serialize them so every
            // request uses the revision returned by the preceding local save.
            const baseline = remoteTeamDataRef.current
            if (teamIncrementalCapabilityRef.current !== 'legacy' && baseline) {
              const mutations = createTeamDataMutations(data, baseline)
              if (mutations.length === 0) {
                setTeamConnectionStatus('connected')
                setTeamConnectionMessage('团队数据已同步')
                return true
              }

              setTeamConnectionStatus('checking')
              setTeamConnectionMessage('正在保存团队数据')

              let retryBaseline = baseline
              let retryRevision = teamDataRevisionRef.current
              let resolvedConflict = false

              for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                  const response = await saveTeamAppDataChanges(
                    teamServerUrl,
                    teamAccessKey,
                    mutations,
                    data.version ?? projectDataStorageVersion,
                    retryRevision,
                  )
                  if (!response) {
                    teamIncrementalCapabilityRef.current = 'legacy'
                    break
                  }

                  teamIncrementalCapabilityRef.current = 'supported'
                  const savedData = applyTeamDataChanges(retryBaseline, response)
                  rememberRemoteSlices(savedData)
                  if (resolvedConflict || teamResolvedConflictDataRef.current) {
                    teamResolvedConflictDataRef.current = savedData
                  }
                  rememberConnectedTeamHost()
                  setTeamConnectionStatus('connected')
                  setTeamConnectionMessage(resolvedConflict ? '团队数据冲突已自动合并并保存' : '团队数据已保存')
                  markTeamSync()
                  return true
                } catch (error) {
                  if (
                    error instanceof TeamDataConflictError &&
                    error.currentData &&
                    error.code !== 'UNSAFE_DATA_CHANGE' &&
                    canReplayTeamMutations(mutations, retryBaseline, normalizeTeamAppData(error.currentData)) &&
                    attempt < 2
                  ) {
                    retryBaseline = normalizeTeamAppData(error.currentData)
                    retryRevision = retryBaseline.revision ?? null
                    resolvedConflict = true
                    rememberRemoteSlices(retryBaseline)
                    continue
                  }
                  throw error
                }
              }
            }

            setTeamConnectionStatus('checking')
            setTeamConnectionMessage('正在保存团队数据')
            const savedData = await saveLegacyTeamAppData(teamServerUrl, teamAccessKey, data, teamDataRevisionRef.current)
            rememberRemoteSlices(savedData)
            rememberConnectedTeamHost()
            setTeamConnectionStatus('connected')
            setTeamConnectionMessage('团队数据已保存')
            markTeamSync()
            return true
          } catch (error) {
            if (error instanceof TeamDataConflictError && error.currentData) {
              applyAppDataToState(error.currentData)
              markTeamSync()
              setTeamConnectionStatus('error')
              setTeamConnectionMessage(
                error.code === 'UNSAFE_DATA_CHANGE'
                  ? '已阻止异常批量删除并重新同步团队数据。'
                  : '团队数据已被其他电脑更新，已重新同步，请再操作一次。',
              )
              return false
            }
            setTeamConnectionStatus('error')
            setTeamConnectionMessage(error instanceof Error ? error.message : '团队数据保存失败')
            throw error
          }
        }

        const queuedSave = teamSaveQueueRef.current.then(saveTask, saveTask)
        teamSaveQueueRef.current = queuedSave.then(
          () => undefined,
          () => undefined,
        )

        return queuedSave.finally(() => {
          teamSavePendingRef.current = Math.max(0, teamSavePendingRef.current - 1)
          if (teamSavePendingRef.current === 0 && teamResolvedConflictDataRef.current) {
            const resolvedData = teamResolvedConflictDataRef.current
            teamResolvedConflictDataRef.current = null
            applyAppDataToState(resolvedData)
          }
        })
      }
      return window.desktopBridge?.saveAppData?.(data) ?? false
    },
    [applyAppDataToState, dataMode, markTeamSync, rememberConnectedTeamHost, rememberRemoteSlices, teamAccessKey, teamServerUrl],
  )
  const currentAppDataSnapshot = useMemo<AppData>(
    () => ({
      version: projectDataStorageVersion,
      projects: appProjects,
      tasks: appTasks,
      calendarItems: appCalendarItems,
      financeRecords: appFinanceRecords,
      financeLedger: {},
      staffMembers: appStaffMembers,
      accounts: appAccounts,
      holidayItems: appHolidayItems,
      workflowOptions: appWorkflowOptions,
    }),
    [appAccounts, appCalendarItems, appFinanceRecords, appHolidayItems, appProjects, appStaffMembers, appTasks, appWorkflowOptions],
  )
  const currentAppDataSnapshotRef = useRef(currentAppDataSnapshot)
  currentAppDataSnapshotRef.current = currentAppDataSnapshot

  async function prepareAndInstallApplicationUpdate() {
    const bridge = window.desktopBridge
    if (!bridge?.installAppUpdate) return

    try {
      setAppUpdateInstallState((current) => ({
        ...current,
        status: 'installing',
        message: '正在等待当前数据保存',
      }))

      // Wait for the latest edit render, then explicitly persist every state-backed slice.
      // Merely waiting for the queue can miss an edit whose save effect has not run yet.
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      const latestData = currentAppDataSnapshotRef.current
      const saved = await saveCurrentAppData({
        version: latestData.version,
        projects: latestData.projects,
        tasks: latestData.tasks,
        calendarItems: latestData.calendarItems,
        financeRecords: latestData.financeRecords,
        staffMembers: latestData.staffMembers,
        accounts: latestData.accounts,
        holidayItems: latestData.holidayItems,
        workflowOptions: latestData.workflowOptions,
      })
      if (!saved) throw new Error('当前修改尚未保存，已取消更新。请确认团队连接后重试。')

      if (dataMode === 'team') {
        while (true) {
          const pendingSave = teamSaveQueueRef.current
          await pendingSave
          if (pendingSave === teamSaveQueueRef.current) break
        }
      }
      const state = await bridge.installAppUpdate()
      setAppUpdateInstallState(state)
    } catch (error) {
      setAppUpdateInstallState((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : '更新安装准备失败',
      }))
    }
  }

  useEffect(() => {
    clearLegacyLocalStorage()
  }, [])

  useEffect(() => {
    const bridge = window.desktopBridge
    if (!bridge?.getAppUpdateState || !bridge.onAppUpdateState) return

    let active = true
    void bridge.getAppUpdateState().then((state) => {
      if (active) setAppUpdateInstallState(state)
    })
    const unsubscribe = bridge.onAppUpdateState((state) => {
      if (active) setAppUpdateInstallState(state)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    teamIncrementalCapabilityRef.current = 'unknown'
    remoteTeamDataRef.current = null
    remoteSliceSnapshotsRef.current = {}
    teamDataRevisionRef.current = null
    setLastTeamSyncAt(null)
  }, [dataMode, teamAccessKey, teamServerUrl])

  useEffect(() => {
    setWorkSchedule(loadStoredWorkSchedule(currentAccount?.id ?? ''))
    setShowWorkScheduleSettings(false)
  }, [currentAccount?.id])

  useEffect(() => {
    if (!weatherLocation) {
      weatherRequestIdRef.current += 1
      setWeatherSnapshot(null)
      setWeatherStatus('idle')
      setWeatherError('')
      return
    }

    const cached = loadStoredWeatherSnapshot(weatherLocation)
    setWeatherSnapshot(cached)
    setWeatherStatus(cached ? 'ready' : 'loading')
    setWeatherError('')

    if (!cached || Date.now() - cached.fetchedAt >= weatherRefreshIntervalMs) {
      void refreshCurrentWeather(weatherLocation)
    }
    const timer = window.setInterval(() => {
      void refreshCurrentWeather(weatherLocation)
    }, weatherRefreshIntervalMs)

    return () => {
      window.clearInterval(timer)
      weatherRequestIdRef.current += 1
    }
  }, [refreshCurrentWeather, weatherLocation])

  const calendarHolidayYearsKey = chinaHolidayYearsForRange(now, addDays(now, maxCalendarRangeDays)).join(',')

  useEffect(() => {
    void refreshChinaHolidays()

    return () => {
      chinaHolidayRequestIdRef.current += 1
    }
  }, [calendarHolidayYearsKey, refreshChinaHolidays])

  useEffect(() => {
    if (!currentAccount?.id) return
    void checkForUpdates()
  }, [checkForUpdates, currentAccount?.id])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30 * 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let canceled = false
    const loadingSourceKey = dataSourceKey

    async function loadFileData() {
      setDataReady(false)
      setLoadedDataSourceKey('')
      let attempt = 0

      if (dataMode === 'team') {
        setTeamConnectionStatus('checking')
        setTeamConnectionMessage('正在连接团队服务')
      }

      while (!canceled) {
        if (attempt > 0) {
          setTeamConnectionStatus('checking')
          setTeamConnectionMessage('团队服务暂不可用，2 秒后自动重连')
          await new Promise((resolve) => window.setTimeout(resolve, teamStartupRetryIntervalMs))
          if (canceled) return
        }

        try {
          const savedData = await loadCurrentAppData()
          if (canceled) return

          if (savedData) applyAppDataToState(savedData)
          if (dataMode === 'team') {
            rememberConnectedTeamHost()
            setTeamConnectionStatus('connected')
            setTeamConnectionMessage(attempt > 0 ? '团队服务已恢复并同步' : '团队数据已连接')
            markTeamSync()
          }
          setLoadedDataSourceKey(loadingSourceKey)
          setDataReady(true)
          return
        } catch (error) {
          if (dataMode !== 'team' || !shouldRetryInitialTeamLoad(error)) throw error
          attempt += 1
        }
      }
    }

    loadFileData().catch((error) => {
      if (canceled) return
      if (dataMode === 'team') {
        setTeamConnectionStatus('error')
        setTeamConnectionMessage(error instanceof Error ? error.message : '团队服务连接失败')
      }
      setLoadedDataSourceKey('')
      setDataReady(false)
    })

    return () => {
      canceled = true
    }
  }, [applyAppDataToState, dataMode, dataSourceKey, loadCurrentAppData, markTeamSync, rememberConnectedTeamHost])

  useEffect(() => {
    if (!dataSourceReady) return
    setAppProjects((current) => reconcileProjectTimelines(current, appCalendarItems))
  }, [appCalendarItems, dataSourceReady])

  useEffect(() => {
    if (!dataSourceReady) return
    localStorage.setItem('crewflow-project-data-version', projectDataStorageVersion)
    localStorage.setItem('crewflow-projects', JSON.stringify(appProjects))
    if (!shouldSaveSlice('projects', appProjects)) return
    saveCurrentAppData({
      version: projectDataStorageVersion,
      projects: appProjects,
    }).catch(() => undefined)
  }, [appProjects, dataSourceReady, saveCurrentAppData, shouldSaveSlice])

  useEffect(() => {
    if (!dataSourceReady) return
    localStorage.setItem('crewflow-tasks', JSON.stringify(appTasks))
    if (!shouldSaveSlice('tasks', appTasks)) return
    saveCurrentAppData({
      version: projectDataStorageVersion,
      tasks: appTasks,
    }).catch(() => undefined)
  }, [appTasks, dataSourceReady, saveCurrentAppData, shouldSaveSlice])

  useEffect(() => {
    if (!dataSourceReady) return
    localStorage.setItem('crewflow-calendar-items', JSON.stringify(appCalendarItems))
    if (!shouldSaveSlice('calendarItems', appCalendarItems)) return
    saveCurrentAppData({
      version: projectDataStorageVersion,
      calendarItems: appCalendarItems,
    }).catch(() => undefined)
  }, [appCalendarItems, dataSourceReady, saveCurrentAppData, shouldSaveSlice])

  useEffect(() => {
    if (!dataSourceReady) return
    localStorage.setItem('crewflow-staff-members', JSON.stringify(appStaffMembers))
    if (!shouldSaveSlice('staffMembers', appStaffMembers)) return
    saveCurrentAppData({
      version: projectDataStorageVersion,
      staffMembers: appStaffMembers,
    }).catch(() => undefined)
  }, [appStaffMembers, dataSourceReady, saveCurrentAppData, shouldSaveSlice])

  useEffect(() => {
    if (!dataSourceReady) return
    localStorage.setItem('crewflow-accounts', JSON.stringify(appAccounts))
    if (!shouldSaveSlice('accounts', appAccounts)) return
    saveCurrentAppData({
      version: projectDataStorageVersion,
      accounts: appAccounts,
    }).catch(() => undefined)
  }, [appAccounts, dataSourceReady, saveCurrentAppData, shouldSaveSlice])

  useEffect(() => {
    if (!dataSourceReady) return
    localStorage.setItem('crewflow-holiday-items', JSON.stringify(appHolidayItems))
    if (!shouldSaveSlice('holidayItems', appHolidayItems)) return
    saveCurrentAppData({
      version: projectDataStorageVersion,
      holidayItems: appHolidayItems,
    }).catch(() => undefined)
  }, [appHolidayItems, dataSourceReady, saveCurrentAppData, shouldSaveSlice])

  useEffect(() => {
    if (!dataSourceReady) return
    localStorage.setItem(workflowOptionsStorageKey, JSON.stringify(appWorkflowOptions))
    if (!shouldSaveSlice('workflowOptions', appWorkflowOptions)) return
    saveCurrentAppData({
      version: projectDataStorageVersion,
      workflowOptions: appWorkflowOptions,
    }).catch(() => undefined)
  }, [appWorkflowOptions, dataSourceReady, saveCurrentAppData, shouldSaveSlice])

  useEffect(() => {
    if (dataMode !== 'team' || !dataSourceReady) return

    const timer = window.setInterval(() => {
      if (teamSavePendingRef.current > 0 || teamSyncPendingRef.current) return
      teamSyncPendingRef.current = true

      async function syncTeamData() {
        const baseline = remoteTeamDataRef.current
        const revision = teamDataRevisionRef.current

        if (teamIncrementalCapabilityRef.current !== 'legacy' && baseline && Number.isInteger(revision)) {
          const response = await fetchTeamAppDataChanges(teamServerUrl, teamAccessKey, revision as number)
          if (response) {
            teamIncrementalCapabilityRef.current = 'supported'
            let receivedChanges = false
            if (response.resetRequired) {
              const savedData = await fetchTeamAppData(teamServerUrl, teamAccessKey)
              applyAppDataToState(savedData)
              receivedChanges = true
            } else if (response.changes.length > 0) {
              applyAppDataToState(applyTeamDataChanges(baseline, response))
              receivedChanges = true
            }
            if (receivedChanges) markTeamSync()
            rememberConnectedTeamHost()
            setTeamConnectionStatus('connected')
            setTeamConnectionMessage('团队数据已同步')
            return
          }
          teamIncrementalCapabilityRef.current = 'legacy'
        }

        const savedData = await loadCurrentAppData()
        if (savedData) applyAppDataToState(savedData)
        if (
          savedData &&
          (!baseline || savedData.revision !== revision || savedData.updatedAt !== baseline.updatedAt)
        ) {
          markTeamSync()
        }
        rememberConnectedTeamHost()
        setTeamConnectionStatus('connected')
        setTeamConnectionMessage('团队数据已同步')
      }

      syncTeamData()
        .catch((error) => {
          setTeamConnectionStatus('error')
          setTeamConnectionMessage(error instanceof Error ? error.message : '团队数据同步失败')
        })
        .finally(() => {
          teamSyncPendingRef.current = false
        })
    }, 2 * 1000)

    return () => window.clearInterval(timer)
  }, [applyAppDataToState, dataMode, dataSourceReady, loadCurrentAppData, markTeamSync, rememberConnectedTeamHost, teamAccessKey, teamServerUrl])

  useEffect(() => {
    if (!showDataModeModal) return
    refreshTeamServiceInfo()
  }, [refreshTeamServiceInfo, showDataModeModal])

  const activeNavItems = useMemo(() => navItemsForRole(role), [role])
  const currentUser =
    (currentAccount?.staffId ? appStaffMembers.find((member) => member.id === currentAccount.staffId)?.name : null) ??
    currentAccount?.userName ??
    null
  const presenceAccountId = currentAccount?.id ?? ''
  const presenceAccountRole = currentAccount?.role ?? null
  const presenceAccountName = currentUser?.trim() || currentAccount?.userName.trim() || currentAccount?.label || presenceAccountId

  useEffect(() => {
    if (dataMode !== 'team' || !dataSourceReady) {
      setTeamPresenceMembers(null)
      return
    }

    let active = true
    const presenceClientId = presenceAccountId
      ? `${teamPresenceClientId}:${presenceAccountId}`.slice(0, 120)
      : ''
    const refreshPresence = async () => {
      try {
        const response = presenceAccountId && presenceAccountRole
          ? await updateTeamPresence(teamServerUrl, teamAccessKey, {
              clientId: presenceClientId,
              accountId: presenceAccountId,
              name: presenceAccountName,
              role: presenceAccountRole,
            })
          : await fetchTeamPresence(teamServerUrl, teamAccessKey)
        if (active) setTeamPresenceMembers(response?.members ?? null)
      } catch {
        if (active) setTeamPresenceMembers(null)
      }
    }

    void refreshPresence()
    const timer = window.setInterval(refreshPresence, teamPresenceHeartbeatIntervalMs)

    return () => {
      active = false
      window.clearInterval(timer)
      if (presenceClientId) {
        void leaveTeamPresence(teamServerUrl, teamAccessKey, presenceClientId).catch(() => undefined)
      }
    }
  }, [dataMode, dataSourceReady, presenceAccountId, presenceAccountName, presenceAccountRole, teamAccessKey, teamPresenceClientId, teamServerUrl])

  useEffect(() => {
    if (activeNavItems.some((item) => item.id === section)) return
    setSection(activeNavItems[0]?.id ?? 'dashboard')
  }, [activeNavItems, section])

  useEffect(() => {
    if (workspaceRef.current) workspaceRef.current.scrollTop = 0
  }, [section])

  useEffect(() => {
    if (!currentWelcomeGuideKey) {
      setShowWelcomeGuide(false)
      return
    }

    try {
      setShowWelcomeGuide(localStorage.getItem(currentWelcomeGuideKey) !== 'true')
    } catch {
      setShowWelcomeGuide(true)
    }
  }, [currentWelcomeGuideKey])

  const roleVisibleProjects = useMemo(() => {
    if (role === 'controller' || role === 'admin' || role === 'finance') return appProjects
    if (!currentUser) return []
    if (role === 'manager') return appProjects.filter((project) => isProjectLead(project, currentUser))

    const memberProjectIds = new Set(appTasks.filter((task) => task.assignee === currentUser).map((task) => task.projectId))
    return appProjects.filter((project) => memberProjectIds.has(project.id))
  }, [appProjects, appTasks, currentUser, role])
  const projectTypeFilterOptions = useMemo(
    () => uniqueCleanOptions([...appWorkflowOptions.projectTypes, ...appProjects.map((project) => project.type)], []),
    [appProjects, appWorkflowOptions.projectTypes],
  )

  useEffect(() => {
    if (filterType === '全部类型' || projectTypeFilterOptions.includes(filterType)) return
    setFilterType('全部类型')
  }, [filterType, projectTypeFilterOptions])

  const roleVisibleTasks = useMemo(() => {
    if (role === 'controller' || role === 'admin' || role === 'finance') return appTasks
    if (!currentUser) return []
    if (role === 'manager') {
      const managerProjectIds = new Set(appProjects.filter((project) => isProjectLead(project, currentUser)).map((project) => project.id))
      return appTasks.filter((task) => managerProjectIds.has(task.projectId))
    }

    return appTasks.filter((task) => task.assignee === currentUser)
  }, [appProjects, appTasks, currentUser, role])

  const roleVisibleCalendarItems = useMemo(() => {
    if (role === 'controller' || role === 'admin' || role === 'finance') return appCalendarItems
    if (!currentUser) return []
    if (role === 'manager') {
      const managerProjectIds = new Set(appProjects.filter((project) => isProjectLead(project, currentUser)).map((project) => project.id))
      return appCalendarItems.filter((item) => managerProjectIds.has(item.projectId))
    }

    const memberProjectIds = new Set(roleVisibleTasks.map((task) => task.projectId))
    return appCalendarItems.filter((item) => item.owner === currentUser || memberProjectIds.has(item.projectId))
  }, [appCalendarItems, appProjects, currentUser, role, roleVisibleTasks])

  const searchMatchedProjectIds = useMemo(() => {
    if (!searchQuery.trim()) return null

    const matchedIds = new Set<string>()
    roleVisibleProjects.forEach((project) => {
      if (projectMatchesSearch(project, searchQuery)) matchedIds.add(project.id)
    })
    roleVisibleTasks.forEach((task) => {
      const project = roleVisibleProjects.find((item) => item.id === task.projectId)
      if (taskMatchesSearch(task, project, searchQuery)) matchedIds.add(task.projectId)
    })
    roleVisibleCalendarItems.forEach((item) => {
      const project = roleVisibleProjects.find((entry) => entry.id === item.projectId)
      if (calendarItemMatchesSearch(item, project, searchQuery)) matchedIds.add(item.projectId)
    })

    return matchedIds
  }, [roleVisibleCalendarItems, roleVisibleProjects, roleVisibleTasks, searchQuery])
  const filteredProjects = useMemo(
    () => filterProjects(roleVisibleProjects, searchQuery, filterStatus, filterType, searchMatchedProjectIds, now, roleVisibleCalendarItems),
    [filterStatus, filterType, now, roleVisibleCalendarItems, roleVisibleProjects, searchMatchedProjectIds, searchQuery],
  )
  const activeProjects = useMemo(
    () => filteredProjects.filter((project) => !isArchivedProject(project)).sort(compareProjectsByFinalDelivery),
    [filteredProjects],
  )
  const archivedProjects = useMemo(() => filteredProjects.filter(isArchivedProject), [filteredProjects])
  const activeProjectIds = useMemo(() => new Set(activeProjects.map((project) => project.id)), [activeProjects])
  const filteredProjectIds = useMemo(() => new Set(filteredProjects.map((project) => project.id)), [filteredProjects])
  const visibleTasks = useMemo(
    () =>
      roleVisibleTasks.filter((task) => {
        const project = roleVisibleProjects.find((item) => item.id === task.projectId)
        return activeProjectIds.has(task.projectId) && taskMatchesSearch(task, project, searchQuery)
      }),
    [activeProjectIds, roleVisibleProjects, roleVisibleTasks, searchQuery],
  )
  const visibleCalendarItems = useMemo(
    () =>
      roleVisibleCalendarItems.filter((item) => {
        const project = roleVisibleProjects.find((entry) => entry.id === item.projectId)
        return activeProjectIds.has(item.projectId) && filteredProjectIds.has(item.projectId) && calendarItemMatchesSearch(item, project, searchQuery)
      }),
    [activeProjectIds, filteredProjectIds, roleVisibleCalendarItems, roleVisibleProjects, searchQuery],
  )
  const displayHolidayItems = useMemo(
    () => mergeHolidayItems(chinaHolidayItems, appHolidayItems),
    [appHolidayItems, chinaHolidayItems],
  )

  const selectedProject = activeProjects.find((project) => project.id === selectedProjectId) ?? activeProjects[0] ?? null
  const currentAccountTitle = accountDisplayTitle(currentAccount, appStaffMembers)
  const riskCount = activeProjects.filter((project) => isProjectAtRisk(project, now, roleVisibleCalendarItems)).length
  const waitingCount = activeProjects.filter(isWaitingProject).length
  const pendingSettlementCount = activeProjects.filter((project) => {
    const record = appFinanceRecords.find((item) => item.projectId === project.id)
    return !record || record.clientSettlementStatus !== '已结算'
  }).length
  const canAccessProjects = activeNavItems.some((item) => item.id === 'projects')
  const canCreateProject = canRoleCreateProject(role)
  const canManageWorkflowOptions = role === 'controller' || role === 'admin'
  const canEditArchivedProjects = role === 'controller' || role === 'admin'
  const activeStaffMembers = useMemo(() => appStaffMembers.filter(isAssignableStaff), [appStaffMembers])
  const assistantStaffMembers = useMemo(() => {
    if (role === 'controller' || role === 'admin') return activeStaffMembers
    if (role === 'manager' || role === 'finance') return activeStaffMembers.filter(canManageProject)
    if (role === 'member' && currentUser) return activeStaffMembers.filter((member) => member.name === currentUser)
    return []
  }, [activeStaffMembers, currentUser, role])
  const assistantProjects = useMemo(
    () => roleVisibleProjects.filter((project) => !isArchivedProject(project)),
    [roleVisibleProjects],
  )
  const assistantProjectIds = useMemo(
    () => new Set(assistantProjects.map((project) => project.id)),
    [assistantProjects],
  )
  const assistantTasks = useMemo(
    () => roleVisibleTasks.filter((task) => assistantProjectIds.has(task.projectId)),
    [assistantProjectIds, roleVisibleTasks],
  )
  const assistantCalendarItems = useMemo(
    () => roleVisibleCalendarItems.filter((item) => assistantProjectIds.has(item.projectId)),
    [assistantProjectIds, roleVisibleCalendarItems],
  )
  const assistantCalendarProjects = useMemo(
    () =>
      assistantProjects.filter(
        (project) =>
          role === 'controller' ||
          role === 'admin' ||
          ((role === 'manager' || role === 'finance') && isProjectLead(project, currentUser)),
      ),
    [assistantProjects, currentUser, role],
  )
  const assistantEditableProjects = useMemo(
    () =>
      assistantProjects.filter(
        (project) =>
          role === 'controller' ||
          role === 'admin' ||
          ((role === 'manager' || role === 'finance') && isProjectLead(project, currentUser)),
      ),
    [assistantProjects, currentUser, role],
  )
  const assistantEditableTasks = useMemo(() => {
    if (role === 'controller' || role === 'admin') return assistantTasks
    if (role === 'manager' || role === 'finance') {
      const editableProjectIds = new Set(assistantEditableProjects.map((project) => project.id))
      return assistantTasks.filter((task) => editableProjectIds.has(task.projectId))
    }
    if (role === 'member' && currentUser) return assistantTasks.filter((task) => task.assignee === currentUser)
    return []
  }, [assistantEditableProjects, assistantTasks, currentUser, role])
  const assistantEditableTaskIds = useMemo(
    () => new Set(assistantEditableTasks.map((task) => task.id)),
    [assistantEditableTasks],
  )
  const assistantTaskToEdit = assistantTaskEditDraft
    ? appTasks.find((task) => task.id === assistantTaskEditDraft.taskId) ?? null
    : null
  const activeRemoteTeamHost = useMemo(() => {
    if (remoteTeamServiceHost) return remoteTeamServiceHost
    if (teamConnectionStatus !== 'connected' || isLocalTeamServerUrl(teamServerUrl, teamServiceInfo)) return ''
    return teamServerDisplayHost(teamServerUrl)
  }, [remoteTeamServiceHost, teamConnectionStatus, teamServerUrl, teamServiceInfo])

  async function handleLogin() {
    const cleanLoginAccountId = loginAccountId.trim()
    let latestAccounts = appAccounts

    if (dataMode === 'team') {
      setLoginError('正在同步团队账号...')
      try {
        const savedData = await loadCurrentAppData()
        if (savedData) {
          latestAccounts = mergeStoredAccounts(savedData.accounts ?? loginAccounts)
          applyAppDataToState(savedData)
          rememberConnectedTeamHost()
          setLoadedDataSourceKey(dataSourceKey)
          setDataReady(true)
          setTeamConnectionStatus('connected')
          setTeamConnectionMessage('团队账号已同步')
          markTeamSync()
        }
      } catch (error) {
        setTeamConnectionStatus('error')
        setTeamConnectionMessage(error instanceof Error ? error.message : '团队账号同步失败')
        setLoginError('无法连接团队服务，请先检查团队模式连接')
        return
      }
    }

    const account = latestAccounts.find((item) => item.id === cleanLoginAccountId)
    if (!account || account.password !== loginPassword) {
      setLoginError('账号或密码不正确')
      return
    }

    const nextNavItems = navItemsForRole(account.role)
    setCurrentAccountId(account.id)
    setSection(nextNavItems[0]?.id ?? 'dashboard')
    localStorage.setItem(sessionStorageKey, account.id)
    setLoginPassword('')
    setLoginError('')
  }

  function handleLogout() {
    setCurrentAccountId('')
    setLoginAccountId('')
    setLoginPassword('')
    setLoginError('')
    localStorage.removeItem(sessionStorageKey)
  }

  function openProjectEditor(project: Project) {
    if (!projectEditScope(project)) return
    setAssistantProjectEditDraft(null)
    setEditingProject(project)
  }

  function projectEditScope(project: Project): 'full' | 'status' | null {
    if (role === 'controller' || role === 'admin') return 'full'
    if ((role !== 'manager' && role !== 'finance') || !isProjectLead(project, currentUser)) return null
    return isArchivedProject(project) ? 'status' : 'full'
  }

  function canEditProject(project: Project) {
    return projectEditScope(project) !== null
  }

  function canEditProjectTaskBoard(project: Project) {
    return projectEditScope(project) === 'full'
  }

  function closeWelcomeGuide() {
    setShowWelcomeGuide(false)
  }

  function dismissWelcomeGuide() {
    try {
      if (currentAccount) localStorage.setItem(welcomeGuideStorageKey(currentAccount), 'true')
    } catch {
      // localStorage may be unavailable in unusual preview contexts; closing still works.
    }
    setShowWelcomeGuide(false)
  }

  function selectWeatherLocation(location: WeatherLocation) {
    saveStoredWeatherLocation(location)
    setWeatherLocation(location)
    setWeatherSnapshot(loadStoredWeatherSnapshot(location))
    setWeatherStatus('loading')
    setWeatherError('')
    setShowWeatherSettings(false)
  }

  function updateWorkSchedule(schedule: WorkSchedule) {
    if (!currentAccount || !isClockTime(schedule.start) || !isClockTime(schedule.end) || schedule.start === schedule.end) return
    saveStoredWorkSchedule(currentAccount.id, schedule)
    setWorkSchedule(schedule)
    setShowWorkScheduleSettings(false)
  }

  function updateDataMode(nextMode: DataMode) {
    setDataMode(nextMode)
    try {
      localStorage.setItem(dataModeStorageKey, nextMode)
    } catch {
      // Ignore localStorage failures in restricted preview environments.
    }
    if (nextMode === 'team') {
      setTeamConnectionStatus('idle')
      setTeamConnectionMessage('准备连接团队服务')
      return
    }
    setRemoteTeamServiceHost('')
    setTeamConnectionStatus('idle')
    setTeamConnectionMessage('单人模式使用本机数据')
  }

  function updateTeamServerUrl(nextUrl: string) {
    setTeamServerUrl(nextUrl)
    setRemoteTeamServiceHost('')
    try {
      localStorage.setItem(teamServerUrlStorageKey, nextUrl)
    } catch {
      // Ignore localStorage failures in restricted preview environments.
    }
  }

  function updateTeamAccessKey(nextKey: string) {
    setTeamAccessKey(nextKey)
    try {
      localStorage.setItem(teamAccessKeyStorageKey, nextKey)
    } catch {
      // Ignore localStorage failures in restricted preview environments.
    }
  }

  async function checkTeamConnection() {
    setTeamConnectionStatus('checking')
    setTeamConnectionMessage('正在连接团队服务')
    try {
      const health = await fetchTeamHealth(teamServerUrl)
      if (!health.ok) throw new Error('团队服务未返回可用状态')
      const savedData = await fetchTeamAppData(teamServerUrl, teamAccessKey)
      if (health.incrementalSync === true) teamIncrementalCapabilityRef.current = 'supported'
      if (health.incrementalSync === false) teamIncrementalCapabilityRef.current = 'legacy'
      applyAppDataToState(savedData)
      rememberConnectedTeamHost()
      setLoadedDataSourceKey(dataSourceKey)
      setDataReady(true)
      setTeamConnectionStatus('connected')
      setTeamConnectionMessage(`已连接：${health.name ?? 'CrewFlow Server'}`)
      markTeamSync()
      return true
    } catch (error) {
      setTeamConnectionStatus('error')
      setTeamConnectionMessage(error instanceof Error ? error.message : '团队服务连接失败')
      return false
    }
  }

  async function importSingleDataToTeam() {
    setTeamConnectionStatus('checking')
    setTeamConnectionMessage('正在导入单人数据')
    try {
      const localData = await window.desktopBridge?.loadAppData?.()
      const currentTeamData = await fetchTeamAppData(teamServerUrl, teamAccessKey)
      rememberRemoteSlices(currentTeamData)
      const savedData = await saveLegacyTeamAppData(teamServerUrl, teamAccessKey, localData ?? currentAppDataSnapshot, currentTeamData.revision)
      applyAppDataToState(savedData)
      updateDataMode('team')
      rememberConnectedTeamHost()
      setTeamConnectionStatus('connected')
      setTeamConnectionMessage('单人数据已导入团队库')
      markTeamSync()
    } catch (error) {
      setTeamConnectionStatus('error')
      setTeamConnectionMessage(error instanceof Error ? error.message : '导入团队库失败')
    }
  }

  async function installLocalTeamService() {
    if (!window.desktopBridge?.installTeamService) {
      setTeamServiceMessage('请在 CrewFlow 桌面 App 中开启团队服务')
      return
    }

    setTeamServiceBusy(true)
    setTeamServiceMessage('正在检查团队服务')
    try {
      const localInfo = await window.desktopBridge.getTeamServiceInfo()
      updateTeamServiceInfoState(localInfo)

      if (!isLocalTeamServerUrl(teamServerUrl, localInfo)) {
        const health = await fetchTeamHealth(teamServerUrl).catch(() => null)
        if (health?.ok) {
          const remoteHost = teamServerDisplayHost(teamServerUrl)
          setRemoteTeamServiceHost(remoteHost)
          setTeamServiceMessage(`团队服务已由 ${remoteHost} 开启，本机不能重复开启。`)
          setTeamConnectionMessage(`团队服务已由 ${remoteHost} 开启`)
          return
        }
      }

      setTeamServiceMessage('正在开启团队服务')
      const info = await window.desktopBridge.installTeamService()
      updateTeamServiceInfoState(info)
      setTeamServiceMessage(info.message)
      if (info.connectionUrl) updateTeamServerUrl(info.connectionUrl)
      if (info.accessKey) updateTeamAccessKey(info.accessKey)
      setRemoteTeamServiceHost('')
      updateDataMode('team')
      setTeamConnectionStatus(info.running ? 'connected' : 'idle')
      setTeamConnectionMessage(info.running ? `本机团队服务已开启：${info.connectionUrl}` : info.message)
    } catch (error) {
      setTeamServiceMessage(error instanceof Error ? error.message : '团队服务开启失败')
    } finally {
      setTeamServiceBusy(false)
    }
  }

  async function stopLocalTeamService() {
    if (!window.desktopBridge?.stopTeamService) {
      setTeamServiceMessage('请在 CrewFlow 桌面 App 中管理团队服务')
      return
    }

    setTeamServiceBusy(true)
    setTeamServiceMessage('正在停止团队服务')
    try {
      const info = await window.desktopBridge.stopTeamService()
      updateTeamServiceInfoState(info)
      setTeamServiceMessage(info.message)
    } catch (error) {
      setTeamServiceMessage(error instanceof Error ? error.message : '团队服务停止失败')
    } finally {
      setTeamServiceBusy(false)
    }
  }

  async function copyLocalTeamServiceUrl(urlOverride?: string) {
    const url = urlOverride || teamServiceInfo?.connectionUrl || teamServerUrl
    if (!url) return
    const text = teamServiceInfo?.accessKey ? `团队服务器地址：${url}\n访问密钥：${teamServiceInfo.accessKey}` : url

    try {
      if (window.desktopBridge?.copyText) {
        await window.desktopBridge.copyText(text)
      } else {
        await navigator.clipboard.writeText(text)
      }
      setTeamServiceMessage(teamServiceInfo?.accessKey ? '已复制团队地址和访问密钥' : `已复制：${url}`)
    } catch {
      setTeamServiceMessage(`复制失败，请手动复制：${text}`)
    }
  }

  function addProjectTypeOption(value: string) {
    const cleanValue = value.trim()
    if (!cleanValue) return

    setAppWorkflowOptions((current) => {
      if (current.projectTypes.includes(cleanValue)) return current
      return normalizeWorkflowOptions({
        ...current,
        projectTypes: [...current.projectTypes, cleanValue],
      })
    })
  }

  function addCustomerProvinceOption(value: string) {
    const cleanValue = value.trim()
    if (!cleanValue) return

    setAppWorkflowOptions((current) => {
      if (current.customerGroups[cleanValue]) return current
      return normalizeWorkflowOptions({
        ...current,
        customerGroups: {
          ...current.customerGroups,
          [cleanValue]: [],
        },
      })
    })
  }

  function addCustomerOption(province: string, value: string) {
    const cleanProvince = province.trim()
    const cleanValue = value.trim()
    if (!cleanProvince || !cleanValue) return

    setAppWorkflowOptions((current) => {
      const currentCustomers = current.customerGroups[cleanProvince] ?? []
      if (currentCustomers.includes(cleanValue)) return current
      return normalizeWorkflowOptions({
        ...current,
        customerGroups: {
          ...current.customerGroups,
          [cleanProvince]: [...currentCustomers, cleanValue],
        },
      })
    })
  }

  function updateCustomerFieldLabel(field: keyof CustomerFieldLabels, value: string) {
    const cleanValue = value.trim()
    if (!cleanValue) return

    setAppWorkflowOptions((current) =>
      normalizeWorkflowOptions({
        ...current,
        customerFieldLabels: {
          ...current.customerFieldLabels,
          [field]: cleanValue,
        },
      }),
    )
  }

  function deleteCustomerOption(province: string, value: string, replacementValue = '') {
    const cleanProvince = province.trim()
    const cleanValue = value.trim()
    const cleanReplacement = replacementValue.trim()
    const currentCustomers = appWorkflowOptions.customerGroups[cleanProvince] ?? []
    if (!cleanProvince || !cleanValue || !currentCustomers.includes(cleanValue)) return null

    const linkedProjects = appProjects.filter((project) => project.client === cleanValue)
    if (linkedProjects.length > 0 && (!cleanReplacement || cleanReplacement === cleanValue)) return null

    const remainingCustomers = currentCustomers.filter((customer) => customer !== cleanValue)
    const nextCustomers = cleanReplacement && !remainingCustomers.includes(cleanReplacement) ? [...remainingCustomers, cleanReplacement] : remainingCustomers
    setAppWorkflowOptions((current) =>
      normalizeWorkflowOptions({
        ...current,
        customerGroups: {
          ...current.customerGroups,
          [cleanProvince]: nextCustomers,
        },
      }),
    )

    if (linkedProjects.length > 0) {
      setAppProjects((current) => current.map((project) => (project.client === cleanValue ? { ...project, client: cleanReplacement } : project)))
    }

    return cleanReplacement || nextCustomers[0] || ''
  }

  function handleUpdateWorkflowOptions(nextOptions: WorkflowOptions, renames: WorkflowOptionRename[] = []) {
    const normalizedOptions = normalizeWorkflowOptions(nextOptions)
    const taskWorkRename = new Map(
      renames.filter((item) => item.category === 'taskWorkTypes' && item.from !== item.to).map((item) => [item.from, item.to]),
    )
    const nodeStatusRename = new Map(
      renames.filter((item) => item.category === 'nodeStatuses' && item.from !== item.to).map((item) => [item.from, item.to]),
    )
    const workflowStageRename = new Map(
      renames.filter((item) => item.category === 'workflowStages' && item.from !== item.to).map((item) => [item.from, item.to]),
    )
    const staffTagRename = new Map(
      renames.filter((item) => item.category === 'staffTags' && item.from !== item.to).map((item) => [item.from, item.to]),
    )
    const projectTypeRename = new Map(
      renames.filter((item) => item.category === 'projectTypes' && item.from !== item.to).map((item) => [item.from, item.to]),
    )

    setAppWorkflowOptions(normalizedOptions)

    if (projectTypeRename.size > 0) {
      setAppProjects((current) =>
        current.map((project) => ({
          ...project,
          type: projectTypeRename.get(project.type) ?? project.type,
        })),
      )
    }

    if (taskWorkRename.size > 0) {
      setAppTasks((current) =>
        current.map((task) => {
          const currentWorkType = task.workType
          if (!currentWorkType || !taskWorkRename.has(currentWorkType)) return task

          const nextWorkType = taskWorkRename.get(currentWorkType) ?? currentWorkType
          return {
            ...task,
            workType: nextWorkType,
            title: renameTaskTitle(task.title, currentWorkType, nextWorkType),
            note: task.note.replaceAll(currentWorkType, nextWorkType),
          }
        }),
      )
    }

    if (nodeStatusRename.size > 0 || workflowStageRename.size > 0) {
      setAppProjects((current) =>
        current.map((project) => {
          const nextWorkStatus = nodeStatusRename.get(project.workStatus) ?? project.workStatus
          const nextStage = workflowStageRename.get(project.stage) ?? project.stage
          const nextCalendarTitle = project.calendarTitle ? workflowStageRename.get(project.calendarTitle) ?? project.calendarTitle : project.calendarTitle
          const nextMilestone = renameWorkflowText(project.nextMilestone, workflowStageRename)

          return {
            ...project,
            workStatus: nextWorkStatus,
            stage: nextStage,
            calendarTitle: nextCalendarTitle,
            nextMilestone,
          }
        }),
      )
      setAppCalendarItems((current) =>
        current.map((item) => ({
          ...item,
          title: renameWorkflowText(item.title, workflowStageRename),
          type: workflowStageRename.get(item.type) ?? item.type,
        })),
      )
    }

    if (staffTagRename.size > 0) {
      setAppStaffMembers((current) =>
        current.map((member) => ({
          ...member,
          tags: Array.from(new Set(member.tags.map((tag) => staffTagRename.get(tag) ?? tag))),
        })),
      )
    }
  }

  function handleCreateProject(payload: NewProjectPayload) {
    const projectId = `P-${Date.now().toString().slice(-8)}`
    const dueDate = new Date(payload.deliveryDate)
    const initialStage = appWorkflowOptions.workflowStages[0] ?? defaultWorkflowStageOptions[0]
    const initialStatus = appWorkflowOptions.nodeStatuses[0] ?? defaultNodeStatusOptions[0]
    const newProject: Project = {
      id: projectId,
      name: payload.name,
      type: payload.type,
      client: payload.client,
      clientContact: payload.clientContact,
      manager: payload.manager,
      stage: initialStage,
      nextMilestone: `${formatMonthDay(dueDate)} ${initialStage}`,
      due: payload.deliveryDate,
      progress: 0,
      status: 'normal',
      healthStatusExplicit: true,
      workStatus: initialStatus,
      owner: payload.manager,
      path: payload.path,
      creatorAccountId: currentAccount?.id,
    }
    const newCalendarItem: CalendarItem = {
      id: `C-${Date.now().toString().slice(-8)}`,
      date: payload.deliveryDate,
      isFinalDelivery: true,
      completed: false,
      projectId,
      day: dueDate.getDate(),
      time: formatMonthDay(dueDate),
      project: payload.name,
      title: initialStage,
      type: '立项节点',
      owner: payload.manager,
    }

    setAppProjects((current) => [newProject, ...current])
    setAppCalendarItems((current) => [newCalendarItem, ...current])
    setSelectedProjectId(projectId)
    setSection('projects')
    setShowNewProjectModal(false)
    setAssistantNewProjectDraft(null)
    setSetupDraft({ projectId, workTypes: payload.workTypes, deliveryDate: payload.deliveryDate })
  }

  function handleProjectSetupSave({
    projectId,
    stage,
    workStatus,
    deliveryDate,
    calendarTitle,
    assignments,
  }: {
    projectId: string
    stage: string
    workStatus: WorkStatus
    deliveryDate: string
    calendarTitle: string
    assignments: AssignmentDraft[]
  }) {
    const project = appProjects.find((item) => item.id === projectId)
    if (!project) {
      setSetupDraft(null)
      return
    }

    const dueDate = new Date(deliveryDate)
    const milestoneTitle = calendarTitle.trim() || stage
    const nextMilestone = `${formatMonthDay(dueDate)} ${milestoneTitle}`
    const nextTasks: Task[] = assignments.map((assignment, index) => {
      const externalNote = assignment.externalNote.trim()
      const externalLabel = externalNote ? `外包：${externalNote}` : '外包：待补充'
      const assignee = assignment.mode === 'internal' ? assignment.assignee : externalLabel

      return {
        id: `T-${Date.now().toString().slice(-6)}-${index}`,
        title: `${project.name} ${assignment.workType}`,
        projectId,
        project: project.name,
        workType: assignment.workType,
        assignmentMode: assignment.mode,
        assignee,
        due: formatMonthDay(dueDate),
        status: '未开始',
        note:
          assignment.mode === 'external'
            ? `外包任务，由${project.manager}跟进。${externalNote ? `外包给：${externalNote}` : '外包信息待补充。'}`
            : `${assignment.workType}执行任务，来自项目经理指派。`,
      }
    })

    setAppProjects((current) =>
      current.map((item) =>
        item.id === projectId
          ? {
              ...item,
              stage,
              workStatus,
              due: deliveryDate,
              nextMilestone,
              calendarTitle: milestoneTitle,
              progress: workStatus === '未开始' ? 0 : Math.max(item.progress, 12),
              owner: nextTasks[0]?.assignee ?? item.manager,
            }
          : item,
      ),
    )
    setAppTasks((current) => [...nextTasks, ...current.filter((task) => task.projectId !== projectId)])
    setAppCalendarItems((current) => [
      {
        id: `C-${Date.now().toString().slice(-8)}`,
        date: deliveryDate,
        isFinalDelivery: true,
        completed: false,
        projectId,
        day: dueDate.getDate(),
        time: formatMonthDay(dueDate),
        project: project.name,
        title: milestoneTitle,
        type: stage,
        owner: project.manager,
      },
      ...current.filter((item) => item.projectId !== projectId),
    ])
    setSetupDraft(null)
  }

  function handleUpdateProject(updatedProject: Project, updatedTasks?: Task[]) {
    const previousProject = appProjects.find((project) => project.id === updatedProject.id)
    if (!previousProject) return
    const editScope = projectEditScope(previousProject)
    if (!editScope) return
    const authorizedProject =
      editScope === 'status'
        ? {
            ...previousProject,
            status: updatedProject.status,
            healthStatusExplicit: updatedProject.healthStatusExplicit,
            workStatus: updatedProject.workStatus,
            stage: updatedProject.stage,
            calendarTitle: updatedProject.calendarTitle,
            due: updatedProject.due,
            progress: updatedProject.progress,
          }
        : updatedProject
    const previousClientProvince = previousProject
      ? Object.entries(appWorkflowOptions.customerGroups).find(([, customers]) => customers.includes(previousProject.client))?.[0]
      : undefined
    const dueDate = new Date(authorizedProject.due)
    const previousDueText = previousProject ? formatMonthDay(new Date(previousProject.due)) : ''
    const milestoneTitle = authorizedProject.calendarTitle?.trim() || authorizedProject.stage
    const nextMilestone = `${formatMonthDay(dueDate)} ${milestoneTitle}`
    const nextProjectTasks = editScope === 'full' ? updatedTasks?.map((task) => ({
      ...task,
      projectId: authorizedProject.id,
      project: authorizedProject.name,
      title: previousProject ? task.title.replace(previousProject.name, authorizedProject.name) : task.title,
      due: task.due === previousProject?.due || task.due === previousDueText ? formatMonthDay(dueDate) : task.due,
    })) : undefined

    setAppProjects((current) =>
      current.map((project) =>
        project.id === authorizedProject.id
          ? {
              ...authorizedProject,
              nextMilestone,
            }
          : project,
      ),
    )
    if (nextProjectTasks) {
      setAppTasks((current) => [...nextProjectTasks, ...current.filter((task) => task.projectId !== authorizedProject.id)])
    } else {
      setAppTasks((current) =>
        current.map((task) =>
          task.projectId === authorizedProject.id
            ? {
                ...task,
                project: authorizedProject.name,
                title: previousProject ? task.title.replace(previousProject.name, authorizedProject.name) : task.title,
                due: task.due === previousProject?.due || task.due === previousDueText ? formatMonthDay(dueDate) : task.due,
              }
            : task,
        ),
      )
    }
    setAppCalendarItems((current) =>
      current.map((item) => {
        if (item.projectId !== authorizedProject.id) return item

        const isPrimaryPlan = previousProject ? isPrimaryProjectCalendarItem(item, previousProject) : false
        const primaryPlanChanged = Boolean(
          isPrimaryPlan &&
            previousProject &&
            (previousProject.due !== authorizedProject.due ||
              (previousProject.calendarTitle?.trim() || previousProject.stage) !== milestoneTitle),
        )

        return {
          ...item,
          project: authorizedProject.name,
          date: isPrimaryPlan ? authorizedProject.due : item.date,
          day: isPrimaryPlan ? dueDate.getDate() : item.day,
          time: isPrimaryPlan ? formatMonthDay(dueDate) : item.time,
          title: isPrimaryPlan ? milestoneTitle : item.title,
          type: isPrimaryPlan ? authorizedProject.stage : item.type,
          owner: item.owner === previousProject?.manager || isPrimaryPlan ? authorizedProject.manager : item.owner,
          completed: primaryPlanChanged ? false : item.completed,
        }
      }),
    )
    if (previousClientProvince && authorizedProject.client !== previousProject?.client) {
      addCustomerOption(previousClientProvince, authorizedProject.client)
    }
    setEditingProject(null)
    setAssistantProjectEditDraft(null)
  }

  function canDeleteProject(project: Project) {
    if (role === 'controller' || role === 'admin') return true
    return Boolean(currentAccount?.id && project.creatorAccountId === currentAccount.id)
  }

  function handleDeleteProject(project: Project) {
    if (!canDeleteProject(project)) return
    const confirmed = window.confirm(`确认删除项目“${project.name}”吗？相关任务、日历和财务记录也会一起删除。`)
    if (!confirmed) return

    setAppProjects((current) => current.filter((item) => item.id !== project.id))
    setAppTasks((current) => current.filter((task) => task.projectId !== project.id))
    setAppCalendarItems((current) => current.filter((item) => item.projectId !== project.id))
    setAppFinanceRecords((current) => current.filter((record) => record.projectId !== project.id))
    setSelectedProjectId((current) => (current === project.id ? '' : current))
    setEditingProject(null)
  }

  function handleUpdateTaskStatus(taskId: string, status: TaskStatus) {
    setAppTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status } : task)))
  }

  function handleUpdateTask(updatedTask: Task) {
    setAppTasks((current) => current.map((task) => (task.id === updatedTask.id ? updatedTask : task)))
  }

  function canEditCalendarProject(projectId: string) {
    if (role === 'controller' || role === 'admin') return true
    if ((role !== 'manager' && role !== 'finance') || !currentUser) return false
    return appProjects.some((project) => project.id === projectId && isProjectLead(project, currentUser))
  }

  function syncPrimaryProjectDate(project: Project, targetDate: string, title: string) {
    const date = new Date(`${targetDate}T00:00:00`)
    if (Number.isNaN(date.getTime())) return

    const previousDueDate = new Date(`${project.due}T00:00:00`)
    const previousDueText = Number.isNaN(previousDueDate.getTime()) ? '' : formatMonthDay(previousDueDate)
    const nextDueText = formatMonthDay(date)
    const milestoneTitle = title.trim() || project.calendarTitle?.trim() || project.stage

    setAppProjects((current) =>
      current.map((item) =>
        item.id === project.id
          ? {
              ...item,
              due: targetDate,
              nextMilestone: `${nextDueText} ${milestoneTitle}`,
              calendarTitle: milestoneTitle,
            }
          : item,
      ),
    )
    setAppTasks((current) =>
      current.map((task) =>
        task.projectId === project.id && (task.due === project.due || task.due === previousDueText)
          ? {
              ...task,
              due: nextDueText,
            }
          : task,
      ),
    )
  }

  function handleAddCalendarPlan(plan: ProjectPlanPayload) {
    const project = appProjects.find((item) => item.id === plan.projectId)
    if (!project || !canEditCalendarProject(plan.projectId)) return

    const date = new Date(plan.date)
    setAppCalendarItems((current) => [
      {
        id: plan.id ?? `C-${Date.now().toString().slice(-8)}`,
        date: plan.date,
        isFinalDelivery: false,
        completed: false,
        projectId: plan.projectId,
        day: date.getDate(),
        time: formatMonthDay(date),
        project: project.name,
        title: plan.title.trim() || '项目计划',
        type: '自定义计划',
        owner: plan.owner,
      },
      ...current,
    ])
  }

  function handleUpdateCalendarPlan(itemKey: string, plan: ProjectPlanPayload) {
    const currentItem = appCalendarItems.find((item) => calendarItemKey(item) === itemKey)
    if (!currentItem || !canEditCalendarProject(currentItem.projectId) || !canEditCalendarProject(plan.projectId)) return
    const project = appProjects.find((item) => item.id === plan.projectId)
    if (!project) return

    const date = new Date(`${plan.date}T00:00:00`)
    const updatesPrimaryTimeline =
      currentItem.projectId === plan.projectId &&
      appProjects.some((item) => item.id === currentItem.projectId && isPrimaryProjectCalendarItem(currentItem, item))
    const planChanged =
      currentItem.projectId !== plan.projectId ||
      dateForCalendarItem(now, currentItem) !== plan.date ||
      currentItem.title.trim() !== plan.title.trim()
    setAppCalendarItems((current) =>
      current.map((item) =>
        calendarItemKey(item) === itemKey
          ? {
              id: item.id ?? plan.id ?? `C-${Date.now().toString().slice(-8)}`,
              date: plan.date,
              isFinalDelivery: currentItem.projectId === plan.projectId ? currentItem.isFinalDelivery : false,
              completed: planChanged ? false : currentItem.completed,
              projectId: plan.projectId,
              day: date.getDate(),
              time: formatMonthDay(date),
              project: project.name,
              title: plan.title.trim() || '项目计划',
              type: item.type || '自定义计划',
              owner: plan.owner,
            }
          : item,
        ),
    )
    if (updatesPrimaryTimeline) syncPrimaryProjectDate(project, plan.date, plan.title)
  }

  function handleMoveCalendarPlan(itemKey: string, targetDate: string) {
    const normalizedTargetDate = targetDate.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
    const currentItem = appCalendarItems.find((item) => calendarItemKey(item) === itemKey)
    if (!normalizedTargetDate || !currentItem || !canEditCalendarProject(currentItem.projectId)) return null

    const sourceDate = dateForCalendarItem(now, currentItem).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
    if (!sourceDate || sourceDate === normalizedTargetDate) return null

    const date = new Date(`${normalizedTargetDate}T00:00:00`)
    const project = appProjects.find((item) => item.id === currentItem.projectId)
    if (!project || Number.isNaN(date.getTime())) return null

    const stableItemId = currentItem.id ?? `C-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const updatesPrimaryTimeline = isPrimaryProjectCalendarItem(currentItem, project)

    setAppCalendarItems((current) =>
      current.map((item) =>
        calendarItemKey(item) === itemKey
          ? {
              ...item,
              id: stableItemId,
              date: normalizedTargetDate,
              day: date.getDate(),
              time: formatMonthDay(date),
              completed: false,
            }
          : item,
      ),
    )
    if (updatesPrimaryTimeline) syncPrimaryProjectDate(project, normalizedTargetDate, currentItem.title)

    return stableItemId
  }

  function handleToggleCalendarPlanCompleted(itemKey: string) {
    const currentItem = appCalendarItems.find((item) => calendarItemKey(item) === itemKey)
    if (!currentItem || !canEditCalendarProject(currentItem.projectId)) return

    setAppCalendarItems((current) =>
      current.map((item) =>
        calendarItemKey(item) === itemKey
          ? {
              ...item,
              completed: item.completed !== true,
            }
          : item,
      ),
    )
  }

  function handleDeleteCalendarPlan(itemKey: string) {
    const currentItem = appCalendarItems.find((item) => calendarItemKey(item) === itemKey)
    if (!currentItem || !canEditCalendarProject(currentItem.projectId)) return
    const project = appProjects.find((item) => item.id === currentItem.projectId)
    const projectPlans = appCalendarItems.filter((item) => item.projectId === currentItem.projectId)
    if (!project) return
    if (projectPlans.length <= 1) {
      window.alert('每个项目至少需要保留一个交付节点；可以编辑日期和名称，但不能删除最后一条。')
      return
    }

    const deletesFinalDelivery = isPrimaryProjectCalendarItem(currentItem, project)
    const remainingPlans = projectPlans.filter((item) => calendarItemKey(item) !== itemKey)
    const replacement = deletesFinalDelivery
      ? [...remainingPlans]
          .map((item) => ({ item, date: dateForCalendarItem(now, item) }))
          .filter((entry) => /^\d{4}-\d{2}-\d{2}/.test(entry.date))
          .sort((left, right) => left.date.localeCompare(right.date))
          .at(-1)
      : undefined

    setAppCalendarItems((current) =>
      current
        .filter((item) => calendarItemKey(item) !== itemKey)
        .map((item) =>
          deletesFinalDelivery && item.projectId === project.id
            ? {
                ...item,
                isFinalDelivery: replacement ? calendarItemKey(item) === calendarItemKey(replacement.item) : false,
              }
            : item,
        ),
    )
    if (replacement) syncPrimaryProjectDate(project, replacement.date, replacement.item.title)
  }

  function handleReviewAssistantCalendarPlans(plans: ProjectPlanPayload[]) {
    const allowedPlans = plans.filter(
      (plan) =>
        canEditCalendarProject(plan.projectId) &&
        appProjects.some((project) => project.id === plan.projectId && !isArchivedProject(project)),
    )
    if (allowedPlans.length === 0) return

    setSearchQuery('')
    setFilterStatus('all')
    setFilterType('全部类型')
    setSection('calendar')
    setAssistantCalendarDrafts(allowedPlans)
  }

  function handleReviewAssistantOperation(operation: AssistantOperation) {
    if (operation.type === 'create_project') {
      if (!canCreateProject) return false
      const manager =
        role === 'manager'
          ? currentUser ?? ''
          : activeStaffMembers.some((member) => member.name === operation.manager && canManageProject(member))
            ? operation.manager
            : ''
      const workTypes = operation.workTypes.filter((item) => appWorkflowOptions.taskWorkTypes.includes(item))
      setAssistantNewProjectDraft({
        name: operation.name,
        path: operation.path,
        type: appWorkflowOptions.projectTypes.includes(operation.projectType) ? operation.projectType : '',
        client: operation.client,
        clientContact: operation.clientContact,
        manager,
        priority: priorityOptions.includes(operation.priority) ? operation.priority : '',
        workTypes,
        deliveryDate: operation.deliveryDate,
      })
      setShowNewProjectModal(true)
      return true
    }

    if (operation.type === 'update_weather') {
      const weatherCity = operation.weatherCity.trim()
      if (!weatherCity) return false
      setAssistantWeatherQuery(weatherCity)
      setShowWeatherSettings(true)
      return true
    }

    if (operation.type === 'update_work_schedule') {
      const start = isClockTime(operation.workStart)
        ? operation.workStart
        : workSchedule?.start ?? '09:00'
      const end = isClockTime(operation.workEnd)
        ? operation.workEnd
        : workSchedule?.end ?? '18:00'
      if (start === end || (!isClockTime(operation.workStart) && !isClockTime(operation.workEnd))) return false
      setAssistantWorkScheduleDraft({ start, end })
      setShowWorkScheduleSettings(true)
      return true
    }

    if (operation.type === 'navigate') {
      const target = activeNavItems.find(
        (item) => item.id === operation.targetSection || item.label === operation.targetSection,
      )
      if (!target) return false
      const targetProject =
        assistantProjects.find((item) => item.id === operation.projectId) ??
        assistantProjects.find((item) => item.name.trim() === operation.projectName.trim())
      if (targetProject) setSelectedProjectId(targetProject.id)
      setSearchQuery('')
      setSection(target.id)
      return true
    }

    if (operation.type === 'update_task') {
      const taskById = assistantEditableTaskIds.has(operation.taskId)
        ? appTasks.find((task) => task.id === operation.taskId)
        : undefined
      const matchingTasks = assistantEditableTasks.filter((task) => {
        const projectMatches =
          !operation.projectId && !operation.projectName
            ? true
            : task.projectId === operation.projectId || task.project.trim() === operation.projectName.trim()
        const taskMatches =
          (!operation.taskTitle && !operation.workType) ||
          task.title.trim() === operation.taskTitle.trim() ||
          task.workType === operation.workType
        return projectMatches && taskMatches
      })
      const task = taskById ?? (matchingTasks.length === 1 ? matchingTasks[0] : null)
      if (!task || !taskStatusOptions.includes(operation.taskStatus as TaskStatus)) return false
      setAssistantTaskEditDraft({
        taskId: task.id,
        status: operation.taskStatus as TaskStatus,
      })
      return true
    }

    const project =
      appProjects.find((item) => item.id === operation.projectId) ??
      appProjects.find((item) => item.name.trim() === operation.projectName.trim())
    if (!project || isArchivedProject(project)) return false
    if (!assistantEditableProjects.some((item) => item.id === project.id)) return false
    if (operation.type === 'assign_task' && !canEditProjectTaskBoard(project)) return false

    const manager = activeStaffMembers.some((member) => member.name === operation.manager && canManageProject(member))
      ? operation.manager
      : undefined
    const stage = appWorkflowOptions.workflowStages.includes(operation.stage) ? operation.stage : undefined
    const workStatus = appWorkflowOptions.nodeStatuses.includes(operation.workStatus)
      ? (operation.workStatus as WorkStatus)
      : undefined
    const assignmentWorkType = appWorkflowOptions.taskWorkTypes.includes(operation.workType)
      ? operation.workType
      : appWorkflowOptions.taskWorkTypes[0] ?? defaultTaskWorkOptions[0]
    const assignmentAssignee = activeStaffMembers.some((member) => member.name === operation.assignee)
      ? operation.assignee
      : ''
    const healthStatus = projectHealthOptions.find(
      (item) => item.value === operation.healthStatus || item.label === operation.healthStatus,
    )?.value

    setSearchQuery('')
    setFilterStatus('all')
    setFilterType('全部类型')
    setSelectedProjectId(project.id)
    setSection('projects')
    setAssistantProjectEditDraft({
      stage,
      workStatus,
      healthStatus,
      due: operation.deliveryDate || undefined,
      calendarTitle: operation.calendarTitle || undefined,
      manager,
      assignment:
        operation.type === 'assign_task'
          ? {
              workType: assignmentWorkType,
              mode: operation.assignmentMode,
              assignee: assignmentAssignee,
              externalNote: operation.externalNote,
              status: taskStatusOptions.includes(operation.taskStatus as TaskStatus)
                ? (operation.taskStatus as TaskStatus)
                : '未开始',
              due: operation.taskDue || undefined,
            }
          : undefined,
    })
    setEditingProject(project)
    return true
  }

  function handleUpdateStaffMember(updatedMember: StaffMember, previousName: string) {
    const nextMember = normalizeStaffMember(updatedMember)
    setAppStaffMembers((current) => current.map((member) => (member.id === nextMember.id ? nextMember : member)))

    const nextName = nextMember.name.trim()
    if (!nextName || nextName === previousName) return

    setAppProjects((current) =>
      current.map((project) => replacePersonInProject(project, previousName, nextName)),
    )
    setAppTasks((current) =>
      current.map((task) => replacePersonInTask(task, previousName, nextName)),
    )
    setAppCalendarItems((current) =>
      current.map((item) => replacePersonInCalendarItem(item, previousName, nextName)),
    )
  }

  function handleAddStaffMember(member: StaffMember) {
    const nextMember = normalizeStaffMember({
      ...member,
      id: `staff-${Date.now()}`,
    })
    setAppStaffMembers((current) => [nextMember, ...current])
  }

  function handleDeleteStaffMember(memberId: string) {
    const targetMember = appStaffMembers.find((member) => member.id === memberId)
    if (!targetMember || targetMember.accountRole === 'controller') return
    if (currentAccount?.staffId === memberId) {
      window.alert('不能删除当前登录账号关联的人员。')
      return
    }

    const linkedAccounts = appAccounts.filter((account) => account.staffId === memberId)
    const activeTaskCount = appTasks.filter((task) => task.assignee === targetMember.name && task.status !== '已完成').length
    const activeProjectCount = appProjects.filter((project) => !isArchivedProject(project) && (project.manager === targetMember.name || project.owner === targetMember.name)).length
    const relatedPlanCount = appCalendarItems.filter((item) => item.owner === targetMember.name).length
    const confirmed = window.confirm(
      [
        `确认删除人员“${targetMember.name}”吗？`,
        `关联账号：${linkedAccounts.length} 个；未完成任务：${activeTaskCount} 个；关联项目：${activeProjectCount} 个；日历计划：${relatedPlanCount} 个。`,
        '删除后会从人员下拉和团队负载移除；已有项目、任务、日历里的姓名会保留为历史记录；关联账号会自动变为未关联人员。',
      ].join('\n'),
    )
    if (!confirmed) return

    setAppStaffMembers((current) => current.filter((member) => member.id !== memberId))
    setAppAccounts((current) => current.map((account) => (account.staffId === memberId ? { ...account, staffId: undefined } : account)))
  }

  function handleUpdateAccount(updatedAccount: Account) {
    const nextAccount = normalizeAccount(updatedAccount)
    setAppAccounts((current) => current.map((account) => (account.id === nextAccount.id ? nextAccount : account)))
  }

  function handleAddAccount(account: Account) {
    const nextAccount = normalizeAccount(account)
    setAppAccounts((current) => {
      if (current.some((item) => item.id === nextAccount.id)) return current
      return [...current, nextAccount]
    })
  }

  function handleDeleteAccount(accountId: string) {
    if (role !== 'controller' && role !== 'admin') return
    if (accountId === currentAccountId) return
    setAppAccounts((current) => {
      const targetAccount = current.find((account) => account.id === accountId)
      if (!targetAccount || targetAccount.role === 'controller' || targetAccount.id === currentAccountId) return current

      return current.filter((account) => account.id !== accountId)
    })
  }

  function handleUpdateControllerAccount(nextAccountId: string, nextPassword: string) {
    if (!currentAccount || role !== 'controller') return
    const cleanAccountId = nextAccountId.trim()
    const cleanPassword = nextPassword.trim()
    if (!cleanAccountId || !cleanPassword) return
    if (appAccounts.some((account) => account.id === cleanAccountId && account.id !== currentAccount.id)) return

    const nextAccount = normalizeAccount({
      ...currentAccount,
      id: cleanAccountId,
      password: cleanPassword,
      role: 'controller',
      staffId: undefined,
      label: '总控',
      title: '',
    })
    if (workSchedule && nextAccount.id !== currentAccount.id) {
      saveStoredWorkSchedule(nextAccount.id, workSchedule)
    }
    setAppAccounts((current) => current.map((account) => (account.id === currentAccount.id ? nextAccount : account)))
    setCurrentAccountId(nextAccount.id)
    setLoginAccountId(nextAccount.id)
    localStorage.setItem(sessionStorageKey, nextAccount.id)
    setShowControllerAccountModal(false)
  }

  function handleResolveDepartedPerson(projectId: string, departedName: string, mode: AssignmentMode | 'paused', replacementName: string, externalNote: string) {
    if (mode === 'paused') {
      setAppProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? {
                ...project,
                workStatus: '暂停',
                status: 'waiting',
                healthStatusExplicit: true,
              }
            : project,
        ),
      )
      setHandoffProject(null)
      return
    }

    const cleanReplacement = mode === 'internal' ? replacementName.trim() : externalNote.trim()
    if (!cleanReplacement) return
    const replacementLabel = mode === 'internal' ? cleanReplacement : `外包：${cleanReplacement}`

    setAppProjects((current) =>
      current.map((project) => (project.id === projectId ? replacePersonInProject(project, departedName, replacementLabel) : project)),
    )
    setAppTasks((current) =>
      current.map((task) => (task.projectId === projectId ? replacePersonInTask(task, departedName, replacementLabel) : task)),
    )
    setAppCalendarItems((current) =>
      current.map((item) => (item.projectId === projectId ? replacePersonInCalendarItem(item, departedName, replacementLabel) : item)),
    )
    setHandoffProject(null)
  }

  if (!currentAccount) {
    return (
      <>
        <LoginScreen
          accountId={loginAccountId}
          password={loginPassword}
          error={loginError}
          dataMode={dataMode}
          teamConnectionStatus={teamConnectionStatus}
          teamConnectionMessage={teamConnectionMessage}
          dataSourceReady={dataSourceReady}
          lastTeamSyncAt={lastTeamSyncAt}
          onlineMemberCount={teamPresenceMembers?.length ?? null}
          onAccountChange={setLoginAccountId}
          onPasswordChange={setLoginPassword}
          onLogin={handleLogin}
          onOpenDataMode={() => setShowDataModeModal(true)}
        />
        {showDataModeModal && (
          <DataModeModal
            dataMode={dataMode}
            teamServerUrl={teamServerUrl}
            teamAccessKey={teamAccessKey}
            teamConnectionStatus={teamConnectionStatus}
            teamConnectionMessage={teamConnectionMessage}
            teamPresenceMembers={teamPresenceMembers}
            activeRemoteTeamHost={activeRemoteTeamHost}
            teamServiceInfo={teamServiceInfo}
            teamServiceBusy={teamServiceBusy}
            teamServiceMessage={teamServiceMessage}
            onClose={() => setShowDataModeModal(false)}
            onDataModeChange={updateDataMode}
            onTeamServerUrlChange={updateTeamServerUrl}
            onTeamAccessKeyChange={updateTeamAccessKey}
            onCheckTeamConnection={checkTeamConnection}
            onImportSingleDataToTeam={importSingleDataToTeam}
            onRefreshTeamService={refreshTeamServiceInfo}
            onInstallTeamService={installLocalTeamService}
            onStopTeamService={stopLocalTeamService}
            onCopyTeamServiceUrl={copyLocalTeamServiceUrl}
          />
        )}
      </>
    )
  }

  return (
    <div className={isWindowsDesktop ? 'appShell windowsDesktop' : 'appShell'}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">
            <img src="./app-icon.png" alt="" />
          </div>
          <div>
            <div className="brandTitleRow">
              <strong>CrewFlow</strong>
              <BrandVersionStatus
                version={appVersion}
                release={availableUpdate}
                status={updateCheckStatus}
                open={showUpdateDialog}
                onOpen={() => {
                  setShowUpdateDialog(true)
                  void checkForUpdates(true)
                }}
              />
            </div>
            <span>项目 · 交付 · 素材 · 团队</span>
          </div>
        </div>

        <div className="roleBox">
          <div className="eyebrow">当前账号</div>
          <div className="accountSummary">
            <strong>{currentAccount.label}</strong>
            {currentAccountTitle && <span>{currentAccountTitle}</span>}
          </div>
          <p>{roles.find((item) => item.id === role)?.description}</p>
          {role === 'controller' && (
            <button className="accountManageButton" type="button" onClick={() => setShowControllerAccountModal(true)}>
              账号管理
            </button>
          )}
          {canManageWorkflowOptions && (
            <button className="accountManageButton" type="button" onClick={() => setShowWorkflowOptionsModal(true)}>
              选项管理
            </button>
          )}
          <button className="logoutButton" type="button" onClick={handleLogout}>
            退出登录
          </button>
        </div>

        <nav className="navList">
          {activeNavItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={section === item.id ? 'active' : ''}
                type="button"
                onClick={() => setSection(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebarFooter">
          <button className="userGuideButton" type="button" onClick={() => setShowUserGuide(true)}>
            <BookOpen size={15} />
            <span>使用说明</span>
          </button>
          <DataModeStatus
            dataMode={dataMode}
            teamConnectionStatus={teamConnectionStatus}
            teamConnectionMessage={teamConnectionMessage}
            dataSourceReady={dataSourceReady}
            lastTeamSyncAt={lastTeamSyncAt}
            onlineMemberCount={teamPresenceMembers?.length ?? null}
            onOpen={() => setShowDataModeModal(true)}
          />
        </div>
      </aside>

      <div className="workspaceViewport">
        <header className="topbar">
          <div className="topbarTitle">
            <div className="eyebrow">{formatFullDate(now)}</div>
            <h1>{titleForSection(section, role)}</h1>
          </div>
          <div className="topbarDragArea" aria-hidden="true" />
          <div className="topActions">
            <div className="search">
              <Search size={18} />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索项目、客户、NAS 路径" />
            </div>
            <button className={showFilterPanel ? 'iconButton active' : 'iconButton'} type="button" title="筛选" onClick={() => setShowFilterPanel((value) => !value)}>
              <Filter size={18} />
            </button>
            {canCreateProject && (
              <button
                className="primaryButton"
                type="button"
                onClick={() => {
                  setAssistantNewProjectDraft(null)
                  setShowNewProjectModal(true)
                }}
              >
                新建项目
              </button>
            )}
            {showFilterPanel && (
              <div className="filterPanel">
                <label>
                  <span>项目状态</span>
                  <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as ProjectFilterStatus)}>
                    <option value="all">全部状态</option>
                    <option value="normal">正常推进</option>
                    <option value="waiting">等反馈</option>
                    <option value="risk">有风险</option>
                    <option value="late">已延期</option>
                    <option value="archived">已归档</option>
                  </select>
                </label>
                <label>
                  <span>项目类型</span>
                  <select value={filterType} onChange={(event) => setFilterType(event.target.value)}>
                    <option value="全部类型">全部类型</option>
                    {projectTypeFilterOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setFilterStatus('all')
                    setFilterType('全部类型')
                  }}
                >
                  清除筛选
                </button>
              </div>
            )}
          </div>
        </header>

        <main ref={workspaceRef} className="workspace">
        {section === 'dashboard' && (
          <Dashboard
            riskCount={riskCount}
            waitingCount={waitingCount}
            pendingSettlementCount={pendingSettlementCount}
            visibleProjects={activeProjects}
            visibleTasks={visibleTasks}
            calendarItems={visibleCalendarItems}
            now={now}
            weatherLocation={weatherLocation}
            weatherSnapshot={weatherSnapshot}
            weatherStatus={weatherStatus}
            weatherError={weatherError}
            workSchedule={workSchedule}
            canAccessProjects={canAccessProjects}
            onOpenWeatherSettings={() => setShowWeatherSettings(true)}
            onOpenWorkScheduleSettings={() => setShowWorkScheduleSettings(true)}
            setSection={setSection}
            setSelectedProjectId={setSelectedProjectId}
          />
        )}
        {section === 'projects' && (
          <Projects
            projects={activeProjects}
            allProjects={appProjects}
            allTasks={appTasks}
            allCalendarItems={appCalendarItems}
            staffMembers={appStaffMembers}
            workflowOptions={appWorkflowOptions}
            selectedProject={selectedProject}
            setSelectedProjectId={setSelectedProjectId}
            canEditProject={canEditProject}
            canEditTaskBoard={canEditProjectTaskBoard}
            canDeleteProject={canDeleteProject}
            onEditProject={openProjectEditor}
            onDeleteProject={handleDeleteProject}
            onUpdateTaskStatus={handleUpdateTaskStatus}
            onUpdateTask={handleUpdateTask}
            onOpenHandoff={setHandoffProject}
          />
        )}
        {section === 'tasks' && <Tasks tasks={visibleTasks} mode={role === 'controller' ? 'global' : 'personal'} onUpdateTaskStatus={role === 'controller' ? undefined : handleUpdateTaskStatus} />}
        {section === 'calendar' && (
          <CalendarView
            projects={activeProjects}
            calendarItems={visibleCalendarItems}
            holidayItems={displayHolidayItems}
            customHolidayItems={appHolidayItems}
            chinaHolidaySync={chinaHolidaySync}
            now={now}
            staffMembers={activeStaffMembers}
            canManagePlans={role === 'controller' || role === 'admin' || role === 'manager'}
            canEditPlan={canEditCalendarProject}
            canManageHolidays={role === 'controller' || role === 'admin'}
            onHolidayItemsChange={setAppHolidayItems}
            onRefreshChinaHolidays={() => void refreshChinaHolidays(true)}
            onAddPlan={handleAddCalendarPlan}
            onUpdatePlan={handleUpdateCalendarPlan}
            onMovePlan={handleMoveCalendarPlan}
            onTogglePlanCompleted={handleToggleCalendarPlanCompleted}
            onDeletePlan={handleDeleteCalendarPlan}
            assistantDraft={assistantCalendarDrafts[0] ?? null}
            onAssistantDraftHandled={() => setAssistantCalendarDrafts((current) => current.slice(1))}
          />
        )}
        {section === 'team' && (
          <TeamLoad
            projects={appProjects}
            tasks={appTasks}
            calendarItems={appCalendarItems}
            staffMembers={appStaffMembers}
            taskWorkTypes={appWorkflowOptions.taskWorkTypes}
          />
        )}
        {section === 'people' && (
          <PeopleManagement
            projects={appProjects}
            tasks={appTasks}
            staffMembers={appStaffMembers}
            staffTagOptions={appWorkflowOptions.staffTags}
            accounts={appAccounts}
            currentRole={role}
            currentAccountId={currentAccountId}
            onUpdateStaffMember={handleUpdateStaffMember}
            onAddStaffMember={handleAddStaffMember}
            onDeleteStaffMember={handleDeleteStaffMember}
            onUpdateAccount={handleUpdateAccount}
            onAddAccount={handleAddAccount}
            onDeleteAccount={handleDeleteAccount}
          />
        )}
        {section === 'archive' && (
          <ArchiveView
            projects={archivedProjects}
            allTasks={appTasks}
            financeRecords={appFinanceRecords}
            canEditArchivedProject={canEditProject}
            canEditAllArchivedProjects={canEditArchivedProjects}
            onEditProject={openProjectEditor}
          />
        )}
        {section === 'finance' && (
          <FinanceView
            role={role}
            projects={roleVisibleProjects}
            displayProjects={filteredProjects}
            tasks={appTasks}
            loadAppData={loadCurrentAppData}
            saveAppData={saveCurrentAppData}
            onRecordsChange={setAppFinanceRecords}
          />
        )}
        </main>
      </div>

      <CrewFlowAssistant
        role={role}
        section={section}
        projects={assistantProjects}
        tasks={assistantTasks}
        calendarItems={assistantCalendarItems}
        financeRecords={
          role === 'controller' || role === 'admin' || role === 'finance'
            ? appFinanceRecords.filter((record) => assistantProjectIds.has(record.projectId))
            : []
        }
        calendarProjects={assistantCalendarProjects}
        staffMembers={assistantStaffMembers}
        editableProjectIds={assistantEditableProjects.map((project) => project.id)}
        editableTaskIds={assistantEditableTasks.map((task) => task.id)}
        navigableSections={activeNavItems.map((item) => ({ id: item.id, label: item.label }))}
        weatherLocation={weatherLocation}
        workSchedule={workSchedule}
        canCreateProject={canCreateProject}
        workflowOptions={appWorkflowOptions}
        canEditProjectTaskBoard={assistantEditableProjects.some(canEditProjectTaskBoard)}
        onOpenNewProject={() => {
          setAssistantNewProjectDraft(null)
          setShowNewProjectModal(true)
        }}
        onReviewCalendarPlans={handleReviewAssistantCalendarPlans}
        onReviewOperation={handleReviewAssistantOperation}
      />

      {dataMode === 'team' && (!dataSourceReady || teamConnectionStatus === 'error') && (
        <div className="teamReconnectGate" role="status" aria-live="polite">
          <section>
            {teamConnectionStatus === 'error' ? <AlertTriangle size={24} /> : <RefreshCw className="spinning" size={24} />}
            <div>
              <strong>{teamConnectionStatus === 'error' ? '团队连接需要处理' : '正在恢复团队连接'}</strong>
              <span>{teamConnectionMessage || '正在读取团队数据'}</span>
              <p>连接完成前已暂停新增和修改，防止数据只留在本机。</p>
            </div>
            <button type="button" onClick={() => setShowDataModeModal(true)}>
              连接设置
            </button>
          </section>
        </div>
      )}

      {showNewProjectModal && (
          <NewProjectModal
            projects={appProjects}
            staffMembers={activeStaffMembers}
            workflowOptions={appWorkflowOptions}
            canDeleteCustomers={canManageWorkflowOptions}
            preferredManager={role === 'manager' ? currentUser ?? undefined : undefined}
            lockManager={role === 'manager'}
            draft={assistantNewProjectDraft ?? undefined}
            onAddProjectType={addProjectTypeOption}
            onAddCustomerProvince={addCustomerProvinceOption}
            onAddCustomer={addCustomerOption}
            onUpdateCustomerFieldLabel={updateCustomerFieldLabel}
            onDeleteCustomer={deleteCustomerOption}
            onClose={() => {
              setShowNewProjectModal(false)
              setAssistantNewProjectDraft(null)
            }}
            onCreateProject={handleCreateProject}
          />
      )}
      {setupDraft && (
        <ProjectSetupModal
          draft={setupDraft}
          project={appProjects.find((project) => project.id === setupDraft.projectId) ?? null}
          staffMembers={activeStaffMembers}
          workflowOptions={appWorkflowOptions}
          onClose={() => setSetupDraft(null)}
          onSave={handleProjectSetupSave}
        />
      )}
      {editingProject && (
        <ProjectEditModal
          project={editingProject}
          projectTasks={appTasks.filter((task) => task.projectId === editingProject.id)}
          staffMembers={activeStaffMembers}
          workflowOptions={appWorkflowOptions}
          canDelete={projectEditScope(editingProject) === 'full' && canDeleteProject(editingProject)}
          canEditTaskBoard={canEditProjectTaskBoard(editingProject)}
          editScope={projectEditScope(editingProject) ?? 'status'}
          draft={assistantProjectEditDraft ?? undefined}
          onClose={() => {
            setEditingProject(null)
            setAssistantProjectEditDraft(null)
          }}
          onSave={handleUpdateProject}
          onDelete={handleDeleteProject}
        />
      )}
      {assistantTaskEditDraft && assistantTaskToEdit && (
        <AssistantTaskStatusModal
          task={assistantTaskToEdit}
          status={assistantTaskEditDraft.status}
          onClose={() => setAssistantTaskEditDraft(null)}
          onSave={(status) => {
            if (assistantEditableTaskIds.has(assistantTaskToEdit.id)) {
              handleUpdateTaskStatus(assistantTaskToEdit.id, status)
            }
            setAssistantTaskEditDraft(null)
          }}
        />
      )}
      {handoffProject && (
        <DepartedHandoffModal
          project={handoffProject.project}
          personName={handoffProject.personName}
          staffMembers={activeStaffMembers}
          onClose={() => setHandoffProject(null)}
          onSave={handleResolveDepartedPerson}
        />
      )}
      {showControllerAccountModal && currentAccount && (
        <ControllerAccountModal
          account={currentAccount}
          accounts={appAccounts}
          onClose={() => setShowControllerAccountModal(false)}
          onSave={handleUpdateControllerAccount}
        />
      )}
      {showDataModeModal && (
        <DataModeModal
          dataMode={dataMode}
          teamServerUrl={teamServerUrl}
          teamAccessKey={teamAccessKey}
          teamConnectionStatus={teamConnectionStatus}
          teamConnectionMessage={teamConnectionMessage}
          teamPresenceMembers={teamPresenceMembers}
          activeRemoteTeamHost={activeRemoteTeamHost}
          teamServiceInfo={teamServiceInfo}
          teamServiceBusy={teamServiceBusy}
          teamServiceMessage={teamServiceMessage}
          onClose={() => setShowDataModeModal(false)}
          onDataModeChange={updateDataMode}
          onTeamServerUrlChange={updateTeamServerUrl}
          onTeamAccessKeyChange={updateTeamAccessKey}
          onCheckTeamConnection={checkTeamConnection}
          onImportSingleDataToTeam={importSingleDataToTeam}
          onRefreshTeamService={refreshTeamServiceInfo}
          onInstallTeamService={installLocalTeamService}
          onStopTeamService={stopLocalTeamService}
          onCopyTeamServiceUrl={copyLocalTeamServiceUrl}
        />
      )}
      {showWeatherSettings && (
        <WeatherSettingsModal
          currentLocation={weatherLocation}
          initialQuery={assistantWeatherQuery}
          onClose={() => {
            setShowWeatherSettings(false)
            setAssistantWeatherQuery('')
          }}
          onSelect={(location) => {
            selectWeatherLocation(location)
            setAssistantWeatherQuery('')
          }}
        />
      )}
      {showWorkScheduleSettings && (
        <WorkScheduleSettingsModal
          schedule={workSchedule}
          draft={assistantWorkScheduleDraft}
          onClose={() => {
            setShowWorkScheduleSettings(false)
            setAssistantWorkScheduleDraft(null)
          }}
          onSave={(schedule) => {
            updateWorkSchedule(schedule)
            setAssistantWorkScheduleDraft(null)
          }}
        />
      )}
      {showWorkflowOptionsModal && (
        <WorkflowOptionsModal
          options={appWorkflowOptions}
          onClose={() => setShowWorkflowOptionsModal(false)}
          onSave={handleUpdateWorkflowOptions}
          onReset={() => handleUpdateWorkflowOptions(defaultWorkflowOptions)}
        />
      )}
      {showUpdateDialog && (
        <VersionUpdateModal
          version={appVersion}
          release={availableUpdate}
          status={updateCheckStatus}
          installState={appUpdateInstallState}
          onClose={() => setShowUpdateDialog(false)}
          onRetry={() => void checkForUpdates(true)}
          onDownload={(asset, releaseUrl) => {
            if (!asset || !window.desktopBridge?.downloadAppUpdate) {
              window.open(releaseUrl, '_blank', 'noopener,noreferrer')
              return
            }
            void window.desktopBridge.downloadAppUpdate({
              version: availableUpdate?.version ?? '',
              name: asset.name,
              url: asset.url,
              fallbackUrl: asset.fallbackUrl,
              digest: asset.digest,
            })
          }}
          onInstall={() => void prepareAndInstallApplicationUpdate()}
        />
      )}
      {currentAccount && showWelcomeGuide && (
        <WelcomeGuideModal
          guide={welcomeGuides[currentAccount.role]}
          onClose={closeWelcomeGuide}
          onDismiss={dismissWelcomeGuide}
          onOpenUserGuide={() => {
            setShowWelcomeGuide(false)
            setShowUserGuide(true)
          }}
        />
      )}
      {showUserGuide && <UserGuideModal sections={userGuideSections} onClose={() => setShowUserGuide(false)} />}
    </div>
  )
}

function AssistantTaskStatusModal({
  task,
  status,
  onClose,
  onSave,
}: {
  task: Task
  status: TaskStatus
  onClose: () => void
  onSave: (status: TaskStatus) => void
}) {
  const [nextStatus, setNextStatus] = useState(status)

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal assistantTaskStatusModal" role="dialog" aria-modal="true" aria-label="确认任务状态" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">助理操作</span>
            <h2>确认任务状态</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="assistantTaskStatusBody">
          <div>
            <span>项目</span>
            <strong>{task.project}</strong>
          </div>
          <div>
            <span>任务</span>
            <strong>{task.title}</strong>
          </div>
          <div>
            <span>负责人</span>
            <strong>{task.assignee}</strong>
          </div>
          <label>
            <span>任务状态</span>
            <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as TaskStatus)}>
              {taskStatusOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <footer>
          <span className="settingsFooterNote">保存后会按团队模式的同步规则更新。</span>
          <div className="settingsFooterActions">
            <button type="button" onClick={onClose}>取消</button>
            <button className="settingsPrimaryButton" type="button" onClick={() => onSave(nextStatus)}>确认修改</button>
          </div>
        </footer>
      </section>
    </div>
  )
}

function WeatherSettingsModal({
  currentLocation,
  initialQuery = '',
  onClose,
  onSelect,
}: {
  currentLocation: WeatherLocation | null
  initialQuery?: string
  onClose: () => void
  onSelect: (location: WeatherLocation) => void
}) {
  const [query, setQuery] = useState(initialQuery || currentLocation?.name || '')
  const [results, setResults] = useState<WeatherLocation[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const runSearch = useCallback(async (cleanQuery: string) => {
    if (!cleanQuery) return
    setStatus('searching')
    setError('')
    try {
      const locations = await searchWeatherLocations(cleanQuery)
      setResults(locations)
      setStatus('done')
    } catch {
      setResults([])
      setStatus('error')
      setError('城市搜索失败，请检查网络后重试。')
    }
  }, [])

  useEffect(() => {
    const cleanQuery = initialQuery.trim()
    if (!cleanQuery) return
    void runSearch(cleanQuery)
  }, [initialQuery, runSearch])

  async function handleSearch() {
    const cleanQuery = query.trim()
    if (!cleanQuery || status === 'searching') return
    await runSearch(cleanQuery)
  }

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal weatherSettingsModal" role="dialog" aria-modal="true" aria-label="设置天气城市" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">天气</span>
            <h2>{initialQuery ? '确认助理选择城市' : '设置所在城市'}</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="weatherSettingsBody">
          {currentLocation && (
            <div className="weatherCurrentLocation">
              <span>当前城市</span>
              <strong>{weatherLocationDisplay(currentLocation)}</strong>
            </div>
          )}

          <form
            className="weatherSearchForm"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSearch()
            }}
          >
            <label htmlFor="weather-city-search">搜索城市</label>
            <div>
              <input
                id="weather-city-search"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="输入城市，例如：北京、上海、成都"
              />
              <button type="submit" disabled={!query.trim() || status === 'searching'}>
                <Search size={17} />
                <span>{status === 'searching' ? '搜索中' : '搜索'}</span>
              </button>
            </div>
          </form>

          <div className="weatherSearchResults" aria-live="polite">
            {status === 'idle' && <p className="settingsHint">选择城市后，天气会每 30 分钟自动更新。</p>}
            {status === 'done' && results.length === 0 && <EmptyState title="没有找到城市" note="请尝试输入完整城市名称。" />}
            {status === 'error' && <p className="settingsError">{error}</p>}
            {results.map((location) => (
              <button key={`${location.id}-${weatherLocationKey(location)}`} type="button" onClick={() => onSelect(location)}>
                <strong>{location.name}</strong>
                <span>{weatherLocationRegion(location)}</span>
              </button>
            ))}
          </div>
        </div>

        <footer>
          <span className="settingsFooterNote">天气设置仅保存在当前电脑。</span>
          <button type="button" onClick={onClose}>关闭</button>
        </footer>
      </section>
    </div>
  )
}

function WorkScheduleSettingsModal({
  schedule,
  draft,
  onClose,
  onSave,
}: {
  schedule: WorkSchedule | null
  draft: WorkSchedule | null
  onClose: () => void
  onSave: (schedule: WorkSchedule) => void
}) {
  const [start, setStart] = useState(draft?.start ?? schedule?.start ?? '09:00')
  const [end, setEnd] = useState(draft?.end ?? schedule?.end ?? '18:00')
  const nextSchedule = { start, end }
  const isValid = isClockTime(start) && isClockTime(end) && start !== end
  const crossesMidnight = isValid && clockTimeToMinutes(end) < clockTimeToMinutes(start)

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal workScheduleSettingsModal" role="dialog" aria-modal="true" aria-label="设置上下班时间" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">当前时间</span>
            <h2>{draft ? '确认助理设置时间' : '设置上下班时间'}</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="workScheduleSettingsBody">
          <div className="workScheduleFields">
            <label>
              <span>上班时间</span>
              <input type="time" step="300" value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label>
              <span>下班时间</span>
              <input type="time" step="300" value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
          </div>

          <div className="workSchedulePreview">
            <span>主页显示预览</span>
            <strong>{isValid ? workScheduleStatus(new Date(), nextSchedule) : '上下班时间不能相同'}</strong>
          </div>
          {crossesMidnight && <p className="settingsHint">下班时间早于上班时间，将按次日下班计算。</p>}
        </div>

        <footer>
          <span className="settingsFooterNote">该时间按当前账号保存在本机。</span>
          <div className="settingsFooterActions">
            <button type="button" onClick={onClose}>取消</button>
            <button className="settingsPrimaryButton" type="button" disabled={!isValid} onClick={() => onSave(nextSchedule)}>保存</button>
          </div>
        </footer>
      </section>
    </div>
  )
}

function WelcomeGuideModal({
  guide,
  onClose,
  onDismiss,
  onOpenUserGuide,
}: {
  guide: WelcomeGuideContent
  onClose: () => void
  onDismiss: () => void
  onOpenUserGuide: () => void
}) {
  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal welcomeGuideModal" role="dialog" aria-modal="true" aria-label="CrewFlow 使用提示" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">{guide.eyebrow}</span>
            <h2>{guide.title}</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="welcomeGuideBody">
          <p>{guide.intro}</p>
          {guide.sections.map((section) => (
            <div className="welcomeSteps" key={section.title}>
              <span>{section.title}</span>
              <ol>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>
          ))}
          {guide.note && <div className="welcomeNote">{guide.note}</div>}
        </div>
        <footer>
          <button type="button" onClick={onDismiss}>
            以后不再提示
          </button>
          <button type="button" onClick={onOpenUserGuide}>
            <BookOpen size={15} />
            完整使用说明
          </button>
          <button className="primaryButton" type="button" onClick={onClose}>
            知道了
          </button>
        </footer>
      </section>
    </div>
  )
}

function UserGuideModal({ sections, onClose }: { sections: UserGuideSection[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? '')
  const articleRef = useRef<HTMLElement | null>(null)
  const filteredSections = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase()
    if (!cleanQuery) return sections
    return sections.filter((section) => `${section.title}\n${section.body}`.toLowerCase().includes(cleanQuery))
  }, [query, sections])
  const activeSection =
    filteredSections.find((section) => section.id === activeSectionId) ??
    filteredSections[0] ??
    sections.find((section) => section.id === activeSectionId) ??
    sections[0]

  useEffect(() => {
    if (!activeSection || activeSection.id === activeSectionId) return
    setActiveSectionId(activeSection.id)
  }, [activeSection, activeSectionId])

  function selectSection(sectionId: string) {
    setActiveSectionId(sectionId)
    articleRef.current?.scrollTo({ top: 0 })
  }

  return (
    <div className="modalBackdrop userGuideBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal userGuideModal" role="dialog" aria-modal="true" aria-label="CrewFlow 中文使用说明" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">帮助中心</span>
            <h2>CrewFlow 中文使用说明</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="userGuideLayout">
          <aside className="userGuideIndex">
            <label className="userGuideSearch">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索使用说明" />
            </label>
            <nav>
              {filteredSections.map((section) => (
                <button
                  className={section.id === activeSection?.id ? 'active' : ''}
                  type="button"
                  key={section.id}
                  onClick={() => selectSection(section.id)}
                  title={section.title}
                >
                  {section.title}
                </button>
              ))}
              {filteredSections.length === 0 && <span className="userGuideEmpty">没有匹配的说明内容</span>}
            </nav>
          </aside>

          <article className="userGuideArticle" ref={articleRef}>
            {activeSection ? (
              <>
                <h2>{activeSection.title}</h2>
                <Suspense fallback={<p className="userGuideLoading">正在打开说明内容…</p>}>
                  <ReactMarkdown
                    components={{
                      a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
                    }}
                  >
                    {activeSection.body}
                  </ReactMarkdown>
                </Suspense>
              </>
            ) : (
              <p>说明内容暂不可用。</p>
            )}
          </article>
        </div>

        <footer>
          <span className="userGuideVersion">离线内置说明 · CrewFlow v{appVersion}</span>
          <button className="primaryButton" type="button" onClick={onClose}>
            关闭
          </button>
        </footer>
      </section>
    </div>
  )
}

function dataModeLabel(dataMode: DataMode) {
  return dataMode === 'team' ? '团队模式' : '单人模式'
}

function connectionStatusText(status: TeamConnectionStatus, message: string) {
  if (message) return message
  if (status === 'checking') return '正在连接团队服务'
  if (status === 'connected') return '团队服务已连接'
  if (status === 'error') return '团队服务连接失败'
  return '使用本机数据'
}

function formatTeamSyncTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function DataModeStatus({
  dataMode,
  teamConnectionStatus,
  teamConnectionMessage,
  dataSourceReady,
  lastTeamSyncAt,
  onlineMemberCount,
  onOpen,
}: {
  dataMode: DataMode
  teamConnectionStatus: TeamConnectionStatus
  teamConnectionMessage: string
  dataSourceReady: boolean
  lastTeamSyncAt: number | null
  onlineMemberCount: number | null
  onOpen: () => void
}) {
  const effectiveStatus = dataMode === 'team' && !dataSourceReady ? 'checking' : teamConnectionStatus
  const Icon = dataMode === 'team' && effectiveStatus === 'connected' ? CheckCircle2 : HardDrive
  const statusClass = dataMode === 'team' ? effectiveStatus : 'single'

  return (
    <button className={`nasStatus dataModeStatus ${statusClass}`} type="button" onClick={onOpen}>
      <Icon size={18} />
      <div className="dataModeStatusCopy">
        <strong>{dataModeLabel(dataMode)}</strong>
        <div className="dataModeStatusMeta">
          <span>{dataMode === 'team' ? connectionStatusText(effectiveStatus, teamConnectionMessage) : '数据只保存在本机'}</span>
          {dataMode === 'team' && dataSourceReady && lastTeamSyncAt && <time dateTime={new Date(lastTeamSyncAt).toISOString()}>最近同步 {formatTeamSyncTime(lastTeamSyncAt)}</time>}
          {dataMode === 'team' && onlineMemberCount !== null && <b className="teamOnlineCount">{onlineMemberCount} 人在线</b>}
        </div>
      </div>
    </button>
  )
}

function updateStatusText(status: UpdateCheckStatus, availableVersion?: string) {
  if (status === 'checking') return '正在检查更新'
  if (status === 'available') return availableVersion ? `有新版本 v${availableVersion}` : '有新版本'
  if (status === 'up-to-date') return '当前已是最新'
  if (status === 'error') return '点击重新检查'
  return '检查更新'
}

function updateReleaseSourceLabel(source?: UpdateRelease['source'], assetUrl?: string) {
  try {
    if (assetUrl && new URL(assetUrl).hostname.toLowerCase() === 'gitcode.com') {
      return source === 'github' ? 'GitCode 国内下载 · GitHub 版本信息' : 'GitCode 国内源'
    }
  } catch {
    // Use the metadata source label when a preview URL is malformed.
  }
  return source === 'gitcode' ? 'GitCode 国内源' : 'GitHub 备用源'
}

function BrandVersionStatus({
  version,
  release,
  status,
  open,
  onOpen,
}: {
  version: string
  release: UpdateRelease | null
  status: UpdateCheckStatus
  open: boolean
  onOpen: () => void
}) {
  return (
    <div className="brandVersionWrap">
      <button
        className={`brandVersion ${status}`}
        type="button"
        onClick={onOpen}
        title={updateStatusText(status, release?.version)}
        aria-expanded={open}
      >
        {status === 'checking' && <RefreshCw size={10} className="spinning" />}
        <span>v{version}</span>
        {status === 'available' && <i aria-hidden="true" />}
      </button>
    </div>
  )
}

function updateRuntimeGuide() {
  const platform =
    window.desktopBridge?.platform ??
    (navigator.userAgent.toLowerCase().includes('windows')
      ? 'win32'
      : navigator.userAgent.toLowerCase().includes('macintosh')
        ? 'darwin'
        : 'unknown')
  const arch = window.desktopBridge?.arch ?? 'unknown'

  if (platform === 'win32') {
    return {
      platformLabel: 'Windows 64 位',
      packageLabel: 'Windows-x64 Setup.exe',
      assetPattern: /Windows-x64-Setup\.exe$/i,
      steps: [
        '点击“下载更新”，等待安装程序下载完成。',
        '点击“安装并重启”，CrewFlow 会在原安装位置完成替换。',
        '首次从压缩包版迁移时，安装程序会创建固定安装目录和快捷方式。',
        '新版确认正常后，可以删除以前的压缩包程序文件夹。',
      ],
    }
  }

  if (platform === 'darwin') {
    const isIntel = arch === 'x64'
    return {
      platformLabel: isIntel ? 'Intel 芯片 Mac' : arch === 'arm64' ? 'Apple 芯片 Mac' : 'macOS',
      packageLabel: 'macOS 通用版 DMG',
      assetPattern: /macOS-(?:universal|arm64|x64)\.dmg$/i,
      steps: [
        '点击“下载更新”，等待 DMG 安装包下载完成。',
        '点击“准备更新并退出”；CrewFlow 会检测本机是否为团队主机，必要时先停止服务。',
        '安装包打开后 CrewFlow 会自动完全退出。',
        '把新版 CrewFlow 拖入“应用程序”，确认覆盖旧版。',
        '重新打开 CrewFlow；团队主机会自动修复并恢复后台服务。',
      ],
    }
  }

  return {
    platformLabel: '当前电脑',
    packageLabel: '与系统匹配的安装包',
    assetPattern: null,
    steps: [
      '从软件更新页下载与当前系统匹配的安装包。',
      '退出正在运行的 CrewFlow 后完成覆盖安装。',
      '重新打开 CrewFlow，确认数据和团队连接正常。',
    ],
  }
}

function formatUpdateBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 MB'
  return `${(value / 1024 / 1024).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`
}

function releaseNotesForDisplay(notes: string) {
  const items: string[] = []

  for (const rawLine of notes.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const heading = line.replace(/^#{1,6}\s*/, '').trim()
    if (/^(下载说明|downloads?|installation)/i.test(heading)) break
    if (/^(CrewFlow\s+v?\d|发布日期|本次更新|what'?s changed)/i.test(heading)) continue
    if (/^#{1,6}\s/.test(line)) continue

    const cleanLine = line
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim()
    if (cleanLine) items.push(cleanLine)
    if (items.length >= 12) break
  }

  return items
}

function VersionUpdateModal({
  version,
  release,
  status,
  installState,
  onClose,
  onRetry,
  onDownload,
  onInstall,
}: {
  version: string
  release: UpdateRelease | null
  status: UpdateCheckStatus
  installState: AppUpdateInstallState
  onClose: () => void
  onRetry: () => void
  onDownload: (asset: UpdateRelease['assets'][number] | undefined, releaseUrl: string) => void
  onInstall: () => void
}) {
  const guide = updateRuntimeGuide()
  const matchingAsset = guide.assetPattern
    ? release?.assets.find((asset) => guide.assetPattern?.test(asset.name))
    : undefined
  const releaseNotes = releaseNotesForDisplay(release?.notes ?? '')
  const hasUpdate = status === 'available' && Boolean(release)
  const isUpdateDownloading = installState.status === 'checking' || installState.status === 'downloading'
  const isUpdateDownloaded = installState.status === 'downloaded'
  const isUpdateInstalling = installState.status === 'installing'
  const isInstallerOpened = installState.status === 'opened'
  const hasInstallError = installState.status === 'error'
  const transferSummary =
    installState.total > 0
      ? `${installState.percent}% · ${formatUpdateBytes(installState.transferred)} / ${formatUpdateBytes(installState.total)}`
      : installState.percent > 0
        ? `${installState.percent}%`
        : '正在准备下载'
  const dialogTitle =
    status === 'checking'
      ? '正在检查更新'
      : hasUpdate
        ? '发现新版本'
        : status === 'up-to-date'
          ? '当前已是最新版本'
          : status === 'error'
            ? '版本检查失败'
            : '软件更新'

  return (
    <div className="modalBackdrop versionUpdateBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="versionUpdateModal"
        role="dialog"
        aria-modal="true"
        aria-label="CrewFlow 软件更新"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">软件更新</span>
            <h2>{dialogTitle}</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="versionUpdateBody">
          <div className="versionUpdateVersions">
            <div>
              <span>当前版本</span>
              <strong>v{version}</strong>
            </div>
            <ChevronRight size={20} aria-hidden="true" />
            <div className={hasUpdate ? 'available' : ''}>
              <span>{hasUpdate ? '最新版本' : '检查结果'}</span>
              <strong>{hasUpdate && release ? `v${release.version}` : status === 'checking' ? '检测中' : `v${version}`}</strong>
            </div>
          </div>

          {status === 'checking' && (
            <div className="versionUpdateState">
              <RefreshCw size={22} className="spinning" />
              <div>
                <strong>正在连接更新服务器</strong>
                <span>请稍候，不会影响当前项目数据。</span>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="versionUpdateState error">
              <AlertTriangle size={22} />
              <div>
                <strong>暂时无法读取最新版本</strong>
                <span>国内源和备用源当前均不可用，请检查网络后重试；现有版本仍可正常使用。</span>
              </div>
            </div>
          )}

          {status === 'up-to-date' && (
            <div className="versionUpdateState success">
              <CheckCircle2 size={22} />
              <div>
                <strong>当前安装的 CrewFlow 已是最新版本</strong>
                <span>有新版本时，左上角版本号旁会出现提示圆点。</span>
              </div>
            </div>
          )}

          {hasUpdate && release && (
            <>
              {(isUpdateDownloading || isUpdateDownloaded || isUpdateInstalling || isInstallerOpened || hasInstallError) && (
                <section className={`versionUpdateTransfer ${hasInstallError ? 'error' : ''}`}>
                  <div className="versionUpdateTransferHeader">
                    <div>
                      {isUpdateDownloaded || isInstallerOpened ? (
                        <CheckCircle2 size={20} />
                      ) : hasInstallError ? (
                        <AlertTriangle size={20} />
                      ) : (
                        <RefreshCw size={20} className={isUpdateDownloading || isUpdateInstalling ? 'spinning' : ''} />
                      )}
                      <strong>{installState.message || '正在准备更新'}</strong>
                    </div>
                    {isUpdateDownloading && <span>{transferSummary}</span>}
                  </div>
                  {isUpdateDownloading && (
                    <div className="versionUpdateProgress" aria-label={`更新下载进度 ${installState.percent}%`}>
                      <i style={{ width: `${installState.percent}%` }} />
                    </div>
                  )}
                </section>
              )}

              <section className="versionUpdateSection">
                <h3>v{release.version} 更新内容</h3>
                {releaseNotes.length > 0 ? (
                  <ul>
                    {releaseNotes.map((item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>该版本暂未提供详细更新说明，可前往版本发布页查看。</p>
                )}
              </section>

              <section className="versionUpdateSection">
                <div className="versionUpdateSectionTitle">
                  <h3>安装与更新</h3>
                  <span>
                    {updateReleaseSourceLabel(release.source, matchingAsset?.url)} · {guide.platformLabel} · {matchingAsset?.name ?? guide.packageLabel}
                  </span>
                </div>
                <ol>
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div className="versionUpdateNote">
                  单人数据、团队数据库和助理 API Key 都保存在程序目录之外，更新不会删除数据。团队主机只在正式安装时短暂停服，新版启动后会自动恢复并修复服务路径。
                </div>
              </section>
            </>
          )}
        </div>

        <footer>
          <button type="button" onClick={onClose} disabled={isUpdateInstalling}>
            {hasUpdate ? '稍后处理' : '关闭'}
          </button>
          {status === 'error' && (
            <button className="primaryButton" type="button" onClick={onRetry}>
              <RefreshCw size={15} />
              重新检查
            </button>
          )}
          {hasUpdate && release && (
            isUpdateDownloaded ? (
              <button className="primaryButton" type="button" onClick={onInstall}>
                {installState.canAutoInstall ? <RefreshCw size={15} /> : <FolderOpen size={15} />}
                {installState.canAutoInstall ? '安装并重启' : '准备更新并退出'}
              </button>
            ) : (
              <button
                className="primaryButton"
                type="button"
                disabled={isUpdateDownloading || isUpdateInstalling || isInstallerOpened}
                onClick={() => onDownload(matchingAsset, release.url)}
              >
                {isUpdateDownloading || isUpdateInstalling ? <RefreshCw size={15} className="spinning" /> : <Download size={15} />}
                {isUpdateDownloading
                  ? '正在下载'
                  : isUpdateInstalling
                    ? '正在安装'
                    : isInstallerOpened
                      ? '安装包已打开'
                      : hasInstallError
                        ? '重新下载'
                        : matchingAsset
                          ? '下载更新'
                          : '前往下载页'}
              </button>
            )
          )}
        </footer>
      </section>
    </div>
  )
}

function DataModeModal({
  dataMode,
  teamServerUrl,
  teamAccessKey,
  teamConnectionStatus,
  teamConnectionMessage,
  teamPresenceMembers,
  activeRemoteTeamHost,
  teamServiceInfo,
  teamServiceBusy,
  teamServiceMessage,
  onClose,
  onDataModeChange,
  onTeamServerUrlChange,
  onTeamAccessKeyChange,
  onCheckTeamConnection,
  onImportSingleDataToTeam,
  onRefreshTeamService,
  onInstallTeamService,
  onStopTeamService,
  onCopyTeamServiceUrl,
}: {
  dataMode: DataMode
  teamServerUrl: string
  teamAccessKey: string
  teamConnectionStatus: TeamConnectionStatus
  teamConnectionMessage: string
  teamPresenceMembers: TeamPresenceMember[] | null
  activeRemoteTeamHost: string
  teamServiceInfo: TeamServiceInfo | null
  teamServiceBusy: boolean
  teamServiceMessage: string
  onClose: () => void
  onDataModeChange: (mode: DataMode) => void
  onTeamServerUrlChange: (url: string) => void
  onTeamAccessKeyChange: (key: string) => void
  onCheckTeamConnection: () => void
  onImportSingleDataToTeam: () => void
  onRefreshTeamService: () => void
  onInstallTeamService: () => void
  onStopTeamService: () => void
  onCopyTeamServiceUrl: (url?: string) => void
}) {
  const hostUrl = teamServiceInfo?.connectionUrl ?? defaultTeamServerUrl
  const visibleHostUrl = activeRemoteTeamHost ? normalizeTeamServerUrl(teamServerUrl) : hostUrl
  const hostStatus = activeRemoteTeamHost ? '已有主机' : teamServiceInfo?.running ? '运行中' : '未开启'
  const canManageLocalService = Boolean(teamServiceInfo?.supported) && !activeRemoteTeamHost
  const hostCandidates =
    teamServiceInfo?.urlCandidates?.length
      ? teamServiceInfo.urlCandidates
      : hostUrl
        ? [{ url: hostUrl, address: hostUrl, interfaceName: '默认地址', kind: '推荐地址' }]
        : []
  const alternateHostCandidates = activeRemoteTeamHost ? [] : hostCandidates.filter((candidate) => candidate.url !== hostUrl)
  const singleDataFile = teamServiceInfo?.singleDataFile ?? ''
  const singleDataDirectory = teamServiceInfo?.singleDataDirectory ?? ''
  const teamDataFile = teamServiceInfo?.teamDataFile ?? teamServiceInfo?.dataFile ?? ''
  const teamDataDirectory = teamServiceInfo?.teamDataDirectory ?? ''
  const backupDirectory = teamServiceInfo?.backupDirectory ?? ''
  const accessKeyFile = teamServiceInfo?.accessKeyFile ?? ''
  const accessKeyDirectory = teamServiceInfo?.accessKeyDirectory ?? ''

  async function copyPath(value: string) {
    if (!value) return
    if (window.desktopBridge?.copyText) {
      await window.desktopBridge.copyText(value)
      return
    }
    await navigator.clipboard.writeText(value)
  }

  async function openDirectory(directory: string) {
    if (!directory) return
    await window.desktopBridge?.openProjectFolder(directory)
  }

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal dataModeModal" role="dialog" aria-modal="true" aria-label="工作模式设置" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dataModeScroll">
        <header>
          <div>
            <span className="eyebrow">工作模式</span>
            <h2>数据保存位置</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="dataModeOptions">
          <button className={dataMode === 'single' ? 'active' : ''} type="button" onClick={() => onDataModeChange('single')}>
            <HardDrive size={18} />
            <strong>单人模式</strong>
            <span>只读写这台电脑上的数据文件。</span>
          </button>
          <button className={dataMode === 'team' ? 'active' : ''} type="button" onClick={() => onDataModeChange('team')}>
            <Users size={18} />
            <strong>团队模式</strong>
            <span>连接常驻电脑上的 CrewFlow Server。</span>
          </button>
        </div>
        <section className="teamHostPanel">
          <div className="teamHostHeader">
            <div>
              <strong>本机作为团队主机</strong>
              <span>{activeRemoteTeamHost ? `团队服务已由 ${activeRemoteTeamHost} 开启，本机不能重复开启。` : '只在常驻电脑操作。开启后，把下面地址发给其他电脑填写。'}</span>
            </div>
            <em className={teamServiceInfo?.running || activeRemoteTeamHost ? 'running' : ''}>{hostStatus}</em>
          </div>
          <label className="dataModeField teamHostAddress">
            <span>{activeRemoteTeamHost ? '当前团队主机地址' : '其他电脑填写这个地址'}</span>
            <input value={visibleHostUrl} readOnly />
          </label>
          {alternateHostCandidates.length > 0 && (
            <div className="teamHostCandidates" aria-label="可用团队服务地址">
              {alternateHostCandidates.map((candidate) => (
                <button key={`${candidate.interfaceName}-${candidate.url}`} type="button" onClick={() => onCopyTeamServiceUrl(candidate.url)}>
                  <strong>候选</strong>
                  <span>{candidate.url}</span>
                  <em>
                    {candidate.interfaceName} · {candidate.kind}
                  </em>
                </button>
              ))}
            </div>
          )}
          <label className="dataModeField teamHostAddress">
            <span>其他电脑填写这个访问密钥</span>
            <input value={teamServiceInfo?.accessKey ?? ''} readOnly placeholder="开启团队服务后自动生成" />
          </label>
          <div className="teamHostActions">
            <button type="button" onClick={onInstallTeamService} disabled={teamServiceBusy || !canManageLocalService}>
              {activeRemoteTeamHost ? '已有团队服务' : teamServiceInfo?.running ? '修复/重启服务' : '开启团队服务'}
            </button>
            <button type="button" onClick={onRefreshTeamService} disabled={teamServiceBusy}>
              刷新状态
            </button>
            <button type="button" onClick={() => onCopyTeamServiceUrl()} disabled={!hostUrl || Boolean(activeRemoteTeamHost)}>
              复制地址和密钥
            </button>
            <button type="button" onClick={onStopTeamService} disabled={teamServiceBusy || !teamServiceInfo?.running}>
              停止服务
            </button>
          </div>
          <p className="teamHostMessage">
            {activeRemoteTeamHost ? `已开启电脑：${activeRemoteTeamHost}` : teamServiceMessage || teamServiceInfo?.message || '打开后会自动显示本机局域网地址。'}
          </p>
        </section>
        <section className="dataPathPanel" aria-label="数据文件位置">
          <div className="dataPathHeader">
            <strong>数据文件位置</strong>
            <span>替换 App 不会清空这里的数据。</span>
          </div>
          <DataPathRow label="单人模式数据" value={singleDataFile || '桌面 App 中自动显示'} directory={singleDataDirectory} onCopy={copyPath} onOpenDirectory={openDirectory} />
          {activeRemoteTeamHost ? (
            <DataPathRow label="团队模式数据" value={`保存在主机：${activeRemoteTeamHost}`} note="请在开启团队服务的电脑查看具体文件路径。" onCopy={copyPath} onOpenDirectory={openDirectory} />
          ) : (
            <>
              <DataPathRow
                label={teamServiceInfo?.storageEngine === 'sqlite' ? '团队 SQLite 数据库' : '团队服务数据'}
                value={teamDataFile || '开启团队服务后自动显示'}
                directory={teamDataDirectory}
                onCopy={copyPath}
                onOpenDirectory={openDirectory}
              />
              <DataPathRow label="团队数据备份" value={backupDirectory || '开启团队服务后自动创建'} directory={backupDirectory} onCopy={copyPath} onOpenDirectory={openDirectory} />
              <DataPathRow label="访问密钥文件" value={accessKeyFile || '开启团队服务后自动生成'} directory={accessKeyDirectory} onCopy={copyPath} onOpenDirectory={openDirectory} />
            </>
          )}
        </section>
        <label className="dataModeField">
          <span>团队服务器地址</span>
          <input value={teamServerUrl} onChange={(event) => onTeamServerUrlChange(event.target.value)} placeholder="例如：http://HOST_LAN_IP:8787" />
        </label>
        <label className="dataModeField">
          <span>团队访问密钥</span>
          <input value={teamAccessKey} onChange={(event) => onTeamAccessKeyChange(event.target.value)} placeholder="主机开启团队服务后显示的访问密钥" />
        </label>
        <div className={`dataModeConnection ${teamConnectionStatus}`}>
          {connectionStatusText(teamConnectionStatus, teamConnectionMessage)}
        </div>
        {dataMode === 'team' && teamPresenceMembers !== null && (
          <section className="teamPresencePanel" aria-label="在线成员">
            <div className="teamPresenceHeader">
              <div>
                <Users size={17} />
                <strong>在线成员</strong>
              </div>
              <span>{teamPresenceMembers.length} 人在线</span>
            </div>
            {teamPresenceMembers.length > 0 ? (
              <div className="teamPresenceList">
                {teamPresenceMembers.map((member) => (
                  <div className="teamPresenceMember" key={member.accountId}>
                    <i aria-hidden="true">{member.name.trim().slice(0, 1) || '?'}</i>
                    <div>
                      <strong>{member.name}</strong>
                      <span>
                        {roleLabelFor(member.role)}
                        {member.connections > 1 ? ` · ${member.connections} 台设备` : ''}
                      </span>
                    </div>
                    <em>在线</em>
                  </div>
                ))}
              </div>
            ) : (
              <p className="teamPresenceEmpty">暂时没有已登录成员</p>
            )}
          </section>
        )}
        <footer>
          <button type="button" onClick={onCheckTeamConnection} disabled={teamConnectionStatus === 'checking'}>
            测试连接
          </button>
          <button type="button" onClick={onImportSingleDataToTeam} disabled={teamConnectionStatus === 'checking'}>
            导入本机数据到团队库
          </button>
          <button className="primaryButton" type="button" onClick={onClose}>
            完成
          </button>
        </footer>
        </div>
      </section>
    </div>
  )
}

function DataPathRow({
  label,
  value,
  directory = '',
  note,
  onCopy,
  onOpenDirectory,
}: {
  label: string
  value: string
  directory?: string
  note?: string
  onCopy: (value: string) => Promise<void>
  onOpenDirectory: (directory: string) => Promise<void>
}) {
  const canOpenDirectory = Boolean(directory)

  return (
    <div className="dataPathRow">
      <div>
        <span>{label}</span>
        <strong title={value}>{value}</strong>
        {note && <em>{note}</em>}
      </div>
      <button type="button" onClick={() => onCopy(value)} disabled={!value}>
        复制
      </button>
      <button type="button" onClick={() => onOpenDirectory(directory)} disabled={!canOpenDirectory}>
        打开
      </button>
    </div>
  )
}

function WorkflowOptionsModal({
  options,
  onClose,
  onSave,
  onReset,
}: {
  options: WorkflowOptions
  onClose: () => void
  onSave: (options: WorkflowOptions, renames: WorkflowOptionRename[]) => void
  onReset: () => void
}) {
  const [draft, setDraft] = useState(() => normalizeWorkflowOptions(options))
  const [renames, setRenames] = useState<WorkflowOptionRename[]>([])

  function updateList(category: WorkflowOptionCategory, nextList: string[]) {
    setDraft((current) => ({
      ...current,
      [category]: normalizeWorkflowOptionList(category, nextList),
    }))
  }

  function renameOption(category: WorkflowOptionCategory, previousValue: string, nextValue: string) {
    if (isProtectedWorkflowOption(category, previousValue)) return

    const cleanValue = nextValue.trim()
    if (!cleanValue) return

    updateList(
      category,
      draft[category].map((item) => (item === previousValue ? cleanValue : item)),
    )
    setRenames((current) => {
      const existingOriginal = current.find((item) => item.category === category && item.to === previousValue)
      const from = existingOriginal?.from ?? previousValue
      const withoutCurrent = current.filter((item) => item !== existingOriginal && !(item.category === category && item.from === previousValue))
      if (from === cleanValue) return withoutCurrent
      return [...withoutCurrent, { category, from, to: cleanValue }]
    })
  }

  function addOption(category: WorkflowOptionCategory, value: string) {
    const cleanValue = value.trim()
    if (!cleanValue || draft[category].includes(cleanValue)) return
    updateList(category, [...draft[category], cleanValue])
  }

  function deleteOption(category: WorkflowOptionCategory, value: string) {
    if (isProtectedWorkflowOption(category, value)) return
    if (category !== 'projectTypes' && draft[category].length <= 1) return
    updateList(category, draft[category].filter((item) => item !== value))
  }

  function moveOption(category: WorkflowOptionCategory, value: string, direction: 'up' | 'down') {
    const currentList = draft[category]
    const currentIndex = currentList.indexOf(value)
    if (currentIndex < 0) return

    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (nextIndex < 0 || nextIndex >= currentList.length) return

    const nextList = [...currentList]
    const [movedValue] = nextList.splice(currentIndex, 1)
    nextList.splice(nextIndex, 0, movedValue)
    updateList(category, nextList)
  }

  function saveOptions() {
    onSave(normalizeWorkflowOptions(draft), renames)
    onClose()
  }

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal workflowOptionsModal" role="dialog" aria-modal="true" aria-label="选项管理" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">全局配置</span>
            <h2>选项管理</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="workflowOptionsBody">
          <WorkflowOptionSection
            title="项目类型"
            note="用于新建项目、项目筛选和项目编辑。初始为空，可按公司业务自行添加。"
            category="projectTypes"
            values={draft.projectTypes}
            onAdd={addOption}
            onRename={renameOption}
            onDelete={deleteOption}
            onMove={moveOption}
          />
          <WorkflowOptionSection
            title="任务工种"
            note="用于新建项目、任务分派和项目详情任务板。"
            category="taskWorkTypes"
            values={draft.taskWorkTypes}
            onAdd={addOption}
            onRename={renameOption}
            onDelete={deleteOption}
            onMove={moveOption}
          />
          <WorkflowOptionSection
            title="当前节点状态"
            note="用于项目当前状态。内置的已完成、需修改、等反馈类状态仍会参与统计。"
            category="nodeStatuses"
            values={draft.nodeStatuses}
            onAdd={addOption}
            onRename={renameOption}
            onDelete={deleteOption}
            onMove={moveOption}
          />
          <WorkflowOptionSection
            title="流程节点"
            note="用于立项后设置、编辑项目和项目详情流程展示。"
            category="workflowStages"
            values={draft.workflowStages}
            onAdd={addOption}
            onRename={renameOption}
            onDelete={deleteOption}
            onMove={moveOption}
          />
          <WorkflowOptionSection
            title="人员标签"
            note="用于人员管理、团队负载、项目负责人筛选和任务推荐。关键标签保留不可改删。"
            category="staffTags"
            values={draft.staffTags}
            protectedValues={protectedStaffTags}
            onAdd={addOption}
            onRename={renameOption}
            onDelete={deleteOption}
            onMove={moveOption}
          />
        </div>
        <footer>
          <button
            type="button"
            onClick={() => {
              setDraft(defaultWorkflowOptions)
              setRenames([])
              onReset()
            }}
          >
            恢复默认
          </button>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primaryButton" type="button" onClick={saveOptions}>
            保存
          </button>
        </footer>
      </section>
    </div>
  )
}

function WorkflowOptionSection({
  title,
  note,
  category,
  values,
  protectedValues = [],
  onAdd,
  onRename,
  onDelete,
  onMove,
}: {
  title: string
  note: string
  category: WorkflowOptionCategory
  values: string[]
  protectedValues?: string[]
  onAdd: (category: WorkflowOptionCategory, value: string) => void
  onRename: (category: WorkflowOptionCategory, previousValue: string, nextValue: string) => void
  onDelete: (category: WorkflowOptionCategory, value: string) => void
  onMove: (category: WorkflowOptionCategory, value: string, direction: 'up' | 'down') => void
}) {
  const [newValue, setNewValue] = useState('')
  const protectedSet = new Set(protectedValues)

  function addValue() {
    onAdd(category, newValue)
    setNewValue('')
  }

  return (
    <section className="workflowOptionSection">
      <div>
        <h3>{title}</h3>
        <p>{note}</p>
      </div>
      <div className="workflowOptionRows">
        {values.map((value, index) => (
          <WorkflowOptionRow
            key={value}
            category={category}
            value={value}
            canDelete={(category === 'projectTypes' || values.length > 1) && !protectedSet.has(value)}
            isProtected={protectedSet.has(value)}
            canMoveUp={index > 0}
            canMoveDown={index < values.length - 1}
            onRename={onRename}
            onDelete={onDelete}
            onMove={onMove}
          />
        ))}
      </div>
      <div className="workflowOptionAdd">
        <input value={newValue} onChange={(event) => setNewValue(event.target.value)} placeholder={`新增${title}`} />
        <button type="button" onClick={addValue} disabled={!newValue.trim() || values.includes(newValue.trim())}>
          新增
        </button>
      </div>
    </section>
  )
}

function WorkflowOptionRow({
  category,
  value,
  canDelete,
  isProtected = false,
  canMoveUp,
  canMoveDown,
  onRename,
  onDelete,
  onMove,
}: {
  category: WorkflowOptionCategory
  value: string
  canDelete: boolean
  isProtected?: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onRename: (category: WorkflowOptionCategory, previousValue: string, nextValue: string) => void
  onDelete: (category: WorkflowOptionCategory, value: string) => void
  onMove: (category: WorkflowOptionCategory, value: string, direction: 'up' | 'down') => void
}) {
  const [draftValue, setDraftValue] = useState(value)

  useEffect(() => {
    setDraftValue(value)
  }, [value])

  function commitRename() {
    if (isProtected) {
      setDraftValue(value)
      return
    }

    const cleanValue = draftValue.trim()
    if (!cleanValue) {
      setDraftValue(value)
      return
    }
    if (cleanValue !== value) onRename(category, value, cleanValue)
  }

  return (
    <div className="workflowOptionRow">
      <input
        className={isProtected ? 'workflowOptionProtectedInput' : undefined}
        value={draftValue}
        readOnly={isProtected}
        onBlur={commitRename}
        onChange={(event) => {
          if (!isProtected) setDraftValue(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
      />
      <div className="workflowOptionRowActions">
        <button type="button" className="workflowOptionMoveButton" onClick={() => onMove(category, value, 'up')} disabled={!canMoveUp} title="上移" aria-label={`上移${value}`}>
          <ChevronUp size={16} />
        </button>
        <button type="button" className="workflowOptionMoveButton" onClick={() => onMove(category, value, 'down')} disabled={!canMoveDown} title="下移" aria-label={`下移${value}`}>
          <ChevronDown size={16} />
        </button>
        <button type="button" onClick={() => onDelete(category, value)} disabled={!canDelete || isProtected} title={isProtected ? '关键标签会被保留' : '删除选项'}>
          {isProtected ? '保留' : '删除'}
        </button>
      </div>
    </div>
  )
}

function LoginScreen({
  accountId,
  password,
  error,
  dataMode,
  teamConnectionStatus,
  teamConnectionMessage,
  dataSourceReady,
  lastTeamSyncAt,
  onlineMemberCount,
  onAccountChange,
  onPasswordChange,
  onLogin,
  onOpenDataMode,
}: {
  accountId: string
  password: string
  error: string
  dataMode: DataMode
  teamConnectionStatus: TeamConnectionStatus
  teamConnectionMessage: string
  dataSourceReady: boolean
  lastTeamSyncAt: number | null
  onlineMemberCount: number | null
  onAccountChange: (accountId: string) => void
  onPasswordChange: (password: string) => void
  onLogin: () => void
  onOpenDataMode: () => void
}) {
  return (
    <main className="loginShell">
      <section className="loginCard">
        <div className="brand loginBrand">
          <div className="brandMark">
            <img src="./app-icon.png" alt="" />
          </div>
          <div>
            <strong>CrewFlow</strong>
            <span>项目 · 交付 · 素材 · 团队</span>
          </div>
        </div>
        <div className="loginIntro">
          <span className="eyebrow">内网本地登录</span>
          <h1>进入工作台</h1>
          <p>请使用分配的账号和密码登录。</p>
        </div>
        <form
          className="loginForm"
          onSubmit={(event) => {
            event.preventDefault()
            onLogin()
          }}
        >
          <label>
            <span>账号</span>
            <input value={accountId} onChange={(event) => onAccountChange(event.target.value)} placeholder="请输入账号" autoComplete="username" />
          </label>
          <label>
            <span>密码</span>
            <input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="请输入密码" autoComplete="current-password" />
          </label>
          {error && <div className="loginError">{error}</div>}
          <button className="primaryButton" type="submit">
            登录
          </button>
        </form>
        <DataModeStatus
          dataMode={dataMode}
          teamConnectionStatus={teamConnectionStatus}
          teamConnectionMessage={teamConnectionMessage}
          dataSourceReady={dataSourceReady}
          lastTeamSyncAt={lastTeamSyncAt}
          onlineMemberCount={onlineMemberCount}
          onOpen={onOpenDataMode}
        />
        <span className="loginVersion">CrewFlow v{appVersion}</span>
      </section>
    </main>
  )
}

function ControllerAccountModal({
  account,
  accounts,
  onClose,
  onSave,
}: {
  account: Account
  accounts: Account[]
  onClose: () => void
  onSave: (accountId: string, password: string) => void
}) {
  const [accountId, setAccountId] = useState(account.id)
  const [password, setPassword] = useState(account.password)
  const cleanAccountId = accountId.trim()
  const cleanPassword = password.trim()
  const duplicated = accounts.some((item) => item.id === cleanAccountId && item.id !== account.id)

  useEffect(() => {
    setAccountId(account.id)
    setPassword(account.password)
  }, [account.id, account.password])

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal controllerAccountModal" role="dialog" aria-modal="true" aria-label="总控账号管理" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">总控私有设置</span>
            <h2>账号管理</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="financeEntryForm">
          <label className="textField">
            <span>登录账号</span>
            <input value={accountId} onChange={(event) => setAccountId(event.target.value)} />
          </label>
          <label className="textField">
            <span>登录密码</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {duplicated && <div className="loginError">这个账号已经被占用，请换一个。</div>}
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primaryButton" type="button" disabled={!cleanAccountId || !cleanPassword || duplicated} onClick={() => onSave(cleanAccountId, cleanPassword)}>
            保存
          </button>
        </footer>
      </section>
    </div>
  )
}

function titleForSection(section: Section, role?: Role) {
  if (section === 'tasks' && role === 'controller') return '任务面板'
  const item = navItems.find((nav) => nav.id === section)
  return item?.label ?? '首页控制台'
}

function Dashboard({
  riskCount,
  waitingCount,
  pendingSettlementCount,
  visibleProjects,
  visibleTasks,
  calendarItems,
  now,
  weatherLocation,
  weatherSnapshot,
  weatherStatus,
  weatherError,
  workSchedule,
  canAccessProjects,
  onOpenWeatherSettings,
  onOpenWorkScheduleSettings,
  setSection,
  setSelectedProjectId,
}: {
  riskCount: number
  waitingCount: number
  pendingSettlementCount: number
  visibleProjects: Project[]
  visibleTasks: Task[]
  calendarItems: CalendarItem[]
  now: Date
  weatherLocation: WeatherLocation | null
  weatherSnapshot: WeatherSnapshot | null
  weatherStatus: WeatherStatus
  weatherError: string
  workSchedule: WorkSchedule | null
  canAccessProjects: boolean
  onOpenWeatherSettings: () => void
  onOpenWorkScheduleSettings: () => void
  setSection: (section: Section) => void
  setSelectedProjectId: (id: string) => void
}) {
  const deliveryCount = calendarItems.filter((item) => item.completed !== true && isCalendarItemInCurrentWeek(now, item)).length
  const todayTasks = visibleTasks
    .filter((task) => isTaskInTodayWork(task, now))
    .sort((left, right) => todayTaskPriority(left) - todayTaskPriority(right))
  const priorityProjects = [...visibleProjects].sort(
    (left, right) => projectPriorityScore(right, calendarItems) - projectPriorityScore(left, calendarItems),
  )
  const todayKey = localDateKey(now)
  const upcomingCalendarItems = [...calendarItems]
    .filter((item) => item.completed !== true && dateForCalendarItem(now, item) >= todayKey)
    .sort((left, right) => dateForCalendarItem(now, left).localeCompare(dateForCalendarItem(now, right)))
    .slice(0, 5)
  const weatherContent = weatherCardContent(weatherLocation, weatherSnapshot, weatherStatus, weatherError)

  return (
    <div className="contentGrid dashboardGrid">
      <section className="panel span8">
        <div className="panelHeader">
          <div>
            <h2>今日必须盯</h2>
            <p>按风险、交付和卡点排序</p>
          </div>
          <button type="button" onClick={() => setSection(canAccessProjects ? 'projects' : 'tasks')}>
            {canAccessProjects ? '查看项目' : '查看任务'}
          </button>
        </div>
        <div className="priorityList">
          {priorityProjects.length === 0 && <EmptyState title="还没有真实项目" note="点击右上角新建项目，录入后这里会显示需要盯的项目。" />}
          {priorityProjects.slice(0, 4).map((project) => (
            <button
              key={project.id}
              className="priorityItem"
              type="button"
              onClick={() => {
                setSelectedProjectId(project.id)
                setSection(canAccessProjects ? 'projects' : 'tasks')
              }}
            >
              <div className={`statusDot ${statusTone[projectDisplayStatus(project, now, calendarItems)]}`} />
              <div>
                <strong>{project.name}</strong>
                <span>
                  {project.stage} · {project.nextMilestone}
                </span>
              </div>
              <span className={`pill ${statusTone[projectDisplayStatus(project, now, calendarItems)]}`}>
                {statusLabel[projectDisplayStatus(project, now, calendarItems)]}
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </section>

      <section className="panel span4 widgets">
        <Widget icon={CloudSun} title="天气" value={weatherContent.value} note={weatherContent.note} onClick={onOpenWeatherSettings} />
        <Widget
          icon={Clock3}
          title="当前时间"
          value={formatClock(now)}
          note={workSchedule ? workScheduleStatus(now, workSchedule) : '点击设置上下班时间'}
          onClick={onOpenWorkScheduleSettings}
        />
        <Widget icon={CalendarDays} title="本周交付" value={`${deliveryCount} 个`} note={deliveryCount > 0 ? '本周一至周日的交付节点' : '本周暂无交付节点'} />
      </section>

      <MetricCard icon={AlertTriangle} label="风险项目" value={`${riskCount}`} tone="danger" />
      <MetricCard icon={MessageSquareText} label="等反馈" value={`${waitingCount}`} tone="wait" />
      <MetricCard icon={CheckCircle2} label="今日任务" value={`${todayTasks.length}`} tone="ok" />
      <MetricCard icon={DollarSign} label="待结款项目" value={`${pendingSettlementCount}`} tone="info" />

      <section className="panel span7">
        <div className="panelHeader">
          <div>
            <h2>今日任务流</h2>
            <p>正在制作、修改中，以及今天到期的任务</p>
          </div>
          <button type="button" onClick={() => setSection('tasks')}>
            查看任务
          </button>
        </div>
        <TaskRows
          tasks={todayTasks.slice(0, 4)}
          emptyTitle="今日暂无任务"
          emptyNote="当前没有制作中、修改中或今天到期的任务。"
        />
      </section>

      <section className="panel span5 calendarListPanel">
        <div className="panelHeader">
          <div>
            <h2>交付节点</h2>
            <p>未来 5 个关键时间点</p>
          </div>
          <button type="button" onClick={() => setSection('calendar')}>
            日历
          </button>
        </div>
        <Timeline calendarItems={upcomingCalendarItems} />
      </section>
    </div>
  )
}

function Projects({
  projects,
  allProjects,
  allTasks,
  allCalendarItems,
  staffMembers,
  workflowOptions,
  selectedProject,
  setSelectedProjectId,
  canEditProject,
  canEditTaskBoard,
  canDeleteProject,
  onEditProject,
  onDeleteProject,
  onUpdateTaskStatus,
  onUpdateTask,
  onOpenHandoff,
}: {
  projects: Project[]
  allProjects: Project[]
  allTasks: Task[]
  allCalendarItems: CalendarItem[]
  staffMembers: StaffMember[]
  workflowOptions: WorkflowOptions
  selectedProject: Project | null
  setSelectedProjectId: (id: string) => void
  canEditProject: (project: Project) => boolean
  canEditTaskBoard: (project: Project) => boolean
  canDeleteProject: (project: Project) => boolean
  onEditProject: (project: Project) => void
  onDeleteProject: (project: Project) => void
  onUpdateTaskStatus: (taskId: string, status: TaskStatus) => void
  onUpdateTask: (task: Task) => void
  onOpenHandoff: (handoff: { project: Project; personName: string }) => void
}) {
  const selectedProjectTasks = selectedProject ? allTasks.filter((task) => task.projectId === selectedProject.id) : []
  const departedStaff = useMemo(() => staffMembers.filter((member) => member.status === '离职'), [staffMembers])
  const assignableStaff = useMemo(() => staffMembers.filter(isAssignableStaff), [staffMembers])
  const projectRowMetadata = useMemo(() => {
    const displayedProjectIds = new Set(projects.map((project) => project.id))
    const activeAssigneesByProject = new Map<string, Set<string>>()
    const relatedNamesByProject = new Map<string, Set<string>>()

    projects.forEach((project) => {
      relatedNamesByProject.set(project.id, new Set([project.manager, project.owner]))
    })

    allTasks.forEach((task) => {
      if (!displayedProjectIds.has(task.projectId)) return
      relatedNamesByProject.get(task.projectId)?.add(task.assignee)
      if (task.status === '已完成') return

      const assignees = activeAssigneesByProject.get(task.projectId) ?? new Set<string>()
      assignees.add(task.assignee)
      activeAssigneesByProject.set(task.projectId, assignees)
    })

    allCalendarItems.forEach((item) => {
      if (displayedProjectIds.has(item.projectId)) relatedNamesByProject.get(item.projectId)?.add(item.owner)
    })

    return new Map(
      projects.map((project) => {
        const activeAssignees = activeAssigneesByProject.get(project.id)
        const relatedNames = relatedNamesByProject.get(project.id) ?? new Set<string>()

        return [
          project.id,
          {
            executor: activeAssignees?.size ? Array.from(activeAssignees).join('、') : project.owner || '待指派',
            departedNames: departedStaff.filter((person) => relatedNames.has(person.name)).map((person) => person.name),
          },
        ] as const
      }),
    )
  }, [allCalendarItems, allTasks, departedStaff, projects])
  const selectedDepartedNames = selectedProject ? departedPeopleForProject(selectedProject, allTasks, allCalendarItems, departedStaff) : []
  const selectedProjectProgress = selectedProject ? progressForProject(selectedProject, workflowOptions.workflowStages) : 0
  const canDeleteSelectedProject = selectedProject ? canDeleteProject(selectedProject) : false
  const canEditSelectedProject = selectedProject ? canEditProject(selectedProject) : false
  const canEditSelectedTaskBoard = selectedProject ? canEditTaskBoard(selectedProject) : false

  async function selectTaskEvidenceFolder(task: Task) {
    if (!canEditSelectedTaskBoard) return
    const selectedPath = await window.desktopBridge?.selectProjectFolder()
    if (selectedPath) onUpdateTask({ ...task, evidencePath: selectedPath })
  }

  return (
    <div className="contentGrid">
      <section className="panel span12">
        <div className="panelHeader">
          <div>
            <h2>项目列表</h2>
            <p>共 {projects.length} 个项目</p>
          </div>
        </div>
        <div className="projectTable projectTableViewport">
          {projects.length === 0 && <EmptyState title="项目中心暂无项目" note="从右上角新建项目开始，项目会进入任务、日历和财务。" />}
          {projects.map((project) => {
            const rowMetadata = projectRowMetadata.get(project.id)
            const departedNames = rowMetadata?.departedNames ?? []

            return (
              <button
                key={project.id}
                className={selectedProject?.id === project.id ? 'projectRow active' : 'projectRow'}
                type="button"
                onClick={() => setSelectedProjectId(project.id)}
              >
                <div>
                  <strong>{project.name}</strong>
                  <span>
                    {project.type} · {project.client || '客户未填写'} · 执行：{rowMetadata?.executor ?? project.owner ?? '待指派'}
                  </span>
                  {departedNames.length > 0 && <em className="handoffInline">人员离职待处理：{departedNames.join('、')}</em>}
                </div>
                <span>{project.manager}</span>
                <span>{project.workStatus} / {project.stage}</span>
                <span>{project.due}</span>
                <span className={`pill ${statusTone[projectDisplayStatus(project, new Date(), allCalendarItems)]}`}>
                  {statusLabel[projectDisplayStatus(project, new Date(), allCalendarItems)]}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {selectedProject ? (
        <section className="panel span12 detailPanel projectDetailPanel">
        <div className="panelHeader">
          <div>
            <h2>项目详情</h2>
            <p>{selectedProject.id}</p>
          </div>
          <div className="panelActions">
            <span className={`pill ${statusTone[projectDisplayStatus(selectedProject, new Date(), allCalendarItems)]}`}>
              {statusLabel[projectDisplayStatus(selectedProject, new Date(), allCalendarItems)]}
            </span>
            {canEditSelectedProject && (
              <button type="button" onClick={() => onEditProject(selectedProject)}>
                编辑项目
              </button>
            )}
            {canDeleteSelectedProject && (
              <button className="dangerButton" type="button" onClick={() => onDeleteProject(selectedProject)}>
                删除项目
              </button>
            )}
          </div>
        </div>

        <div className="projectDetailGrid">
          <div className="projectDetailCard projectDetailMain">
            <div className="detailSectionHeading">
              <span>项目概览</span>
            </div>
            <div className="detailTitle">
              <strong>{selectedProject.name}</strong>
              <span>
                {selectedProject.type} · {selectedProject.client || '客户未填写'}
                {selectedProject.clientContact ? ` · 对接：${selectedProject.clientContact}` : ''}
              </span>
            </div>
            {selectedDepartedNames.length > 0 && (
              <div className="handoffNotice">
                <div>
                  <strong>人员离职待处理</strong>
                  <span>关联人员：{selectedDepartedNames.join('、')}</span>
                </div>
                <button type="button" onClick={() => onOpenHandoff({ project: selectedProject, personName: selectedDepartedNames[0] })}>
                  处理接替
                </button>
              </div>
            )}
            <div className="progressBlock">
              <div className="progressLabel">
                <span>当前进度</span>
                <strong>{selectedProjectProgress}%</strong>
              </div>
              <div className="progressBar">
                <span style={{ width: `${selectedProjectProgress}%` }} />
              </div>
            </div>
            <div className="projectPathList">
              {projectFolderPaths(selectedProject).map((folderPath, index) => (
                <button className="pathBox" type="button" key={folderPath} onClick={() => openProjectPath(folderPath)}>
                  {index === 0 ? <HardDrive size={16} /> : <FolderOpen size={16} />}
                  <span>{folderPath}</span>
                  <FolderOpen size={15} />
                </button>
              ))}
            </div>
          </div>

          <div className="projectDetailCard detailInfoGrid">
            <div className="detailSectionHeading">
              <span>关键节点</span>
            </div>
            <InfoLine label="项目经理" value={selectedProject.manager} />
            <InfoLine label="当前节点状态" value={selectedProject.workStatus} />
            <InfoLine label="流程节点" value={selectedProject.stage} />
            <InfoLine label="最终交付" value={selectedProject.nextMilestone} />
            <InfoLine label="当前执行" value={currentExecutorForProject(selectedProject.id, allTasks, allProjects)} />
          </div>

          <div className="projectDetailCard assignmentList projectDetailAssignments">
            <div className="detailSectionHeading">
              <span>执行任务</span>
              <strong>{selectedProjectTasks.filter((task) => task.status === '已完成').length}/{selectedProjectTasks.length}</strong>
            </div>
            {selectedProjectTasks.length === 0 && <EmptyState title="暂无执行任务" note="项目经理完成任务分派后，这里会显示各执行人的任务状态。" />}
            {selectedProjectTasks.map((task) => {
              const workType = taskWorkType(task, selectedProject, workflowOptions.taskWorkTypes)
              const externalTask = isExternalTask(task)

              return (
                <div key={task.id} className="assignmentItem">
                  {canEditSelectedTaskBoard ? (
                    <select
                      value={workType}
                      onChange={(event) => {
                        const nextWorkType = event.target.value
                        onUpdateTask({
                          ...task,
                          workType: nextWorkType,
                          title: taskTitleForWorkType(selectedProject.name, nextWorkType),
                        })
                      }}
                    >
                      {optionsWithCurrent(workflowOptions.taskWorkTypes, workType).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="readonlyValue">{workType}</span>
                  )}
                  {externalTask ? (
                    canEditSelectedTaskBoard ? (
                      <input
                        value={externalAssigneeName(task)}
                        onChange={(event) =>
                          onUpdateTask({
                            ...task,
                            assignmentMode: 'external',
                            assignee: `外包：${event.target.value}`,
                          })
                        }
                        placeholder="填写外包方"
                      />
                    ) : (
                      <span className="readonlyValue">{externalAssigneeName(task)}</span>
                    )
                  ) : canEditSelectedTaskBoard ? (
                    <select
                      value={staffNameInOptions(task.assignee, assignableStaff)}
                      onChange={(event) => onUpdateTask({ ...task, assignmentMode: 'internal', assignee: event.target.value })}
                    >
                      <option value="" disabled>
                        选择人员
                      </option>
                      {assignableStaff.map((member) => (
                        <option key={member.name} value={member.name}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="readonlyValue">{task.assignee}</span>
                  )}
                  {canEditSelectedTaskBoard ? (
                    <select value={task.status} onChange={(event) => onUpdateTaskStatus(task.id, event.target.value as TaskStatus)}>
                      {taskStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`readonlyValue task-${task.status}`}>{task.status}</span>
                  )}
                  <div className="taskEvidenceField">
                    <span className="taskEvidenceLabel">完成实证资料</span>
                    <div className="taskEvidenceControls">
                      <button
                        className={`taskEvidencePath${!task.evidencePath && canEditSelectedTaskBoard ? ' empty' : ''}`}
                        type="button"
                        disabled={!task.evidencePath && !canEditSelectedTaskBoard}
                        onClick={() =>
                          task.evidencePath ? openProjectPath(task.evidencePath) : canEditSelectedTaskBoard ? selectTaskEvidenceFolder(task) : undefined
                        }
                        title={task.evidencePath || '选择完成资料文件夹'}
                      >
                        <FolderOpen size={15} />
                        <span>{task.evidencePath || '选择完成资料文件夹'}</span>
                        {!task.evidencePath && canEditSelectedTaskBoard && <Plus size={15} />}
                      </button>
                      {canEditSelectedTaskBoard && task.evidencePath && (
                        <button
                          className="taskEvidenceAction"
                          type="button"
                          onClick={() => selectTaskEvidenceFolder(task)}
                          title="更换实证资料文件夹"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {canEditSelectedTaskBoard && task.evidencePath && (
                        <button
                          className="taskEvidenceAction dangerPathButton"
                          type="button"
                          onClick={() => onUpdateTask({ ...task, evidencePath: '' })}
                          title="清除实证资料路径"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="projectDetailStages">
            <div className="detailSectionHeading">
              <span>流程节点</span>
            </div>
            <div className="workflowStageSequence">
              {optionsWithCurrent(workflowOptions.workflowStages, selectedProject.stage).map((stage, index, stages) => (
                <div key={stage} className="workflowStageItem">
                  <span className={stage === selectedProject.stage ? 'active' : ''}>{stage}</span>
                  {index < stages.length - 1 && <ChevronRight className="workflowStageArrow" size={16} aria-hidden="true" />}
                </div>
              ))}
            </div>
          </div>
        </div>
        </section>
      ) : (
        <section className="panel span12 detailPanel">
          <EmptyState title="等待选择项目" note="新建真实项目后，会在这里显示路径、流程节点和执行人。" />
        </section>
      )}
    </div>
  )
}

function ArchiveView({
  projects,
  allTasks,
  financeRecords,
  canEditArchivedProject,
  canEditAllArchivedProjects,
  onEditProject,
}: {
  projects: Project[]
  allTasks: Task[]
  financeRecords: FinanceRecord[]
  canEditArchivedProject: (project: Project) => boolean
  canEditAllArchivedProjects: boolean
  onEditProject: (project: Project) => void
}) {
  return (
    <div className="contentGrid">
      <section className="panel span12">
        <div className="panelHeader">
          <div>
            <h2>项目归档</h2>
            <p>已完成或归档完成的项目集中保留在这里，财务只显示结算状态</p>
          </div>
        </div>
        <div className="archiveGrid">
          {projects.length === 0 && <EmptyState title="暂无归档项目" note="项目完成或流程进入归档后，会归入这里。" />}
          {projects.map((project) => {
            const projectTasks = allTasks.filter((task) => task.projectId === project.id)
            const doneTasks = projectTasks.filter((task) => task.status === '已完成').length
            const financeRecord = financeRecords.find((record) => record.projectId === project.id) ?? createBlankFinanceRecord(project.id)
            const financeState = archiveFinanceState(financeRecord)

            return (
              <article key={project.id} className="archiveCard">
                <div>
                  <div className="archiveCardTop">
                    <span className="eyebrow">{project.client || '客户未填写'}</span>
                    <span className={`financeStatus ${financeState.tone}`}>{financeState.label}</span>
                  </div>
                  <strong>{project.name}</strong>
                  <p>
                    {project.type} · 项目经理：{project.manager}
                  </p>
                </div>
                <div className="archiveStats">
                  <InfoLine label="归档节点" value={project.stage} />
                  <InfoLine label="任务完成" value={`${doneTasks}/${projectTasks.length}`} />
                  <InfoLine label="交付时间" value={project.due} />
                  <InfoLine label="财务状态" value={financeState.label} />
                </div>
                <div className="archiveActions">
                  {projectFolderPaths(project).map((folderPath, index) => (
                    <button type="button" key={folderPath} onClick={() => openProjectPath(folderPath)} title={folderPath}>
                      {index === 0 ? '打开主路径' : `打开路径 ${index + 1}`}
                    </button>
                  ))}
                  {canEditArchivedProject(project) && (
                    <button type="button" onClick={() => onEditProject(project)}>
                      {canEditAllArchivedProjects ? '编辑项目' : '编辑状态'}
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function NewProjectModal({
  projects,
  staffMembers,
  workflowOptions,
  canDeleteCustomers,
  preferredManager,
  lockManager = false,
  draft,
  onAddProjectType,
  onAddCustomerProvince,
  onAddCustomer,
  onUpdateCustomerFieldLabel,
  onDeleteCustomer,
  onClose,
  onCreateProject,
}: {
  projects: Project[]
  staffMembers: StaffMember[]
  workflowOptions: WorkflowOptions
  canDeleteCustomers: boolean
  preferredManager?: string
  lockManager?: boolean
  draft?: AssistantNewProjectDraft
  onAddProjectType: (typeName: string) => void
  onAddCustomerProvince: (provinceName: string) => void
  onAddCustomer: (provinceName: string, customerName: string) => void
  onUpdateCustomerFieldLabel: (field: keyof CustomerFieldLabels, value: string) => void
  onDeleteCustomer: (provinceName: string, customerName: string, replacementName?: string) => string | null
  onClose: () => void
  onCreateProject: (payload: NewProjectPayload) => void
}) {
  const projectManagers = useMemo(() => staffMembers.filter(canManageProject), [staffMembers])
  const projectTypeOptions = workflowOptions.projectTypes
  const customerGroups = workflowOptions.customerGroups
  const provinceOptions = useMemo(() => Object.keys(customerGroups), [customerGroups])
  const draftProvince =
    Object.entries(customerGroups).find(([, customers]) => Boolean(draft?.client && customers.includes(draft.client)))?.[0] ?? ''
  const lockedManagerAvailable = Boolean(preferredManager && projectManagers.some((member) => member.name === preferredManager))
  const [name, setName] = useState(draft?.name ?? '')
  const [path, setPath] = useState(draft?.path ?? '')
  const [type, setType] = useState(
    draft?.type && projectTypeOptions.includes(draft.type) ? draft.type : (projectTypeOptions[0] ?? ''),
  )
  const [province, setProvince] = useState(draftProvince)
  const [client, setClient] = useState(draft?.client ?? '')
  const [clientContact, setClientContact] = useState(draft?.clientContact ?? '')
  const [manager, setManager] = useState(
    preferredManager ||
      (draft?.manager && projectManagers.some((member) => member.name === draft.manager) ? draft.manager : '') ||
      projectManagers[0]?.name ||
      '',
  )
  const [priority, setPriority] = useState(draft?.priority || '重要')
  const [workTypes, setWorkTypes] = useState<string[]>(
    draft?.workTypes?.filter((item) => workflowOptions.taskWorkTypes.includes(item)).length
      ? draft.workTypes.filter((item) => workflowOptions.taskWorkTypes.includes(item))
      : [workflowOptions.taskWorkTypes[0] ?? defaultTaskWorkOptions[0]],
  )
  const [deliveryDate, setDeliveryDate] = useState(draft?.deliveryDate || defaultDeliveryDate())
  const customerOptions = useMemo(() => (province ? customerGroups[province] ?? [] : []), [customerGroups, province])

  useEffect(() => {
    if (lockManager && preferredManager && lockedManagerAvailable) {
      setManager(preferredManager)
      return
    }
    if (projectManagers.some((member) => member.name === manager)) return
    setManager(projectManagers[0]?.name ?? '')
  }, [lockManager, lockedManagerAvailable, manager, preferredManager, projectManagers])

  useEffect(() => {
    if (projectTypeOptions.includes(type)) return
    setType(projectTypeOptions[0] ?? '')
  }, [projectTypeOptions, type])

  useEffect(() => {
    if (!province || provinceOptions.includes(province)) return
    setProvince('')
    setClient('')
  }, [province, provinceOptions])

  function handleProvinceSelect(nextProvince: string) {
    setProvince(nextProvince)
    setClient(customerGroups[nextProvince]?.[0] ?? '')
  }

  function addCustomProjectType(projectTypeName: string) {
    const cleanName = projectTypeName.trim()
    if (!cleanName) return
    onAddProjectType(cleanName)
    setType(cleanName)
  }

  function addCustomCustomer(customerName: string, provinceName = province) {
    const cleanProvince = provinceName.trim()
    const cleanName = customerName.trim()
    if (!cleanProvince || !cleanName) return
    onAddCustomer(cleanProvince, cleanName)
    setProvince(cleanProvince)
    setClient(cleanName)
  }

  function addCustomProvince(provinceName: string) {
    const cleanName = provinceName.trim()
    if (!cleanName) return
    onAddCustomerProvince(cleanName)
    setProvince(cleanName)
    setClient('')
  }

  function toggleWorkType(workType: string) {
    setWorkTypes((current) => {
      if (current.includes(workType)) {
        return current.length === 1 ? current : current.filter((item) => item !== workType)
      }

      return [...current, workType]
    })
  }

  async function selectProjectFolder() {
    const selectedPath = await window.desktopBridge?.selectProjectFolder()
    if (selectedPath) setPath(selectedPath)
  }

  async function openProjectFolder() {
    if (!path) return
    await window.desktopBridge?.openProjectFolder(path)
  }

  function submitProject() {
    const cleanClient = client.trim()
    if (!name.trim() || !type) return

    if (province && cleanClient) onAddCustomer(province, cleanClient)

    onCreateProject({
      name: name.trim(),
      path: path || '\\\\ProjectHost\\projects\\待选择项目文件夹',
      type,
      client: cleanClient,
      clientContact: clientContact.trim(),
      manager,
      priority,
      workTypes,
      deliveryDate,
    })
  }

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="newProjectModal" role="dialog" aria-modal="true" aria-label="新建项目" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">项目录入</span>
            <h2>{draft ? '确认助理新建项目' : '新建项目'}</h2>
            <p>先录入项目基础信息和 NAS 路径，项目经理收到后继续拆任务。</p>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="structuredForm">
          <label className="textField">
            <span>项目名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：客户项目名称" />
          </label>
          <label className="textField">
            <span>甲方对接人</span>
            <input value={clientContact} onChange={(event) => setClientContact(event.target.value)} placeholder="例如：张主任 / 李老师" />
          </label>
          <label className="textField">
            <span>NAS 项目路径</span>
            <div className="pathField">
              <HardDrive size={17} />
              <button type="button" onClick={selectProjectFolder}>
                {path || '选择项目文件夹'}
              </button>
              <button type="button" onClick={openProjectFolder} disabled={!path}>
                打开
              </button>
            </div>
          </label>
          <label className="textField">
            <span>成片交付日期</span>
            <input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
          </label>
          <ProjectTypePicker options={projectTypeOptions} active={type} onSelect={setType} onAddCustomType={addCustomProjectType} />
          <CustomerPicker
            province={province}
            provinces={provinceOptions}
            customers={customerOptions}
            client={client}
            linkedProjects={client ? projects.filter((project) => project.client === client) : []}
            canDelete={canDeleteCustomers}
            labels={workflowOptions.customerFieldLabels}
            onProvinceSelect={handleProvinceSelect}
            onClientSelect={setClient}
            onAddCustomProvince={addCustomProvince}
            onAddCustomCustomer={addCustomCustomer}
            onUpdateLabel={onUpdateCustomerFieldLabel}
            onDeleteCustomer={(customerName, replacementName) => onDeleteCustomer(province, customerName, replacementName)}
          />
          <OptionGroup
            label="项目经理"
            options={lockManager && lockedManagerAvailable && preferredManager ? [preferredManager] : projectManagers.map((member) => member.name)}
            active={manager}
            onSelect={lockManager && lockedManagerAvailable ? undefined : setManager}
          />
          {lockManager && <p className="fieldHint">项目经理账号新建项目时，默认由当前账号负责。</p>}
          <OptionGroup label="优先级" options={priorityOptions} active={priority} onSelect={setPriority} />
          <MultiOptionGroup label="任务工种" options={workflowOptions.taskWorkTypes} active={workTypes} onToggle={toggleWorkType} />
        </div>

        <footer>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primaryButton" type="button" onClick={submitProject} disabled={!name.trim() || !type}>
            创建项目
          </button>
        </footer>
      </section>
    </div>
  )
}

function ProjectTypePicker({
  options,
  active,
  onSelect,
  onAddCustomType,
}: {
  options: string[]
  active: string
  onSelect: (option: string) => void
  onAddCustomType: (typeName: string) => void
}) {
  const [customTypeName, setCustomTypeName] = useState('')

  function addType() {
    const cleanName = customTypeName.trim()
    if (!cleanName) return
    onAddCustomType(cleanName)
    setCustomTypeName('')
  }

  return (
    <div className="customOptionPicker">
      <div className="optionGroup">
        <span>项目类型</span>
        {options.length === 0 ? (
          <p className="fieldHint">暂无项目类型，请先添加。</p>
        ) : (
          <div>
            {options.map((option) => (
              <button key={option} className={option === active ? 'active' : ''} type="button" onClick={() => onSelect(option)}>
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="customCustomer">
        <input value={customTypeName} onChange={(event) => setCustomTypeName(event.target.value)} placeholder="添加项目类型" />
        <button type="button" onClick={addType} disabled={!customTypeName.trim() || options.includes(customTypeName.trim())}>
          添加类型
        </button>
      </div>
    </div>
  )
}

function OptionGroup({
  label,
  options,
  active,
  onSelect,
}: {
  label: string
  options: string[]
  active: string
  onSelect?: (option: string) => void
}) {
  return (
    <div className="optionGroup">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button key={option} className={option === active ? 'active' : ''} type="button" onClick={() => onSelect?.(option)}>
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function MultiOptionGroup({
  label,
  options,
  active,
  onToggle,
}: {
  label: string
  options: string[]
  active: string[]
  onToggle: (option: string) => void
}) {
  return (
    <div className="optionGroup">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button key={option} className={active.includes(option) ? 'active' : ''} type="button" onClick={() => onToggle(option)}>
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function EditableCustomerFieldLabel({
  value,
  canEdit,
  onSave,
}: {
  value: string
  canEdit: boolean
  onSave: (value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [editing, value])

  function save() {
    const cleanValue = draft.trim()
    if (!cleanValue) return
    onSave(cleanValue)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="customerFieldLabelEditor">
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save()
            if (event.key === 'Escape') setEditing(false)
          }}
          aria-label="修改字段名称"
        />
        <button type="button" onClick={save} disabled={!draft.trim()} title="保存字段名称">
          <CheckCircle2 size={15} />
        </button>
        <button type="button" onClick={() => setEditing(false)} title="取消修改">
          <X size={15} />
        </button>
      </div>
    )
  }

  return (
    <div className="customerFieldLabel">
      <span>{value}（选填）</span>
      {canEdit && (
        <button type="button" onClick={() => setEditing(true)} title={`修改“${value}”字段名称`}>
          <Pencil size={14} />
        </button>
      )}
    </div>
  )
}

function CustomerPicker({
  province,
  provinces,
  customers,
  client,
  linkedProjects,
  canDelete,
  labels,
  onProvinceSelect,
  onClientSelect,
  onAddCustomProvince,
  onAddCustomCustomer,
  onUpdateLabel,
  onDeleteCustomer,
}: {
  province: string
  provinces: string[]
  customers: string[]
  client: string
  linkedProjects: Project[]
  canDelete: boolean
  labels: CustomerFieldLabels
  onProvinceSelect: (province: string) => void
  onClientSelect: (client: string) => void
  onAddCustomProvince: (provinceName: string) => void
  onAddCustomCustomer: (customerName: string, provinceName?: string) => void
  onUpdateLabel: (field: keyof CustomerFieldLabels, value: string) => void
  onDeleteCustomer: (customerName: string, replacementName?: string) => string | null
}) {
  const [customProvinceName, setCustomProvinceName] = useState('')
  const [pendingDeleteCustomer, setPendingDeleteCustomer] = useState('')
  const [replacementCustomer, setReplacementCustomer] = useState('')

  function addCustomer() {
    const cleanProvince = province || customProvinceName.trim()
    const cleanName = client.trim()
    if (!cleanProvince || !cleanName) return
    if (!province) {
      onAddCustomProvince(cleanProvince)
      setCustomProvinceName('')
    }
    onAddCustomCustomer(cleanName, cleanProvince)
    onClientSelect(cleanName)
  }

  function addProvince() {
    if (!customProvinceName.trim()) return
    onAddCustomProvince(customProvinceName)
    setCustomProvinceName('')
  }

  function requestDeleteCustomer() {
    const cleanName = client.trim()
    if (!canDelete || !customers.includes(cleanName)) return

    if (linkedProjects.length > 0) {
      setPendingDeleteCustomer(cleanName)
      setReplacementCustomer(customers.find((customer) => customer !== cleanName) ?? '')
      return
    }

    if (!window.confirm(`确认删除客户单位“${cleanName}”吗？`)) return
    const nextClient = onDeleteCustomer(cleanName)
    if (nextClient !== null) onClientSelect(nextClient)
  }

  function replaceAndDeleteCustomer() {
    const cleanReplacement = replacementCustomer.trim()
    if (!pendingDeleteCustomer || !cleanReplacement || cleanReplacement === pendingDeleteCustomer) return

    const nextClient = onDeleteCustomer(pendingDeleteCustomer, cleanReplacement)
    if (nextClient === null) return
    onClientSelect(nextClient)
    setPendingDeleteCustomer('')
    setReplacementCustomer('')
  }

  return (
    <div className="customerPicker">
      <div className="optionGroup">
        <EditableCustomerFieldLabel
          value={labels.primary}
          canEdit={canDelete}
          onSave={(value) => onUpdateLabel('primary', value)}
        />
        <div>
          <button className={!province ? 'active' : ''} type="button" onClick={() => onProvinceSelect('')}>
            暂不填写
          </button>
          {provinces.map((item) => (
              <button key={item} className={item === province ? 'active' : ''} type="button" onClick={() => onProvinceSelect(item)}>
                {item}
              </button>
          ))}
        </div>
      </div>
      <div className="customCustomer">
        <input value={customProvinceName} onChange={(event) => setCustomProvinceName(event.target.value)} placeholder={`添加自定义${labels.primary}`} />
        <button type="button" onClick={addProvince} disabled={!customProvinceName.trim()}>
          添加{labels.primary}
        </button>
      </div>
      <div className="optionGroup">
        <EditableCustomerFieldLabel
          value={labels.secondary}
          canEdit={canDelete}
          onSave={(value) => onUpdateLabel('secondary', value)}
        />
        <select value={customers.includes(client) ? client : ''} onChange={(event) => onClientSelect(event.target.value)}>
          <option value="">选择已保存{labels.secondary}</option>
          {customers.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="customCustomer">
        <input
          value={client}
          onChange={(event) => onClientSelect(event.target.value)}
          placeholder={province || customProvinceName.trim() ? `添加自定义${labels.secondary}` : `先选择或填写${labels.primary}`}
        />
        <button
          type="button"
          onClick={addCustomer}
          disabled={(!province && !customProvinceName.trim()) || !client.trim() || customers.includes(client.trim())}
        >
          添加{labels.secondary}
        </button>
        {canDelete && (
          <button className="dangerIconButton" type="button" onClick={requestDeleteCustomer} disabled={!customers.includes(client.trim())} title="删除客户单位">
            <Trash2 size={17} />
          </button>
        )}
      </div>
      {pendingDeleteCustomer && (
        <div className="customerDeleteNotice">
          <div>
            <strong>“{pendingDeleteCustomer}”关联 {linkedProjects.length} 个项目</strong>
            <p>请指定新的客户单位。确认后会先更新这些项目，再删除旧单位。</p>
          </div>
          <div className="customerReplacementActions">
            <input
              list="customer-replacement-options"
              value={replacementCustomer}
              onChange={(event) => setReplacementCustomer(event.target.value)}
              placeholder="选择或输入新的客户单位"
            />
            <datalist id="customer-replacement-options">
              {customers
                .filter((customer) => customer !== pendingDeleteCustomer)
                .map((customer) => (
                  <option key={customer} value={customer} />
                ))}
            </datalist>
            <button type="button" onClick={replaceAndDeleteCustomer} disabled={!replacementCustomer.trim() || replacementCustomer.trim() === pendingDeleteCustomer}>
              替换并删除
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingDeleteCustomer('')
                setReplacementCustomer('')
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectEditModal({
  project,
  projectTasks,
  staffMembers,
  workflowOptions,
  canDelete,
  canEditTaskBoard,
  editScope,
  draft,
  onClose,
  onSave,
  onDelete,
}: {
  project: Project
  projectTasks: Task[]
  staffMembers: StaffMember[]
  workflowOptions: WorkflowOptions
  canDelete: boolean
  canEditTaskBoard: boolean
  editScope: 'full' | 'status'
  draft?: AssistantProjectEditDraft
  onClose: () => void
  onSave: (project: Project, tasks: Task[]) => void
  onDelete: (project: Project) => void
}) {
  const statusOnly = editScope === 'status'
  const projectManagers = useMemo(() => staffMembers.filter(canManageProject), [staffMembers])
  const assignableStaff = useMemo(() => staffMembers.filter((member) => member.status === '在职'), [staffMembers])
  const initialManager = staffNameInOptions(project.manager, projectManagers) || projectManagers[0]?.name || ''
  const [name, setName] = useState(project.name)
  const [path, setPath] = useState(project.path)
  const [additionalPaths, setAdditionalPaths] = useState<string[]>(() =>
    uniqueProjectPaths(project.additionalPaths ?? [], project.path),
  )
  const [type, setType] = useState(project.type)
  const [client, setClient] = useState(project.client)
  const [clientContact, setClientContact] = useState(project.clientContact ?? '')
  const [manager, setManager] = useState(
    draft?.manager && projectManagers.some((member) => member.name === draft.manager) ? draft.manager : initialManager,
  )
  const [stage, setStage] = useState(draft?.stage ?? project.stage)
  const [calendarTitle, setCalendarTitle] = useState(
    draft?.calendarTitle ?? project.calendarTitle ?? milestoneTitleFrom(project.nextMilestone),
  )
  const [workStatus, setWorkStatus] = useState<WorkStatus>(draft?.workStatus ?? project.workStatus)
  const [projectStatus, setProjectStatus] = useState<ProjectHealthStatus>(
    () => draft?.healthStatus ?? projectHealthStatus(project),
  )
  const [due, setDue] = useState(draft?.due ?? project.due)
  const [taskDrafts, setTaskDrafts] = useState<Task[]>(() => {
    const normalizedTasks = normalizeTaskAssigneesForStaff(projectTasks, assignableStaff)
    if (!draft?.assignment || !canEditTaskBoard) return normalizedTasks

    const assignment = draft.assignment
    const existingTaskIndex = normalizedTasks.findIndex(
      (task) => taskWorkType(task, project, workflowOptions.taskWorkTypes) === assignment.workType,
    )
    const assignee =
      assignment.mode === 'external'
        ? `外包：${assignment.externalNote || '待补充'}`
        : staffNameInOptions(assignment.assignee, assignableStaff) || assignableStaff[0]?.name || initialManager
    const nextTask: Task = {
      id: existingTaskIndex >= 0 ? normalizedTasks[existingTaskIndex].id : `T-${Date.now().toString().slice(-6)}-assistant`,
      title: taskTitleForWorkType(project.name, assignment.workType),
      projectId: project.id,
      project: project.name,
      workType: assignment.workType,
      assignmentMode: assignment.mode,
      assignee,
      due: formatMonthDay(new Date(assignment.due ?? project.due)),
      status: assignment.status,
      note:
        assignment.mode === 'external'
          ? `外包任务，由${project.manager}跟进。外包给：${assignment.externalNote || '待补充'}。`
          : `${assignment.workType}执行任务，来自助理预填。`,
    }
    if (existingTaskIndex < 0) return [...normalizedTasks, nextTask]
    return normalizedTasks.map((task, index) => (index === existingTaskIndex ? { ...task, ...nextTask } : task))
  })

  async function selectProjectFolder() {
    const selectedPath = await window.desktopBridge?.selectProjectFolder()
    if (selectedPath) setPath(selectedPath)
  }

  async function openProjectFolder() {
    if (!path) return
    await window.desktopBridge?.openProjectFolder(path)
  }

  async function addAdditionalProjectFolder() {
    const selectedPath = await window.desktopBridge?.selectProjectFolder()
    if (!selectedPath || selectedPath === path) return
    setAdditionalPaths((current) => uniqueProjectPaths([...current, selectedPath], path))
  }

  async function replaceAdditionalProjectFolder(index: number) {
    const selectedPath = await window.desktopBridge?.selectProjectFolder()
    if (!selectedPath || selectedPath === path) return
    setAdditionalPaths((current) =>
      uniqueProjectPaths(current.map((folderPath, currentIndex) => (currentIndex === index ? selectedPath : folderPath)), path),
    )
  }

  function saveProject() {
    if (!name.trim()) return

    const dueDate = new Date(due)
    onSave(
      {
        ...project,
        name: name.trim(),
        path,
        additionalPaths: uniqueProjectPaths(additionalPaths, path),
        type,
        client: client.trim(),
        clientContact: clientContact.trim(),
        manager,
        stage,
        calendarTitle: calendarTitle.trim(),
        workStatus,
        status: projectStatus,
        healthStatusExplicit: true,
        due,
        owner: manager,
        nextMilestone: `${formatMonthDay(dueDate)} ${stage}`,
        progress: workStatus === '已完成' ? 100 : project.progress,
      },
      canEditTaskBoard ? taskDrafts : projectTasks,
    )
  }

  function updateTaskDraft(taskId: string, patch: Partial<Task>) {
    setTaskDrafts((current) => current.map((task) => (task.id === taskId ? { ...task, ...patch } : task)))
  }

  function addTaskDraft() {
    const dueDate = new Date(due)
    setTaskDrafts((current) => [
      ...current,
      {
        id: `T-${Date.now().toString().slice(-6)}-${current.length}`,
        title: taskTitleForWorkType(name.trim() || project.name, workflowOptions.taskWorkTypes[0] ?? defaultTaskWorkOptions[0]),
        projectId: project.id,
        project: name.trim() || project.name,
        workType: workflowOptions.taskWorkTypes[0] ?? defaultTaskWorkOptions[0],
        assignmentMode: 'internal',
        assignee: assignableStaff[0]?.name ?? manager,
        due: formatMonthDay(dueDate),
        status: '未开始',
        note: '项目编辑新增任务。',
      },
    ])
  }

  function removeTaskDraft(taskId: string) {
    setTaskDrafts((current) => current.filter((task) => task.id !== taskId))
  }

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="newProjectModal projectEditModal" role="dialog" aria-modal="true" aria-label="编辑项目" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">项目维护</span>
            <h2>{draft ? '确认助理修改' : statusOnly ? '编辑归档项目状态' : '编辑项目'}</h2>
            <p>{statusOnly ? '可调整本人负责项目的状态、流程节点和最终交付日期。' : '用于修正项目名称、客户、项目经理、流程节点、最终交付和 NAS 路径。'}</p>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="structuredForm">
          {!statusOnly && (
            <>
              <label className="textField">
                <span>项目名称</span>
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="textField">
                <span>{workflowOptions.customerFieldLabels.secondary}</span>
                <input value={client} onChange={(event) => setClient(event.target.value)} />
              </label>
              <label className="textField">
                <span>甲方对接人</span>
                <input value={clientContact} onChange={(event) => setClientContact(event.target.value)} placeholder="例如：张主任 / 李老师" />
              </label>
            </>
          )}
          <div className="setupGrid">
            {!statusOnly && (
              <>
                <label className="textField">
                  <span>项目类型</span>
                  <select value={type} onChange={(event) => setType(event.target.value)}>
                    {optionsWithCurrent(workflowOptions.projectTypes, type).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="textField">
                  <span>项目经理</span>
                  <select value={manager} onChange={(event) => setManager(event.target.value)}>
                    <option value="" disabled>
                      选择项目经理
                    </option>
                    {projectManagers.map((member) => (
                      <option key={member.name} value={member.name}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="textField">
              <span>项目健康度</span>
              <select value={projectStatus} onChange={(event) => setProjectStatus(event.target.value as ProjectHealthStatus)}>
                {projectHealthOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="textField">
              <span>当前节点状态</span>
              <select value={workStatus} onChange={(event) => setWorkStatus(event.target.value as WorkStatus)}>
                {optionsWithCurrent(workflowOptions.nodeStatuses, workStatus).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="textField">
              <span>流程节点</span>
              <select value={stage} onChange={(event) => setStage(event.target.value)}>
                {optionsWithCurrent(workflowOptions.workflowStages, stage).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="textField">
              <span>最终交付日期</span>
              <input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
            </label>
            <label className="textField setupGridWide">
              <span>最终交付日历显示</span>
              <input value={calendarTitle} onChange={(event) => setCalendarTitle(event.target.value)} placeholder="例如：需求对接、脚本初稿、成片交付" />
            </label>
          </div>
          {!statusOnly && <div className="assignmentEditor">
            <div className="assignmentEditorHeader">
              <div>
                <h3>执行任务人员</h3>
              <p>{canEditTaskBoard ? '用于新增、修改或删除这个项目的执行任务。' : '当前账号只能查看执行任务。'}</p>
            </div>
              {canEditTaskBoard && (
                <button type="button" onClick={addTaskDraft}>
                  新增任务
                </button>
              )}
            </div>
            {taskDrafts.length === 0 && <EmptyState title="暂无执行任务" note="设置交付和任务后，这里会显示任务人员。" />}
            {taskDrafts.map((task) => {
              const workType = taskWorkType(task, project, workflowOptions.taskWorkTypes)
              const externalTask = isExternalTask(task)

              return (
                <article key={task.id} className="assignmentEditorRow taskEditRow">
                  {canEditTaskBoard ? (
                    <select
                      value={workType}
                      onChange={(event) => {
                        const nextWorkType = event.target.value
                        updateTaskDraft(task.id, {
                          workType: nextWorkType,
                          title: taskTitleForWorkType(name.trim() || project.name, nextWorkType),
                        })
                      }}
                    >
                      {optionsWithCurrent(workflowOptions.taskWorkTypes, workType).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="readonlyValue">{workType}</span>
                  )}
                  <select
                    value={externalTask ? 'external' : 'internal'}
                    disabled={!canEditTaskBoard}
                    onChange={(event) => {
                      const assignmentMode = event.target.value as AssignmentMode
                      updateTaskDraft(task.id, {
                        assignmentMode,
                        assignee: assignmentMode === 'external' ? '外包：' : (assignableStaff[0]?.name ?? manager),
                      })
                    }}
                  >
                    <option value="internal">内部人员</option>
                    <option value="external">外包</option>
                  </select>
                  {externalTask ? (
                    <input
                      value={externalAssigneeName(task)}
                      disabled={!canEditTaskBoard}
                      onChange={(event) =>
                        updateTaskDraft(task.id, {
                          assignmentMode: 'external',
                          assignee: `外包：${event.target.value}`,
                        })
                      }
                      placeholder="填写外包方"
                    />
                  ) : (
                    <select
                      value={staffNameInOptions(task.assignee, assignableStaff)}
                      disabled={!canEditTaskBoard}
                      onChange={(event) => updateTaskDraft(task.id, { assignmentMode: 'internal', assignee: event.target.value })}
                    >
                      <option value="" disabled>
                        选择人员
                      </option>
                      {assignableStaff.map((member) => (
                        <option key={member.name} value={member.name}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <select value={task.status} disabled={!canEditTaskBoard} onChange={(event) => updateTaskDraft(task.id, { status: event.target.value as TaskStatus })}>
                    {taskStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  {canEditTaskBoard && (
                    <button className="dangerButton" type="button" onClick={() => removeTaskDraft(task.id)}>
                      删除
                    </button>
                  )}
                </article>
              )
            })}
          </div>}
          {!statusOnly && <div className="textField projectPathEditor">
            <span>项目文件夹路径</span>
            <div className="pathField pathFieldWithActions">
              <HardDrive size={17} />
              <button type="button" onClick={selectProjectFolder}>
                {path || '选择项目文件夹'}
              </button>
              <button type="button" onClick={openProjectFolder} disabled={!path}>
                打开
              </button>
              <button className="pathIconButton" type="button" onClick={addAdditionalProjectFolder} title="添加项目路径">
                <Plus size={17} />
              </button>
            </div>
            {additionalPaths.map((folderPath, index) => (
              <div className="pathField pathFieldWithActions" key={`${folderPath}-${index}`}>
                <FolderOpen size={17} />
                <button type="button" onClick={() => replaceAdditionalProjectFolder(index)} title={folderPath}>
                  {folderPath}
                </button>
                <button type="button" onClick={() => openProjectPath(folderPath)}>
                  打开
                </button>
                <button
                  className="pathIconButton dangerPathButton"
                  type="button"
                  onClick={() => setAdditionalPaths((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                  title="删除该路径"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>}
        </div>

        <footer>
          <div className="modalDangerSlot">
            {canDelete && (
              <button className="dangerButton" type="button" onClick={() => onDelete(project)}>
                删除项目
              </button>
            )}
          </div>
          <button type="button" onClick={onClose}>取消</button>
          <button className="primaryButton" type="button" onClick={saveProject} disabled={!name.trim()}>
            {draft ? '确认并保存' : '保存修改'}
          </button>
        </footer>
      </section>
    </div>
  )
}

function ProjectSetupModal({
  draft,
  project,
  staffMembers,
  workflowOptions,
  onClose,
  onSave,
}: {
  draft: ProjectSetupDraft
  project: Project | null
  staffMembers: StaffMember[]
  workflowOptions: WorkflowOptions
  onClose: () => void
  onSave: (payload: {
    projectId: string
    stage: string
    workStatus: WorkStatus
    deliveryDate: string
    calendarTitle: string
    assignments: AssignmentDraft[]
  }) => void
}) {
  const assignableStaff = useMemo(() => staffMembers.filter((member) => member.status === '在职'), [staffMembers])
  const stages = workflowOptions.workflowStages
  const [stage, setStage] = useState(workflowOptions.workflowStages[0] ?? defaultWorkflowStageOptions[0])
  const [workStatus, setWorkStatus] = useState<WorkStatus>(workflowOptions.nodeStatuses[0] ?? defaultNodeStatusOptions[0])
  const [deliveryDate, setDeliveryDate] = useState(draft.deliveryDate)
  const [calendarTitle, setCalendarTitle] = useState('')
  const [assignments, setAssignments] = useState<AssignmentDraft[]>(
    draft.workTypes.map((workType) => ({
      workType,
      mode: 'internal',
      assignee: suggestedAssigneeForWorkType(workType, assignableStaff),
      externalNote: '',
    })),
  )

  useEffect(() => {
    setAssignments((current) =>
      current.map((assignment) => {
        if (assignment.mode === 'external') return assignment

        return {
          ...assignment,
          assignee: staffNameInOptions(assignment.assignee, assignableStaff) || assignableStaff[0]?.name || '',
        }
      }),
    )
  }, [assignableStaff])

  function updateAssignment(workType: string, patch: Partial<AssignmentDraft>) {
    setAssignments((current) =>
      current.map((assignment) => (assignment.workType === workType ? { ...assignment, ...patch } : assignment)),
    )
  }

  if (!project) return null

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="newProjectModal setupModal" role="dialog" aria-modal="true" aria-label="立项后设置" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">立项后设置</span>
            <h2>设置交付和任务</h2>
            <p>项目已创建，继续确认流程节点和最终交付，并把所选工种分派给内部人员或外包。</p>
          </div>
          <button type="button" onClick={onClose} title="稍后设置">
            <X size={18} />
          </button>
        </header>

        <div className="structuredForm">
          <div className="setupProjectName">
            <strong>{project.name}</strong>
            <span>{project.client || '客户未填写'} · {project.type} · 项目经理：{project.manager}</span>
          </div>
          <div className="setupGrid">
            <label className="textField">
              <span>当前节点状态</span>
              <select value={workStatus} onChange={(event) => setWorkStatus(event.target.value as WorkStatus)}>
                {optionsWithCurrent(workflowOptions.nodeStatuses, workStatus).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="textField">
              <span>流程节点</span>
              <select value={stage} onChange={(event) => setStage(event.target.value)}>
                {optionsWithCurrent(stages, stage).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="textField">
              <span>最终交付日期</span>
              <input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
            </label>
            <label className="textField">
              <span>最终交付日历显示</span>
              <input value={calendarTitle} onChange={(event) => setCalendarTitle(event.target.value)} placeholder="例如：需求对接、脚本初稿、成片交付" />
            </label>
          </div>

          <div className="assignmentEditor">
            <div>
              <h3>任务分派</h3>
              <p>内部人员会在“我的任务”看到安排；外包任务由项目经理跟进。</p>
            </div>
            {assignments.map((assignment) => (
              <article key={assignment.workType} className="assignmentEditorRow">
                <strong>{assignment.workType}</strong>
                <select
                  value={assignment.mode}
                  onChange={(event) => updateAssignment(assignment.workType, { mode: event.target.value as AssignmentMode })}
                >
                  <option value="internal">内部人员</option>
                  <option value="external">外包</option>
                </select>
                {assignment.mode === 'internal' ? (
                  <select
                    value={staffNameInOptions(assignment.assignee, assignableStaff)}
                    onChange={(event) => updateAssignment(assignment.workType, { assignee: event.target.value })}
                  >
                    <option value="" disabled>
                      选择人员
                    </option>
                    {assignableStaff.map((member) => (
                      <option key={member.name} value={member.name}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={assignment.externalNote}
                    onChange={(event) => updateAssignment(assignment.workType, { externalNote: event.target.value })}
                    placeholder="写外包给谁，例如：张三拍摄团队"
                  />
                )}
              </article>
            ))}
          </div>
        </div>

        <footer>
          <button type="button" onClick={onClose}>
            稍后设置
          </button>
          <button
            className="primaryButton"
            type="button"
            onClick={() =>
              onSave({
                projectId: draft.projectId,
                stage,
                workStatus,
                deliveryDate,
                calendarTitle,
                assignments,
              })
            }
          >
            保存并生成任务
          </button>
        </footer>
      </section>
    </div>
  )
}

function suggestedAssigneeForWorkType(workType: string, staffMembers: StaffMember[]) {
  const byTag = staffMembers.find((member) => member.tags.some((tag) => workType.includes(tag) || tag.includes(workType)))
  return byTag?.name ?? staffMembers[0]?.name ?? ''
}

function Tasks({
  tasks,
  mode = 'personal',
  onUpdateTaskStatus,
}: {
  tasks: Task[]
  mode?: 'personal' | 'global'
  onUpdateTaskStatus?: (taskId: string, status: TaskStatus) => void
}) {
  const isGlobalMode = mode === 'global'
  const [dateFilter, setDateFilter] = useState<TaskDateFilter>('all')
  const [customDate, setCustomDate] = useState('')
  const filteredTasks = useMemo(() => {
    if (dateFilter === 'all') return tasks

    const today = new Date()
    if (dateFilter === 'today') return tasks.filter((task) => isTaskDueOnDate(task, today))
    if (dateFilter === 'custom') {
      if (!customDate) return tasks
      const selectedDate = new Date(`${customDate}T00:00:00`)
      return Number.isNaN(selectedDate.getTime()) ? tasks : tasks.filter((task) => isTaskDueOnDate(task, selectedDate))
    }

    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
    return tasks.filter((task) => weekDates.some((date) => isTaskDueOnDate(task, date)))
  }, [customDate, dateFilter, tasks])

  return (
    <div className="contentGrid">
      <section className="panel span12">
        <div className="panelHeader">
          <div>
            <h2>{isGlobalMode ? '全局任务面板' : '我的任务'}</h2>
            <p>{isGlobalMode ? '查看团队成员当前任务、状态和截止时间' : '成员只需要更新未开始、制作中、修改中、已完成和备注'}</p>
          </div>
        </div>
        <div className="taskSource">
          <span>{isGlobalMode ? '任务范围' : '任务来源'}</span>
          <strong>{isGlobalMode ? '总控查看所有项目中的执行任务' : '项目经理在项目中心指派后，这里显示个人任务'}</strong>
          <em>{isGlobalMode ? '用于掌握大家正在做什么，不参与任务状态更新' : '执行成员只看与自己相关的项目节点'}</em>
        </div>
        <div className="taskDateFilter" aria-label="任务日期筛选">
          <div className="taskDateSegments">
            {([
              ['all', '全部'],
              ['today', '今天'],
              ['week', '本周'],
            ] as Array<[TaskDateFilter, string]>).map(([value, label]) => (
              <button
                key={value}
                className={dateFilter === value ? 'active' : ''}
                type="button"
                onClick={() => setDateFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className={dateFilter === 'custom' ? 'taskDatePicker active' : 'taskDatePicker'}>
            <CalendarDays size={16} />
            <input
              type="date"
              value={customDate}
              aria-label="指定任务日期"
              onChange={(event) => {
                setCustomDate(event.target.value)
                setDateFilter(event.target.value ? 'custom' : 'all')
              }}
            />
          </label>
          <span>显示 {filteredTasks.length}/{tasks.length}</span>
        </div>
        <TaskRows
          tasks={filteredTasks}
          large
          onUpdateTaskStatus={onUpdateTaskStatus}
          emptyTitle="该日期暂无任务"
          emptyNote="换一个日期或切换到“全部”查看任务。"
        />
      </section>
    </div>
  )
}

function CalendarView({
  projects,
  calendarItems,
  holidayItems,
  customHolidayItems,
  chinaHolidaySync,
  now,
  staffMembers,
  canManagePlans,
  canEditPlan,
  canManageHolidays,
  onHolidayItemsChange,
  onRefreshChinaHolidays,
  onAddPlan,
  onUpdatePlan,
  onMovePlan,
  onTogglePlanCompleted,
  onDeletePlan,
  assistantDraft,
  onAssistantDraftHandled,
}: {
  projects: Project[]
  calendarItems: CalendarItem[]
  holidayItems: HolidayItem[]
  customHolidayItems: HolidayItem[]
  chinaHolidaySync: ChinaHolidaySyncState
  now: Date
  staffMembers: StaffMember[]
  canManagePlans: boolean
  canEditPlan: (projectId: string) => boolean
  canManageHolidays: boolean
  onHolidayItemsChange: (items: HolidayItem[]) => void
  onRefreshChinaHolidays: () => void
  onAddPlan: (plan: ProjectPlanPayload) => void
  onUpdatePlan: (itemKey: string, plan: ProjectPlanPayload) => void
  onMovePlan: (itemKey: string, targetDate: string) => string | null
  onTogglePlanCompleted: (itemKey: string) => void
  onDeletePlan: (itemKey: string) => void
  assistantDraft: ProjectPlanPayload | null
  onAssistantDraftHandled: () => void
}) {
  const calendarProjects = projects.filter((project) => calendarItems.some((item) => item.projectId === project.id))
  const [selectedProjectId, setSelectedProjectId] = useState(calendarProjects[0]?.id ?? projects[0]?.id ?? '')
  const [planDate, setPlanDate] = useState<string | null>(null)
  const [rangeDays, setRangeDays] = useState(14)
  const [pageStart, setPageStart] = useState(0)
  const [editingPlan, setEditingPlan] = useState<{ item: CalendarItem; key: string; date: string } | null>(null)
  const [showHolidaySettings, setShowHolidaySettings] = useState(false)
  const [draggingPlan, setDraggingPlan] = useState<CalendarDragPreview | null>(null)
  const [dragTargetDate, setDragTargetDate] = useState<string | null>(null)
  const [moveNotice, setMoveNotice] = useState<CalendarMoveNotice | null>(null)
  const [dayPopover, setDayPopover] = useState<CalendarDayPopoverState | null>(null)
  const openDayPopoverDate = dayPopover?.date
  const dragSessionRef = useRef<CalendarDragSession | null>(null)
  const dayPopoverDragRef = useRef<CalendarPopoverDragSession | null>(null)
  const dragHoldTimerRef = useRef<number | null>(null)
  const suppressCalendarClickRef = useRef(false)
  const effectiveSelectedProjectId = calendarProjects.some((project) => project.id === selectedProjectId)
    ? selectedProjectId
    : (calendarProjects[0]?.id ?? '')
  const selectedProject = projects.find((project) => project.id === effectiveSelectedProjectId) ?? calendarProjects[0]
  const selectedProjectSchedule = calendarItems
    .filter((item) => item.projectId === effectiveSelectedProjectId)
    .sort((left, right) => dateForCalendarItem(now, left).localeCompare(dateForCalendarItem(now, right)))
  const visibleDayCount = 14
  const maxPageStart = Math.max(0, rangeDays - visibleDayCount)
  const clampedPageStart = Math.min(pageStart, maxPageStart)
  const visibleEnd = Math.min(clampedPageStart + visibleDayCount, rangeDays)
  const days = Array.from({ length: visibleEnd - clampedPageStart }, (_, index) => addDays(now, clampedPageStart + index))
  const dayPopoverItems = dayPopover
    ? calendarItems.filter((item) => dateForCalendarItem(now, item) === dayPopover.date)
    : []

  useEffect(() => {
    setPageStart((current) => Math.min(current, Math.max(0, rangeDays - visibleDayCount)))
  }, [rangeDays, visibleDayCount])

  useEffect(() => {
    if (!assistantDraft) return
    setSelectedProjectId(assistantDraft.projectId)
    const draftDate = new Date(`${assistantDraft.date}T00:00:00`)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayOffset = Math.floor((draftDate.getTime() - todayStart.getTime()) / 86400000)
    if (Number.isFinite(dayOffset) && dayOffset >= 0) {
      const requiredRange = dayOffset + 1
      const nextRange = [14, 30, 60, 90].find((value) => value >= requiredRange) ?? 90
      setRangeDays(nextRange)
      setPageStart(Math.floor(dayOffset / visibleDayCount) * visibleDayCount)
    }
  }, [assistantDraft, now])

  useEffect(() => {
    if (!moveNotice) return
    const timer = window.setTimeout(() => setMoveNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [moveNotice])

  useEffect(() => {
    if (!openDayPopoverDate) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.calendarDayPopover') || target.closest('.calendarOverflowButton')) return
      setDayPopover(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDayPopover(null)
    }
    const closeOnResize = () => setDayPopover(null)

    window.addEventListener('pointerdown', closeOnOutsidePointer, true)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnResize)
    return () => {
      dayPopoverDragRef.current = null
      window.removeEventListener('pointerdown', closeOnOutsidePointer, true)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeOnResize)
    }
  }, [openDayPopoverDate])

  useEffect(() => {
    const movePopover = (event: PointerEvent) => {
      const session = dayPopoverDragRef.current
      if (!session || session.pointerId !== event.pointerId) return

      event.preventDefault()
      const popover = document.querySelector<HTMLElement>('.calendarDayPopover')
      const popoverWidth = popover?.offsetWidth ?? Math.min(360, window.innerWidth - 32)
      const popoverHeight = popover?.offsetHeight ?? 184
      const maxLeft = Math.max(8, window.innerWidth - popoverWidth - 8)
      const maxTop = Math.max(8, window.innerHeight - popoverHeight - 8)
      const left = Math.min(maxLeft, Math.max(8, session.left + event.clientX - session.startX))
      const top = Math.min(maxTop, Math.max(8, session.top + event.clientY - session.startY))

      setDayPopover((current) => (current?.date === session.date ? { ...current, left, top } : current))
    }

    const finishPopoverDrag = (event: PointerEvent) => {
      const session = dayPopoverDragRef.current
      if (session?.pointerId === event.pointerId) dayPopoverDragRef.current = null
    }

    window.addEventListener('pointermove', movePopover, true)
    window.addEventListener('pointerup', finishPopoverDrag, true)
    window.addEventListener('pointercancel', finishPopoverDrag, true)
    return () => {
      window.removeEventListener('pointermove', movePopover, true)
      window.removeEventListener('pointerup', finishPopoverDrag, true)
      window.removeEventListener('pointercancel', finishPopoverDrag, true)
    }
  }, [])

  useEffect(
    () => () => {
      if (dragHoldTimerRef.current !== null) window.clearTimeout(dragHoldTimerRef.current)
      document.body.classList.remove('calendarDragging')
    },
    [],
  )

  function clearCalendarDragHoldTimer() {
    if (dragHoldTimerRef.current === null) return
    window.clearTimeout(dragHoldTimerRef.current)
    dragHoldTimerRef.current = null
  }

  function cancelCalendarDrag() {
    clearCalendarDragHoldTimer()
    dragSessionRef.current = null
    setDraggingPlan(null)
    setDragTargetDate(null)
    document.body.classList.remove('calendarDragging')
  }

  function activateCalendarDrag() {
    const session = dragSessionRef.current
    if (!session || session.active) return

    session.active = true
    setDraggingPlan({
      itemKey: session.itemKey,
      project: session.project,
      sourceDate: session.sourceDate,
      title: session.title,
      x: session.x,
      y: session.y,
    })
    setDragTargetDate(session.sourceDate)
    document.body.classList.add('calendarDragging')
  }

  function calendarDateAtPoint(clientX: number, clientY: number) {
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-calendar-date]')
    return target?.dataset.calendarDate ?? null
  }

  function handleCalendarEventPointerDown(event: ReactPointerEvent<HTMLButtonElement>, item: CalendarItem) {
    if (!canManagePlans || !canEditPlan(item.projectId)) return
    if (event.pointerType === 'mouse' && event.button !== 0) return

    const sourceDate = dateForCalendarItem(now, item).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
    if (!sourceDate) return

    clearCalendarDragHoldTimer()
    dragSessionRef.current = {
      itemKey: calendarItemKey(item),
      pointerId: event.pointerId,
      project: item.project,
      sourceDate,
      startX: event.clientX,
      startY: event.clientY,
      title: item.title,
      x: event.clientX,
      y: event.clientY,
      active: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragHoldTimerRef.current = window.setTimeout(activateCalendarDrag, 250)
  }

  function handleCalendarEventPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return

    session.x = event.clientX
    session.y = event.clientY
    const movedDistance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY)
    if (!session.active && movedDistance >= 6) {
      clearCalendarDragHoldTimer()
      activateCalendarDrag()
    }
    if (!session.active) return

    event.preventDefault()
    setDraggingPlan((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current))
    setDragTargetDate(calendarDateAtPoint(event.clientX, event.clientY))
  }

  function handleCalendarEventPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return

    clearCalendarDragHoldTimer()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!session.active) {
      dragSessionRef.current = null
      return
    }

    event.preventDefault()
    suppressCalendarClickRef.current = true
    window.setTimeout(() => {
      suppressCalendarClickRef.current = false
    }, 0)

    const targetDate = calendarDateAtPoint(event.clientX, event.clientY)
    if (targetDate && targetDate !== session.sourceDate) {
      const stableItemKey = onMovePlan(session.itemKey, targetDate)
      if (stableItemKey) {
        setMoveNotice({
          itemKey: stableItemKey,
          fromDate: session.sourceDate,
          toDate: targetDate,
          title: session.title,
        })
      }
    }
    setDayPopover(null)
    cancelCalendarDrag()
  }

  function handleCalendarEventPointerCancel() {
    cancelCalendarDrag()
    setDayPopover(null)
  }

  function toggleCalendarDayPopover(event: ReactMouseEvent<HTMLButtonElement>, date: string, itemCount: number) {
    if (dayPopover?.date === date) {
      setDayPopover(null)
      return
    }

    const cell = event.currentTarget.closest<HTMLElement>('[data-calendar-date]')
    if (!cell) return

    const cellBounds = cell.getBoundingClientRect()
    const popoverWidth = Math.min(360, window.innerWidth - 32)
    const popoverHeight = Math.min(420, Math.max(184, 74 + itemCount * 62))
    const left = Math.min(Math.max(16, cellBounds.left), window.innerWidth - popoverWidth - 16)
    const belowTop = cellBounds.bottom + 8
    const top =
      belowTop + popoverHeight <= window.innerHeight - 16
        ? belowTop
        : Math.max(16, cellBounds.top - popoverHeight - 8)

    setDayPopover({ date, left, top })
  }

  function handleCalendarPopoverPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!dayPopover) return
    const target = event.target
    if (target instanceof Element && target.closest('button')) return

    dayPopoverDragRef.current = {
      ...dayPopover,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
    event.preventDefault()
  }

  return (
    <div className="contentGrid">
      <section className="panel span12">
        <div className="panelHeader">
          <div>
            <h2>交付日历</h2>
            <p>每天显示具体项目进行到哪一步</p>
          </div>
          <div className="rangeSwitch" aria-label="日历范围">
            {[14, 30, 60, 90].map((daysCount) => (
              <button
                key={daysCount}
                className={rangeDays === daysCount ? 'active' : ''}
                type="button"
                onClick={() => {
                  setRangeDays(daysCount)
                  setPageStart(0)
                }}
              >
                未来{daysCount}天
              </button>
            ))}
            {canManageHolidays && (
              <button type="button" onClick={() => setShowHolidaySettings(true)}>
                节假日设置
              </button>
            )}
          </div>
        </div>
        <div className="calendarPager">
          <button type="button" disabled={clampedPageStart === 0} onClick={() => setPageStart((value) => Math.max(0, value - visibleDayCount))}>
            <ChevronLeft size={16} />
            上一页
          </button>
          <span>
            显示第 {clampedPageStart + 1}-{visibleEnd} 天，共 {rangeDays} 天
          </span>
          <button type="button" disabled={visibleEnd >= rangeDays} onClick={() => setPageStart((value) => Math.min(maxPageStart, value + visibleDayCount))}>
            下一页
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="calendarGrid">
          {days.map((date) => {
            const dateKey = localDateKey(date)
            const dayItems = calendarItems.filter((item) => isCalendarItemOnDate(now, item, date))
            const isToday = isSameDay(date, now)
            const holiday = holidayForDate(holidayItems, date)
            const weekend = isWeekend(date)

            return (
              <div
                key={dateKey}
                data-calendar-date={dateKey}
                className={[
                  dayItems.length > 0 ? 'calendarDay hasEvent' : 'calendarDay',
                  isToday ? 'today' : '',
                  weekend && holiday?.type !== '班' ? 'weekend' : '',
                  holiday?.type === '休' ? 'holidayRest' : '',
                  holiday?.type === '班' ? 'holidayWork' : '',
                  draggingPlan && dragTargetDate === dateKey ? 'dropTarget' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onContextMenu={(event) => {
                  event.preventDefault()
                  if (canManagePlans && projects.length > 0) setPlanDate(dateKey)
                }}
              >
                <div className="calendarDayHeader">
                  <div>
                    <strong>{formatCalendarDay(date, isToday)}</strong>
                    <span>{formatWeekday(date)}</span>
                  </div>
                  {holiday && <em className={`holidayBadge ${holiday.type === '休' ? 'rest' : 'work'}`}>{holiday.type}</em>}
                </div>
                {holiday && <span className="holidayName">{holiday.name}</span>}
                <div className="calendarEvents">
                  {dayItems.slice(0, 2).map((item) => {
                    const itemKey = calendarItemKey(item)
                    const canDragItem = canManagePlans && canEditPlan(item.projectId)
                    const isDraggingItem = draggingPlan?.itemKey === itemKey

                    return (
                      <button
                        key={itemKey}
                        type="button"
                        draggable={false}
                        aria-grabbed={isDraggingItem}
                        className={[
                          item.projectId === effectiveSelectedProjectId ? 'calendarEvent active' : 'calendarEvent',
                          item.completed ? 'completed' : '',
                          canDragItem ? 'canDrag' : '',
                          isDraggingItem ? 'dragging' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={(event) => {
                          if (suppressCalendarClickRef.current) {
                            event.preventDefault()
                            return
                          }
                          setSelectedProjectId(item.projectId)
                        }}
                        onPointerDown={canDragItem ? (event) => handleCalendarEventPointerDown(event, item) : undefined}
                        onPointerMove={canDragItem ? handleCalendarEventPointerMove : undefined}
                        onPointerUp={canDragItem ? handleCalendarEventPointerUp : undefined}
                        onPointerCancel={canDragItem ? handleCalendarEventPointerCancel : undefined}
                      >
                        <span>{item.project}</span>
                        <strong>{item.completed ? `已完成 · ${item.title}` : item.title}</strong>
                      </button>
                    )
                  })}
                  {dayItems.length > 2 && (
                    <button
                      className="calendarOverflowButton"
                      type="button"
                      aria-expanded={dayPopover?.date === dateKey}
                      onClick={(event) => toggleCalendarDayPopover(event, dateKey, dayItems.length)}
                    >
                      +{dayItems.length - 2} 个节点
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {dayPopover && dayPopoverItems.length > 0 && createPortal(
          <div
            className={draggingPlan ? 'calendarDayPopover dragHidden' : 'calendarDayPopover'}
            role="dialog"
            aria-label={`${formatMonthDay(new Date(`${dayPopover.date}T00:00:00`))}全部安排`}
            style={{ left: dayPopover.left, top: dayPopover.top }}
          >
            <header
              onPointerDown={handleCalendarPopoverPointerDown}
            >
              <div>
                <span>{formatMonthDay(new Date(`${dayPopover.date}T00:00:00`))}</span>
                <strong>{dayPopoverItems.length} 个安排</strong>
              </div>
              <button type="button" title="关闭" onClick={() => setDayPopover(null)}>
                <X size={16} />
              </button>
            </header>
            <div className="calendarDayPopoverList">
              {dayPopoverItems.map((item) => {
                const itemKey = calendarItemKey(item)
                const canDragItem = canManagePlans && canEditPlan(item.projectId)
                const isDraggingItem = draggingPlan?.itemKey === itemKey

                return (
                  <button
                    key={itemKey}
                    type="button"
                    draggable={false}
                    aria-grabbed={isDraggingItem}
                    className={[
                      'calendarDayPopoverItem',
                      item.projectId === effectiveSelectedProjectId ? 'active' : '',
                      item.completed ? 'completed' : '',
                      canDragItem ? 'canDrag' : '',
                      isDraggingItem ? 'dragging' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={(event) => {
                      if (suppressCalendarClickRef.current) {
                        event.preventDefault()
                        return
                      }
                      setSelectedProjectId(item.projectId)
                      setDayPopover(null)
                    }}
                    onPointerDown={canDragItem ? (event) => handleCalendarEventPointerDown(event, item) : undefined}
                    onPointerMove={canDragItem ? handleCalendarEventPointerMove : undefined}
                    onPointerUp={canDragItem ? handleCalendarEventPointerUp : undefined}
                    onPointerCancel={canDragItem ? handleCalendarEventPointerCancel : undefined}
                  >
                    <div>
                      <span>{item.project}</span>
                      <strong>{item.completed ? `已完成 · ${item.title}` : item.title}</strong>
                    </div>
                    <em>{item.owner}</em>
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
      </section>

      <section className="panel span5 calendarListPanel">
        <div className="panelHeader">
          <div>
            <h2>项目列表</h2>
            <p>点击项目，右侧显示完整时间安排</p>
          </div>
        </div>
        <div className="calendarProjectList" tabIndex={0} aria-label="项目列表">
          {calendarProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={project.id === effectiveSelectedProjectId ? 'calendarProject active' : 'calendarProject'}
              onClick={() => setSelectedProjectId(project.id)}
            >
              <div>
                <strong>{project.name}</strong>
                <span>
                  {project.type} · {project.manager}
                </span>
              </div>
              <span className={`pill ${statusTone[projectDisplayStatus(project, now, calendarItems)]}`}>
                {statusLabel[projectDisplayStatus(project, now, calendarItems)]}
              </span>
            </button>
          ))}
          {calendarProjects.length === 0 && <EmptyState title="暂无项目排期" note="在上方日历日期上右键，可以给已有项目添加计划。" />}
        </div>
      </section>

      <section className="panel span7 calendarListPanel">
        <div className="panelHeader">
          <div>
            <h2>{selectedProject?.name ?? '暂无项目节点'}</h2>
            <p>当前选定项目的具体时间安排</p>
          </div>
          {selectedProject && (
            <span className={`pill ${statusTone[projectDisplayStatus(selectedProject, now, calendarItems)]}`}>
              {statusLabel[projectDisplayStatus(selectedProject, now, calendarItems)]}
            </span>
          )}
        </div>
        <div className="projectSchedule" tabIndex={0} aria-label="当前项目节点列表">
          {selectedProjectSchedule.map((item) => {
            const itemKey = calendarItemKey(item)

            return (
            <article key={itemKey} className={item.completed ? 'scheduleItem completed' : 'scheduleItem'}>
              <div className="scheduleTime">
                <strong>{item.time}</strong>
                <span>{item.type}</span>
              </div>
              <div>
                <strong>{item.title}</strong>
                <span>
                  负责人：{item.owner} · 项目：{item.project}
                </span>
              </div>
              {canEditPlan(item.projectId) && (
                <div className="scheduleActions">
                  <button
                    className={item.completed ? 'completedAction' : ''}
                    type="button"
                    onClick={() => onTogglePlanCompleted(itemKey)}
                  >
                    {item.completed ? '恢复' : '完成'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingPlan({
                        item,
                        key: itemKey,
                        date: dateForCalendarItem(now, item),
                      })
                    }
                  >
                    编辑
                  </button>
                  <button type="button" onClick={() => onDeletePlan(itemKey)}>
                    删除
                  </button>
                </div>
              )}
            </article>
            )
          })}
          {selectedProjectSchedule.length === 0 && (
            <div className="emptySchedule">这个项目暂时没有排期节点。</div>
          )}
        </div>
      </section>
      {draggingPlan && (
        <div
          className="calendarDragPreview"
          aria-hidden="true"
          style={{
            left: `clamp(12px, ${draggingPlan.x + 14}px, calc(100vw - 230px))`,
            top: `clamp(12px, ${draggingPlan.y + 14}px, calc(100vh - 84px))`,
          }}
        >
          <span>{draggingPlan.project}</span>
          <strong>{draggingPlan.title}</strong>
        </div>
      )}
      {moveNotice && (
        <div className="calendarMoveNotice" role="status" aria-live="polite">
          <div>
            <strong>已移动“{moveNotice.title}”</strong>
            <span>
              {formatMonthDay(new Date(`${moveNotice.fromDate}T00:00:00`))} 至{' '}
              {formatMonthDay(new Date(`${moveNotice.toDate}T00:00:00`))}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onMovePlan(moveNotice.itemKey, moveNotice.fromDate)
              setMoveNotice(null)
            }}
          >
            撤销
          </button>
        </div>
      )}
      {canManagePlans && planDate && (
        <CalendarPlanModal
          date={planDate}
          projects={projects}
          staffMembers={staffMembers}
          onClose={() => setPlanDate(null)}
          onSave={(plan) => {
            onAddPlan(plan)
            setSelectedProjectId(plan.projectId)
            setPlanDate(null)
          }}
        />
      )}
      {canManagePlans && assistantDraft && (
        <CalendarPlanModal
          key={`${assistantDraft.projectId}-${assistantDraft.date}-${assistantDraft.title}`}
          date={assistantDraft.date}
          projects={projects}
          staffMembers={staffMembers}
          draft={assistantDraft}
          onClose={onAssistantDraftHandled}
          onSave={(plan) => {
            onAddPlan(plan)
            setSelectedProjectId(plan.projectId)
            onAssistantDraftHandled()
          }}
        />
      )}
      {canManagePlans && editingPlan && (
        <CalendarPlanModal
          date={editingPlan.date}
          projects={projects}
          staffMembers={staffMembers}
          item={editingPlan.item}
          onClose={() => setEditingPlan(null)}
          onSave={(plan) => {
            onUpdatePlan(editingPlan.key, plan)
            setSelectedProjectId(plan.projectId)
            setEditingPlan(null)
          }}
        />
      )}
      {showHolidaySettings && (
        <HolidaySettingsModal
          holidayItems={customHolidayItems}
          chinaHolidaySync={chinaHolidaySync}
          onClose={() => setShowHolidaySettings(false)}
          onChange={onHolidayItemsChange}
          onRefreshChinaHolidays={onRefreshChinaHolidays}
        />
      )}
    </div>
  )
}

function CalendarPlanModal({
  date,
  projects,
  staffMembers,
  item,
  draft,
  onClose,
  onSave,
}: {
  date: string
  projects: Project[]
  staffMembers: StaffMember[]
  item?: CalendarItem
  draft?: ProjectPlanPayload
  onClose: () => void
  onSave: (plan: ProjectPlanPayload) => void
}) {
  const assignableStaff = useMemo(() => staffMembers.filter((member) => member.status === '在职'), [staffMembers])
  const [projectId, setProjectId] = useState(item?.projectId ?? draft?.projectId ?? projects[0]?.id ?? '')
  const selectedProject = projects.find((project) => project.id === projectId) ?? projects[0]
  const initialOwner =
    staffNameInOptions(item?.owner ?? draft?.owner ?? '', assignableStaff) ||
    staffNameInOptions(selectedProject?.manager ?? '', assignableStaff) ||
    assignableStaff[0]?.name ||
    ''
  const [title, setTitle] = useState(item?.title ?? draft?.title ?? '项目计划')
  const [owner, setOwner] = useState(initialOwner)
  const [scheduledDate, setScheduledDate] = useState(date)

  useEffect(() => {
    if (item || draft?.owner) return
    if (!selectedProject) return
    setOwner(staffNameInOptions(selectedProject.manager, assignableStaff) || assignableStaff[0]?.name || '')
  }, [assignableStaff, draft?.owner, item, selectedProject])

  if (!selectedProject) return null

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal calendarPlanModal" role="dialog" aria-modal="true" aria-label="添加交付计划" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">{formatMonthDay(new Date(`${scheduledDate}T00:00:00`))}</span>
            <h2>{item ? '编辑计划' : draft ? '确认助理计划' : '添加计划'}</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="financeEntryForm">
          <label className="textField">
            <span>选择项目</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="textField">
            <span>计划名称</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：脚本初稿、拍摄计划、成片交付" />
          </label>
          {item && (
            <label className="textField">
              <span>计划日期</span>
              <input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
            </label>
          )}
          <label className="textField">
            <span>负责人</span>
            <select value={owner} onChange={(event) => setOwner(event.target.value)}>
              <option value="" disabled>
                选择人员
              </option>
              {assignableStaff.map((member) => (
                <option key={member.name} value={member.name}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="primaryButton"
            type="button"
            onClick={() =>
              onSave({
                date: scheduledDate,
                id: item?.id,
                projectId,
                title,
                owner,
              })
            }
            disabled={!scheduledDate}
          >
            {item ? '保存修改' : draft ? '确认并保存' : '保存计划'}
          </button>
        </footer>
      </section>
    </div>
  )
}

function HolidaySettingsModal({
  holidayItems,
  chinaHolidaySync,
  onClose,
  onChange,
  onRefreshChinaHolidays,
}: {
  holidayItems: HolidayItem[]
  chinaHolidaySync: ChinaHolidaySyncState
  onClose: () => void
  onChange: (items: HolidayItem[]) => void
  onRefreshChinaHolidays: () => void
}) {
  const [date, setDate] = useState(defaultDeliveryDate())
  const [name, setName] = useState('')
  const [type, setType] = useState<HolidayType>('休')
  const sortedItems = [...holidayItems].sort((left, right) => left.date.localeCompare(right.date))

  function saveHoliday() {
    const cleanName = name.trim()
    if (!date || !cleanName) return

    const nextItem: HolidayItem = {
      id: `holiday-${date}`,
      date,
      name: cleanName,
      type,
    }

    onChange([
      ...holidayItems.filter((item) => item.date !== date),
      nextItem,
    ].sort((left, right) => left.date.localeCompare(right.date)))
    setName('')
    setType('休')
  }

  function deleteHoliday(itemId: string) {
    onChange(holidayItems.filter((item) => item.id !== itemId))
  }

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal holidaySettingsModal" role="dialog" aria-modal="true" aria-label="节假日设置" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">交付日历</span>
            <h2>节假日设置</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="financeEntryForm">
          <div className="holidaySourcePanel">
            <div>
              <strong>中国法定节假日</strong>
              <span>{chinaHolidaySyncLabel(chinaHolidaySync)}</span>
              <a href={chinaHolidayProjectUrl} target="_blank" rel="noreferrer">
                数据源：holiday-cn
              </a>
            </div>
            <button type="button" onClick={onRefreshChinaHolidays} disabled={chinaHolidaySync.loading} title="更新法定节假日">
              <RefreshCw size={16} className={chinaHolidaySync.loading ? 'spinning' : ''} />
              {chinaHolidaySync.loading ? '更新中' : '更新'}
            </button>
          </div>

          <div className="holidaySectionHeading">
            <strong>自定义日期</strong>
            <span>{sortedItems.length} 项</span>
          </div>
          <div className="holidayEditor">
            <label className="textField">
              <span>日期</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="textField">
              <span>名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：国庆节、春节调休" />
            </label>
            <label className="textField">
              <span>类型</span>
              <select value={type} onChange={(event) => setType(event.target.value as HolidayType)}>
                <option value="休">休息日</option>
                <option value="班">调休上班</option>
              </select>
            </label>
            <button type="button" onClick={saveHoliday} disabled={!date || !name.trim()}>
              保存
            </button>
          </div>

          <div className="holidayList">
            {sortedItems.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{formatHolidayDate(item.date)}</strong>
                  <span>{item.name}</span>
                </div>
                <em className={item.type === '休' ? 'rest' : 'work'}>{item.type}</em>
                <button type="button" onClick={() => deleteHoliday(item.id)}>
                  删除
                </button>
              </article>
            ))}
            {sortedItems.length === 0 && <EmptyState title="暂无自定义日期" note="中国法定休假和调休上班日会自动显示。" />}
          </div>
        </div>
      </section>
    </div>
  )
}

function DepartedHandoffModal({
  project,
  personName,
  staffMembers,
  onClose,
  onSave,
}: {
  project: Project
  personName: string
  staffMembers: StaffMember[]
  onClose: () => void
  onSave: (projectId: string, departedName: string, mode: AssignmentMode | 'paused', replacementName: string, externalNote: string) => void
}) {
  const assignableStaff = useMemo(() => staffMembers.filter((member) => member.status === '在职'), [staffMembers])
  const [mode, setMode] = useState<AssignmentMode | 'paused'>('internal')
  const [replacementName, setReplacementName] = useState(assignableStaff[0]?.name ?? '')
  const [externalNote, setExternalNote] = useState('')

  useEffect(() => {
    if (assignableStaff.some((member) => member.name === replacementName)) return
    setReplacementName(assignableStaff[0]?.name ?? '')
  }, [assignableStaff, replacementName])

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal handoffModal" role="dialog" aria-modal="true" aria-label="离职人员接替处理" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">项目接替</span>
            <h2>处理离职人员关联</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="financeEntryForm">
          <div className="handoffSummary">
            <strong>{project.name}</strong>
            <span>离职人员：{personName}</span>
          </div>
          <div className="optionGroup">
            <span>处理方式</span>
            <div>
              <button className={mode === 'internal' ? 'active' : ''} type="button" onClick={() => setMode('internal')}>
                公司人员接替
              </button>
              <button className={mode === 'external' ? 'active' : ''} type="button" onClick={() => setMode('external')}>
                外包接替
              </button>
              <button className={mode === 'paused' ? 'active' : ''} type="button" onClick={() => setMode('paused')}>
                暂时搁置
              </button>
            </div>
          </div>
          {mode === 'internal' && (
            <label className="textField">
              <span>接替人员</span>
              <select value={replacementName} onChange={(event) => setReplacementName(event.target.value)}>
                <option value="" disabled>
                  选择人员
                </option>
                {assignableStaff.map((member) => (
                  <option key={member.name} value={member.name}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === 'external' && (
            <label className="textField">
              <span>外包说明</span>
              <input value={externalNote} onChange={(event) => setExternalNote(event.target.value)} placeholder="例如：张三团队接替剪辑" />
            </label>
          )}
          {mode === 'paused' && <div className="noteBox">项目会标记为暂停，保留后续继续处理空间。</div>}
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="primaryButton"
            type="button"
            onClick={() => onSave(project.id, personName, mode, replacementName, externalNote)}
            disabled={(mode === 'internal' && !replacementName) || (mode === 'external' && !externalNote.trim())}
          >
            保存处理
          </button>
        </footer>
      </section>
    </div>
  )
}

function PeopleManagement({
  projects,
  tasks,
  staffMembers,
  staffTagOptions,
  accounts,
  currentRole,
  currentAccountId,
  onUpdateStaffMember,
  onAddStaffMember,
  onDeleteStaffMember,
  onUpdateAccount,
  onAddAccount,
  onDeleteAccount,
}: {
  projects: Project[]
  tasks: Task[]
  staffMembers: StaffMember[]
  staffTagOptions: string[]
  accounts: Account[]
  currentRole: Role
  currentAccountId: string
  onUpdateStaffMember: (member: StaffMember, previousName: string) => void
  onAddStaffMember: (member: StaffMember) => void
  onDeleteStaffMember: (memberId: string) => void
  onUpdateAccount: (account: Account) => void
  onAddAccount: (account: Account) => void
  onDeleteAccount: (accountId: string) => void
}) {
  const editableStaff = staffMembers.filter((person) => person.accountRole !== 'controller')
  const activeProjects = projects.filter((project) => !isArchivedProject(project))
  const archivedProjects = projects.filter((project) => isArchivedProject(project))
  const peopleRows = editableStaff.map((person) => {
    const activeTasks = tasks.filter((task) => task.assignee === person.name && task.status !== '已完成')
    const finishedTasks = tasks.filter((task) => task.assignee === person.name && task.status === '已完成')
    const managedProjects = activeProjects.filter((project) => project.manager === person.name)
    const archivedManagedProjects = archivedProjects.filter((project) => project.manager === person.name)
    const roleLabel = roles.find((roleItem) => roleItem.id === person.accountRole)?.label ?? person.accountRole

    return {
      ...person,
      roleLabel,
      activeTasks: activeTasks.length,
      finishedTasks: finishedTasks.length,
      managedProjects: managedProjects.length,
      archivedManagedProjects: archivedManagedProjects.length,
    }
  })

  return (
    <div className="contentGrid">
      <section className="panel span12">
        <div className="panelHeader">
          <div>
            <h2>人员管理</h2>
            <p>人员、账号和项目关联</p>
          </div>
        </div>

        <div className="peopleSummary">
          <InfoLine label="人员总数" value={`${editableStaff.length} 人`} />
          <InfoLine label="在职人员" value={`${editableStaff.filter((person) => person.status === '在职').length} 人`} />
          <InfoLine label="可负责项目" value={`${editableStaff.filter((person) => canManageProject(person) && person.status === '在职').length} 人`} />
          <InfoLine label="财务/行政" value={`${editableStaff.filter((person) => person.tags.includes('财务') || person.tags.includes('行政')).length} 人`} />
        </div>

        <StaffCreateForm staffTagOptions={staffTagOptions} onAddStaffMember={onAddStaffMember} />

        <div className="peopleTable">
          {peopleRows.map((person) => (
            <PeopleRow
              key={person.id}
              person={person}
              staffTagOptions={staffTagOptions}
              canDelete={!accounts.some((account) => account.id === currentAccountId && account.staffId === person.id)}
              onSave={onUpdateStaffMember}
              onDelete={onDeleteStaffMember}
            />
          ))}
        </div>
      </section>

      <section className="panel span12">
        <div className="panelHeader">
          <div>
            <h2>账号管理</h2>
            <p>项目经理、执行成员、财务等工作账号</p>
          </div>
        </div>
        <AccountManagement
          accounts={accounts}
          staffMembers={staffMembers}
          canDeleteAccounts={currentRole === 'controller' || currentRole === 'admin'}
          currentAccountId={currentAccountId}
          onUpdateAccount={onUpdateAccount}
          onAddAccount={onAddAccount}
          onDeleteAccount={onDeleteAccount}
        />
      </section>
    </div>
  )
}

function StaffCreateForm({
  staffTagOptions,
  onAddStaffMember,
}: {
  staffTagOptions: string[]
  onAddStaffMember: (member: StaffMember) => void
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [tags, setTags] = useState<string[]>([])
  const [status, setStatus] = useState<StaffMember['status']>('在职')

  function addStaffMember() {
    const cleanName = name.trim()
    if (!cleanName || tags.length === 0) return

    onAddStaffMember({
      id: '',
      name: cleanName,
      tags,
      accountRole: role,
      status,
      load: 0,
      risk: 0,
      tasks: 0,
    })
    setName('')
    setRole('member')
    setTags([])
    setStatus('在职')
  }

  return (
    <div className="staffCreateForm">
      <label>
        <span>新增人员</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="姓名" />
      </label>
      <label>
        <span>权限角色</span>
        <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {roles
            .filter((item) => item.id !== 'controller')
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
        </select>
      </label>
      <label>
        <span>标签</span>
        <TagPicker tags={tags} options={staffTagOptions} onChange={setTags} />
      </label>
      <label>
        <span>状态</span>
        <select value={status} onChange={(event) => setStatus(event.target.value as StaffMember['status'])}>
          <option value="在职">在职</option>
          <option value="离职">离职</option>
        </select>
      </label>
      <button type="button" onClick={addStaffMember} disabled={!name.trim() || tags.length === 0}>
        新增人员
      </button>
    </div>
  )
}

function AccountManagement({
  accounts,
  staffMembers,
  canDeleteAccounts,
  currentAccountId,
  onUpdateAccount,
  onAddAccount,
  onDeleteAccount,
}: {
  accounts: Account[]
  staffMembers: StaffMember[]
  canDeleteAccounts: boolean
  currentAccountId: string
  onUpdateAccount: (account: Account) => void
  onAddAccount: (account: Account) => void
  onDeleteAccount: (accountId: string) => void
}) {
  const assignableStaff = staffMembers.filter(isAssignableStaff)
  const manageableAccounts = accounts.filter((account) => account.role !== 'controller')

  return (
    <div className="accountTable">
      <AccountCreateForm accounts={accounts} staffMembers={assignableStaff} onAddAccount={onAddAccount} />
      {manageableAccounts.map((account) => (
        <AccountRow
          key={account.id}
          account={account}
          staffMembers={assignableStaff}
          canDelete={canDeleteAccounts && account.id !== currentAccountId}
          onSave={onUpdateAccount}
          onDelete={onDeleteAccount}
        />
      ))}
    </div>
  )
}

function AccountCreateForm({
  accounts,
  staffMembers,
  onAddAccount,
}: {
  accounts: Account[]
  staffMembers: StaffMember[]
  onAddAccount: (account: Account) => void
}) {
  const [role, setRole] = useState<Role>('member')
  const [accountId, setAccountId] = useState(() => nextAccountId(accounts, role))
  const [staffId, setStaffId] = useState('')
  const [password, setPassword] = useState('123456')
  const cleanAccountId = accountId.trim()
  const isController = role === 'controller'
  const duplicated = accounts.some((account) => account.id === cleanAccountId)

  function handleRoleChange(nextRole: Role) {
    setRole(nextRole)
    setStaffId('')
    setAccountId(nextAccountId(accounts, nextRole))
  }

  function addAccount() {
    if (!cleanAccountId || duplicated || !password.trim()) return
    const nextAccount: Account = {
      id: cleanAccountId,
      password: password.trim(),
      role,
      userName: '',
      staffId: isController ? undefined : (staffId || undefined),
      label: roleLabelFor(role),
      title: isController ? '' : `${roleLabelFor(role)}入口`,
    }

    onAddAccount(nextAccount)
    setAccountId(nextAccountId([...accounts, nextAccount], role))
    setStaffId('')
    setPassword('123456')
  }

  return (
    <div className="accountCreateForm">
      <label>
        <span>新增账号</span>
        <input value={accountId} onChange={(event) => setAccountId(event.target.value)} placeholder={`例如：${nextAccountId(accounts, role)}`} />
      </label>
      <label>
        <span>权限角色</span>
        <select value={role} onChange={(event) => handleRoleChange(event.target.value as Role)}>
          {roles
            .filter((item) => item.id !== 'controller')
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
        </select>
      </label>
      <label>
        <span>关联人员</span>
        <select value={isController ? '' : staffId} onChange={(event) => setStaffId(event.target.value)} disabled={isController}>
          <option value="">{isController ? '总控账号' : '未关联人员'}</option>
          {!isController &&
            staffMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        <span>密码</span>
        <input value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <button type="button" onClick={addAccount} disabled={!cleanAccountId || duplicated || !password.trim()}>
        新增账号
      </button>
    </div>
  )
}

function AccountRow({
  account,
  staffMembers,
  canDelete,
  onSave,
  onDelete,
}: {
  account: Account
  staffMembers: StaffMember[]
  canDelete: boolean
  onSave: (account: Account) => void
  onDelete: (accountId: string) => void
}) {
  const [role, setRole] = useState<Role>(account.role)
  const [staffId, setStaffId] = useState(account.staffId ?? '')
  const [password, setPassword] = useState(account.password)
  const isController = role === 'controller'

  useEffect(() => {
    setRole(account.role)
    setStaffId(account.staffId ?? '')
    setPassword(account.password)
  }, [account.password, account.role, account.staffId])

  useEffect(() => {
    if (isController) {
      setStaffId('')
      return
    }

    if (!staffId || staffMembers.some((member) => member.id === staffId)) return
    setStaffId('')
  }, [isController, staffId, staffMembers])

  const changed = role !== account.role || staffId !== (account.staffId ?? '') || password !== account.password

  return (
    <article className="accountRow">
      <div className="accountIdentity">
        <strong>{account.id}</strong>
        <span>{account.label}</span>
      </div>
      <label>
        <span>权限角色</span>
        <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {roles
            .filter((item) => item.id !== 'controller')
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
        </select>
      </label>
      <label>
        <span>关联人员</span>
        <select value={isController ? '' : staffId} onChange={(event) => setStaffId(event.target.value)} disabled={isController}>
          <option value="">{isController ? '总控账号' : '未关联人员'}</option>
          {!isController &&
            staffMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        <span>密码</span>
        <input value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <button
        className="peopleSaveButton"
        type="button"
        disabled={!changed || !password.trim()}
        onClick={() =>
          onSave({
            ...account,
            role,
            staffId: isController ? undefined : (staffId || undefined),
            password: password.trim(),
            label: roleLabelFor(role),
            title: isController ? '' : `${roleLabelFor(role)}入口`,
          })
        }
      >
        保存
      </button>
      {canDelete && (
        <button className="accountDeleteButton" type="button" onClick={() => onDelete(account.id)}>
          删除
        </button>
      )}
    </article>
  )
}

function TagPicker({ tags, options, onChange }: { tags: string[]; options: string[]; onChange: (tags: string[]) => void }) {
  const normalizedOptions = useMemo(() => uniqueCleanOptions(options, defaultStaffTagOptions), [options])
  const availableTags = useMemo(() => normalizedOptions.filter((tag) => !tags.includes(tag)), [normalizedOptions, tags])
  const [nextTag, setNextTag] = useState(availableTags[0] ?? '')

  useEffect(() => {
    if (nextTag && availableTags.includes(nextTag)) return
    setNextTag(availableTags[0] ?? '')
  }, [availableTags, nextTag])

  function removeTag(tag: string) {
    onChange(tags.filter((item) => item !== tag))
  }

  function addTag() {
    if (!nextTag || tags.includes(nextTag)) return
    onChange([...tags, nextTag])
  }

  return (
    <div className="tagPicker">
      <div className="tagChips">
        {tags.map((tag) => (
          <button key={tag} type="button" onClick={() => removeTag(tag)} title="删除标签">
            {tag}
            <span>×</span>
          </button>
        ))}
        {tags.length === 0 && <em>未设置标签</em>}
      </div>
      <div className="tagPickerAdd">
        <select value={nextTag} onChange={(event) => setNextTag(event.target.value)} disabled={availableTags.length === 0}>
          {availableTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <button type="button" onClick={addTag} disabled={!nextTag}>
          添加
        </button>
      </div>
    </div>
  )
}

function PeopleRow({
  person,
  staffTagOptions,
  canDelete,
  onSave,
  onDelete,
}: {
  person: StaffMember & {
    roleLabel: string
    activeTasks: number
    managedProjects: number
    archivedManagedProjects: number
  }
  staffTagOptions: string[]
  canDelete: boolean
  onSave: (member: StaffMember, previousName: string) => void
  onDelete: (memberId: string) => void
}) {
  const [name, setName] = useState(person.name)
  const [status, setStatus] = useState<StaffMember['status']>(person.status)
  const [tags, setTags] = useState<string[]>(person.tags)

  useEffect(() => {
    setName(person.name)
  }, [person.name])

  useEffect(() => {
    setStatus(person.status)
  }, [person.status])

  useEffect(() => {
    setTags(person.tags)
  }, [person.tags])

  function handleTagsChange(nextTags: string[]) {
    setTags(nextTags)
    onSave(
      {
        ...person,
        tags: nextTags,
      },
      person.name,
    )
  }

  const changed = name.trim() !== person.name || status !== person.status

  return (
    <article className="peopleRow">
      <div className="peopleIdentity">
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="peopleTags">
        <TagPicker tags={tags} options={staffTagOptions} onChange={handleTagsChange} />
      </div>
      <div className="peopleMetric">
        <span>当前任务</span>
        <strong>{person.activeTasks} 个</strong>
      </div>
      <div className="peopleMetric">
        <span>负责项目</span>
        <strong>{person.managedProjects} 个</strong>
      </div>
      <div className="peopleMetric">
        <span>归档项目</span>
        <strong>{person.archivedManagedProjects} 个</strong>
      </div>
      <select className={status === '离职' ? 'peopleStatus departed' : 'peopleStatus'} value={status} onChange={(event) => setStatus(event.target.value as StaffMember['status'])}>
        <option value="在职">在职</option>
        <option value="离职">离职</option>
      </select>
      <button
        className="peopleSaveButton"
        type="button"
        disabled={!changed || !name.trim()}
        onClick={() =>
          onSave(
            {
              ...person,
              name: name.trim(),
              tags,
              status,
            },
            person.name,
          )
        }
      >
        保存
      </button>
      <button className="accountDeleteButton" type="button" disabled={!canDelete} onClick={() => onDelete(person.id)}>
        删除
      </button>
    </article>
  )
}

function TeamLoad({
  projects,
  tasks,
  calendarItems,
  staffMembers,
  taskWorkTypes,
}: {
  projects: Project[]
  tasks: Task[]
  calendarItems: CalendarItem[]
  staffMembers: StaffMember[]
  taskWorkTypes: string[]
}) {
  const activeProjects = projects.filter((project) => !isArchivedProject(project))
  const activeProjectIds = new Set(activeProjects.map((project) => project.id))
  const teamLoad = staffMembers.filter((member) => member.accountRole !== 'controller' && member.status === '在职').map((person) => {
    const personAssignedTasks = tasks.filter((task) => task.assignee === person.name && activeProjectIds.has(task.projectId))
    const personTasks = personAssignedTasks.filter((task) => task.status !== '已完成')
    const managedProjects = activeProjects.filter((project) => project.manager === person.name)
    const ownedProjects = activeProjects.filter((project) => project.owner === person.name)
    const activeRelatedProjectIds = new Set([
      ...personTasks.map((task) => task.projectId),
      ...managedProjects.map((project) => project.id),
      ...ownedProjects.map((project) => project.id),
    ])
    const relatedProjectIds = new Set([
      ...personAssignedTasks.map((task) => task.projectId),
      ...managedProjects.map((project) => project.id),
      ...ownedProjects.map((project) => project.id),
    ])
    const relatedProjects = activeProjects.filter((project) => relatedProjectIds.has(project.id))
    const relatedProjectTasks = relatedProjects.map((project) => ({
      project,
      tasks: personAssignedTasks
        .filter((task) => task.projectId === project.id)
        .map((task) => ({
          id: task.id,
          description: teamTaskDescription(task, project, taskWorkTypes),
          status: task.status,
        })),
    }))
    const risk = activeProjects.filter(
      (project) => activeRelatedProjectIds.has(project.id) && isProjectAtRisk(project, new Date(), calendarItems),
    ).length
    const revisionTasks = personTasks.filter((task) => task.status === '修改中').length
    const load = Math.min(100, personTasks.length * 12 + managedProjects.length * 10 + ownedProjects.length * 8 + revisionTasks * 6)

    return {
      ...person,
      load,
      risk,
      tasks: personTasks.length,
      managedProjects: managedProjects.length,
      managedProjectIds: managedProjects.map((project) => project.id),
      relatedProjects,
      relatedProjectTasks,
      isProjectManager: person.accountRole === 'manager' || person.tags.includes('项目经理'),
    }
  })

  return (
    <div className="contentGrid">
      <section className="panel span12">
        <div className="panelHeader">
          <div>
            <h2>团队负载</h2>
            <p>用于判断谁任务过载、哪些风险集中到同一人</p>
          </div>
        </div>
        <div className="teamGrid">
          {teamLoad.map((person) => (
            <article key={person.name} className="teamCard">
              <div className="teamCardHeader">
                <strong>{person.name}</strong>
                <span>{person.tags.join(' / ')}</span>
              </div>
              <div className="teamLoadOverview">
                <div
                  className="loadRing"
                  style={
                    {
                      '--load': `${person.load}%`,
                      '--load-angle': `${person.load * 3.6}deg`,
                    } as React.CSSProperties
                  }
                >
                  <div className="loadRingInner">
                    <strong>{person.load}%</strong>
                    <span>负载</span>
                  </div>
                </div>
                <div className="teamProjectProgress">
                  <span className="teamProjectProgressTitle">参与项目进度</span>
                  {person.relatedProjectTasks.length > 0 ? (
                    <div className="teamProjectProgressList">
                      {person.relatedProjectTasks.map(({ project, tasks: projectTasks }) => (
                        <div
                          className="teamProjectProgressItem"
                          key={project.id}
                          title={
                            projectTasks.length > 0
                              ? `${project.name} · ${projectTasks.map((task) => `${task.description} · ${task.status}`).join('、')}`
                              : `${project.name} · ${project.stage || '待设置流程节点'}`
                          }
                        >
                          <strong>{project.name}</strong>
                          {person.managedProjectIds.includes(project.id) && (
                            <span className="teamProjectStage">当前节点：{project.stage || '待设置流程节点'}</span>
                          )}
                          {projectTasks.length > 0 ? (
                            projectTasks.map((task) => (
                              <div className="teamProjectTaskDetail" key={task.id}>
                                <span>{task.description}</span>
                                <em
                                  className={`teamProjectTaskStatus ${
                                    task.status === '已完成'
                                      ? 'done'
                                      : task.status === '修改中'
                                        ? 'revision'
                                        : task.status === '制作中'
                                          ? 'active'
                                          : 'pending'
                                  }`}
                                >
                                  {task.status}
                                </em>
                              </div>
                            ))
                          ) : (
                            <span>{project.stage || '待设置流程节点'}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="teamProjectProgressEmpty">暂无参与项目</span>
                  )}
                </div>
              </div>
              <InfoLine label="任务" value={`${person.tasks} 个`} />
              {person.isProjectManager && <InfoLine label="负责项目" value={`${person.managedProjects} 个`} />}
              {person.risk > 0 && <InfoLine label="风险" value={`${person.risk} 个`} />}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function FinanceView({
  role,
  projects,
  displayProjects = projects,
  tasks,
  loadAppData,
  saveAppData,
  onRecordsChange,
}: {
  role: Role
  projects: Project[]
  displayProjects?: Project[]
  tasks: Task[]
  loadAppData: AppDataLoader
  saveAppData: AppDataSaver
  onRecordsChange?: (records: FinanceRecord[]) => void
}) {
  const [activeFinanceView, setActiveFinanceView] = useState<'settlement' | 'participation'>('settlement')
  const [selectedFinanceProjectId, setSelectedFinanceProjectId] = useState(projects[0]?.id ?? '')
  const [records, setRecords] = useState<FinanceRecord[]>(() => loadStoredFinanceRecords())
  const [ledger, setLedger] = useState<FinanceLedger>(() => loadStoredFinanceLedger())
  const [activeAction, setActiveAction] = useState<FinanceAction | null>(null)
  const [editingEntry, setEditingEntry] = useState<{ action: FinanceAction; entry: FinanceLedgerEntry } | null>(null)
  const [financeReady, setFinanceReady] = useState(false)
  const syncedRecords = useMemo(() => {
    const projectIds = new Set(projects.map((project) => project.id))
    return records.filter((record) => projectIds.has(record.projectId))
  }, [projects, records])
  const displayProjectIds = useMemo(() => new Set(displayProjects.map((project) => project.id)), [displayProjects])
  const visibleRecords = useMemo(
    () => syncedRecords.filter((record) => displayProjectIds.has(record.projectId)),
    [displayProjectIds, syncedRecords],
  )
  const totalContract = visibleRecords.reduce((sum, record) => sum + record.contractAmount, 0)
  const totalReceived = visibleRecords.reduce((sum, record) => sum + record.receivedAmount, 0)
  const totalUnreceived = totalContract - totalReceived
  const overdueCount = visibleRecords.filter((record) => financeSettlementStatus(record) === '逾期').length
  const pendingInvoiceCount = visibleRecords.filter((record) => record.contractAmount > 0 && record.invoiceStatus !== '已开票').length
  const selectedRecord =
    visibleRecords.find((record) => record.projectId === selectedFinanceProjectId) ?? visibleRecords[0] ?? null
  const selectedProject = selectedRecord ? projects.find((project) => project.id === selectedRecord.projectId) ?? null : null
  const selectedLedger = selectedRecord ? ledger[selectedRecord.projectId] ?? emptyFinanceLedger() : emptyFinanceLedger()
  const showParticipationView = role === 'controller' && activeFinanceView === 'participation'

  useEffect(() => {
    if (!financeReady) return
    setRecords((current) => ensureFinanceRecordsForProjects(current, projects))
  }, [financeReady, projects])

  useEffect(() => {
    if (!selectedFinanceProjectId && visibleRecords[0]) {
      setSelectedFinanceProjectId(visibleRecords[0].projectId)
      return
    }

    if (selectedFinanceProjectId && !visibleRecords.some((record) => record.projectId === selectedFinanceProjectId)) {
      setSelectedFinanceProjectId(visibleRecords[0]?.projectId ?? '')
    }
  }, [selectedFinanceProjectId, visibleRecords])

  useEffect(() => {
    let canceled = false

    async function loadFileFinanceData() {
      const savedData = await loadAppData()
      if (canceled) return

      const nextRecords = ensureFinanceRecordsForProjects((savedData?.financeRecords ?? loadStoredFinanceRecords()).map(normalizeFinanceRecord), projects)
      setRecords(nextRecords)
      onRecordsChange?.(nextRecords)
      if (savedData?.financeLedger) setLedger(savedData.financeLedger)
      setFinanceReady(true)
    }

    loadFileFinanceData().catch(() => {
      if (canceled) return
      setFinanceReady(true)
    })

    return () => {
      canceled = true
    }
  }, [loadAppData, onRecordsChange, projects])

  useEffect(() => {
    if (!financeReady) return
    localStorage.setItem('crewflow-finance-records', JSON.stringify(records))
    onRecordsChange?.(records)
    saveAppData({
      version: projectDataStorageVersion,
      financeRecords: records,
    }).catch(() => undefined)
  }, [financeReady, onRecordsChange, records, saveAppData])

  useEffect(() => {
    if (!financeReady) return
    localStorage.setItem('crewflow-finance-ledger', JSON.stringify(ledger))
    saveAppData({
      version: projectDataStorageVersion,
      financeLedger: ledger,
    }).catch(() => undefined)
  }, [financeReady, ledger, saveAppData])

  function openFinanceAction(action: FinanceAction) {
    if (!selectedRecord) return
    setEditingEntry(null)
    setActiveAction(action)
  }

  function editFinanceEntry(action: FinanceAction, entry: FinanceLedgerEntry) {
    if (!selectedRecord) return
    setEditingEntry({ action, entry })
    setActiveAction(action)
  }

  function saveFinanceEntry(action: FinanceAction, entry: FinanceLedgerEntry) {
    if (!selectedRecord) return
    setLedger((current) => {
      const projectLedger = current[selectedRecord.projectId] ?? emptyFinanceLedger()
      const key = financeLedgerKey(action)
      const nextEntries =
        editingEntry && editingEntry.action === action
          ? projectLedger[key].map((item) => (item.id === editingEntry.entry.id ? entry : item))
          : [entry, ...projectLedger[key]]

      return {
        ...current,
        [selectedRecord.projectId]: {
          ...projectLedger,
          [key]: nextEntries,
        },
      }
    })

    setRecords((current) => {
      return current.map((record) => {
        if (record.projectId !== selectedRecord.projectId) return record
        if (!editingEntry || editingEntry.action !== action) return updateFinanceRecord(record, action, entry)

        return updateFinanceRecord(reverseFinanceRecord(record, action, editingEntry.entry), action, entry)
      })
    })
    setEditingEntry(null)
    setActiveAction(null)
  }

  function deleteFinanceEntry(action: FinanceAction, entry: FinanceLedgerEntry) {
    if (!selectedRecord) return
    setLedger((current) => {
      const projectLedger = current[selectedRecord.projectId] ?? emptyFinanceLedger()
      const key = financeLedgerKey(action)

      return {
        ...current,
        [selectedRecord.projectId]: {
          ...projectLedger,
          [key]: projectLedger[key].filter((item) => item.id !== entry.id),
        },
      }
    })
    setRecords((current) =>
      current.map((record) => (record.projectId === selectedRecord.projectId ? reverseFinanceRecord(record, action, entry) : record)),
    )
  }

  function updateSelectedFinanceRecord(patch: Partial<FinanceRecord>) {
    if (!selectedRecord) return
    setRecords((current) =>
      current.map((record) =>
        record.projectId === selectedRecord.projectId ? syncFinanceSettlementStatus({ ...record, ...patch }) : record,
      ),
    )
  }

  return (
    <div className="contentGrid financeGrid">
      {role === 'controller' && (
        <div className="financeViewTabs span12" role="tablist" aria-label="财务视图">
          <button
            className={activeFinanceView === 'settlement' ? 'active' : ''}
            type="button"
            role="tab"
            aria-selected={activeFinanceView === 'settlement'}
            onClick={() => setActiveFinanceView('settlement')}
          >
            <DollarSign size={17} />
            项目结算
          </button>
          <button
            className={activeFinanceView === 'participation' ? 'active' : ''}
            type="button"
            role="tab"
            aria-selected={activeFinanceView === 'participation'}
            onClick={() => setActiveFinanceView('participation')}
          >
            <Users size={17} />
            月度项目参与统计
          </button>
        </div>
      )}

      {showParticipationView ? (
        <MonthlyProjectParticipation projects={projects} tasks={tasks} records={syncedRecords} />
      ) : (
        <>
          <FinanceMetric icon={DollarSign} label="合同总额" value={formatMoney(totalContract)} tone="cyan" />
          <FinanceMetric icon={CheckCircle2} label="已收金额" value={formatMoney(totalReceived)} tone="green" />
          <FinanceMetric icon={AlertTriangle} label="未收金额" value={formatMoney(totalUnreceived)} tone="amber" />

          <section className="panel span12">
            <div className="panelHeader">
              <div>
                <h2>项目结算</h2>
                <p>只显示收付款、开票和合同状态</p>
              </div>
              <div className="financeBadges">
                <span>{overdueCount} 个逾期</span>
                <span>{pendingInvoiceCount} 个待处理发票</span>
              </div>
            </div>
            <div className="settlementTable">
              {visibleRecords.length === 0 && <EmptyState title="财务暂无项目" note="新建项目后，这里会建立空白商务档案，金额从 0 开始录入。" />}
              {visibleRecords.map((record) => {
                const project = projects.find((item) => item.id === record.projectId)
                const unpaid = record.contractAmount - record.receivedAmount
                const receivedRatio = record.contractAmount > 0 ? Math.round((record.receivedAmount / record.contractAmount) * 100) : 0
                const settlementStatus = financeSettlementStatus(record)
                const settlementText = record.contractAmount > 0 ? settlementStatus : '待录入'

                return (
                  <button
                    key={record.projectId}
                    className={`settlementRow ${selectedFinanceProjectId === record.projectId ? 'active' : ''}`}
                    type="button"
                    onClick={() => setSelectedFinanceProjectId(record.projectId)}
                  >
                    <div>
                      <strong>{project?.name}</strong>
                      <span>
                        {project?.client || '客户未填写'} · {project?.type} · 项目经理：{project?.manager || '未分配'}
                      </span>
                    </div>
                    <div className="moneyCell">
                      <span>合同</span>
                      <strong>{formatMoney(record.contractAmount)}</strong>
                    </div>
                    <div className="moneyCell">
                      <span>已收</span>
                      <strong>{formatMoney(record.receivedAmount)}</strong>
                    </div>
                    <div className="moneyCell">
                      <span>未收</span>
                      <strong>{formatMoney(unpaid)}</strong>
                    </div>
                    <span className={`financeStatus ${record.contractAmount > 0 ? financeTone(settlementStatus) : 'wait'}`}>{settlementText}</span>
                    <div className="miniProgress" title={`已收 ${receivedRatio}%`}>
                      <span style={{ width: `${receivedRatio}%` }} />
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="panel span12 financeDetailPanel">
            <div className="panelHeader">
              <div>
                <h2>项目商务详情</h2>
                <p>点击左侧项目后查看具体商务情况</p>
              </div>
            </div>
            {selectedProject && selectedRecord ? (
              <FinanceProjectDetail
                project={selectedProject}
                record={selectedRecord}
                ledger={selectedLedger}
                onAction={openFinanceAction}
                onEditEntry={editFinanceEntry}
                onDeleteEntry={deleteFinanceEntry}
                onUpdateRecord={updateSelectedFinanceRecord}
              />
            ) : (
              <EmptyState title="请选择项目" note="项目建立后，点击项目结算列表即可录入甲方商务。" />
            )}
          </section>

          {activeAction && selectedProject && (
            <FinanceEntryModal
              action={activeAction}
              project={selectedProject}
              editingEntry={editingEntry?.action === activeAction ? editingEntry.entry : null}
              onClose={() => {
                setEditingEntry(null)
                setActiveAction(null)
              }}
              onSave={saveFinanceEntry}
            />
          )}
        </>
      )}
    </div>
  )
}

type MonthlyParticipantKind = 'internal' | 'external'

type MonthlyProjectSummary = {
  id: string
  name: string
  due: string
  contractAmount: number
  amountRecorded: boolean
}

type MonthlyParticipationProject = MonthlyProjectSummary & {
  workTypes: string[]
}

type MonthlyParticipant = {
  key: string
  name: string
  kind: MonthlyParticipantKind
  projects: MonthlyParticipationProject[]
  totalContractAmount: number
  pendingAmountCount: number
}

function MonthlyProjectParticipation({
  projects,
  tasks,
  records,
}: {
  projects: Project[]
  tasks: Task[]
  records: FinanceRecord[]
}) {
  const [monthKey, setMonthKey] = useState(() => previousMonthKey())
  const [selectedParticipantKey, setSelectedParticipantKey] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [showAllProjectBars, setShowAllProjectBars] = useState(false)
  const [showAllParticipantBars, setShowAllParticipantBars] = useState(false)
  const [showAllRelationshipProjects, setShowAllRelationshipProjects] = useState(false)
  const report = useMemo(
    () => buildMonthlyParticipationReport(projects, tasks, records, monthKey),
    [monthKey, projects, records, tasks],
  )
  const projectBars = useMemo(
    () =>
      [...report.projects].sort(
        (left, right) =>
          Number(right.amountRecorded) - Number(left.amountRecorded) ||
          right.contractAmount - left.contractAmount ||
          left.due.localeCompare(right.due) ||
          left.name.localeCompare(right.name, 'zh-CN'),
      ),
    [report.projects],
  )
  const participantBars = useMemo(
    () =>
      [...report.participants].sort(
        (left, right) =>
          right.projects.length - left.projects.length ||
          (left.kind === right.kind ? left.name.localeCompare(right.name, 'zh-CN') : left.kind === 'internal' ? -1 : 1),
      ),
    [report.participants],
  )
  const relationshipProjects = useMemo(
    () => [...report.projects].sort((left, right) => left.due.localeCompare(right.due) || left.name.localeCompare(right.name, 'zh-CN')),
    [report.projects],
  )
  const selectedParticipant = report.participants.find((participant) => participant.key === selectedParticipantKey) ?? null
  const selectedProject = report.projects.find((project) => project.id === selectedProjectId) ?? null
  const selectedRelationship = selectedParticipant?.projects.find((project) => project.id === selectedProjectId) ?? null
  const selectedParticipantProjectIds = new Set(selectedParticipant?.projects.map((project) => project.id) ?? [])
  const selectedProjectParticipantKeys = new Set(
    selectedProject
      ? report.participants
          .filter((participant) => participant.projects.some((project) => project.id === selectedProject.id))
          .map((participant) => participant.key)
      : [],
  )
  const visibleProjectBars = showAllProjectBars ? projectBars : projectBars.slice(0, 8)
  const visibleParticipantBars = showAllParticipantBars ? participantBars : participantBars.slice(0, 8)
  const visibleRelationshipProjects = showAllRelationshipProjects ? relationshipProjects : relationshipProjects.slice(0, 8)
  const maxProjectAmount = Math.max(1, ...projectBars.map((project) => project.contractAmount))
  const maxParticipantProjects = Math.max(1, ...participantBars.map((participant) => participant.projects.length))

  useEffect(() => {
    setSelectedParticipantKey((current) =>
      current && !report.participants.some((participant) => participant.key === current) ? '' : current,
    )
    setSelectedProjectId((current) => (current && !report.projects.some((project) => project.id === current) ? '' : current))
  }, [report.participants, report.projects])

  useEffect(() => {
    setShowAllProjectBars(false)
    setShowAllParticipantBars(false)
    setShowAllRelationshipProjects(false)
  }, [monthKey])

  function selectProject(projectId: string) {
    const nextProjectId = selectedProjectId === projectId ? '' : projectId
    setSelectedProjectId(nextProjectId)
    if (nextProjectId && selectedParticipant && !selectedParticipant.projects.some((project) => project.id === nextProjectId)) {
      setSelectedParticipantKey('')
    }
  }

  function selectParticipant(participantKey: string) {
    const nextParticipantKey = selectedParticipantKey === participantKey ? '' : participantKey
    setSelectedParticipantKey(nextParticipantKey)
    const nextParticipant = report.participants.find((participant) => participant.key === nextParticipantKey)
    if (nextParticipant && selectedProject && !nextParticipant.projects.some((project) => project.id === selectedProject.id)) {
      setSelectedProjectId('')
    }
  }

  function selectRelationship(participantKey: string, projectId: string) {
    setSelectedParticipantKey(participantKey)
    setSelectedProjectId(projectId)
  }

  function clearSelection() {
    setSelectedParticipantKey('')
    setSelectedProjectId('')
  }

  return (
    <>
      <FinanceMetric icon={FolderKanban} label="交付项目" value={`${report.projects.length} 个`} tone="cyan" />
      <FinanceMetric icon={DollarSign} label="项目总额" value={formatMoney(report.totalContractAmount)} tone="green" />
      <FinanceMetric icon={Users} label="内部参与人" value={`${report.internalParticipantCount} 人`} tone="blue" />
      <FinanceMetric icon={Users} label="外包参与方" value={`${report.externalParticipantCount} 个`} tone="amber" />

      <section className="monthlyParticipationToolbar span12">
        <div className="monthlyParticipationHeader">
          <div>
            <h2>{formatMonthHeading(monthKey)}项目参与总览</h2>
            <p>按项目最终交付日期归入月份；参与金额只表示项目规模，不代表个人收入或提成。</p>
          </div>
          <div className="monthlyParticipationHeaderActions">
            <div className="financeBadges">
              <span>{report.projects.length} 个项目</span>
              {report.pendingAmountCount > 0 && <span>{report.pendingAmountCount} 个金额待录入</span>}
              {report.unassignedProjects.length > 0 && <span>{report.unassignedProjects.length} 个项目未分配参与人</span>}
            </div>
            <div className="monthlyParticipationControls">
              <button
                type="button"
                title="上一个月"
                aria-label="上一个月"
                onClick={() => setMonthKey((current) => shiftMonthKey(current, -1))}
              >
                <ChevronLeft size={18} />
              </button>
              <label>
                <span>统计月份</span>
                <input type="month" value={monthKey} onChange={(event) => event.target.value && setMonthKey(event.target.value)} />
              </label>
              <button
                type="button"
                title="下一个月"
                aria-label="下一个月"
                onClick={() => setMonthKey((current) => shiftMonthKey(current, 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {report.projects.length === 0 ? (
        <section className="panel span12 monthlyParticipationEmpty">
          <EmptyState title="这个月暂无交付项目" note="项目会按照编辑项目中的最终交付日期自动归入对应月份。" />
        </section>
      ) : (
        <>
          <section className="panel span6 monthlyChartPanel">
            <div className="monthlySectionHeader">
              <div>
                <h3>项目金额分布</h3>
                <p>合同金额待录入的项目仍会保留在图中</p>
              </div>
              <span>{report.projects.length} 个项目</span>
            </div>
            <div className="monthlyBarChart">
              {visibleProjectBars.map((project) => {
                const isRelated = !selectedParticipant || selectedParticipantProjectIds.has(project.id)
                const barWidth = project.amountRecorded ? Math.max(4, (project.contractAmount / maxProjectAmount) * 100) : 0

                return (
                  <button
                    className={`monthlyBarRow project ${selectedProjectId === project.id ? 'selected' : ''} ${isRelated ? '' : 'muted'}`}
                    key={project.id}
                    type="button"
                    aria-pressed={selectedProjectId === project.id}
                    onClick={() => selectProject(project.id)}
                  >
                    <span className="monthlyBarLabel">
                      <strong>{project.name}</strong>
                      <small>交付 {formatDeliveryDate(project.due)}</small>
                    </span>
                    <span className="monthlyBarTrack" aria-hidden="true">
                      <span style={{ width: `${barWidth}%` }} />
                    </span>
                    <strong className={project.amountRecorded ? '' : 'pending'}>
                      {project.amountRecorded ? formatMoney(project.contractAmount) : '待录入'}
                    </strong>
                  </button>
                )
              })}
            </div>
            {projectBars.length > 8 && (
              <button className="monthlyShowAllButton" type="button" onClick={() => setShowAllProjectBars((current) => !current)}>
                {showAllProjectBars ? '收起项目' : `查看全部 ${projectBars.length} 个项目`}
              </button>
            )}
          </section>

          <section className="panel span6 monthlyChartPanel">
            <div className="monthlySectionHeader">
              <div>
                <h3>参与项目分布</h3>
                <p>按参与项目数量展示，内部人员与外包方分色</p>
              </div>
              <div className="monthlyChartLegend" aria-label="参与方类型图例">
                <span className="internal">内部</span>
                <span className="external">外包</span>
              </div>
            </div>
            {report.participants.length === 0 ? (
              <EmptyState title="暂无参与人信息" note="这些项目尚未设置项目经理、内部执行人员或外包参与方。" />
            ) : (
              <div className="monthlyBarChart">
                {visibleParticipantBars.map((participant) => {
                  const isRelated = !selectedProject || selectedProjectParticipantKeys.has(participant.key)
                  return (
                    <button
                      className={`monthlyBarRow participant ${participant.kind} ${selectedParticipantKey === participant.key ? 'selected' : ''} ${isRelated ? '' : 'muted'}`}
                      key={participant.key}
                      type="button"
                      aria-pressed={selectedParticipantKey === participant.key}
                      onClick={() => selectParticipant(participant.key)}
                    >
                      <span className="monthlyBarLabel">
                        <strong>{participant.name}</strong>
                        <small>
                          {participant.kind === 'external' ? '外包' : '内部'} ·{' '}
                          {participant.totalContractAmount > 0
                            ? `参与项目 ${formatMoney(participant.totalContractAmount)}`
                            : participant.pendingAmountCount > 0
                              ? '参与项目金额待录入'
                              : '暂无项目金额'}
                        </small>
                      </span>
                      <span className="monthlyBarTrack" aria-hidden="true">
                        <span style={{ width: `${Math.max(5, (participant.projects.length / maxParticipantProjects) * 100)}%` }} />
                      </span>
                      <strong>{participant.projects.length} 个</strong>
                    </button>
                  )
                })}
              </div>
            )}
            {participantBars.length > 8 && (
              <button className="monthlyShowAllButton" type="button" onClick={() => setShowAllParticipantBars((current) => !current)}>
                {showAllParticipantBars ? '收起参与方' : `查看全部 ${participantBars.length} 个参与方`}
              </button>
            )}
          </section>

          <section className="panel span12 monthlyRelationshipPanel">
            <div className="monthlySectionHeader monthlyRelationshipHeader">
              <div>
                <h3>项目协作关系</h3>
                <p>沿项目时间顺序查看参与人员、外包方和各自承担的工作</p>
              </div>
              {(selectedParticipant || selectedProject) && (
                <button className="monthlyClearSelection" type="button" onClick={clearSelection}>
                  <X size={15} />
                  清除筛选
                </button>
              )}
            </div>

            {(selectedParticipant || selectedProject) && (
              <div className="monthlySelectionSummary">
                <strong>
                  {selectedParticipant && selectedProject
                    ? `${selectedParticipant.name} · ${selectedProject.name}`
                    : selectedParticipant
                      ? selectedParticipant.name
                      : selectedProject?.name}
                </strong>
                <span>
                  {selectedParticipant && selectedProject
                    ? selectedRelationship
                      ? `${selectedRelationship.workTypes.join(' / ')} · ${selectedProject.amountRecorded ? formatMoney(selectedProject.contractAmount) : '金额待录入'} · 交付 ${formatDeliveryDate(selectedProject.due)}`
                      : '当前参与方未参与这个项目'
                    : selectedParticipant
                      ? `参与 ${selectedParticipant.projects.length} 个项目；参与金额可能与其他人员重复，不代表个人收入。`
                      : `${selectedProject?.amountRecorded ? formatMoney(selectedProject.contractAmount) : '金额待录入'} · 最终交付 ${formatDeliveryDate(selectedProject?.due ?? '')}`}
                </span>
              </div>
            )}

            <div className="monthlyRelationshipList">
              {visibleRelationshipProjects.map((project) => {
                const projectParticipants = report.participants.flatMap((participant) => {
                  const relationship = participant.projects.find((item) => item.id === project.id)
                  return relationship ? [{ participant, relationship }] : []
                })
                const isMuted =
                  (selectedParticipant && !selectedParticipantProjectIds.has(project.id)) ||
                  (selectedProject && selectedProject.id !== project.id)

                return (
                  <article
                    className={`monthlyRelationshipRow ${selectedProjectId === project.id ? 'selected' : ''} ${isMuted ? 'muted' : ''}`}
                    key={project.id}
                  >
                    <button
                      className="monthlyRelationshipProject"
                      type="button"
                      aria-pressed={selectedProjectId === project.id}
                      onClick={() => selectProject(project.id)}
                    >
                      <span>{formatDeliveryDate(project.due)}</span>
                      <strong>{project.name}</strong>
                      <small>{project.amountRecorded ? formatMoney(project.contractAmount) : '金额待录入'}</small>
                    </button>
                    <div className="monthlyRelationshipConnector" aria-hidden="true">
                      <span />
                    </div>
                    <div className="monthlyRelationshipPeople">
                      {projectParticipants.length > 0 ? (
                        projectParticipants.map(({ participant, relationship }) => (
                          <button
                            className={`monthlyRelationshipPerson ${participant.kind} ${selectedParticipantKey === participant.key ? 'selected' : ''}`}
                            key={`${project.id}:${participant.key}`}
                            type="button"
                            onClick={() => selectRelationship(participant.key, project.id)}
                          >
                            <span>{participant.kind === 'external' ? '外包' : '内部'}</span>
                            <strong>{participant.name}</strong>
                            <small>{relationship.workTypes.join(' / ')}</small>
                          </button>
                        ))
                      ) : (
                        <span className="monthlyRelationshipEmpty">待分配参与人</span>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>

            {relationshipProjects.length > 8 && (
              <button className="monthlyShowAllButton" type="button" onClick={() => setShowAllRelationshipProjects((current) => !current)}>
                {showAllRelationshipProjects ? '收起协作关系' : `查看全部 ${relationshipProjects.length} 个项目`}
              </button>
            )}
          </section>
        </>
      )}
    </>
  )
}

function buildMonthlyParticipationReport(projects: Project[], tasks: Task[], records: FinanceRecord[], monthKey: string) {
  const recordByProjectId = new Map(records.map((record) => [record.projectId, record]))
  const tasksByProjectId = new Map<string, Task[]>()
  tasks.forEach((task) => {
    const current = tasksByProjectId.get(task.projectId) ?? []
    current.push(task)
    tasksByProjectId.set(task.projectId, current)
  })

  const monthProjects = projects
    .filter((project) => projectDeliveryMonthKey(project.due) === monthKey)
    .sort((left, right) => left.due.localeCompare(right.due) || left.name.localeCompare(right.name, 'zh-CN'))
  const projectSummaries: MonthlyProjectSummary[] = monthProjects.map((project) => {
    const contractAmount = Math.max(0, Number(recordByProjectId.get(project.id)?.contractAmount) || 0)
    return {
      id: project.id,
      name: project.name,
      due: project.due,
      contractAmount,
      amountRecorded: contractAmount > 0,
    }
  })
  const projectSummaryById = new Map(projectSummaries.map((project) => [project.id, project]))
  const participants = new Map<
    string,
    {
      key: string
      name: string
      kind: MonthlyParticipantKind
      projects: Map<string, MonthlyParticipationProject & { workTypeSet: Set<string> }>
    }
  >()
  const unassignedProjects: Project[] = []

  monthProjects.forEach((project) => {
    const record = recordByProjectId.get(project.id)
    const contractAmount = Math.max(0, Number(record?.contractAmount) || 0)
    const amountRecorded = contractAmount > 0
    let participantAdded = false

    function addParticipant(kind: MonthlyParticipantKind, name: string, workType: string, keyOverride?: string) {
      const cleanName = name.trim()
      if (!cleanName || cleanName === '未分配' || cleanName === '待分配') return

      participantAdded = true
      const participantKey = keyOverride ?? `${kind}:${cleanName}`
      const participant = participants.get(participantKey) ?? {
        key: participantKey,
        name: cleanName,
        kind,
        projects: new Map(),
      }
      const currentProject = participant.projects.get(project.id)
      if (currentProject) {
        currentProject.workTypeSet.add(workType)
      } else {
        participant.projects.set(project.id, {
          id: project.id,
          name: project.name,
          due: project.due,
          workTypes: [],
          workTypeSet: new Set([workType]),
          contractAmount,
          amountRecorded,
        })
      }
      participants.set(participantKey, participant)
    }

    const managerName = project.manager?.trim() ?? ''
    if (managerName) addParticipant('internal', managerName, '项目经理')

    const projectTasks = tasksByProjectId.get(project.id) ?? []
    projectTasks.forEach((task) => {
      const workType = monthlyParticipationTaskLabel(task, project)
      if (isExternalTask(task)) {
        const externalName = externalAssigneeName(task).trim()
        const isPendingExternal = !externalName || externalName === '待补充'
        addParticipant(
          'external',
          isPendingExternal ? '待补充外包方' : externalName,
          workType,
          isPendingExternal ? `external-pending:${project.id}` : undefined,
        )
        return
      }

      addParticipant('internal', task.assignee ?? '', workType)
    })

    if (!participantAdded) unassignedProjects.push(project)
  })

  const participantRows: MonthlyParticipant[] = Array.from(participants.values())
    .map((participant) => {
      const participantProjects = Array.from(participant.projects.values())
        .map(({ workTypeSet, ...project }) => ({
          ...project,
          workTypes: Array.from(workTypeSet),
        }))
        .sort((left, right) => left.due.localeCompare(right.due) || left.name.localeCompare(right.name, 'zh-CN'))

      return {
        key: participant.key,
        name: participant.name,
        kind: participant.kind,
        projects: participantProjects,
        totalContractAmount: participantProjects.reduce(
          (sum, project) => sum + (project.amountRecorded ? project.contractAmount : 0),
          0,
        ),
        pendingAmountCount: participantProjects.filter((project) => !project.amountRecorded).length,
      }
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'internal' ? -1 : 1
      return left.name.localeCompare(right.name, 'zh-CN')
    })

  return {
    projects: projectSummaries,
    participants: participantRows,
    unassignedProjects: unassignedProjects
      .map((project) => projectSummaryById.get(project.id))
      .filter((project): project is MonthlyProjectSummary => Boolean(project)),
    totalContractAmount: projectSummaries.reduce((sum, project) => sum + project.contractAmount, 0),
    pendingAmountCount: projectSummaries.filter((project) => !project.amountRecorded).length,
    internalParticipantCount: participantRows.filter((participant) => participant.kind === 'internal').length,
    externalParticipantCount: participantRows.filter((participant) => participant.kind === 'external').length,
  }
}

function previousMonthKey(today = new Date()) {
  return monthKeyForDate(new Date(today.getFullYear(), today.getMonth() - 1, 1))
}

function monthKeyForDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonthKey(monthKey: string, offset: number) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/)
  if (!match) return previousMonthKey()
  return monthKeyForDate(new Date(Number(match[1]), Number(match[2]) - 1 + offset, 1))
}

function projectDeliveryMonthKey(due: string) {
  const match = due.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}`

  const parsed = new Date(due)
  return Number.isNaN(parsed.getTime()) ? '' : monthKeyForDate(parsed)
}

function formatMonthHeading(monthKey: string) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/)
  return match ? `${match[1]}年${Number(match[2])}月` : monthKey
}

function formatDeliveryDate(due: string) {
  const match = due.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (match) return `${Number(match[2])}月${Number(match[3])}日`
  return due || '日期待设置'
}

function monthlyParticipationTaskLabel(task: Task, project: Project) {
  if (task.workType?.trim()) return task.workType.trim()

  const title = task.title.trim()
  const projectPrefix = project.name.trim()
  if (projectPrefix && title.startsWith(projectPrefix)) {
    return title.slice(projectPrefix.length).trim() || '执行任务'
  }

  return title || '执行任务'
}

function FinanceProjectDetail({
  project,
  record,
  ledger,
  onAction,
  onEditEntry,
  onDeleteEntry,
  onUpdateRecord,
}: {
  project: Project
  record: FinanceRecord
  ledger: ReturnType<typeof emptyFinanceLedger>
  onAction: (action: FinanceAction) => void
  onEditEntry: (action: FinanceAction, entry: FinanceLedgerEntry) => void
  onDeleteEntry: (action: FinanceAction, entry: FinanceLedgerEntry) => void
  onUpdateRecord: (patch: Partial<FinanceRecord>) => void
}) {
  const unreceived = record.contractAmount - record.receivedAmount

  async function selectContractFile() {
    const filePath = await window.desktopBridge?.selectProjectFile('选择合同文件')
    if (filePath) onUpdateRecord({ contractFile: filePath })
  }

  async function openContractFile() {
    if (!record.contractFile) return
    await window.desktopBridge?.openProjectFile(record.contractFile)
  }

  return (
    <div className="businessDetail">
      <div className="businessHero">
        <div className="businessHeroTitle">
          <strong>{project.name}</strong>
          <span>
            {project.client || '客户未填写'} · {project.type} · {project.manager}
          </span>
        </div>

        <div className="businessAmounts">
          <EditableMoneyLine label="合同金额" value={record.contractAmount} onChange={(value) => onUpdateRecord({ contractAmount: value })} />
          <InfoLine label="已收金额" value={formatMoney(record.receivedAmount)} />
          <InfoLine label="未收金额" value={formatMoney(unreceived)} />
          <InfoLine label="已开票金额" value={formatMoney(record.invoiceAmount)} />
        </div>
      </div>

      <div className="businessSection">
        <div>
          <h3>甲方商务</h3>
          <p>报价、合同、开票、收款进度</p>
        </div>
        <div className="businessFieldGrid">
          <div className="financeContractFields">
            <EditableTextLine
              label="合同名称"
              value={record.contractName}
              placeholder="填写合同上的正式名称"
              onChange={(value) => onUpdateRecord({ contractName: value })}
            />
            <div className="editableLine financeContractLine" title={record.contractFile || '尚未选择合同文件'}>
              <span>合同文件路径</span>
              <button className="financeContractPicker" type="button" onClick={selectContractFile}>
                <FolderOpen size={15} />
                <span>{record.contractFile ? compactFileName(record.contractFile) : '选择合同文件'}</span>
              </button>
              <button className="financeContractOpen" type="button" onClick={openContractFile} disabled={!record.contractFile}>
                打开
              </button>
            </div>
          </div>
          <EditableSelectLine
            label="报价是否制作"
            value={record.quoteStatus}
            options={['待制作', '已制作', '需修改']}
            onChange={(value) => onUpdateRecord({ quoteStatus: value as FinanceRecord['quoteStatus'] })}
          />
          <EditableSelectLine
            label="比价是否制作"
            value={record.comparisonStatus}
            options={['待制作', '已制作', '需修改']}
            onChange={(value) => onUpdateRecord({ comparisonStatus: value as FinanceRecord['comparisonStatus'] })}
          />
          <EditableSelectLine
            label="合同状态"
            value={record.contractStatus}
            options={['待签订', '已签订']}
            onChange={(value) => onUpdateRecord({ contractStatus: value as FinanceRecord['contractStatus'] })}
          />
          <EditableSelectLine
            label="开票状态"
            value={record.invoiceStatus}
            options={['未开票', '部分开票', '已开票']}
            onChange={(value) => onUpdateRecord({ invoiceStatus: value as FinanceRecord['invoiceStatus'] })}
          />
          <EditableSelectLine
            label="甲方是否结算"
            value={record.clientSettlementStatus}
            options={['未结算', '部分结算', '已结算']}
            onChange={(value) => onUpdateRecord({ clientSettlementStatus: value as FinanceRecord['clientSettlementStatus'] })}
          />
          <EditableDateLine
            label="下次收款日期"
            value={record.nextCollectionDate ?? ''}
            onChange={(value) =>
              onUpdateRecord({
                nextCollectionDate: value,
                nextCollection: formatCollectionPlan(value, record.nextCollectionNote),
              })
            }
          />
          <EditableTextLine
            label="下次收款款项"
            value={record.nextCollectionNote ?? ''}
            placeholder="例如：二期款、尾款、首付款"
            onChange={(value) =>
              onUpdateRecord({
                nextCollectionNote: value,
                nextCollection: formatCollectionPlan(record.nextCollectionDate, value),
              })
            }
          />
        </div>
        <div className="businessRecordsRow">
          <div className="financeActions">
            <button type="button" onClick={() => onAction('payment')}>
              新增收款
            </button>
            <button type="button" onClick={() => onAction('invoice')}>
              新增开票
            </button>
          </div>
          <FinanceLedgerList
            title="收款记录"
            action="payment"
            entries={ledger.payments}
            emptyText="暂无收款记录"
            onEdit={onEditEntry}
            onDelete={onDeleteEntry}
          />
          <FinanceLedgerList
            title="开票记录"
            action="invoice"
            entries={ledger.invoices}
            emptyText="暂无开票记录"
            onEdit={onEditEntry}
            onDelete={onDeleteEntry}
          />
        </div>
      </div>
    </div>
  )
}

function FinanceLedgerList({
  title,
  action,
  entries,
  emptyText,
  onEdit,
  onDelete,
}: {
  title: string
  action: FinanceAction
  entries: FinanceLedgerEntry[]
  emptyText: string
  onEdit: (action: FinanceAction, entry: FinanceLedgerEntry) => void
  onDelete: (action: FinanceAction, entry: FinanceLedgerEntry) => void
}) {
  async function openMaterial(filePath?: string) {
    if (!filePath) return
    await window.desktopBridge?.openProjectFile(filePath)
  }

  return (
    <div className="ledgerList">
      <strong>{title}</strong>
      {entries.length === 0 && <span>{emptyText}</span>}
      {entries.slice(0, 3).map((entry) => (
        <article key={entry.id}>
          <div>
            <b>{entry.title}</b>
            <span>{entry.date}</span>
          </div>
          {typeof entry.amount === 'number' && <em>{formatMoney(entry.amount)}</em>}
          {entry.note && <p>{entry.note}</p>}
          {entry.materialFile && (
            <button className="ledgerMaterial" type="button" onClick={() => openMaterial(entry.materialFile)}>
              相关材料：{compactFileName(entry.materialFile)}
            </button>
          )}
          <div className="ledgerActions">
            <button type="button" onClick={() => onEdit(action, entry)}>
              编辑
            </button>
            <button type="button" onClick={() => onDelete(action, entry)}>
              删除
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

function EditableMoneyLine({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="editableLine">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} />
    </label>
  )
}

function EditableSelectLine({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="editableLine">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function EditableDateLine({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="editableLine">
      <span>{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function EditableTextLine({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <label className="editableLine">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function FinanceEntryModal({
  action,
  project,
  editingEntry,
  onClose,
  onSave,
}: {
  action: FinanceAction
  project: Project
  editingEntry: FinanceLedgerEntry | null
  onClose: () => void
  onSave: (action: FinanceAction, entry: FinanceLedgerEntry) => void
}) {
  const [amount, setAmount] = useState(editingEntry?.amount ? String(editingEntry.amount) : '')
  const [date, setDate] = useState(editingEntry?.date ?? new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState(editingEntry?.title ?? financeActionConfig[action].defaultTitle)
  const [note, setNote] = useState(editingEntry?.note ?? '')
  const [materialFile, setMaterialFile] = useState(editingEntry?.materialFile ?? '')
  const config = financeActionConfig[action]
  const needsAmount = true
  const needsMaterial = action === 'invoice'

  async function selectMaterialFile() {
    const filePath = await window.desktopBridge?.selectProjectFile('选择开票相关材料')
    if (filePath) setMaterialFile(filePath)
  }

  async function openMaterialFile() {
    if (!materialFile) return
    await window.desktopBridge?.openProjectFile(materialFile)
  }

  function saveEntry() {
    const parsedAmount = Number(amount)
    if (needsAmount && (!amount || Number.isNaN(parsedAmount))) return

    onSave(action, {
      id: editingEntry?.id ?? `${action}-${Date.now()}`,
      date,
      title: title.trim() || config.defaultTitle,
      amount: needsAmount ? parsedAmount : undefined,
      note: note.trim(),
      materialFile: materialFile || undefined,
    })
  }

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal" role="dialog" aria-modal="true" aria-label={config.title} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">{project.name}</span>
            <h2>{config.title}</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="financeEntryForm">
          <label className="textField">
            <span>记录名称</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          {needsAmount && (
            <label className="textField">
              <span>金额</span>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="填写数字，例如 12000" />
            </label>
          )}
          <label className="textField">
            <span>日期</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          {needsMaterial ? (
            <div className="textField">
              <span>相关材料</span>
              <div className="financeFileLine">
                <span>{materialFile ? compactFileName(materialFile) : '未选择文件'}</span>
                <button type="button" onClick={selectMaterialFile}>
                  选择文件
                </button>
                <button type="button" onClick={openMaterialFile} disabled={!materialFile}>
                  打开
                </button>
              </div>
            </div>
          ) : (
            <label className="textField">
              <span>备注</span>
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={config.notePlaceholder} />
            </label>
          )}
          {needsMaterial && (
            <label className="textField">
              <span>说明</span>
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={config.notePlaceholder} />
            </label>
          )}
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primaryButton" type="button" onClick={saveEntry}>
            保存记录
          </button>
        </footer>
      </section>
    </div>
  )
}

const defaultAssistantSettings: AssistantSettings = {
  mode: 'rules',
  onlineBaseUrl: '',
  onlineModel: '',
  activeOnlineProfileId: '',
  onlineProfiles: [],
  localBaseUrl: 'http://127.0.0.1:11434',
  localModel: '',
  localThinking: false,
  includeProjectContext: true,
  includeFinanceContext: false,
  fallbackToRules: true,
  hasApiKey: false,
  secureStorageAvailable: true,
}

const assistantImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const assistantImageCountLimit = 4
const assistantImageSizeLimit = 10 * 1024 * 1024
const assistantImageTotalSizeLimit = 20 * 1024 * 1024

type AssistantMessage = {
  from: 'assistant' | 'user'
  text: string
  images?: AssistantImageAttachment[]
}
type AssistantSuggestion = {
  label: string
  prompt: string
}
type AssistantCandidateDraft = AssistantCalendarCandidate & { id: string; selected: boolean }

function readAssistantImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('无法读取图片'))
    }
    reader.onerror = () => reject(new Error('无法读取图片'))
    reader.readAsDataURL(file)
  })
}

function CrewFlowAssistant({
  role,
  section,
  projects,
  tasks,
  calendarItems,
  financeRecords,
  calendarProjects,
  staffMembers,
  editableProjectIds,
  editableTaskIds,
  navigableSections,
  weatherLocation,
  workSchedule,
  workflowOptions,
  canCreateProject,
  canEditProjectTaskBoard,
  onOpenNewProject,
  onReviewCalendarPlans,
  onReviewOperation,
}: {
  role: Role
  section: Section
  projects: Project[]
  tasks: Task[]
  calendarItems: CalendarItem[]
  financeRecords: FinanceRecord[]
  calendarProjects: Project[]
  staffMembers: StaffMember[]
  editableProjectIds: string[]
  editableTaskIds: string[]
  navigableSections: Array<{ id: Section; label: string }>
  weatherLocation: WeatherLocation | null
  workSchedule: WorkSchedule | null
  workflowOptions: WorkflowOptions
  canCreateProject: boolean
  canEditProjectTaskBoard: boolean
  onOpenNewProject: () => void
  onReviewCalendarPlans: (plans: ProjectPlanPayload[]) => void
  onReviewOperation: (operation: AssistantOperation) => boolean
}) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<AssistantSettings>(defaultAssistantSettings)
  const [settingsDraft, setSettingsDraft] = useState<AssistantSettingsDraft>(() => assistantSettingsDraft(defaultAssistantSettings))
  const [apiKey, setApiKey] = useState('')
  const [onlineTestPassed, setOnlineTestPassed] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [localModels, setLocalModels] = useState<string[]>([])
  const [localModelsLoading, setLocalModelsLoading] = useState(false)
  const [candidates, setCandidates] = useState<AssistantCandidateDraft[]>([])
  const [pendingImages, setPendingImages] = useState<AssistantImageAttachment[]>([])
  const [imageMessage, setImageMessage] = useState('')
  const assistantRef = useRef<HTMLElement | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      from: 'assistant',
      text: '我可以帮你整理项目、任务、交付节点和工作提醒。',
    },
  ])
  const suggestions = assistantSuggestions(role, section, projects, tasks, calendarItems, financeRecords)
  const modeLabel = assistantModeLabel(settings.mode)
  const onlineProfiles = settings.onlineProfiles ?? []
  const selectedOnlineProfile = onlineProfiles.find((profile) => profile.id === settingsDraft.activeOnlineProfileId)
  const hasSavedOnlineApiKey =
    selectedOnlineProfile?.hasApiKey ?? (onlineProfiles.length === 0 ? settings.hasApiKey : false)

  useEffect(() => {
    window.desktopBridge
      ?.loadAssistantSettings()
      .then((savedSettings) => {
        setSettings(savedSettings)
        setSettingsDraft(assistantSettingsDraft(savedSettings))
      })
      .catch(() => {
        setSettings(defaultAssistantSettings)
        setSettingsDraft(assistantSettingsDraft(defaultAssistantSettings))
      })
  }, [])

  useEffect(() => {
    if (!open || !showSettings || settingsDraft.mode !== 'local' || !window.desktopBridge?.testAssistantProvider) return

    let active = true
    const localBaseUrl = settingsDraft.localBaseUrl
    setLocalModelsLoading(true)
    window.desktopBridge
      .testAssistantProvider({
        settings: {
          ...assistantSettingsDraft(defaultAssistantSettings),
          mode: 'local',
          localBaseUrl,
        },
      })
      .then((result) => {
        if (!active) return
        const models = result.models ?? []
        setLocalModels(models)
        setSettingsDraft((current) => {
          if (current.mode !== 'local' || current.localBaseUrl !== localBaseUrl) return current
          if (current.localModel && models.includes(current.localModel)) return current
          return models[0] ? { ...current, localModel: models[0] } : current
        })
        if (models.length === 0) setSettingsMessage(result.message)
      })
      .catch((error) => {
        if (active) setSettingsMessage(assistantErrorMessage(error))
      })
      .finally(() => {
        if (active) setLocalModelsLoading(false)
      })

    return () => {
      active = false
    }
  }, [open, settingsDraft.localBaseUrl, settingsDraft.mode, showSettings])

  useEffect(() => {
    if (!open) return

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (assistantRef.current?.contains(target)) return
      setOpen(false)
    }

    window.addEventListener('mousedown', handleOutsideClick)

    return () => window.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  useEffect(() => {
    if (!open || showSettings) return
    const frame = window.requestAnimationFrame(() => {
      const container = messagesRef.current
      if (!container) return
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [busy, candidates, messages, open, showSettings])

  useEffect(() => {
    if (!open || showSettings) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [busy, open, showSettings])

  useEffect(() => {
    if (settings.mode === 'online') return
    setPendingImages([])
    setImageMessage('')
  }, [settings.mode])

  async function addAssistantImages(files: File[]) {
    if (settings.mode !== 'online' || files.length === 0) return

    const nextImages: AssistantImageAttachment[] = []
    const errors: string[] = []
    let totalSize = pendingImages.reduce((sum, image) => sum + image.size, 0)

    for (const file of files) {
      if (pendingImages.length + nextImages.length >= assistantImageCountLimit) {
        errors.push(`每条消息最多添加 ${assistantImageCountLimit} 张图片`)
        break
      }
      if (!assistantImageMimeTypes.has(file.type)) {
        errors.push(`${file.name || '所选文件'}不是支持的图片格式`)
        continue
      }
      if (file.size > assistantImageSizeLimit) {
        errors.push(`${file.name || '所选图片'}超过 10 MB`)
        continue
      }
      if (totalSize + file.size > assistantImageTotalSizeLimit) {
        errors.push('本条消息的图片总大小不能超过 20 MB')
        break
      }

      try {
        const dataUrl = await readAssistantImage(file)
        nextImages.push({
          id: `assistant-image-${Date.now()}-${nextImages.length}`,
          name: file.name || `图片 ${pendingImages.length + nextImages.length + 1}`,
          mimeType: file.type,
          size: file.size,
          dataUrl,
        })
        totalSize += file.size
      } catch {
        errors.push(`${file.name || '所选图片'}读取失败`)
      }
    }

    if (nextImages.length > 0) setPendingImages((current) => [...current, ...nextImages])
    setImageMessage(errors[0] ?? '')
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
  }

  async function sendMessage(text = input, includePendingImages = true) {
    const cleanText = text.trim()
    const images = includePendingImages && settings.mode === 'online' ? pendingImages : []
    if ((!cleanText && images.length === 0) || busy) return
    const messageText =
      cleanText || '请分析这些图片；如果包含项目节点或工作安排，请整理成可确认的操作。'
    const wantsNewProject = /新建项目|创建项目|立项|录入项目/.test(messageText)

    const userMessage: AssistantMessage = { from: 'user', text: messageText, images }
    const currentMessages = [...messages, userMessage]
    setMessages(currentMessages)
    setInput('')
    if (includePendingImages) {
      setPendingImages([])
      setImageMessage('')
    }
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))

    if (settings.mode === 'rules') {
      if (wantsNewProject && canCreateProject) onOpenNewProject()
      setMessages((current) => [
        ...current,
        {
          from: 'assistant',
          text: assistantReply(messageText, role, section, projects, tasks, calendarItems, financeRecords, canCreateProject),
        },
      ])
      return
    }

    if (!window.desktopBridge?.requestAssistant) {
      setMessages((current) => [...current, { from: 'assistant', text: '当前桌面环境无法连接模型，请使用本地规则模式。' }])
      return
    }

    setBusy(true)
    try {
      const response = await window.desktopBridge.requestAssistant({
        messages: currentMessages.slice(-12).map((message) => ({
          role: message.from,
          content: message.text,
          images: message.images?.map(({ name, mimeType, dataUrl }) => ({ name, mimeType, dataUrl })),
        })),
        context: {
          ...assistantContext(
            role,
            section,
            settings,
            projects,
            tasks,
            calendarItems,
            financeRecords,
            staffMembers,
          ),
          workflowOptions,
          usageGuide: userGuideMarkdown,
          editableCalendarProjectIds: calendarProjects.map((project) => project.id),
          editableProjectIds,
          editableTaskIds,
          navigableSections,
          localSettings: {
            weatherCity: weatherLocation?.name ?? '',
            workStart: workSchedule?.start ?? '',
            workEnd: workSchedule?.end ?? '',
          },
          pendingCalendarCandidates: candidates.map((candidate) => ({
            projectId: candidate.projectId,
            date: candidate.date,
            title: candidate.title,
            owner: candidate.owner,
            source: candidate.source,
          })),
          capabilities: {
            canCreateProject,
            canEditProject: editableProjectIds.length > 0,
            canAssignTask: canEditProjectTaskBoard,
            canUpdateTask: editableTaskIds.length > 0,
            canUpdateWeather: true,
            canUpdateWorkSchedule: true,
            canNavigate: navigableSections.length > 0,
          },
        },
        task: 'assistant_route',
      })

      if (response.clearPending) setCandidates([])
      if (response.kind === 'calendar_candidates') {
        const nextCandidates = normalizeAssistantCandidates(response.candidates, calendarProjects)
        const directPlans = assistantPlansFromCandidates(nextCandidates, calendarProjects, calendarItems)
        if (response.openConfirmation && nextCandidates.length === 1 && directPlans.plans.length === 1) {
          setCandidates([])
          setMessages((current) => [
            ...current,
            {
              from: 'assistant',
              text: '已整理这条节点，正在打开交付日历确认窗口。',
            },
          ])
          setOpen(false)
          onReviewCalendarPlans(directPlans.plans)
        } else {
          setCandidates(nextCandidates)
          setMessages((current) => [
            ...current,
            {
              from: 'assistant',
              text:
                nextCandidates.length > 0
                  ? response.message || `已整理 ${nextCandidates.length} 条计划，请核对后前往交付日历确认。`
                  : response.message || '没有找到日期和项目都明确的计划。请补充项目名称及具体日期后再试。',
            },
          ])
        }
      } else if (response.kind === 'operation') {
        if (response.operation) {
          const opened = onReviewOperation(response.operation)
          setMessages((current) => [
            ...current,
            {
              from: 'assistant',
              text: opened ? response.message : '当前账号无法准备这项操作、目标不存在，或需要补充更明确的信息。',
            },
          ])
          if (opened) setOpen(false)
        } else {
          setMessages((current) => [...current, { from: 'assistant', text: response.message }])
        }
      } else {
        setMessages((current) => [...current, { from: 'assistant', text: response.message }])
      }
    } catch (error) {
      const fallback = assistantReply(messageText, role, section, projects, tasks, calendarItems, financeRecords, canCreateProject)
      setMessages((current) => [
        ...current,
        {
          from: 'assistant',
          text: settings.fallbackToRules ? `${assistantErrorMessage(error)}\n\n已改用本地规则：\n${fallback}` : assistantErrorMessage(error),
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  async function saveSettings(clearApiKey = false) {
    if (!window.desktopBridge?.saveAssistantSettings) return
    const saveOnlineProfile = settingsDraft.mode === 'online' && onlineTestPassed && !clearApiKey
    setSettingsBusy(true)
    setSettingsMessage('')
    try {
      const saved = await window.desktopBridge.saveAssistantSettings({
        settings: settingsDraft,
        apiKey,
        clearApiKey,
        saveOnlineProfile,
      })
      setSettings(saved)
      setSettingsDraft(assistantSettingsDraft(saved))
      setApiKey('')
      setOnlineTestPassed(false)
      setSettingsMessage(
        clearApiKey ? 'API Key 已清除' : saveOnlineProfile ? '设置已保存，并加入常用在线模型' : '设置已保存',
      )
    } catch (error) {
      setSettingsMessage(assistantErrorMessage(error))
    } finally {
      setSettingsBusy(false)
    }
  }

  async function testProvider() {
    if (!window.desktopBridge?.testAssistantProvider) return
    setSettingsBusy(true)
    setSettingsMessage('正在测试连接…')
    try {
      const result = await window.desktopBridge.testAssistantProvider({
        settings: settingsDraft,
        apiKey,
      })
      if (settingsDraft.mode === 'online') {
        setOnlineTestPassed(result.ok)
        setSettingsMessage(result.ok ? `${result.message}。保存设置后可从常用模型快速切换` : result.message)
      } else {
        setOnlineTestPassed(false)
        setSettingsMessage(result.message)
      }
      if (settingsDraft.mode === 'local') setLocalModels(result.models ?? [])
      if (settingsDraft.mode === 'local' && !settingsDraft.localModel && result.models?.[0]) {
        setSettingsDraft((current) => ({ ...current, localModel: result.models?.[0] ?? '' }))
      }
    } catch (error) {
      setOnlineTestPassed(false)
      setSettingsMessage(assistantErrorMessage(error))
    } finally {
      setSettingsBusy(false)
    }
  }

  function selectOnlineProfile(profileId: string) {
    const profile = onlineProfiles.find((item) => item.id === profileId)
    setApiKey('')
    setOnlineTestPassed(false)
    setSettingsMessage('')
    setSettingsDraft((current) => ({
      ...current,
      activeOnlineProfileId: profile?.id ?? '',
      onlineBaseUrl: profile?.onlineBaseUrl ?? '',
      onlineModel: profile?.onlineModel ?? '',
    }))
  }

  async function deleteOnlineProfile() {
    const profile = selectedOnlineProfile
    if (!profile || !window.desktopBridge?.deleteAssistantOnlineProfile) return
    if (!window.confirm(`删除常用模型“${assistantOnlineProfileLabel(profile)}”吗？`)) return

    setSettingsBusy(true)
    setSettingsMessage('')
    try {
      const saved = await window.desktopBridge.deleteAssistantOnlineProfile(profile.id)
      setSettings(saved)
      setSettingsDraft(assistantSettingsDraft(saved))
      setApiKey('')
      setOnlineTestPassed(false)
      setSettingsMessage('常用模型已删除')
    } catch (error) {
      setSettingsMessage(assistantErrorMessage(error))
    } finally {
      setSettingsBusy(false)
    }
  }

  async function refreshLocalModels() {
    if (!window.desktopBridge?.testAssistantProvider || localModelsLoading) return
    setLocalModelsLoading(true)
    setSettingsMessage('正在读取本地模型…')
    try {
      const result = await window.desktopBridge.testAssistantProvider({
        settings: { ...settingsDraft, mode: 'local', localModel: '' },
      })
      const models = result.models ?? []
      setLocalModels(models)
      setSettingsDraft((current) => {
        if (current.localModel && models.includes(current.localModel)) return current
        return models[0] ? { ...current, localModel: models[0] } : current
      })
      setSettingsMessage(models.length > 0 ? `已读取 ${models.length} 个本地模型` : result.message)
    } catch (error) {
      setSettingsMessage(assistantErrorMessage(error))
    } finally {
      setLocalModelsLoading(false)
    }
  }

  function reviewCandidates() {
    const { plans, skipped } = assistantPlansFromCandidates(candidates, calendarProjects, calendarItems)

    if (plans.length === 0) {
      setMessages((current) => [
        ...current,
        {
          from: 'assistant',
          text: `没有可带入日历的计划${skipped > 0 ? '，请检查日期、项目、内容是否完整或是否已经存在' : ''}。`,
        },
      ])
      return
    }

    setCandidates([])
    setMessages((current) => [
      ...current,
      {
        from: 'assistant',
        text: `已准备 ${plans.length} 条计划，正在打开交付日历供你逐条确认${skipped > 0 ? `；另有 ${skipped} 条重复或不完整内容未带入` : ''}。`,
      },
    ])
    setOpen(false)
    onReviewCalendarPlans(plans)
  }

  if (!open) {
    return (
      <button
        className="assistantFab"
        type="button"
        aria-label="打开 CrewFlow 助理"
        title="打开 CrewFlow 助理"
        onClick={() => setOpen(true)}
      >
        <MessageSquareText size={21} />
      </button>
    )
  }

  return (
    <section ref={assistantRef} className="assistantWindow" aria-label="CrewFlow 助理">
      <header>
        <div>
          <strong>CrewFlow 助理</strong>
          <span>{showSettings ? '模型与隐私设置' : modeLabel}</span>
        </div>
        <div className="assistantHeaderActions">
          <button
            type="button"
            onClick={() => {
              setShowSettings((current) => !current)
              setSettingsMessage('')
            }}
            title={showSettings ? '返回对话' : '助理设置'}
          >
            {showSettings ? <ArrowLeft size={16} /> : <Settings2 size={16} />}
          </button>
          <button type="button" onClick={() => setOpen(false)} title="收起">
            <Minimize2 size={16} />
          </button>
        </div>
      </header>

      {showSettings ? (
        <div className="assistantSettings">
          <div className="assistantModeOptions" role="group" aria-label="助理模式">
            {(
              [
                ['rules', '本地规则', ShieldCheck],
                ['online', '在线 AI', Bot],
                ['local', '本地模型', HardDrive],
              ] as const
            ).map(([mode, label, Icon]) => (
              <button
                key={mode}
                className={settingsDraft.mode === mode ? 'active' : ''}
                type="button"
                onClick={() => {
                  setSettingsDraft((current) => ({ ...current, mode }))
                  setOnlineTestPassed(false)
                  setSettingsMessage('')
                }}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {settingsDraft.mode === 'rules' && (
            <div className="assistantSettingsNote">
              <ShieldCheck size={18} />
              <div>
                <strong>无需联网</strong>
                <span>使用内置规则整理当前账号可见的项目、任务和交付提醒。</span>
              </div>
            </div>
          )}

          {settingsDraft.mode === 'online' && (
            <div className="assistantSettingsFields">
              <div className="assistantOnlineProfileRow">
                <label>
                  <span>常用在线模型</span>
                  <select
                    value={settingsDraft.activeOnlineProfileId}
                    disabled={onlineProfiles.length === 0}
                    onChange={(event) => selectOnlineProfile(event.target.value)}
                  >
                    <option value="">
                      {onlineProfiles.length === 0 ? '测试成功并保存后显示在这里' : '手动填写新模型'}
                    </option>
                    {onlineProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {assistantOnlineProfileLabel(profile)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="assistantProfileDelete"
                  type="button"
                  disabled={!selectedOnlineProfile || settingsBusy}
                  onClick={() => void deleteOnlineProfile()}
                  title="删除当前常用模型"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <label>
                <span>API 地址</span>
                <input
                  value={settingsDraft.onlineBaseUrl}
                  onChange={(event) => {
                    setSettingsDraft((current) => ({
                      ...current,
                      onlineBaseUrl: event.target.value,
                      activeOnlineProfileId: '',
                    }))
                    setOnlineTestPassed(false)
                  }}
                  placeholder="例如：https://api.openai.com/v1"
                />
              </label>
              <label>
                <span>模型名称</span>
                <input
                  value={settingsDraft.onlineModel}
                  onChange={(event) => {
                    setSettingsDraft((current) => ({
                      ...current,
                      onlineModel: event.target.value,
                      activeOnlineProfileId: '',
                    }))
                    setOnlineTestPassed(false)
                  }}
                  placeholder="填写服务商提供的模型名称"
                />
              </label>
              <label>
                <span>API Key</span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value)
                    setOnlineTestPassed(false)
                  }}
                  placeholder={hasSavedOnlineApiKey ? '已安全保存，留空表示继续使用' : '输入 API Key'}
                  autoComplete="off"
                />
              </label>
              <p className="assistantPrivacyNote">
                连接测试成功后保存，会加入常用模型。每套 API Key 只加密保存在当前电脑，不写入团队数据库。
              </p>
            </div>
          )}

          {settingsDraft.mode === 'local' && (
            <div className="assistantSettingsFields">
              <label>
                <span>本地服务地址</span>
                <input
                  value={settingsDraft.localBaseUrl}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, localBaseUrl: event.target.value }))}
                  placeholder="http://127.0.0.1:11434"
                />
              </label>
              <div className="assistantLocalModelRow">
                <label>
                  <span>模型名称</span>
                  <select
                    value={settingsDraft.localModel}
                    disabled={localModelsLoading && localModels.length === 0}
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, localModel: event.target.value }))}
                  >
                    {!settingsDraft.localModel && (
                      <option value="" disabled>
                        {localModelsLoading ? '正在读取…' : '请选择模型'}
                      </option>
                    )}
                    {settingsDraft.localModel && !localModels.includes(settingsDraft.localModel) && (
                      <option value={settingsDraft.localModel}>{settingsDraft.localModel}</option>
                    )}
                    {localModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="assistantModelRefresh"
                  type="button"
                  disabled={localModelsLoading}
                  onClick={() => void refreshLocalModels()}
                  title="刷新本地模型"
                >
                  <RefreshCw size={16} className={localModelsLoading ? 'spinning' : ''} />
                </button>
              </div>
              <div className="assistantLocalResponseMode">
                <span>响应模式</span>
                <div className="assistantResponseModeOptions" role="group" aria-label="本地模型响应模式">
                  <button
                    type="button"
                    className={!settingsDraft.localThinking ? 'active' : ''}
                    aria-pressed={!settingsDraft.localThinking}
                    onClick={() => setSettingsDraft((current) => ({ ...current, localThinking: false }))}
                  >
                    快速响应
                  </button>
                  <button
                    type="button"
                    className={settingsDraft.localThinking ? 'active' : ''}
                    aria-pressed={settingsDraft.localThinking}
                    onClick={() => setSettingsDraft((current) => ({ ...current, localThinking: true }))}
                  >
                    深度思考
                  </button>
                </div>
              </div>
              <p className="assistantPrivacyNote">
                {settingsDraft.localThinking
                  ? '适合复杂分析，等待时间会明显增加。'
                  : '适合日常对话、信息提取和表单预填。'}
              </p>
            </div>
          )}

          <div className="assistantContextOptions">
            <label>
              <input
                type="checkbox"
                checked={settingsDraft.includeProjectContext}
                onChange={(event) =>
                  setSettingsDraft((current) => ({ ...current, includeProjectContext: event.target.checked }))
                }
              />
              <span>允许读取当前账号可见的项目、任务和日历摘要</span>
            </label>
            {(role === 'controller' || role === 'admin' || role === 'finance') && (
              <label>
                <input
                  type="checkbox"
                  checked={settingsDraft.includeFinanceContext}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({ ...current, includeFinanceContext: event.target.checked }))
                  }
                />
                <span>允许读取当前账号可见的财务摘要</span>
              </label>
            )}
            <label>
              <input
                type="checkbox"
                checked={settingsDraft.fallbackToRules}
                onChange={(event) =>
                  setSettingsDraft((current) => ({ ...current, fallbackToRules: event.target.checked }))
                }
              />
              <span>模型连接失败时使用本地规则回答</span>
            </label>
          </div>
          <p className="assistantPrivacyNote">
            助理继承当前登录账号的数据范围和操作权限；所有数据写入仍需在界面中确认。
          </p>

          {settingsMessage && <div className="assistantSettingsMessage">{settingsMessage}</div>}
          <div className="assistantSettingsActions">
            {settingsDraft.mode !== 'rules' && (
              <button type="button" disabled={settingsBusy} onClick={() => void testProvider()}>
                测试连接
              </button>
            )}
            {settingsDraft.mode === 'online' && hasSavedOnlineApiKey && (
              <button type="button" disabled={settingsBusy} onClick={() => void saveSettings(true)}>
                清除密钥
              </button>
            )}
            <button className="primaryButton" type="button" disabled={settingsBusy} onClick={() => void saveSettings()}>
              保存设置
            </button>
          </div>
        </div>
      ) : (
        <>
          <div ref={messagesRef} className="assistantMessages">
            {messages.map((message, index) => (
              <div key={`${message.from}-${index}`} className={`assistantMessage ${message.from}`}>
                {message.images && message.images.length > 0 && (
                  <div className="assistantMessageImages">
                    {message.images.map((image) => (
                      <img key={image.id} src={image.dataUrl} alt={image.name} title={image.name} />
                    ))}
                  </div>
                )}
                {message.text && <span>{message.text}</span>}
              </div>
            ))}
            {busy && <div className="assistantMessage assistant">正在思考…</div>}
            {candidates.length > 0 && (
              <div className="assistantCandidates">
                <strong>选择要带入日历的计划</strong>
                {candidates.map((candidate) => (
                  <div className="assistantCandidate" key={candidate.id}>
                    <input
                      type="checkbox"
                      checked={candidate.selected}
                      onChange={(event) =>
                        setCandidates((current) =>
                          current.map((item) =>
                            item.id === candidate.id ? { ...item, selected: event.target.checked } : item,
                          ),
                        )
                      }
                      aria-label="选择计划"
                    />
                    <div>
                      <select
                        value={candidate.projectId}
                        onChange={(event) =>
                          setCandidates((current) =>
                            current.map((item) =>
                              item.id === candidate.id ? { ...item, projectId: event.target.value } : item,
                            ),
                          )
                        }
                      >
                        <option value="">选择项目</option>
                        {calendarProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={candidate.date}
                        onChange={(event) =>
                          setCandidates((current) =>
                            current.map((item) =>
                              item.id === candidate.id ? { ...item, date: event.target.value } : item,
                            ),
                          )
                        }
                      />
                      <input
                        value={candidate.title}
                        onChange={(event) =>
                          setCandidates((current) =>
                            current.map((item) =>
                              item.id === candidate.id ? { ...item, title: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder="计划内容"
                      />
                      <select
                        value={candidate.owner}
                        onChange={(event) =>
                          setCandidates((current) =>
                            current.map((item) =>
                              item.id === candidate.id ? { ...item, owner: event.target.value } : item,
                            ),
                          )
                        }
                      >
                        <option value="">使用项目负责人</option>
                        {uniqueCleanOptions(
                          [...staffMembers.map((member) => member.name), ...calendarProjects.map((project) => project.manager)],
                          [],
                        ).map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      {candidate.source && <small>依据：{candidate.source}</small>}
                    </div>
                  </div>
                ))}
                <div className="assistantCandidateActions">
                  <button type="button" onClick={() => setCandidates([])}>
                    取消
                  </button>
                  <button className="primaryButton" type="button" onClick={reviewCandidates}>
                    前往日历确认
                  </button>
                </div>
              </div>
            )}
          </div>

          <form
            className={`assistantInput${settings.mode === 'online' ? ' withImages' : ''}`}
            onDragOver={(event) => {
              if (settings.mode === 'online') event.preventDefault()
            }}
            onDrop={(event) => {
              if (settings.mode !== 'online') return
              event.preventDefault()
              void addAssistantImages(Array.from(event.dataTransfer.files))
            }}
            onSubmit={(event) => {
              event.preventDefault()
              void sendMessage()
            }}
          >
            <div className="assistantQuickActions" aria-label="快捷提问">
              {suggestions.map((item) => (
                <button
                  key={item.prompt}
                  type="button"
                  title={item.prompt}
                  disabled={busy}
                  onClick={() => void sendMessage(item.prompt, false)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {pendingImages.length > 0 && (
              <div className="assistantPendingImages">
                {pendingImages.map((image) => (
                  <div key={image.id} className="assistantPendingImage">
                    <img src={image.dataUrl} alt={image.name} />
                    <button
                      type="button"
                      title={`移除 ${image.name}`}
                      onClick={() => setPendingImages((current) => current.filter((item) => item.id !== image.id))}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {imageMessage && <span className="assistantImageMessage">{imageMessage}</span>}
            {settings.mode === 'online' && (
              <>
                <input
                  ref={imageInputRef}
                  className="assistantImageInput"
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  multiple
                  tabIndex={-1}
                  onChange={(event) => {
                    void addAssistantImages(Array.from(event.target.files ?? []))
                    event.currentTarget.value = ''
                  }}
                />
                <button
                  className="assistantImageButton"
                  type="button"
                  title="添加图片"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <ImagePlus size={16} />
                </button>
              </>
            )}
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onPaste={(event) => {
                if (settings.mode !== 'online') return
                const images = Array.from(event.clipboardData.items)
                  .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                  .map((item) => item.getAsFile())
                  .filter((file): file is File => Boolean(file))
                if (images.length === 0) return
                event.preventDefault()
                void addAssistantImages(images)
              }}
              placeholder={
                settings.mode === 'rules'
                  ? '问：今天优先处理什么？'
                  : settings.mode === 'online'
                    ? '提问，或添加/粘贴图片'
                    : '提问，或粘贴聊天记录提取计划'
              }
              aria-busy={busy}
            />
            <button type="submit" title={busy ? '等待上一条处理完成' : '发送'} disabled={busy}>
              <Send size={16} />
            </button>
          </form>
        </>
      )}
    </section>
  )
}

function assistantSettingsDraft(settings: AssistantSettings): AssistantSettingsDraft {
  return {
    mode: settings.mode,
    onlineBaseUrl: settings.onlineBaseUrl,
    onlineModel: settings.onlineModel,
    activeOnlineProfileId: settings.activeOnlineProfileId,
    localBaseUrl: settings.localBaseUrl,
    localModel: settings.localModel,
    localThinking: settings.localThinking,
    includeProjectContext: settings.includeProjectContext,
    includeFinanceContext: settings.includeFinanceContext,
    fallbackToRules: settings.fallbackToRules,
  }
}

function assistantOnlineProfileLabel(profile: AssistantOnlineProfile) {
  try {
    const host = new URL(profile.onlineBaseUrl).host
    return host ? `${profile.onlineModel} · ${host}` : profile.onlineModel
  } catch {
    return profile.onlineModel
  }
}

function assistantModeLabel(mode: AssistantMode) {
  if (mode === 'online') return '在线 AI'
  if (mode === 'local') return '本地模型'
  return '本地规则'
}

function assistantErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '助理暂时无法响应'
  const remoteMessage = message.match(/Error: (.+)$/)?.[1] ?? message
  return remoteMessage.replace(/^Error invoking remote method '[^']+':\s*/i, '')
}

function assistantContext(
  role: Role,
  section: Section,
  settings: AssistantSettings,
  projects: Project[],
  tasks: Task[],
  calendarItems: CalendarItem[],
  financeRecords: FinanceRecord[],
  staffMembers: StaffMember[],
) {
  const context: Record<string, unknown> = {
    today: localDateKey(new Date()),
    role,
    section,
  }
  if (settings.includeProjectContext) {
    context.projects = projects.slice(0, 300).map((project) => ({
      id: project.id,
      name: project.name,
      type: project.type,
      client: project.client,
      manager: project.manager,
      stage: project.stage,
      workStatus: project.workStatus,
      nextMilestone: project.nextMilestone,
      finalDelivery: project.nextMilestone,
      due: project.due,
      progress: project.progress,
      status: projectDisplayStatus(project, new Date(), calendarItems),
      healthStatus: projectHealthStatus(project),
    }))
    context.tasks = tasks.slice(0, 600).map((task) => ({
      id: task.id,
      projectId: task.projectId,
      project: task.project,
      title: task.title,
      workType: task.workType,
      assignmentMode: task.assignmentMode,
      assignee: task.assignee,
      due: task.due,
      status: task.status,
    }))
    context.calendar = calendarItems.slice(0, 600).map((item) => ({
      projectId: item.projectId,
      project: item.project,
      date: dateForCalendarItem(new Date(), item),
      title: item.title,
      owner: item.owner,
      isFinalDelivery: item.isFinalDelivery === true,
      completed: item.completed === true,
    }))
    context.staff = staffMembers.slice(0, 150).map((member) => ({ name: member.name, tags: member.tags }))
  }
  if (settings.includeFinanceContext && (role === 'controller' || role === 'admin' || role === 'finance')) {
    context.finance = financeRecords.slice(0, 300).map((record) => ({
      projectId: record.projectId,
      contractAmount: record.contractAmount,
      receivedAmount: record.receivedAmount,
      invoiceAmount: record.invoiceAmount,
      contractStatus: record.contractStatus,
      invoiceStatus: record.invoiceStatus,
      settlementStatus: record.settlementStatus,
      nextCollectionDate: record.nextCollectionDate,
    }))
  }
  return context
}

function normalizeAssistantCandidates(candidates: AssistantCalendarCandidate[], projects: Project[]) {
  return candidates.slice(0, 20).map((candidate, index) => {
    const project =
      projects.find((item) => item.id === candidate.projectId) ??
      findAssistantProjectByName(candidate.projectName, projects)
    return {
      ...candidate,
      id: `assistant-plan-${Date.now()}-${index}`,
      projectId: project?.id ?? '',
      owner: candidate.owner || project?.manager || '',
      selected: Boolean(project && candidate.date && candidate.title),
    }
  })
}

function assistantProjectAliases(name: string) {
  const compactName = name.replace(/\s+/g, '').trim()
  const aliases = [
    compactName,
    compactName.replace(/[（(][^）)]*[）)]$/g, ''),
    compactName.replace(/[-_ ]?[vV]?\d+(?:\.\d+)*$/g, ''),
    ...Array.from(compactName.matchAll(/[（(]([^）)]+)[）)]/g), (match) => match[1]),
  ]
  return uniqueCleanOptions(aliases.filter((alias) => alias.length >= 2), [])
}

function findAssistantProjectByName(name: string, projects: Project[]) {
  const compactName = name.replace(/\s+/g, '').trim()
  if (!compactName) return undefined
  const exactProject = projects.find((project) => project.name.replace(/\s+/g, '').trim() === compactName)
  if (exactProject) return exactProject

  const fuzzyProjects = projects.filter((project) =>
    assistantProjectAliases(project.name).some(
      (alias) => alias === compactName || alias.includes(compactName) || compactName.includes(alias),
    ),
  )
  return fuzzyProjects.length === 1 ? fuzzyProjects[0] : undefined
}

function assistantPlansFromCandidates(
  candidates: AssistantCandidateDraft[],
  projects: Project[],
  calendarItems: CalendarItem[],
) {
  const plans: ProjectPlanPayload[] = []
  let skipped = 0
  candidates.forEach((candidate) => {
    if (!candidate.selected) return
    const project = projects.find((item) => item.id === candidate.projectId)
    const duplicate = calendarItems.some(
      (item) =>
        item.projectId === candidate.projectId &&
        dateForCalendarItem(new Date(), item) === candidate.date &&
        item.title.trim() === candidate.title.trim(),
    )
    if (!project || !candidate.date || !candidate.title.trim() || duplicate) {
      skipped += 1
      return
    }
    plans.push({
      date: candidate.date,
      projectId: project.id,
      title: candidate.title.trim(),
      owner: candidate.owner || project.manager,
    })
  })
  return { plans, skipped }
}

function assistantSuggestions(
  role: Role,
  section: Section,
  projects: Project[],
  tasks: Task[],
  calendarItems: CalendarItem[],
  financeRecords: FinanceRecord[],
): AssistantSuggestion[] {
  const now = new Date()
  const riskCount = projects.filter((project) => isProjectAtRisk(project, now, calendarItems)).length
  const waitingCount = projects.filter(isWaitingProject).length
  const openTasks = tasks.filter((task) => task.status !== '已完成')
  const activeTaskCount = openTasks.filter((task) => task.status === '制作中').length
  const revisionTaskCount = openTasks.filter((task) => task.status === '修改中').length
  const weekCalendarCount = calendarItems.filter((item) => item.completed !== true && isCalendarItemInCurrentWeek(now, item)).length
  const pendingCollectionCount = financeRecords.filter(
    (record) => record.contractAmount > 0 && record.receivedAmount < record.contractAmount,
  ).length
  const pendingInvoiceCount = financeRecords.filter(
    (record) => record.contractAmount > 0 && record.invoiceStatus !== '已开票',
  ).length
  const pendingSettlementCount = financeRecords.filter(
    (record) => record.clientSettlementStatus !== '已结算',
  ).length
  const labelWithCount = (label: string, count: number) => (count > 0 ? `${label} ${count}` : label)

  if (section === 'finance') {
    return [
      { label: labelWithCount('待收款', pendingCollectionCount), prompt: '结合当前财务数据，哪些项目需要跟进收款？' },
      { label: labelWithCount('待开票', pendingInvoiceCount), prompt: '结合当前财务数据，哪些项目需要处理开票？' },
      { label: labelWithCount('待结算', pendingSettlementCount), prompt: '结合当前财务数据，整理需要跟进的结算事项。' },
    ]
  }
  if (section === 'calendar') {
    return [
      { label: labelWithCount('本周节点', weekCalendarCount), prompt: '结合当前交付日历，整理本周的关键节点。' },
      { label: '临期安排', prompt: '哪些交付节点即将到期，需要优先关注？' },
      { label: '整理日程', prompt: '按项目整理接下来的交付日程。' },
    ]
  }
  if (section === 'tasks' || role === 'member') {
    return [
      { label: labelWithCount(role === 'member' ? '我的待办' : '待办', openTasks.length), prompt: '按优先级整理我当前需要处理的任务。' },
      { label: labelWithCount('制作中', activeTaskCount), prompt: '哪些任务正在制作中，当前进度如何？' },
      { label: labelWithCount('修改中', revisionTaskCount), prompt: '哪些任务处于修改中，需要关注什么？' },
    ]
  }
  if (section === 'projects') {
    return [
      { label: '项目概况', prompt: '结合当前可见数据，概括项目整体进度。' },
      { label: labelWithCount('风险项目', riskCount), prompt: '哪些项目存在风险？请说明判断依据和建议。' },
      { label: labelWithCount('待反馈', waitingCount), prompt: '哪些项目正在等待反馈，下一步应该如何跟进？' },
    ]
  }
  if (section === 'team' || section === 'people') {
    return [
      { label: '人员负载', prompt: '结合当前任务，分析团队成员的工作负载。' },
      { label: labelWithCount('待办任务', openTasks.length), prompt: '当前待办任务主要集中在哪些人员和项目？' },
      { label: labelWithCount('项目风险', riskCount), prompt: '哪些风险项目可能与人员负载有关？' },
    ]
  }
  if (section === 'archive') {
    return [
      { label: '项目复盘', prompt: '根据当前可见信息，给出项目复盘的整理框架。' },
      { label: '归档检查', prompt: '项目归档前通常还需要确认哪些事项？' },
      { label: '经验总结', prompt: '帮我整理一份适用于已完成项目的经验总结提纲。' },
    ]
  }

  return [
    {
      label: riskCount > 0 ? `风险项目 ${riskCount}` : '项目概况',
      prompt: riskCount > 0 ? '哪些项目存在风险？请说明判断依据和建议。' : '结合当前可见数据，概括项目整体进度。',
    },
    { label: labelWithCount('待办任务', openTasks.length), prompt: '结合当前项目和任务，今天优先处理什么？' },
    { label: labelWithCount('本周节点', weekCalendarCount), prompt: '结合当前交付日历，整理本周的关键节点。' },
  ]
}

function assistantReply(
  prompt: string,
  role: Role,
  section: Section,
  projects: Project[],
  tasks: Task[],
  calendarItems: CalendarItem[],
  financeRecords: FinanceRecord[],
  canCreateProject: boolean,
) {
  const riskProjects = projects.filter((project) => isProjectAtRisk(project, new Date(), calendarItems))
  const waitingProjects = projects.filter(isWaitingProject)
  const revisionTasks = tasks.filter((task) => task.status === '修改中')
  const activeTasks = tasks.filter((task) => task.status === '制作中' || task.status === '未开始')
  const financeRisks = financeRecords.filter((record) => record.settlementStatus === '逾期' || record.invoiceStatus !== '已开票')
  const lowerPrompt = prompt.toLowerCase()
  const canAnswerLocally = /新建项目|创建项目|立项|录入项目|款|开票|财务|交付|日程|撞期|任务|项目|风险|反馈|优先|今天|安排|进度|状态|延期|归档|负责人|项目经理|拍摄|素材|收款|合同|怎么用|如何使用|使用说明|单人模式|团队模式|数据保存|权限|账号管理|人员管理|选项管理|软件更新/.test(prompt)

  if (/智障|傻|乱答|不对|驴唇不对马嘴/.test(prompt)) {
    return [
      '这个问题我现在答得不够准。',
      '我可以整理项目、任务、交付日历、财务提醒，或打开新建项目窗口。',
      '其他问题我会尽量明确说明，避免给出没把握的回答。',
    ].join('\n')
  }

  if (!canAnswerLocally) {
    return [
      '这个问题我现在还不能准确回答。',
      '你可以这样问我：今天优先处理什么、哪些项目需要关注、我有哪些任务、哪些款项要跟进，或者让我新建项目。',
      '切换到在线 AI 或本地模型后，还可以粘贴聊天记录并提取交付日历候选。',
    ].join('\n')
  }

  if (/怎么用|如何使用|使用说明|单人模式|团队模式|数据保存|权限|账号管理|人员管理|选项管理|软件更新/.test(prompt)) {
    return [
      'CrewFlow 的常用顺序是：选择单人或团队模式，登录后配置人员与账号，再新建项目、设置任务和交付节点，最后在任务面板、交付日历、团队负载和财务页面持续更新。',
      '单人模式的数据只保存在当前电脑；团队模式由一台常驻电脑开启 CrewFlow Server，其他电脑填写服务地址连接。',
      '左侧底部可以随时打开“使用说明”，里面有安装、角色权限、数据备份、团队部署和更新方法。',
    ].join('\n')
  }

  if (/新建项目|创建项目|立项|录入项目/.test(prompt)) {
    if (!canCreateProject) {
      return '当前账号没有新建项目权限。你可以让我查询自己的任务、交付节点或当前可见项目。'
    }

    return [
      '已打开新建项目窗口。你可以先在窗口里确认信息。',
      '也可以按这个格式发我，我后续会继续增强为项目草稿：',
      '项目名称：',
      '客户单位：',
      '项目类型：',
      '项目负责人：',
      '交付日期：2026-07-03',
      '任务分工：方案、执行、审核',
      '项目文件夹：',
    ].join('\n')
  }

  if (section === 'finance' || prompt.includes('款') || prompt.includes('开票')) {
    return [
      `财务侧当前有 ${financeRisks.length} 个项目需要跟进。`,
      ...financeRisks.slice(0, 3).map((record) => {
        const project = projects.find((item) => item.id === record.projectId) ?? projects[0]
        return `${project.name}：${record.settlementStatus}，开票 ${record.invoiceStatus}。`
      }),
      '建议先处理逾期收款，再处理待开票。'
    ].join('\n')
  }

  if (section === 'calendar' || prompt.includes('交付') || prompt.includes('日程') || prompt.includes('撞期')) {
    const busyDays = Array.from(new Set(calendarItems.map((item) => item.time.split(' ')[0]))).slice(0, 4)
    return [
      `当前可见交付节点 ${calendarItems.length} 个，涉及 ${new Set(calendarItems.map((item) => item.projectId)).size} 个项目。`,
      busyDays.length > 0 ? `重点日期：${busyDays.join('、')}。` : '暂时没有明确交付节点。',
      '建议项目负责人提前确认反馈窗口，避免审核和最终交付集中在同一天。'
    ].join('\n')
  }

  if (section === 'tasks' || role === 'member' || lowerPrompt.includes('task') || prompt.includes('任务')) {
    return [
      `你当前可见任务 ${tasks.length} 个，其中制作中/未开始 ${activeTasks.length} 个，修改中 ${revisionTasks.length} 个。`,
      ...activeTasks.slice(0, 3).map((task) => `${task.assignee}：${task.title}，截止 ${task.due}。`),
      revisionTasks.length > 0 ? `需要先盯修改：${revisionTasks.map((task) => task.title).join('、')}。` : '当前没有修改中的任务，可以按交付时间推进。'
    ].join('\n')
  }

  return [
    `当前可见项目 ${projects.length} 个，风险/延期 ${riskProjects.length} 个，等反馈 ${waitingProjects.length} 个。`,
    riskProjects.length > 0 ? `优先盯：${riskProjects.map((project) => project.name).join('、')}。` : '目前没有明显风险项目。',
    waitingProjects.length > 0 ? `需要催反馈：${waitingProjects.map((project) => project.name).join('、')}。` : '当前等待反馈压力不高。',
    '建议今天先看需要关注项目的下一节点，再确认任务是否已经指派到具体执行人。'
  ].join('\n')
}

function FinanceMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof DollarSign
  label: string
  value: string
  tone: string
}) {
  return (
    <section className={`financeMetric span3 ${tone}`}>
      <Icon size={22} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </section>
  )
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: typeof AlertTriangle; label: string; value: string; tone: string }) {
  return (
    <section className={`metricCard span3 ${tone}`}>
      <div className="metricGlow" />
      <Icon size={22} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </section>
  )
}

function formatMoney(value: number) {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(value % 10000 === 0 ? 0 : 1)}万`
  }

  return `${value.toLocaleString('zh-CN')}元`
}

function financeTone(status: FinanceRecord['settlementStatus']) {
  if (status === '逾期') return 'danger'
  if (status === '待收款') return 'warn'
  if (status === '待开票') return 'wait'
  return 'ok'
}

function financeSettlementStatus(record: FinanceRecord): FinanceRecord['settlementStatus'] {
  const unpaidAmount = Math.max(0, record.contractAmount - record.receivedAmount)
  if (record.settlementStatus === '逾期' && unpaidAmount > 0) return '逾期'
  if (record.contractAmount <= 0) return record.settlementStatus
  if (record.invoiceStatus !== '已开票') return '待开票'
  if (unpaidAmount > 0) return '待收款'
  return '正常'
}

function syncFinanceSettlementStatus(record: FinanceRecord): FinanceRecord {
  return {
    ...record,
    settlementStatus: financeSettlementStatus(record),
  }
}

function archiveFinanceState(record: FinanceRecord) {
  if (record.contractAmount <= 0) return { label: '财务待录入', tone: 'wait' }
  if (financeSettlementStatus(record) === '逾期') return { label: '财务逾期', tone: 'danger' }

  const clientSettled = record.clientSettlementStatus === '已结算' || record.receivedAmount >= record.contractAmount
  const outsourceSettled = record.payableAmount <= 0 || record.outsourcedSettlementStatus === '已结算'
  if (clientSettled && outsourceSettled) return { label: '财务已结清', tone: 'ok' }

  return { label: '财务未结清', tone: 'warn' }
}

const financeActionConfig: Record<FinanceAction, { title: string; defaultTitle: string; notePlaceholder: string }> = {
  payment: { title: '新增收款', defaultTitle: '甲方收款', notePlaceholder: '例如：二期款到账，待确认回单' },
  invoice: { title: '新增开票', defaultTitle: '开票记录', notePlaceholder: '例如：专票，已发送给甲方' },
}

function emptyFinanceLedger() {
  return {
    payments: [] as FinanceLedgerEntry[],
    invoices: [] as FinanceLedgerEntry[],
    outsourcing: [] as FinanceLedgerEntry[],
    followUps: [] as FinanceLedgerEntry[],
  }
}

function financeLedgerKey(action: FinanceAction): keyof ReturnType<typeof emptyFinanceLedger> {
  if (action === 'payment') return 'payments'
  return 'invoices'
}

function createBlankFinanceRecord(projectId: string): FinanceRecord {
  return {
    projectId,
    contractName: '',
    contractAmount: 0,
    receivedAmount: 0,
    invoiceAmount: 0,
    quoteStatus: '待制作',
    comparisonStatus: '待制作',
    clientSettlementStatus: '未结算',
    contractStatus: '待签订',
    invoiceStatus: '未开票',
    settlementStatus: '待开票',
    nextCollection: '',
    outsourcedCost: 0,
    outsourcedInvoiceStatus: '无需开票',
    outsourcedSettlementStatus: '未结算',
    payableAmount: 0,
    payableNote: '',
  }
}

function ensureFinanceRecordsForProjects(records: FinanceRecord[], projects: Project[]) {
  const currentByProject = new Map(records.map((record) => [record.projectId, record]))

  return projects.map((project) => normalizeFinanceRecord(currentByProject.get(project.id) ?? createBlankFinanceRecord(project.id)))
}

function normalizeFinanceRecord(record: FinanceRecord): FinanceRecord {
  return syncFinanceSettlementStatus({
    ...createBlankFinanceRecord(record.projectId),
    ...record,
    comparisonStatus: record.comparisonStatus ?? '待制作',
  })
}

function resetProjectDataIfNeeded() {
  if (localStorage.getItem('crewflow-project-data-version') === projectDataStorageVersion) return

  localStorage.setItem('crewflow-project-data-version', projectDataStorageVersion)
}

function loadStoredProjects() {
  try {
    resetProjectDataIfNeeded()
    const saved = localStorage.getItem('crewflow-projects')
    if (!saved) return projects

    return (JSON.parse(saved) as Project[]).map(normalizeProject)
  } catch {
    return projects
  }
}

function normalizeProject(project: Project): Project {
  const workStatus = normalizeNodeStatus(project.workStatus)
  const storedHealthStatus = normalizeProjectHealthStatus(project.status)
  const healthStatus =
    project.healthStatusExplicit === true
      ? storedHealthStatus
      : storedHealthStatus === 'normal' && (workStatus === '等甲方反馈' || workStatus === '等内部确认')
        ? 'waiting'
        : storedHealthStatus

  return {
    ...project,
    client: project.client ?? '',
    clientContact: project.clientContact ?? '',
    path: project.path ?? '',
    additionalPaths: uniqueProjectPaths(Array.isArray(project.additionalPaths) ? project.additionalPaths : [], project.path ?? ''),
    calendarTitle: project.calendarTitle ?? milestoneTitleFrom(project.nextMilestone ?? project.stage),
    creatorAccountId: project.creatorAccountId,
    status: healthStatus,
    healthStatusExplicit: true,
    workStatus,
    stage: normalizeProjectStage(project.stage),
  }
}

function normalizeProjectHealthStatus(status: unknown): ProjectHealthStatus {
  if (status === 'risk' || status === 'waiting') return status
  return 'normal'
}

function projectDeliveryCalendarItem(project: Project): CalendarItem | null {
  if (!project.due) return null

  const dueDate = new Date(project.due)
  if (Number.isNaN(dueDate.getTime())) return null

  const title = project.calendarTitle?.trim() || milestoneTitleFrom(project.nextMilestone) || project.stage || '交付节点'

  return {
    id: `C-delivery-${project.id}`,
    date: project.due,
    isFinalDelivery: true,
    completed: false,
    projectId: project.id,
    day: dueDate.getDate(),
    time: formatMonthDay(dueDate),
    project: project.name,
    title,
    type: project.stage || '交付节点',
    owner: project.manager || project.owner,
  }
}

function ensureProjectCalendarItems(projects: Project[], calendarItems: CalendarItem[]) {
  let changed = false
  const normalizedItems = [...calendarItems]
  const missingDeliveryItems: CalendarItem[] = []

  projects.forEach((project) => {
    const projectItemIndexes = normalizedItems
      .map((item, index) => (item.projectId === project.id ? index : -1))
      .filter((index) => index >= 0)
    if (projectItemIndexes.some((index) => normalizedItems[index].isFinalDelivery === true)) return

    const legacyPrimaryIndex = projectItemIndexes.find((index) =>
      isPrimaryProjectCalendarItem(normalizedItems[index], project),
    )
    if (legacyPrimaryIndex !== undefined) {
      normalizedItems[legacyPrimaryIndex] = {
        ...normalizedItems[legacyPrimaryIndex],
        isFinalDelivery: true,
      }
      changed = true
      return
    }

    if (projectItemIndexes.length > 0) {
      const latestItemIndex = projectItemIndexes
        .map((index) => ({ index, date: dateForCalendarItem(new Date(), normalizedItems[index]) }))
        .filter((entry) => /^\d{4}-\d{2}-\d{2}/.test(entry.date))
        .sort((left, right) => left.date.localeCompare(right.date))
        .at(-1)?.index
      if (latestItemIndex !== undefined) {
        normalizedItems[latestItemIndex] = {
          ...normalizedItems[latestItemIndex],
          isFinalDelivery: true,
        }
        changed = true
        return
      }
    }

    const deliveryItem = projectDeliveryCalendarItem(project)
    if (deliveryItem) {
      missingDeliveryItems.push(deliveryItem)
      changed = true
    }
  })

  return changed ? [...missingDeliveryItems, ...normalizedItems] : calendarItems
}

function reconcileProjectTimelines(projects: Project[], calendarItems: CalendarItem[], today = new Date()) {
  let changed = false
  const nextProjects = projects.map((project) => {
    if (isArchivedProject(project)) return project

    const finalDeliveryItem =
      calendarItems.find((item) => item.projectId === project.id && item.isFinalDelivery === true) ??
      calendarItems.find((item) => item.projectId === project.id && isPrimaryProjectCalendarItem(item, project))
    if (!finalDeliveryItem) return project

    const finalDeliveryDate = dateForCalendarItem(today, finalDeliveryItem).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
    if (!finalDeliveryDate) return project

    const milestoneTitle = finalDeliveryItem.title.trim() || finalDeliveryItem.type.trim() || project.stage
    const milestoneDate = new Date(`${finalDeliveryDate}T00:00:00`)
    const nextMilestone = `${formatMonthDay(milestoneDate)} ${milestoneTitle}`
    if (
      project.due === finalDeliveryDate &&
      project.nextMilestone === nextMilestone &&
      project.calendarTitle === milestoneTitle
    ) {
      return project
    }

    changed = true
    return {
      ...project,
      due: finalDeliveryDate,
      nextMilestone,
      calendarTitle: milestoneTitle,
    }
  })

  return changed ? nextProjects : projects
}

function isArchivedProject(project: Project) {
  return project.stage === '归档完成' || project.workStatus === '已完成'
}

function isWaitingProject(project: Project) {
  return project.status === 'waiting' || project.workStatus === '等甲方反馈' || project.workStatus === '等内部确认'
}

function isRiskProject(project: Project) {
  return project.status === 'risk'
}

function hasOverdueProjectNode(project: Project, calendarItems: CalendarItem[], today = new Date()) {
  if (isArchivedProject(project)) return false
  const todayKey = localDateKey(today)

  return calendarItems.some((item) => {
    if (item.projectId !== project.id || item.completed === true || isPrimaryProjectCalendarItem(item, project)) return false
    const itemDate = dateForCalendarItem(today, item).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
    return Boolean(itemDate && itemDate < todayKey)
  })
}

function isLateProject(project: Project, today = new Date(), calendarItems: CalendarItem[] = []) {
  if (isArchivedProject(project)) return false
  const finalDeliveryItem = calendarItems.find(
    (item) => item.projectId === project.id && isPrimaryProjectCalendarItem(item, project),
  )
  if (finalDeliveryItem?.completed === true) return false

  const dueDateKey = project.due.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  return Boolean(dueDateKey && dueDateKey < localDateKey(today))
}

function isProjectAtRisk(project: Project, today = new Date(), calendarItems: CalendarItem[] = []) {
  return isRiskProject(project) || isLateProject(project, today, calendarItems) || hasOverdueProjectNode(project, calendarItems, today)
}

function projectHealthStatus(project: Project): ProjectHealthStatus {
  if (project.status === 'risk') return 'risk'
  if (project.status === 'waiting') return 'waiting'
  return 'normal'
}

function projectDisplayStatus(project: Project, today = new Date(), calendarItems: CalendarItem[] = []): ProjectStatus {
  if (isLateProject(project, today, calendarItems)) return 'late'
  if (isRiskProject(project) || hasOverdueProjectNode(project, calendarItems, today)) return 'risk'
  if (isWaitingProject(project)) return 'waiting'
  return 'normal'
}

function progressForProject(project: Project, workflowStages: string[]) {
  if (project.workStatus === '已完成' || isArchivedProject(project)) return 100
  const currentStageIndex = workflowStages.indexOf(project.stage)
  if (currentStageIndex < 0 || workflowStages.length === 0) return Math.min(100, Math.max(0, project.progress))

  return Math.round(((currentStageIndex + 1) / workflowStages.length) * 100)
}

function projectPriorityScore(project: Project, calendarItems: CalendarItem[] = []) {
  if (isLateProject(project, new Date(), calendarItems)) return 40
  if (isRiskProject(project) || hasOverdueProjectNode(project, calendarItems)) return 30
  if (isWaitingProject(project)) return 20
  if (project.workStatus === '进行中') return 10
  return 0
}

function filterProjects(
  projectList: Project[],
  query: string,
  status: ProjectFilterStatus,
  type: string,
  searchMatchedProjectIds: Set<string> | null,
  today: Date,
  calendarItems: CalendarItem[],
) {
  return projectList.filter((project) => {
    if (type !== '全部类型' && project.type !== type) return false
    if (status === 'archived' && !isArchivedProject(project)) return false
    if (status !== 'archived' && status !== 'all' && isArchivedProject(project)) return false
    if (status === 'normal' && projectDisplayStatus(project, today, calendarItems) !== 'normal') return false
    if (status === 'risk' && !isProjectAtRisk(project, today, calendarItems)) return false
    if (status === 'late' && !isLateProject(project, today, calendarItems)) return false
    if (status === 'waiting' && !isWaitingProject(project)) return false

    if (!query.trim()) return true
    return projectMatchesSearch(project, query) || Boolean(searchMatchedProjectIds?.has(project.id))
  })
}

function compareProjectsByFinalDelivery(left: Project, right: Project) {
  const leftDue = left.due.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
  const rightDue = right.due.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''

  if (leftDue && rightDue && leftDue !== rightDue) return leftDue.localeCompare(rightDue)
  if (leftDue) return -1
  if (rightDue) return 1

  const nameOrder = left.name.localeCompare(right.name, 'zh-CN')
  return nameOrder || left.id.localeCompare(right.id)
}

function projectMatchesSearch(project: Project, query: string) {
  const cleanQuery = query.trim().toLowerCase()
  if (!cleanQuery) return true

  return [
    project.id,
    project.name,
    project.type,
    project.client,
    project.manager,
    project.owner,
    project.stage,
    project.workStatus,
    project.nextMilestone,
    project.path,
    ...(project.additionalPaths ?? []),
  ]
    .join(' ')
    .toLowerCase()
    .includes(cleanQuery)
}

function taskMatchesSearch(task: Task, project: Project | undefined, query: string) {
  const cleanQuery = query.trim().toLowerCase()
  if (!cleanQuery) return true

  return [
    task.title,
    task.project,
    task.assignee,
    task.due,
    task.status,
    task.note,
    task.evidencePath,
    project?.name,
    project?.client,
    project?.path,
    ...(project?.additionalPaths ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(cleanQuery)
}

function calendarItemMatchesSearch(item: CalendarItem, project: Project | undefined, query: string) {
  const cleanQuery = query.trim().toLowerCase()
  if (!cleanQuery) return true

  return [item.project, item.title, item.type, item.owner, item.time, project?.name, project?.client, project?.path, ...(project?.additionalPaths ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(cleanQuery)
}

function normalizeNodeStatus(status: string): WorkStatus {
  if (defaultNodeStatusOptions.includes(status as WorkStatus)) return status as WorkStatus
  if (status === '等反馈') return '等甲方反馈'
  if (status === '已完成') return '已完成'
  if (status === '进行中') return '进行中'
  return '未开始'
}

function normalizeProjectStage(stage: string) {
  const stageMap: Record<string, string> = {
    脚本撰写: '方案/脚本',
    策划方案: '方案/脚本',
    文案撰写: '方案/脚本',
    结构梳理: '方案/脚本',
    调研采访: '方案/脚本',
    拍摄筹备: '拍摄计划',
    初剪: '粗剪',
    后期剪辑: '精剪',
    包装: '包装/调色',
    'A-copy': '甲方审核',
    'B-copy': '修改执行',
    修改中: '修改执行',
    客户反馈: '甲方审核',
    成片交付: '成片交付',
    复盘归档: '归档完成',
    定稿交付: '定稿交付',
  }

  return stageMap[stage] ?? stage
}

function isPrimaryProjectCalendarItem(item: CalendarItem, previousProject: Project) {
  if (item.projectId !== previousProject.id) return false
  if (item.isFinalDelivery === true) return true
  if (item.isFinalDelivery === false) return false

  const previousDueKey = previousProject.due.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
  const itemDateKey = item.date?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
  const previousDueDate = new Date(`${previousDueKey}T00:00:00`)
  if (!previousDueKey || Number.isNaN(previousDueDate.getTime())) return false
  if (itemDateKey && itemDateKey !== previousDueKey) return false

  const previousDueText = formatMonthDay(previousDueDate)
  const previousMilestoneTitle = previousProject.calendarTitle?.trim() || milestoneTitleFrom(previousProject.nextMilestone)
  const hasPrimaryIdentity =
    item.id === `C-delivery-${previousProject.id}` ||
    (Boolean(previousMilestoneTitle) && item.title.trim() === previousMilestoneTitle) ||
    (!previousMilestoneTitle && (item.type === previousProject.stage || item.type === '立项节点')) ||
    (!itemDateKey && item.time === previousDueText && item.title.trim() === previousMilestoneTitle)

  return (
    (itemDateKey === previousDueKey || item.day === previousDueDate.getDate()) &&
    hasPrimaryIdentity
  )
}

function milestoneTitleFrom(nextMilestone: string) {
  return nextMilestone.replace(/^\d+月\d+日\s*/, '').trim()
}

function calendarItemKey(item: CalendarItem) {
  return item.id ?? `${item.projectId}-${item.day}-${item.time}-${item.title}-${item.type}-${item.owner}`
}

function dateForCalendarItem(now: Date, item: CalendarItem) {
  if (item.date) return item.date

  const date = new Date(now)
  if (item.day < now.getDate()) date.setMonth(date.getMonth() + 1)
  date.setDate(item.day)
  return localDateKey(date)
}

function isCalendarItemInCurrentWeek(now: Date, item: CalendarItem) {
  const weekStart = new Date(now)
  const daysSinceMonday = (weekStart.getDay() + 6) % 7
  weekStart.setDate(weekStart.getDate() - daysSinceMonday)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = addDays(weekStart, 6)
  const itemDateKey = dateForCalendarItem(now, item).match(/^\d{4}-\d{2}-\d{2}/)?.[0]

  return Boolean(itemDateKey && itemDateKey >= localDateKey(weekStart) && itemDateKey <= localDateKey(weekEnd))
}

function isCalendarItemOnDate(now: Date, item: CalendarItem, date: Date) {
  return dateForCalendarItem(now, item) === localDateKey(date)
}

function loadStoredTasks() {
  try {
    resetProjectDataIfNeeded()
    const saved = localStorage.getItem('crewflow-tasks')
    if (!saved) return tasks

    return (JSON.parse(saved) as Task[]).map((task) => ({
      ...task,
      status: normalizeTaskStatus(task.status),
    }))
  } catch {
    return tasks
  }
}

function normalizeTaskStatus(status: string): TaskStatus {
  if (status === '制作中' || status === '未开始' || status === '修改中' || status === '已完成') return status
  if (status === '进行中') return '制作中'
  if (status === '卡住') return '修改中'
  return '未开始'
}

function uniqueCleanOptions(options: string[], fallback: string[]) {
  const cleaned = options.map((item) => item.trim()).filter(Boolean)
  const unique = Array.from(new Set(cleaned))
  return unique.length > 0 ? unique : fallback
}

function ensureProtectedStaffTags(options: string[]) {
  const nextOptions = [...options]
  protectedStaffTags.forEach((tag) => {
    if (!nextOptions.includes(tag)) nextOptions.push(tag)
  })
  return nextOptions
}

function normalizeWorkflowOptionList(category: WorkflowOptionCategory, options: string[]) {
  const rawOptions = Array.isArray(options) ? options : []
  const normalized = uniqueCleanOptions(rawOptions, defaultWorkflowOptions[category])
  return category === 'staffTags' ? ensureProtectedStaffTags(normalized) : normalized
}

function isProtectedWorkflowOption(category: WorkflowOptionCategory, value: string) {
  return category === 'staffTags' && protectedStaffTags.includes(value)
}

function normalizeCustomerGroups(groups: CustomerGroups | undefined): CustomerGroups {
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) return defaultCustomerGroups

  const normalized: CustomerGroups = {}
  Object.entries(groups).forEach(([province, customers]) => {
    const cleanProvince = province.trim()
    if (!cleanProvince) return

    const currentCustomers = normalized[cleanProvince] ?? []
    const nextCustomers = Array.isArray(customers) ? uniqueCleanOptions([...currentCustomers, ...customers], []) : currentCustomers
    normalized[cleanProvince] = nextCustomers
  })

  return normalized
}

function normalizeWorkflowOptions(options: Partial<WorkflowOptions> | undefined): WorkflowOptions {
  const primaryCustomerLabel = options?.customerFieldLabels?.primary?.trim()
  const secondaryCustomerLabel = options?.customerFieldLabels?.secondary?.trim()
  return {
    taskWorkTypes: normalizeWorkflowOptionList('taskWorkTypes', options?.taskWorkTypes ?? []),
    nodeStatuses: normalizeWorkflowOptionList('nodeStatuses', options?.nodeStatuses ?? []),
    workflowStages: normalizeWorkflowOptionList('workflowStages', options?.workflowStages ?? []),
    staffTags: normalizeWorkflowOptionList('staffTags', options?.staffTags ?? []),
    projectTypes: normalizeWorkflowOptionList('projectTypes', options?.projectTypes ?? []),
    customerGroups: normalizeCustomerGroups(options?.customerGroups),
    customerFieldLabels: {
      primary: primaryCustomerLabel || defaultWorkflowOptions.customerFieldLabels.primary,
      secondary: secondaryCustomerLabel || defaultWorkflowOptions.customerFieldLabels.secondary,
    },
  }
}

function optionsWithCurrent(options: string[], current: string) {
  if (!current.trim()) return options
  return options.includes(current) ? options : [current, ...options]
}

function renameTaskTitle(title: string, previousWorkType: string, nextWorkType: string) {
  if (title.endsWith(` ${previousWorkType}`)) {
    return `${title.slice(0, -previousWorkType.length).trimEnd()} ${nextWorkType}`
  }

  return title.replaceAll(previousWorkType, nextWorkType)
}

function renameWorkflowText(text: string, renameMap: Map<string, string>) {
  let nextText = text
  renameMap.forEach((nextValue, previousValue) => {
    nextText = nextText.replaceAll(previousValue, nextValue)
  })
  return nextText
}

function taskWorkType(task: Task, project: Project, options = defaultTaskWorkOptions) {
  if (task.workType && options.includes(task.workType)) return task.workType
  if (task.workType) return task.workType

  const cleanTitle = task.title.replace(project.name, '').trim()
  const matchedType = options.find((option) => cleanTitle === option || cleanTitle.includes(option))
  return matchedType ?? options[0] ?? defaultTaskWorkOptions[0]
}

function teamTaskDescription(task: Task, project: Project, options = defaultTaskWorkOptions) {
  const workType = taskWorkType(task, project, options)
  const title = task.title.trim()
  const projectPrefix = project.name.trim()
  const detail = projectPrefix && title.startsWith(projectPrefix) ? title.slice(projectPrefix.length).trim() : title

  return detail && detail !== workType ? `${workType} · ${detail}` : workType
}

function taskTitleForWorkType(projectName: string, workType: string) {
  return `${projectName} ${workType}`
}

function isExternalTask(task: Task) {
  if (task.assignmentMode) return task.assignmentMode === 'external'
  return task.assignee.startsWith('外包：') || task.note.includes('外包任务')
}

function externalAssigneeName(task: Task) {
  return task.assignee.replace(/^外包：/, '')
}

function staffNameInOptions(name: string | undefined, staffOptions: StaffMember[]) {
  if (!name) return ''
  return staffOptions.some((member) => member.name === name) ? name : ''
}

function normalizeTaskAssigneesForStaff(taskList: Task[], staffOptions: StaffMember[]) {
  const fallbackName = staffOptions[0]?.name ?? ''

  return taskList.map((task) => {
    if (isExternalTask(task)) {
      return {
        ...task,
        assignmentMode: 'external' as AssignmentMode,
      }
    }

    return {
      ...task,
      assignmentMode: 'internal' as AssignmentMode,
      assignee: staffNameInOptions(task.assignee, staffOptions) || fallbackName,
    }
  })
}

function loadStoredCalendarItems() {
  try {
    resetProjectDataIfNeeded()
    const saved = localStorage.getItem('crewflow-calendar-items')
    if (!saved) return calendarItems

    return JSON.parse(saved) as CalendarItem[]
  } catch {
    return calendarItems
  }
}

function loadStoredFinanceRecords() {
  try {
    localStorage.setItem('crewflow-finance-version', financeStorageVersion)

    const saved = localStorage.getItem('crewflow-finance-records')
    if (!saved) return financeRecords

    return (JSON.parse(saved) as FinanceRecord[]).map(normalizeFinanceRecord)
  } catch {
    return financeRecords
  }
}

function loadStoredStaffMembers() {
  try {
    const saved = localStorage.getItem('crewflow-staff-members')
    if (!saved) return staffMembers

    return (JSON.parse(saved) as StaffMember[]).map(normalizeStaffMember)
  } catch {
    return staffMembers
  }
}

function loadStoredAccounts() {
  try {
    const saved = localStorage.getItem('crewflow-accounts')
    if (!saved) return loginAccounts

    return mergeStoredAccounts(JSON.parse(saved) as Account[])
  } catch {
    return loginAccounts
  }
}

function loadStoredHolidayItems() {
  try {
    const saved = localStorage.getItem('crewflow-holiday-items')
    if (!saved) return holidayItems

    return (JSON.parse(saved) as HolidayItem[]).map(normalizeHolidayItem)
  } catch {
    return holidayItems
  }
}

function loadStoredWorkflowOptions() {
  try {
    const saved = localStorage.getItem(workflowOptionsStorageKey)
    if (!saved) return defaultWorkflowOptions

    return normalizeWorkflowOptions(JSON.parse(saved) as WorkflowOptions)
  } catch {
    return defaultWorkflowOptions
  }
}

function mergeStoredAccounts(storedAccounts: Account[]) {
  const normalizedStored = storedAccounts.map(normalizeAccount)
  const storedController = normalizedStored.find((account) => account.role === 'controller')
  const controllerAccount = storedController ?? loginAccounts.find((account) => account.role === 'controller') ?? loginAccounts[0]
  const workAccounts = normalizedStored.filter((account) => account.role !== 'controller' && account.id !== controllerAccount.id)

  return [
    controllerAccount,
    ...workAccounts,
  ]
}

function normalizeAccount(account: Account): Account {
  const defaultAccount = loginAccounts.find((item) => item.id === account.id)
  const role = account.role ?? defaultAccount?.role ?? 'member'

  return {
    ...defaultAccount,
    ...account,
    id: account.id || defaultAccount?.id || `account-${Date.now()}`,
    password: account.password || defaultAccount?.password || '123456',
    role,
    userName: account.userName ?? defaultAccount?.userName ?? '',
    staffId: role === 'controller' ? undefined : (account.staffId ?? defaultAccount?.staffId),
    label: account.label || defaultAccount?.label || roleLabelFor(role),
    title: account.title || defaultAccount?.title || `${roleLabelFor(role)}入口`,
  }
}

function normalizeHolidayItem(item: HolidayItem): HolidayItem {
  return {
    id: item.id || `holiday-${item.date || Date.now()}`,
    date: item.date,
    name: item.name || '节假日',
    type: item.type === '班' ? '班' : '休',
  }
}

function roleLabelFor(role: Role) {
  return roles.find((item) => item.id === role)?.label ?? role
}

function nextAccountId(accounts: Account[], role: Role) {
  const prefix: Record<Role, string> = {
    controller: 'zk',
    admin: 'admin',
    manager: 'pm',
    member: 'member',
    finance: 'finance',
  }
  const base = prefix[role]
  const existingIds = new Set(accounts.map((account) => account.id))

  for (let index = 1; index < 100; index += 1) {
    const candidate = `${base}${String(index).padStart(2, '0')}`
    if (!existingIds.has(candidate)) return candidate
  }

  return `${base}${Date.now().toString().slice(-4)}`
}

function accountDisplayTitle(account: Account | null | undefined, staffList: StaffMember[]) {
  if (!account || account.role === 'controller') return ''

  const boundPerson = account.staffId ? staffList.find((person) => person.id === account.staffId) : null
  return boundPerson ? `关联：${boundPerson.name}` : ''
}

function normalizeStaffMember(member: StaffMember): StaffMember {
  const defaultMember = staffMembers.find((item) => item.id === member.id || item.name === member.name)

  return {
    ...defaultMember,
    ...member,
    id: member.id || defaultMember?.id || `staff-${member.name || Date.now()}`,
    name: member.name ?? defaultMember?.name ?? '',
    tags: member.tags?.length ? member.tags : (defaultMember?.tags ?? ['执行']),
    accountRole: member.accountRole ?? defaultMember?.accountRole ?? 'member',
    status: member.status === '离职' ? '离职' : '在职',
    load: member.load ?? defaultMember?.load ?? 0,
    risk: member.risk ?? defaultMember?.risk ?? 0,
    tasks: member.tasks ?? defaultMember?.tasks ?? 0,
  }
}

function canManageProject(member: StaffMember) {
  return member.tags.includes('项目负责人') || member.tags.includes('项目经理')
}

function isProjectLead(project: Project, personName: string | null | undefined) {
  const cleanName = personName?.trim()
  return Boolean(cleanName && (project.manager === cleanName || project.owner === cleanName))
}

function isAssignableStaff(member: StaffMember) {
  return member.status === '在职' && member.accountRole !== 'controller'
}

function replacePersonInProject(project: Project, previousName: string, nextName: string) {
  return {
    ...project,
    manager: project.manager === previousName ? nextName : project.manager,
    owner: project.owner === previousName ? nextName : project.owner,
  }
}

function replacePersonInTask(task: Task, previousName: string, nextName: string) {
  return {
    ...task,
    assignee: task.assignee === previousName ? nextName : task.assignee,
    note: task.note.replaceAll(previousName, nextName),
  }
}

function replacePersonInCalendarItem(item: CalendarItem, previousName: string, nextName: string) {
  return {
    ...item,
    owner: item.owner === previousName ? nextName : item.owner,
  }
}

function departedPeopleForProject(project: Project, tasks: Task[], calendarItems: CalendarItem[], departedStaff: StaffMember[]) {
  if (isArchivedProject(project)) return []

  const relatedNames = new Set<string>([project.manager, project.owner])
  tasks.filter((task) => task.projectId === project.id).forEach((task) => relatedNames.add(task.assignee))
  calendarItems.filter((item) => item.projectId === project.id).forEach((item) => relatedNames.add(item.owner))

  return departedStaff.filter((person) => relatedNames.has(person.name)).map((person) => person.name)
}

function loadStoredFinanceLedger() {
  try {
    const saved = localStorage.getItem('crewflow-finance-ledger')
    if (!saved) return {}

    return JSON.parse(saved) as FinanceLedger
  } catch {
    return {}
  }
}

function updateFinanceRecord(record: FinanceRecord, action: FinanceAction, entry: FinanceLedgerEntry): FinanceRecord {
  const amount = entry.amount ?? 0

  if (action === 'payment') {
    const receivedAmount = record.receivedAmount + amount
    return syncFinanceSettlementStatus({
      ...record,
      receivedAmount,
      clientSettlementStatus: receivedAmount >= record.contractAmount ? '已结算' : '部分结算',
      settlementStatus: receivedAmount >= record.contractAmount ? '正常' : '待收款',
    })
  }

  if (action === 'invoice') {
    const invoiceAmount = record.invoiceAmount + amount
    return syncFinanceSettlementStatus({
      ...record,
      invoiceAmount,
      invoiceStatus: invoiceAmount >= record.contractAmount ? '已开票' : '部分开票',
      settlementStatus: invoiceAmount >= record.contractAmount ? record.settlementStatus : '待开票',
    })
  }

  return {
    ...record,
  }
}

function reverseFinanceRecord(record: FinanceRecord, action: FinanceAction, entry: FinanceLedgerEntry): FinanceRecord {
  const amount = entry.amount ?? 0

  if (action === 'payment') {
    const receivedAmount = Math.max(0, record.receivedAmount - amount)
    return syncFinanceSettlementStatus({
      ...record,
      receivedAmount,
      clientSettlementStatus: receivedAmount <= 0 ? '未结算' : receivedAmount >= record.contractAmount ? '已结算' : '部分结算',
      settlementStatus: receivedAmount >= record.contractAmount ? '正常' : '待收款',
    })
  }

  if (action === 'invoice') {
    const invoiceAmount = Math.max(0, record.invoiceAmount - amount)
    return syncFinanceSettlementStatus({
      ...record,
      invoiceAmount,
      invoiceStatus: invoiceAmount <= 0 ? '未开票' : invoiceAmount >= record.contractAmount ? '已开票' : '部分开票',
    })
  }

  return record
}

function compactFileName(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath
}

function formatCollectionPlan(date?: string, note?: string) {
  const cleanDate = date ? formatMonthDay(new Date(date)) : ''
  const cleanNote = note?.trim() ?? ''

  return [cleanDate, cleanNote].filter(Boolean).join(' ')
}

function Widget({ icon: Icon, title, value, note, onClick }: { icon: typeof CloudSun; title: string; value: string; note: string; onClick?: () => void }) {
  const content = (
    <>
      <Icon size={20} />
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <p>{note}</p>
      </div>
    </>
  )

  if (onClick) {
    return (
      <button className="widget widgetButton" type="button" onClick={onClick} title={`设置${title}`}>
        {content}
      </button>
    )
  }

  return <div className="widget">{content}</div>
}

function TaskRows({
  tasks,
  large = false,
  onUpdateTaskStatus,
  emptyTitle = '暂无任务',
  emptyNote = '项目经理分派后，相关人员会在这里看到自己的任务。',
}: {
  tasks: Task[]
  large?: boolean
  onUpdateTaskStatus?: (taskId: string, status: TaskStatus) => void
  emptyTitle?: string
  emptyNote?: string
}) {
  return (
    <div className={large ? 'taskRows large' : 'taskRows'}>
      {tasks.length === 0 && <EmptyState title={emptyTitle} note={emptyNote} />}
      {tasks.map((task) => (
        <article key={task.id} className="taskRow">
          <div className={`taskStatus ${task.status}`} />
          <div>
            <strong>{task.title}</strong>
            <span>
              {task.project} · {task.assignee}
            </span>
            {large && <p>{task.note}</p>}
          </div>
          <span>{task.due}</span>
          {onUpdateTaskStatus ? (
            <select className={`taskStatusSelect task-${task.status}`} value={task.status} onChange={(event) => onUpdateTaskStatus(task.id, event.target.value as TaskStatus)}>
              {taskStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          ) : (
            <span className={`pill task-${task.status}`}>{task.status}</span>
          )}
        </article>
      ))}
    </div>
  )
}

function Timeline({ calendarItems }: { calendarItems: CalendarItem[] }) {
  return (
    <div className="timeline">
      {calendarItems.length === 0 && <EmptyState title="暂无交付节点" note="新建项目后设置交付日历，这里会显示具体项目和流程节点。" />}
      {calendarItems.map((item) => (
        <div key={calendarItemKey(item)} className="timelineItem">
          <div className="timelineDate">
            <span>{item.time}</span>
            <small title={item.type || '交付节点'}>{item.type || '交付节点'}</small>
          </div>
          <div className="timelineContent">
            <div className="timelineTitleRow">
              <strong title={item.title}>{item.title}</strong>
              <span className="timelineOwner" title={`负责人：${item.owner || '未分配'}`}>
                负责人 · {item.owner || '未分配'}
              </span>
            </div>
            <p title={item.project}>{item.project || '未命名项目'}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ title, note }: { title: string; note: string }) {
  return (
    <div className="emptyState">
      <strong>{title}</strong>
      <span>{note}</span>
    </div>
  )
}

function currentExecutorForProject(projectId: string, allTasks: Task[], allProjects: Project[]) {
  const activeTasks = allTasks.filter((task) => task.projectId === projectId && task.status !== '已完成')
  if (activeTasks.length === 0) {
    return allProjects.find((project) => project.id === projectId)?.owner ?? '待指派'
  }

  return Array.from(new Set(activeTasks.map((task) => task.assignee))).join('、')
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="infoLine">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatFullDate(date: Date) {
  const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getDay()]

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekday}`
}

function formatClock(date: Date) {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function weatherDescription(code: number) {
  if (code === 0) return '晴'
  if (code === 1) return '晴间多云'
  if (code === 2) return '多云'
  if (code === 3) return '阴'
  if (code === 45 || code === 48) return '雾'
  if (code >= 51 && code <= 55) return '毛毛雨'
  if (code === 56 || code === 57 || code === 66 || code === 67) return '冻雨'
  if (code >= 61 && code <= 65) return '雨'
  if (code >= 71 && code <= 75) return '雪'
  if (code === 77) return '雪粒'
  if (code >= 80 && code <= 82) return '阵雨'
  if (code === 85 || code === 86) return '阵雪'
  if (code === 95) return '雷雨'
  if (code === 96 || code === 99) return '雷雨伴冰雹'
  return '天气更新'
}

function weatherLocationRegion(location: WeatherLocation) {
  return Array.from(new Set([location.admin1, location.country].filter((item) => item && item !== location.name))).join(' · ') || '地区信息暂缺'
}

function weatherLocationDisplay(location: WeatherLocation) {
  const region = weatherLocationRegion(location)
  return region === '地区信息暂缺' ? location.name : `${location.name} · ${region}`
}

function weatherCardContent(
  location: WeatherLocation | null,
  snapshot: WeatherSnapshot | null,
  status: WeatherStatus,
  error: string,
) {
  if (!location) return { value: '设置城市', note: '点击选择所在城市' }

  const matchingSnapshot = snapshot?.locationKey === weatherLocationKey(location) ? snapshot : null
  if (!matchingSnapshot) {
    if (status === 'error') return { value: '暂时无法更新', note: `${location.name} · 点击切换城市` }
    return { value: '正在获取', note: weatherLocationDisplay(location) }
  }

  const suffix = status === 'loading' ? ' · 更新中' : status === 'error' || error ? ' · 使用缓存' : ''
  return {
    value: `${Math.round(matchingSnapshot.temperature)}°C ${weatherDescription(matchingSnapshot.weatherCode)}`,
    note: `${location.name} · 体感 ${Math.round(matchingSnapshot.apparentTemperature)}°C · 风 ${Math.round(matchingSnapshot.windSpeed)} km/h${suffix}`,
  }
}

function clockTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function formatScheduleDuration(totalMinutes: number) {
  const roundedMinutes = Math.max(1, Math.ceil(totalMinutes))
  const hours = Math.floor(roundedMinutes / 60)
  const minutes = roundedMinutes % 60

  if (hours === 0) return `${minutes}分钟`
  if (minutes === 0) return `${hours}小时`
  return `${hours}小时 ${minutes}分钟`
}

function workScheduleStatus(date: Date, schedule: WorkSchedule) {
  const startMinutes = clockTimeToMinutes(schedule.start)
  const endMinutes = clockTimeToMinutes(schedule.end)
  const currentMinutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
  const worksOvernight = startMinutes > endMinutes
  const isWorking = worksOvernight
    ? currentMinutes >= startMinutes || currentMinutes < endMinutes
    : currentMinutes >= startMinutes && currentMinutes < endMinutes
  const targetMinutes = isWorking ? endMinutes : startMinutes
  const remainingMinutes = (targetMinutes - currentMinutes + 24 * 60) % (24 * 60)
  const targetLabel = isWorking ? '下班' : '上班'

  return `${schedule.start}–${schedule.end} · 距离${targetLabel} ${formatScheduleDuration(remainingMinutes)}`
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date)
  nextDate.setDate(date.getDate() + days)

  return nextDate
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function formatCalendarDay(date: Date, isToday: boolean) {
  const month = date.getMonth() + 1
  const day = date.getDate()

  return isToday ? `今天 ${month}/${day}` : `${month}/${day}`
}

function formatWeekday(date: Date) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
}

function isWeekend(date: Date) {
  return date.getDay() === 0 || date.getDay() === 6
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function isTaskDueOnDate(task: Task, targetDate: Date) {
  const due = task.due.trim()
  const targetDateKey = localDateKey(targetDate)
  const isoDate = due.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoDate) {
    const [, year, month, day] = isoDate
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` === targetDateKey
  }

  const chineseDate = due.match(/^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/)
  if (chineseDate) {
    const [, year, month, day] = chineseDate
    return (
      (!year || Number(year) === targetDate.getFullYear()) &&
      Number(month) === targetDate.getMonth() + 1 &&
      Number(day) === targetDate.getDate()
    )
  }

  const parsedDate = new Date(due)
  return !Number.isNaN(parsedDate.getTime()) && localDateKey(parsedDate) === targetDateKey
}

function isTaskDueToday(task: Task, today: Date) {
  return isTaskDueOnDate(task, today)
}

function isTaskInTodayWork(task: Task, today: Date) {
  if (task.status === '已完成') return false
  return task.status === '制作中' || task.status === '修改中' || isTaskDueToday(task, today)
}

function todayTaskPriority(task: Task) {
  if (task.status === '修改中') return 0
  if (task.status === '制作中') return 1
  return 2
}

function holidayForDate(items: HolidayItem[], date: Date) {
  return items.find((item) => item.date === localDateKey(date))
}

function mergeHolidayItems(chinaItems: HolidayItem[], customItems: HolidayItem[]) {
  const itemsByDate = new Map(chinaItems.map((item) => [item.date, item]))
  customItems.forEach((item) => itemsByDate.set(item.date, item))
  return Array.from(itemsByDate.values()).sort((left, right) => left.date.localeCompare(right.date))
}

function chinaHolidaySyncLabel(sync: ChinaHolidaySyncState) {
  if (sync.loading) return '正在更新'

  const sourceLabel: Record<ChinaHolidayLoadSource, string> = {
    network: '已同步',
    cache: '使用本机缓存',
    bundled: '使用内置数据',
    mixed: '已同步（含缓存）',
    unavailable: '暂不可用',
  }
  const updatedAt = sync.updatedAt
    ? ` · ${new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(sync.updatedAt)}`
    : ''
  const unavailable = sync.unavailableYears.length > 0 ? ` · 未取得 ${sync.unavailableYears.join('、')} 年` : ''

  return `${sourceLabel[sync.source]}${updatedAt}${unavailable}`
}

function formatHolidayDate(dateValue: string) {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return dateValue

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${formatWeekday(date)}`
}

function formatMonthDay(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function defaultDeliveryDate() {
  const date = addDays(new Date(), 7)
  return date.toISOString().slice(0, 10)
}

async function openProjectPath(folderPath: string) {
  if (!folderPath) return
  await window.desktopBridge?.openProjectFolder(folderPath)
}

function uniqueProjectPaths(paths: string[], primaryPath = '') {
  return Array.from(
    new Set(
      paths
        .map((folderPath) => folderPath.trim())
        .filter((folderPath) => folderPath && folderPath !== primaryPath.trim()),
    ),
  )
}

function projectFolderPaths(project: Project) {
  return Array.from(
    new Set(
      [project.path, ...(Array.isArray(project.additionalPaths) ? project.additionalPaths : [])]
        .map((folderPath) => folderPath.trim())
        .filter(Boolean),
    ),
  )
}

export default App
