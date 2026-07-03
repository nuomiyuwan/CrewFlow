import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CloudSun,
  Copy,
  DollarSign,
  Filter,
  FolderKanban,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Minimize2,
  Archive,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react'
import './App.css'

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
type WorkStatus = string
type TaskStatus = '未开始' | '制作中' | '修改中' | '已完成'
type AssignmentMode = 'internal' | 'external'
type ProjectFilterStatus = 'all' | 'normal' | 'risk' | 'late' | 'waiting' | 'archived'

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
  dataFile?: string
  updatedAt?: string
  message: string
}

type DesktopBridge = {
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
  copyText: (value: string) => Promise<boolean>
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
  status: ProjectStatus
  workStatus: WorkStatus
  owner: string
  path: string
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
}

type CalendarItem = {
  id?: string
  date?: string
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

type FinanceRecord = {
  projectId: string
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
type AppData = {
  version: string
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
type WorkflowOptions = {
  taskWorkTypes: string[]
  nodeStatuses: string[]
  workflowStages: string[]
  staffTags: string[]
}
type WorkflowOptionCategory = keyof WorkflowOptions
type WorkflowOptionRename = {
  category: WorkflowOptionCategory
  from: string
  to: string
}
type AppDataLoader = () => Promise<AppData | null>
type AppDataSaver = (data: Partial<AppData>) => Promise<boolean>
type ProjectPlanPayload = {
  id?: string
  date: string
  projectId: string
  title: string
  time: string
  type: string
  owner: string
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

const projectTypeOptions = ['短视频', '纪录片', '总结片', '宣传片', '微电影', '平面设计', '其他']
const customerGroups: Record<string, string[]> = {
  北京: [
    '北京公司',
    '昌平公司',
    '海淀公司',
    '大兴公司',
    '亦庄公司',
    '门头沟公司',
    '电缆公司',
    '电科院',
    '城区公司',
    '丰台公司',
    '通州公司',
    '顺义公司',
    '物资公司',
    '信通公司',
    '建设咨询',
    '承发包',
    '房山公司',
    '石景山公司',
    '怀柔公司',
    '平谷公司',
    '延庆公司',
    '密云公司',
    '电力党校',
    '电动车公司',
    '综合能源',
    '经研院',
    '谷新公司',
    '中电联',
    '中电传媒',
  ],
  新疆: ['新疆公司'],
  河北: ['河北公司'],
  江西: ['江西公司'],
}
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
}
const financeStorageVersion = 'finance-ledger-v5'
const projectDataStorageVersion = 'project-flow-v1'
const sessionStorageKey = 'crewflow-session-account'
const welcomeGuideStorageKey = 'crewflow-welcome-dismissed'
const dataModeStorageKey = 'crewflow-data-mode'
const teamServerUrlStorageKey = 'crewflow-team-server-url'
const workflowOptionsStorageKey = 'crewflow-workflow-options'
const defaultTeamServerUrl = 'http://127.0.0.1:8787'
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
  if (role === 'controller') return navItems.filter((item) => item.id !== 'tasks')
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

function shouldShowWelcomeGuide() {
  try {
    return localStorage.getItem(welcomeGuideStorageKey) !== 'true'
  } catch {
    return true
  }
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

function normalizeTeamServerUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return defaultTeamServerUrl
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  return withProtocol.replace(/\/+$/, '')
}

function teamApiUrl(serverUrl: string, pathname: string) {
  return `${normalizeTeamServerUrl(serverUrl)}${pathname}`
}

async function fetchTeamAppData(serverUrl: string) {
  const response = await fetch(teamApiUrl(serverUrl, '/api/app-data'))
  if (!response.ok) throw new Error(`团队数据读取失败：${response.status}`)
  return (await response.json()) as AppData
}

async function saveTeamAppData(serverUrl: string, data: Partial<AppData>) {
  const response = await fetch(teamApiUrl(serverUrl, '/api/app-data'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error(`团队数据保存失败：${response.status}`)
  return true
}

async function fetchTeamHealth(serverUrl: string) {
  const response = await fetch(teamApiUrl(serverUrl, '/health'))
  if (!response.ok) throw new Error(`连接失败：${response.status}`)
  return (await response.json()) as { ok?: boolean; name?: string; updatedAt?: string; dataFile?: string }
}

function clearLegacyLocalStorage() {
  try {
    legacyLocalStorageKeys.forEach((key) => localStorage.removeItem(key))
  } catch {
    // Ignore localStorage failures in restricted preview environments.
  }
}

function App() {
  const [dataMode, setDataMode] = useState<DataMode>(() => loadStoredDataMode())
  const [teamServerUrl, setTeamServerUrl] = useState(() => loadStoredTeamServerUrl())
  const [teamConnectionStatus, setTeamConnectionStatus] = useState<TeamConnectionStatus>('idle')
  const [teamConnectionMessage, setTeamConnectionMessage] = useState('')
  const [teamServiceInfo, setTeamServiceInfo] = useState<TeamServiceInfo | null>(null)
  const [teamServiceBusy, setTeamServiceBusy] = useState(false)
  const [teamServiceMessage, setTeamServiceMessage] = useState('')
  const [showDataModeModal, setShowDataModeModal] = useState(false)
  const [currentAccountId, setCurrentAccountId] = useState(() => loadStoredAccountId())
  const [appProjects, setAppProjects] = useState<Project[]>(() => loadStoredProjects())
  const [appTasks, setAppTasks] = useState<Task[]>(() => loadStoredTasks())
  const [appCalendarItems, setAppCalendarItems] = useState<CalendarItem[]>(() => loadStoredCalendarItems())
  const [appFinanceRecords, setAppFinanceRecords] = useState<FinanceRecord[]>(() => loadStoredFinanceRecords())
  const [appStaffMembers, setAppStaffMembers] = useState<StaffMember[]>(() => loadStoredStaffMembers())
  const [appAccounts, setAppAccounts] = useState<Account[]>(() => loadStoredAccounts())
  const [appHolidayItems, setAppHolidayItems] = useState<HolidayItem[]>(() => loadStoredHolidayItems())
  const [appWorkflowOptions, setAppWorkflowOptions] = useState<WorkflowOptions>(() => loadStoredWorkflowOptions())
  const currentAccount = useMemo(() => appAccounts.find((account) => account.id === currentAccountId) ?? null, [appAccounts, currentAccountId])
  const role = currentAccount?.role ?? 'controller'
  const [section, setSection] = useState<Section>(() => navItemsForRole(loadStoredAccounts().find((account) => account.id === loadStoredAccountId())?.role ?? 'controller')[0]?.id ?? 'dashboard')
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? '')
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [showControllerAccountModal, setShowControllerAccountModal] = useState(false)
  const [showWorkflowOptionsModal, setShowWorkflowOptionsModal] = useState(false)
  const [setupDraft, setSetupDraft] = useState<ProjectSetupDraft | null>(null)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [handoffProject, setHandoffProject] = useState<{ project: Project; personName: string } | null>(null)
  const [dataReady, setDataReady] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [filterStatus, setFilterStatus] = useState<ProjectFilterStatus>('all')
  const [filterType, setFilterType] = useState('全部类型')
  const [loginAccountId, setLoginAccountId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(() => shouldShowWelcomeGuide())
  const loadCurrentAppData = useCallback<AppDataLoader>(async () => {
    if (dataMode === 'team') return fetchTeamAppData(teamServerUrl)
    return window.desktopBridge?.loadAppData?.() ?? null
  }, [dataMode, teamServerUrl])
  const saveCurrentAppData = useCallback<AppDataSaver>(
    async (data) => {
      if (dataMode === 'team') return saveTeamAppData(teamServerUrl, data)
      return window.desktopBridge?.saveAppData?.(data) ?? false
    },
    [dataMode, teamServerUrl],
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

  useEffect(() => {
    clearLegacyLocalStorage()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30 * 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let canceled = false

    async function loadFileData() {
      setDataReady(false)
      const savedData = await loadCurrentAppData()
      if (canceled) return

      if (savedData?.projects) setAppProjects(savedData.projects.map(normalizeProject))
      if (savedData?.tasks) {
        setAppTasks(
          savedData.tasks.map((task) => ({
            ...task,
            status: normalizeTaskStatus(task.status),
          })),
        )
      }
      if (savedData?.calendarItems) setAppCalendarItems(savedData.calendarItems)
      if (savedData?.financeRecords) setAppFinanceRecords(savedData.financeRecords.map(normalizeFinanceRecord))
      if (savedData?.staffMembers) setAppStaffMembers(savedData.staffMembers.map(normalizeStaffMember))
      if (savedData?.accounts) setAppAccounts(mergeStoredAccounts(savedData.accounts))
      if (savedData?.holidayItems) setAppHolidayItems(savedData.holidayItems.map(normalizeHolidayItem))
      if (savedData?.workflowOptions) setAppWorkflowOptions(normalizeWorkflowOptions(savedData.workflowOptions))
      if (dataMode === 'team') {
        setTeamConnectionStatus('connected')
        setTeamConnectionMessage('团队数据已连接')
      }
      setDataReady(true)
    }

    loadFileData().catch((error) => {
      if (canceled) return
      if (dataMode === 'team') {
        setTeamConnectionStatus('error')
        setTeamConnectionMessage(error instanceof Error ? error.message : '团队服务连接失败')
      }
      setDataReady(true)
    })

    return () => {
      canceled = true
    }
  }, [dataMode, loadCurrentAppData])

  useEffect(() => {
    if (!dataReady) return
    localStorage.setItem('crewflow-project-data-version', projectDataStorageVersion)
    localStorage.setItem('crewflow-projects', JSON.stringify(appProjects))
    saveCurrentAppData({
      version: projectDataStorageVersion,
      projects: appProjects,
    }).catch(() => undefined)
  }, [appProjects, dataReady, saveCurrentAppData])

  useEffect(() => {
    if (!dataReady) return
    localStorage.setItem('crewflow-tasks', JSON.stringify(appTasks))
    saveCurrentAppData({
      version: projectDataStorageVersion,
      tasks: appTasks,
    }).catch(() => undefined)
  }, [appTasks, dataReady, saveCurrentAppData])

  useEffect(() => {
    if (!dataReady) return
    localStorage.setItem('crewflow-calendar-items', JSON.stringify(appCalendarItems))
    saveCurrentAppData({
      version: projectDataStorageVersion,
      calendarItems: appCalendarItems,
    }).catch(() => undefined)
  }, [appCalendarItems, dataReady, saveCurrentAppData])

  useEffect(() => {
    if (!dataReady) return
    localStorage.setItem('crewflow-staff-members', JSON.stringify(appStaffMembers))
    saveCurrentAppData({
      version: projectDataStorageVersion,
      staffMembers: appStaffMembers,
    }).catch(() => undefined)
  }, [appStaffMembers, dataReady, saveCurrentAppData])

  useEffect(() => {
    if (!dataReady) return
    localStorage.setItem('crewflow-accounts', JSON.stringify(appAccounts))
    saveCurrentAppData({
      version: projectDataStorageVersion,
      accounts: appAccounts,
    }).catch(() => undefined)
  }, [appAccounts, dataReady, saveCurrentAppData])

  useEffect(() => {
    if (!dataReady) return
    localStorage.setItem('crewflow-holiday-items', JSON.stringify(appHolidayItems))
    saveCurrentAppData({
      version: projectDataStorageVersion,
      holidayItems: appHolidayItems,
    }).catch(() => undefined)
  }, [appHolidayItems, dataReady, saveCurrentAppData])

  useEffect(() => {
    if (!dataReady) return
    localStorage.setItem(workflowOptionsStorageKey, JSON.stringify(appWorkflowOptions))
    saveCurrentAppData({
      version: projectDataStorageVersion,
      workflowOptions: appWorkflowOptions,
    }).catch(() => undefined)
  }, [appWorkflowOptions, dataReady, saveCurrentAppData])

  useEffect(() => {
    if (dataMode !== 'team' || !dataReady) return

    const timer = window.setInterval(() => {
      loadCurrentAppData()
        .then((savedData) => {
          if (!savedData) return
          setAppProjects(savedData.projects.map(normalizeProject))
          setAppTasks(
            savedData.tasks.map((task) => ({
              ...task,
              status: normalizeTaskStatus(task.status),
            })),
          )
          setAppCalendarItems(savedData.calendarItems)
          setAppFinanceRecords(savedData.financeRecords.map(normalizeFinanceRecord))
          setAppStaffMembers((savedData.staffMembers ?? []).map(normalizeStaffMember))
          setAppAccounts(mergeStoredAccounts(savedData.accounts ?? loginAccounts))
          setAppHolidayItems((savedData.holidayItems ?? []).map(normalizeHolidayItem))
          setAppWorkflowOptions(normalizeWorkflowOptions(savedData.workflowOptions))
          setTeamConnectionStatus('connected')
          setTeamConnectionMessage('团队数据已同步')
        })
        .catch((error) => {
          setTeamConnectionStatus('error')
          setTeamConnectionMessage(error instanceof Error ? error.message : '团队数据同步失败')
        })
    }, 10 * 1000)

    return () => window.clearInterval(timer)
  }, [dataMode, dataReady, loadCurrentAppData])

  useEffect(() => {
    if (!showDataModeModal) return
    refreshTeamServiceInfo()
  }, [showDataModeModal])

  const activeNavItems = useMemo(() => navItemsForRole(role), [role])
  const currentUser =
    (currentAccount?.staffId ? appStaffMembers.find((member) => member.id === currentAccount.staffId)?.name : null) ??
    currentAccount?.userName ??
    null

  useEffect(() => {
    if (activeNavItems.some((item) => item.id === section)) return
    setSection(activeNavItems[0]?.id ?? 'dashboard')
  }, [activeNavItems, section])

  const roleVisibleProjects = useMemo(() => {
    if (role === 'controller' || role === 'admin' || role === 'finance') return appProjects
    if (!currentUser) return []
    if (role === 'manager') return appProjects.filter((project) => project.manager === currentUser)

    const memberProjectIds = new Set(appTasks.filter((task) => task.assignee === currentUser).map((task) => task.projectId))
    return appProjects.filter((project) => memberProjectIds.has(project.id))
  }, [appProjects, appTasks, currentUser, role])

  const roleVisibleTasks = useMemo(() => {
    if (role === 'controller' || role === 'admin' || role === 'finance') return appTasks
    if (!currentUser) return []
    if (role === 'manager') {
      const managerProjectIds = new Set(appProjects.filter((project) => project.manager === currentUser).map((project) => project.id))
      return appTasks.filter((task) => managerProjectIds.has(task.projectId))
    }

    return appTasks.filter((task) => task.assignee === currentUser)
  }, [appProjects, appTasks, currentUser, role])

  const roleVisibleCalendarItems = useMemo(() => {
    if (role === 'controller' || role === 'admin' || role === 'finance') return appCalendarItems
    if (!currentUser) return []
    if (role === 'manager') {
      const managerProjectIds = new Set(appProjects.filter((project) => project.manager === currentUser).map((project) => project.id))
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
    () => filterProjects(roleVisibleProjects, searchQuery, filterStatus, filterType, searchMatchedProjectIds),
    [filterStatus, filterType, roleVisibleProjects, searchMatchedProjectIds, searchQuery],
  )
  const activeProjects = useMemo(() => filteredProjects.filter((project) => !isArchivedProject(project)), [filteredProjects])
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

  const selectedProject = activeProjects.find((project) => project.id === selectedProjectId) ?? activeProjects[0] ?? null
  const currentAccountTitle = accountDisplayTitle(currentAccount, appStaffMembers)
  const riskCount = activeProjects.filter(isRiskProject).length
  const waitingCount = activeProjects.filter(isWaitingProject).length
  const canAccessProjects = activeNavItems.some((item) => item.id === 'projects')
  const canCreateProject = canRoleCreateProject(role)
  const canManageWorkflowOptions = role === 'controller' || role === 'admin'
  const canEditProjectTaskBoard = role === 'controller' || role === 'admin'
  const activeStaffMembers = useMemo(() => appStaffMembers.filter(isAssignableStaff), [appStaffMembers])

  async function handleLogin() {
    const cleanLoginAccountId = loginAccountId.trim()
    let latestAccounts = appAccounts

    if (dataMode === 'team') {
      setLoginError('正在同步团队账号...')
      try {
        const savedData = await loadCurrentAppData()
        if (savedData) {
          setAppProjects(savedData.projects.map(normalizeProject))
          setAppTasks(
            savedData.tasks.map((task) => ({
              ...task,
              status: normalizeTaskStatus(task.status),
            })),
          )
          setAppCalendarItems(savedData.calendarItems)
          setAppFinanceRecords(savedData.financeRecords.map(normalizeFinanceRecord))
          setAppStaffMembers((savedData.staffMembers ?? []).map(normalizeStaffMember))
          latestAccounts = mergeStoredAccounts(savedData.accounts ?? loginAccounts)
          setAppAccounts(latestAccounts)
          setAppHolidayItems((savedData.holidayItems ?? []).map(normalizeHolidayItem))
          setAppWorkflowOptions(normalizeWorkflowOptions(savedData.workflowOptions))
          setTeamConnectionStatus('connected')
          setTeamConnectionMessage('团队账号已同步')
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

  function closeWelcomeGuide() {
    setShowWelcomeGuide(false)
  }

  function dismissWelcomeGuide() {
    try {
      localStorage.setItem(welcomeGuideStorageKey, 'true')
    } catch {
      // localStorage may be unavailable in unusual preview contexts; closing still works.
    }
    setShowWelcomeGuide(false)
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
    setTeamConnectionStatus('idle')
    setTeamConnectionMessage('单人模式使用本机数据')
  }

  function updateTeamServerUrl(nextUrl: string) {
    setTeamServerUrl(nextUrl)
    try {
      localStorage.setItem(teamServerUrlStorageKey, nextUrl)
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
      setTeamConnectionStatus('connected')
      setTeamConnectionMessage(`已连接：${health.name ?? 'CrewFlow Server'}`)
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
      await saveTeamAppData(teamServerUrl, localData ?? currentAppDataSnapshot)
      updateDataMode('team')
      setTeamConnectionStatus('connected')
      setTeamConnectionMessage('单人数据已导入团队库')
    } catch (error) {
      setTeamConnectionStatus('error')
      setTeamConnectionMessage(error instanceof Error ? error.message : '导入团队库失败')
    }
  }

  async function refreshTeamServiceInfo() {
    if (!window.desktopBridge?.getTeamServiceInfo) {
      setTeamServiceInfo({
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
      setTeamServiceInfo(info)
      setTeamServiceMessage(info.message)
    } catch (error) {
      setTeamServiceMessage(error instanceof Error ? error.message : '团队服务状态读取失败')
    } finally {
      setTeamServiceBusy(false)
    }
  }

  async function installLocalTeamService() {
    if (!window.desktopBridge?.installTeamService) {
      setTeamServiceMessage('请在 CrewFlow 桌面 App 中开启团队服务')
      return
    }

    setTeamServiceBusy(true)
    setTeamServiceMessage('正在开启团队服务')
    try {
      const info = await window.desktopBridge.installTeamService()
      setTeamServiceInfo(info)
      setTeamServiceMessage(info.message)
      if (info.connectionUrl) updateTeamServerUrl(info.connectionUrl)
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
      setTeamServiceInfo(info)
      setTeamServiceMessage(info.message)
    } catch (error) {
      setTeamServiceMessage(error instanceof Error ? error.message : '团队服务停止失败')
    } finally {
      setTeamServiceBusy(false)
    }
  }

  async function copyLocalTeamServiceUrl() {
    const url = teamServiceInfo?.connectionUrl || teamServerUrl
    if (!url) return

    try {
      if (window.desktopBridge?.copyText) {
        await window.desktopBridge.copyText(url)
      } else {
        await navigator.clipboard.writeText(url)
      }
      setTeamServiceMessage(`已复制：${url}`)
    } catch {
      setTeamServiceMessage(`复制失败，请手动复制：${url}`)
    }
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

    setAppWorkflowOptions(normalizedOptions)

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
      workStatus: initialStatus,
      owner: payload.manager,
      path: payload.path,
      creatorAccountId: currentAccount?.id,
    }
    const newCalendarItem: CalendarItem = {
      id: `C-${Date.now().toString().slice(-8)}`,
      date: payload.deliveryDate,
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
    const dueDate = new Date(updatedProject.due)
    const previousDueText = previousProject ? formatMonthDay(new Date(previousProject.due)) : ''
    const milestoneTitle = updatedProject.calendarTitle?.trim() || updatedProject.stage
    const nextMilestone = `${formatMonthDay(dueDate)} ${milestoneTitle}`
    const nextProjectTasks = updatedTasks?.map((task) => ({
      ...task,
      projectId: updatedProject.id,
      project: updatedProject.name,
      title: previousProject ? task.title.replace(previousProject.name, updatedProject.name) : task.title,
      due: task.due === previousProject?.due || task.due === previousDueText ? formatMonthDay(dueDate) : task.due,
    }))

    setAppProjects((current) =>
      current.map((project) =>
        project.id === updatedProject.id
          ? {
              ...updatedProject,
              nextMilestone,
            }
          : project,
      ),
    )
    if (nextProjectTasks) {
      setAppTasks((current) => [...nextProjectTasks, ...current.filter((task) => task.projectId !== updatedProject.id)])
    } else {
      setAppTasks((current) =>
        current.map((task) =>
          task.projectId === updatedProject.id
            ? {
                ...task,
                project: updatedProject.name,
                title: previousProject ? task.title.replace(previousProject.name, updatedProject.name) : task.title,
                due: task.due === previousProject?.due || task.due === previousDueText ? formatMonthDay(dueDate) : task.due,
              }
            : task,
        ),
      )
    }
    setAppCalendarItems((current) =>
      current.map((item) => {
        if (item.projectId !== updatedProject.id) return item

        const isPrimaryPlan = previousProject ? isPrimaryProjectCalendarItem(item, previousProject) : false

        return {
          ...item,
          project: updatedProject.name,
          date: isPrimaryPlan ? updatedProject.due : item.date,
          day: isPrimaryPlan ? dueDate.getDate() : item.day,
          time: isPrimaryPlan ? formatMonthDay(dueDate) : item.time,
          title: isPrimaryPlan ? milestoneTitle : item.title,
          type: isPrimaryPlan ? updatedProject.stage : item.type,
          owner: item.owner === previousProject?.manager || isPrimaryPlan ? updatedProject.manager : item.owner,
        }
      }),
    )
    setEditingProject(null)
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

  function handleAddCalendarPlan(plan: ProjectPlanPayload) {
    const project = appProjects.find((item) => item.id === plan.projectId)
    if (!project) return

    const date = new Date(plan.date)
    setAppCalendarItems((current) => [
      {
        id: plan.id ?? `C-${Date.now().toString().slice(-8)}`,
        date: plan.date,
        projectId: plan.projectId,
        day: date.getDate(),
        time: plan.time.trim() || formatMonthDay(date),
        project: project.name,
        title: plan.title.trim() || '项目计划',
        type: plan.type.trim() || '项目计划',
        owner: plan.owner,
      },
      ...current,
    ])
  }

  function handleUpdateCalendarPlan(itemKey: string, plan: ProjectPlanPayload) {
    const project = appProjects.find((item) => item.id === plan.projectId)
    if (!project) return

    const date = new Date(plan.date)
    setAppCalendarItems((current) =>
      current.map((item) =>
        calendarItemKey(item) === itemKey
          ? {
              id: item.id ?? plan.id ?? `C-${Date.now().toString().slice(-8)}`,
              date: plan.date,
              projectId: plan.projectId,
              day: date.getDate(),
              time: plan.time.trim() || formatMonthDay(date),
              project: project.name,
              title: plan.title.trim() || '项目计划',
              type: plan.type.trim() || '项目计划',
              owner: plan.owner,
            }
          : item,
      ),
    )
  }

  function handleDeleteCalendarPlan(itemKey: string) {
    setAppCalendarItems((current) => current.filter((item) => calendarItemKey(item) !== itemKey))
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
    if (!targetMember || targetMember.name === '王标') return
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
          onAccountChange={setLoginAccountId}
          onPasswordChange={setLoginPassword}
          onLogin={handleLogin}
          onOpenDataMode={() => setShowDataModeModal(true)}
        />
        {showDataModeModal && (
          <DataModeModal
            dataMode={dataMode}
            teamServerUrl={teamServerUrl}
            teamConnectionStatus={teamConnectionStatus}
            teamConnectionMessage={teamConnectionMessage}
            teamServiceInfo={teamServiceInfo}
            teamServiceBusy={teamServiceBusy}
            teamServiceMessage={teamServiceMessage}
            onClose={() => setShowDataModeModal(false)}
            onDataModeChange={updateDataMode}
            onTeamServerUrlChange={updateTeamServerUrl}
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
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">
            <img src="./app-icon.png" alt="" />
          </div>
          <div>
            <strong>CrewFlow</strong>
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

        <DataModeStatus
          dataMode={dataMode}
          teamConnectionStatus={teamConnectionStatus}
          teamConnectionMessage={teamConnectionMessage}
          onOpen={() => setShowDataModeModal(true)}
        />
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">{formatFullDate(now)}</div>
            <h1>{titleForSection(section)}</h1>
          </div>
          <div className="topActions">
            <div className="search">
              <Search size={18} />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索项目、客户、NAS 路径" />
            </div>
            <button className={showFilterPanel ? 'iconButton active' : 'iconButton'} type="button" title="筛选" onClick={() => setShowFilterPanel((value) => !value)}>
              <Filter size={18} />
            </button>
            {canCreateProject && (
              <button className="primaryButton" type="button" onClick={() => setShowNewProjectModal(true)}>
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
                    {projectTypeOptions.map((item) => (
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

        {section === 'dashboard' && (
          <Dashboard
            riskCount={riskCount}
            waitingCount={waitingCount}
            visibleProjects={activeProjects}
            visibleTasks={visibleTasks}
            calendarItems={visibleCalendarItems}
            now={now}
            canAccessProjects={canAccessProjects}
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
            canEditTaskBoard={canEditProjectTaskBoard}
            canDeleteProject={canDeleteProject}
            onEditProject={setEditingProject}
            onDeleteProject={handleDeleteProject}
            onUpdateTaskStatus={handleUpdateTaskStatus}
            onUpdateTask={handleUpdateTask}
            onOpenHandoff={setHandoffProject}
          />
        )}
        {section === 'tasks' && <Tasks tasks={visibleTasks} onUpdateTaskStatus={handleUpdateTaskStatus} />}
        {section === 'calendar' && (
          <CalendarView
            projects={activeProjects}
            calendarItems={visibleCalendarItems}
            holidayItems={appHolidayItems}
            now={now}
            staffMembers={activeStaffMembers}
            canManageHolidays={role === 'controller' || role === 'admin'}
            onHolidayItemsChange={setAppHolidayItems}
            onAddPlan={handleAddCalendarPlan}
            onUpdatePlan={handleUpdateCalendarPlan}
            onDeletePlan={handleDeleteCalendarPlan}
          />
        )}
        {section === 'team' && <TeamLoad projects={appProjects} tasks={appTasks} staffMembers={appStaffMembers} />}
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
        {section === 'archive' && <ArchiveView projects={archivedProjects} allTasks={appTasks} financeRecords={appFinanceRecords} onEditProject={setEditingProject} />}
        {section === 'finance' && (
          <FinanceView
            projects={roleVisibleProjects}
            displayProjects={filteredProjects}
            loadAppData={loadCurrentAppData}
            saveAppData={saveCurrentAppData}
            onRecordsChange={setAppFinanceRecords}
          />
        )}
      </main>

      <LocalAssistant
        role={role}
        section={section}
        projects={activeProjects}
        tasks={visibleTasks}
        calendarItems={visibleCalendarItems}
        canCreateProject={canCreateProject}
        onOpenNewProject={() => setShowNewProjectModal(true)}
      />

      {showNewProjectModal && (
          <NewProjectModal
            staffMembers={activeStaffMembers}
            workflowOptions={appWorkflowOptions}
            preferredManager={role === 'manager' ? currentUser ?? undefined : undefined}
          lockManager={role === 'manager'}
          onClose={() => setShowNewProjectModal(false)}
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
          canDelete={canDeleteProject(editingProject)}
          canEditTaskBoard={canEditProjectTaskBoard}
          onClose={() => setEditingProject(null)}
          onSave={handleUpdateProject}
          onDelete={handleDeleteProject}
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
          teamConnectionStatus={teamConnectionStatus}
          teamConnectionMessage={teamConnectionMessage}
          teamServiceInfo={teamServiceInfo}
          teamServiceBusy={teamServiceBusy}
          teamServiceMessage={teamServiceMessage}
          onClose={() => setShowDataModeModal(false)}
          onDataModeChange={updateDataMode}
          onTeamServerUrlChange={updateTeamServerUrl}
          onCheckTeamConnection={checkTeamConnection}
          onImportSingleDataToTeam={importSingleDataToTeam}
          onRefreshTeamService={refreshTeamServiceInfo}
          onInstallTeamService={installLocalTeamService}
          onStopTeamService={stopLocalTeamService}
          onCopyTeamServiceUrl={copyLocalTeamServiceUrl}
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
      {showWelcomeGuide && <WelcomeGuideModal onClose={closeWelcomeGuide} onDismiss={dismissWelcomeGuide} />}
    </div>
  )
}

function WelcomeGuideModal({ onClose, onDismiss }: { onClose: () => void; onDismiss: () => void }) {
  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal welcomeGuideModal" role="dialog" aria-modal="true" aria-label="CrewFlow 使用提示" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">首次使用</span>
            <h2>欢迎使用 CrewFlow</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="welcomeGuideBody">
          <p>CrewFlow 用来管理视频项目的立项、任务、交付日历、人员和财务结算。</p>
          <div className="welcomeSteps">
            <span>默认账号</span>
            <ol>
              <li>系统默认内置总控账号：zk，密码：123456。</li>
              <li>进入后可在左侧“账号管理”修改总控用户名和密码。</li>
              <li>其他成员账号建议先在“人员管理”新增人员，再到“账号管理”创建并关联。</li>
            </ol>
          </div>
          <div className="welcomeSteps">
            <span>工作模式</span>
            <ol>
              <li>单人模式：数据只保存在当前电脑，适合个人试用或单机管理。</li>
              <li>团队模式：选择一台常驻 Mac 或 Windows 电脑，在“工作模式”里点击“开启团队服务”。</li>
              <li>开启后把自动显示的局域网地址复制给其他电脑，其他电脑选择团队模式并填写这个地址。</li>
              <li>常驻电脑安装后台服务后，终端关闭也不会影响其他人连接。</li>
            </ol>
          </div>
          <div className="welcomeSteps">
            <span>第一次使用建议按这个顺序开始：</span>
            <ol>
              <li>先在“人员管理”确认团队成员、标签和账号关联。</li>
              <li>再到右上角点击“新建项目”，填写客户、项目经理、NAS 路径和交付日期。</li>
              <li>项目创建后，在“设置交付和任务”里分派工种和负责人。</li>
              <li>执行成员可在“我的任务”查看个人任务；管理人员可在“团队负载”和“交付日历”查看排期压力。</li>
              <li>财务只维护合同金额、收款、开票和结算状态。</li>
            </ol>
          </div>
          <div className="welcomeNote">团队模式常用地址格式：http://常驻电脑局域网IP:8787。不要让多人直接读写同一个共享文件。</div>
        </div>
        <footer>
          <button type="button" onClick={onDismiss}>
            以后不再提示
          </button>
          <button className="primaryButton" type="button" onClick={onClose}>
            知道了
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

function DataModeStatus({
  dataMode,
  teamConnectionStatus,
  teamConnectionMessage,
  onOpen,
}: {
  dataMode: DataMode
  teamConnectionStatus: TeamConnectionStatus
  teamConnectionMessage: string
  onOpen: () => void
}) {
  const Icon = dataMode === 'team' && teamConnectionStatus === 'connected' ? CheckCircle2 : HardDrive
  const statusClass = dataMode === 'team' ? teamConnectionStatus : 'single'

  return (
    <button className={`nasStatus dataModeStatus ${statusClass}`} type="button" onClick={onOpen}>
      <Icon size={18} />
      <div>
        <strong>{dataModeLabel(dataMode)}</strong>
        <span>{dataMode === 'team' ? connectionStatusText(teamConnectionStatus, teamConnectionMessage) : '数据只保存在本机'}</span>
      </div>
    </button>
  )
}

function DataModeModal({
  dataMode,
  teamServerUrl,
  teamConnectionStatus,
  teamConnectionMessage,
  teamServiceInfo,
  teamServiceBusy,
  teamServiceMessage,
  onClose,
  onDataModeChange,
  onTeamServerUrlChange,
  onCheckTeamConnection,
  onImportSingleDataToTeam,
  onRefreshTeamService,
  onInstallTeamService,
  onStopTeamService,
  onCopyTeamServiceUrl,
}: {
  dataMode: DataMode
  teamServerUrl: string
  teamConnectionStatus: TeamConnectionStatus
  teamConnectionMessage: string
  teamServiceInfo: TeamServiceInfo | null
  teamServiceBusy: boolean
  teamServiceMessage: string
  onClose: () => void
  onDataModeChange: (mode: DataMode) => void
  onTeamServerUrlChange: (url: string) => void
  onCheckTeamConnection: () => void
  onImportSingleDataToTeam: () => void
  onRefreshTeamService: () => void
  onInstallTeamService: () => void
  onStopTeamService: () => void
  onCopyTeamServiceUrl: () => void
}) {
  const hostUrl = teamServiceInfo?.connectionUrl ?? defaultTeamServerUrl
  const hostStatus = teamServiceInfo?.running ? '运行中' : '未开启'
  const canManageLocalService = Boolean(teamServiceInfo?.supported)

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal dataModeModal" role="dialog" aria-modal="true" aria-label="工作模式设置" onMouseDown={(event) => event.stopPropagation()}>
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
              <span>只在常驻电脑操作。开启后，把下面地址发给其他电脑填写。</span>
            </div>
            <em className={teamServiceInfo?.running ? 'running' : ''}>{hostStatus}</em>
          </div>
          <label className="dataModeField teamHostAddress">
            <span>其他电脑填写这个地址</span>
            <input value={hostUrl} readOnly />
          </label>
          <div className="teamHostActions">
            <button type="button" onClick={onInstallTeamService} disabled={teamServiceBusy || !canManageLocalService}>
              {teamServiceInfo?.running ? '修复/重启服务' : '开启团队服务'}
            </button>
            <button type="button" onClick={onRefreshTeamService} disabled={teamServiceBusy}>
              刷新状态
            </button>
            <button type="button" onClick={onCopyTeamServiceUrl} disabled={!hostUrl}>
              复制地址
            </button>
            <button type="button" onClick={onStopTeamService} disabled={teamServiceBusy || !teamServiceInfo?.running}>
              停止服务
            </button>
          </div>
          <p className="teamHostMessage">{teamServiceMessage || teamServiceInfo?.message || '打开后会自动显示本机局域网地址。'}</p>
        </section>
        <label className="dataModeField">
          <span>团队服务器地址</span>
          <input value={teamServerUrl} onChange={(event) => onTeamServerUrlChange(event.target.value)} placeholder="例如：http://192.168.31.20:8787" />
        </label>
        <div className={`dataModeConnection ${teamConnectionStatus}`}>
          {connectionStatusText(teamConnectionStatus, teamConnectionMessage)}
        </div>
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
      </section>
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
    if (draft[category].length <= 1) return
    updateList(category, draft[category].filter((item) => item !== value))
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
            title="任务工种"
            note="用于新建项目、任务分派和项目详情任务板。"
            category="taskWorkTypes"
            values={draft.taskWorkTypes}
            onAdd={addOption}
            onRename={renameOption}
            onDelete={deleteOption}
          />
          <WorkflowOptionSection
            title="当前节点状态"
            note="用于项目当前状态。内置的已完成、需修改、等反馈类状态仍会参与统计。"
            category="nodeStatuses"
            values={draft.nodeStatuses}
            onAdd={addOption}
            onRename={renameOption}
            onDelete={deleteOption}
          />
          <WorkflowOptionSection
            title="流程节点"
            note="用于立项后设置、编辑项目和项目详情流程展示。"
            category="workflowStages"
            values={draft.workflowStages}
            onAdd={addOption}
            onRename={renameOption}
            onDelete={deleteOption}
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
}: {
  title: string
  note: string
  category: WorkflowOptionCategory
  values: string[]
  protectedValues?: string[]
  onAdd: (category: WorkflowOptionCategory, value: string) => void
  onRename: (category: WorkflowOptionCategory, previousValue: string, nextValue: string) => void
  onDelete: (category: WorkflowOptionCategory, value: string) => void
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
        {values.map((value) => (
          <WorkflowOptionRow
            key={value}
            category={category}
            value={value}
            canDelete={values.length > 1 && !protectedSet.has(value)}
            isProtected={protectedSet.has(value)}
            onRename={onRename}
            onDelete={onDelete}
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
  onRename,
  onDelete,
}: {
  category: WorkflowOptionCategory
  value: string
  canDelete: boolean
  isProtected?: boolean
  onRename: (category: WorkflowOptionCategory, previousValue: string, nextValue: string) => void
  onDelete: (category: WorkflowOptionCategory, value: string) => void
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
      <button type="button" onClick={() => onDelete(category, value)} disabled={!canDelete || isProtected} title={isProtected ? '关键标签会被保留' : '删除选项'}>
        {isProtected ? '保留' : '删除'}
      </button>
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
          onOpen={onOpenDataMode}
        />
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

function titleForSection(section: Section) {
  const item = navItems.find((nav) => nav.id === section)
  return item?.label ?? '首页控制台'
}

function Dashboard({
  riskCount,
  waitingCount,
  visibleProjects,
  visibleTasks,
  calendarItems,
  now,
  canAccessProjects,
  setSection,
  setSelectedProjectId,
}: {
  riskCount: number
  waitingCount: number
  visibleProjects: Project[]
  visibleTasks: Task[]
  calendarItems: CalendarItem[]
  now: Date
  canAccessProjects: boolean
  setSection: (section: Section) => void
  setSelectedProjectId: (id: string) => void
}) {
  const deliveryCount = calendarItems.length
  const shootOrMaterialCount = calendarItems.filter((item) => /拍摄|素材/.test(`${item.type}${item.title}`)).length
  const openTasks = visibleTasks.filter((task) => task.status !== '已完成')
  const priorityProjects = [...visibleProjects].sort((left, right) => projectPriorityScore(right) - projectPriorityScore(left))

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
              <div className={`statusDot ${statusTone[projectDisplayStatus(project)]}`} />
              <div>
                <strong>{project.name}</strong>
                <span>
                  {project.stage} · {project.nextMilestone}
                </span>
              </div>
              <span className={`pill ${statusTone[projectDisplayStatus(project)]}`}>{statusLabel[projectDisplayStatus(project)]}</span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </section>

      <section className="panel span4 widgets">
        <Widget icon={CloudSun} title="天气" value="28°C 多云" note="适合外拍，傍晚有风" />
        <Widget icon={Clock3} title="当前时间" value={formatClock(now)} note={workdayCountdown(now)} />
        <Widget icon={CalendarDays} title="本周交付" value={`${deliveryCount} 个`} note={deliveryCount > 0 ? '来自已设置的交付日历' : '暂无交付节点'} />
      </section>

      <MetricCard icon={AlertTriangle} label="风险项目" value={`${riskCount}`} tone="danger" />
      <MetricCard icon={MessageSquareText} label="等反馈" value={`${waitingCount}`} tone="wait" />
      <MetricCard icon={CheckCircle2} label="今日任务" value={`${openTasks.length}`} tone="ok" />
      <MetricCard icon={Camera} label="拍摄/素材节点" value={`${shootOrMaterialCount}`} tone="info" />

      <section className="panel span7">
        <div className="panelHeader">
          <div>
            <h2>今日任务流</h2>
            <p>项目经理和成员需要更新的事项</p>
          </div>
          <button type="button" onClick={() => setSection('tasks')}>
            查看任务
          </button>
        </div>
        <TaskRows tasks={openTasks.slice(0, 4)} />
      </section>

      <section className="panel span5">
        <div className="panelHeader">
          <div>
            <h2>交付节点</h2>
            <p>未来 5 个关键时间点</p>
          </div>
          <button type="button" onClick={() => setSection('calendar')}>
            日历
          </button>
        </div>
        <Timeline calendarItems={calendarItems} />
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
  canEditTaskBoard: boolean
  canDeleteProject: (project: Project) => boolean
  onEditProject: (project: Project) => void
  onDeleteProject: (project: Project) => void
  onUpdateTaskStatus: (taskId: string, status: TaskStatus) => void
  onUpdateTask: (task: Task) => void
  onOpenHandoff: (handoff: { project: Project; personName: string }) => void
}) {
  const selectedProjectTasks = selectedProject ? allTasks.filter((task) => task.projectId === selectedProject.id) : []
  const departedStaff = staffMembers.filter((member) => member.status === '离职')
  const assignableStaff = useMemo(() => staffMembers.filter(isAssignableStaff), [staffMembers])
  const selectedDepartedNames = selectedProject ? departedPeopleForProject(selectedProject, allTasks, allCalendarItems, departedStaff) : []
  const selectedProjectProgress = selectedProject ? progressForProject(selectedProject, selectedProjectTasks) : 0
  const canDeleteSelectedProject = selectedProject ? canDeleteProject(selectedProject) : false

  return (
    <div className="contentGrid">
      <section className="panel span12">
        <div className="panelHeader">
          <div>
            <h2>项目列表</h2>
            <p>最多 15 个项目时，列表比大看板更高效</p>
          </div>
        </div>
        <div className="projectTable">
          {projects.length === 0 && <EmptyState title="项目中心暂无项目" note="从右上角新建项目开始，项目会进入任务、日历和财务。" />}
          {projects.map((project) => {
            const departedNames = departedPeopleForProject(project, allTasks, allCalendarItems, departedStaff)

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
                    {project.type} · {project.client} · 执行：{currentExecutorForProject(project.id, allTasks, allProjects)}
                  </span>
                  {departedNames.length > 0 && <em className="handoffInline">人员离职待处理：{departedNames.join('、')}</em>}
                </div>
                <span>{project.manager}</span>
                <span>{project.workStatus} / {project.stage}</span>
                <span>{project.due}</span>
                <span className={`pill ${statusTone[projectDisplayStatus(project)]}`}>{statusLabel[projectDisplayStatus(project)]}</span>
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
            <span className={`pill ${statusTone[projectDisplayStatus(selectedProject)]}`}>{statusLabel[projectDisplayStatus(selectedProject)]}</span>
            <button type="button" onClick={() => onEditProject(selectedProject)}>
              编辑项目
            </button>
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
                {selectedProject.type} · {selectedProject.client}
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
            <button className="pathBox" type="button" onClick={() => openProjectPath(selectedProject.path)}>
              <HardDrive size={16} />
              <span>{selectedProject.path}</span>
              <Copy size={15} />
            </button>
          </div>

          <div className="projectDetailCard detailInfoGrid">
            <div className="detailSectionHeading">
              <span>关键节点</span>
            </div>
            <InfoLine label="项目经理" value={selectedProject.manager} />
            <InfoLine label="当前节点状态" value={selectedProject.workStatus} />
            <InfoLine label="流程节点" value={selectedProject.stage} />
            <InfoLine label="下一节点" value={selectedProject.nextMilestone} />
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
                  {canEditTaskBoard ? (
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
                    canEditTaskBoard ? (
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
                  ) : canEditTaskBoard ? (
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
                  {canEditTaskBoard ? (
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
                </div>
              )
            })}
          </div>

          <div className="projectDetailCard stageList projectDetailStages">
            <div className="detailSectionHeading">
              <span>流程节点</span>
            </div>
            {optionsWithCurrent(workflowOptions.workflowStages, selectedProject.stage).map((stage) => (
              <span key={stage} className={stage === selectedProject.stage ? 'active' : ''}>
                {stage}
              </span>
            ))}
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
  onEditProject,
}: {
  projects: Project[]
  allTasks: Task[]
  financeRecords: FinanceRecord[]
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
                    <span className="eyebrow">{project.client}</span>
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
                  <button type="button" onClick={() => openProjectPath(project.path)}>
                    打开 NAS
                  </button>
                  <button type="button" onClick={() => onEditProject(project)}>
                    编辑项目
                  </button>
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
  staffMembers,
  workflowOptions,
  preferredManager,
  lockManager = false,
  onClose,
  onCreateProject,
}: {
  staffMembers: StaffMember[]
  workflowOptions: WorkflowOptions
  preferredManager?: string
  lockManager?: boolean
  onClose: () => void
  onCreateProject: (payload: NewProjectPayload) => void
}) {
  const projectManagers = useMemo(() => staffMembers.filter(canManageProject), [staffMembers])
  const lockedManagerAvailable = Boolean(preferredManager && projectManagers.some((member) => member.name === preferredManager))
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [type, setType] = useState('宣传片')
  const [province, setProvince] = useState('北京')
  const [customProvinces, setCustomProvinces] = useState<string[]>([])
  const [customCustomers, setCustomCustomers] = useState<Record<string, string[]>>({})
  const [client, setClient] = useState(customerGroups.北京[0])
  const [clientContact, setClientContact] = useState('')
  const [manager, setManager] = useState(preferredManager ?? projectManagers[0]?.name ?? '')
  const [priority, setPriority] = useState('重要')
  const [workTypes, setWorkTypes] = useState<string[]>([workflowOptions.taskWorkTypes[0] ?? defaultTaskWorkOptions[0]])
  const [deliveryDate, setDeliveryDate] = useState(defaultDeliveryDate())

  useEffect(() => {
    if (lockManager && preferredManager && lockedManagerAvailable) {
      setManager(preferredManager)
      return
    }
    if (projectManagers.some((member) => member.name === manager)) return
    setManager(projectManagers[0]?.name ?? '')
  }, [lockManager, lockedManagerAvailable, manager, preferredManager, projectManagers])

  function handleProvinceSelect(nextProvince: string) {
    setProvince(nextProvince)
    setClient([...(customerGroups[nextProvince] ?? []), ...(customCustomers[nextProvince] ?? [])][0] ?? '')
  }

  function addCustomCustomer(customerName: string) {
    const cleanName = customerName.trim()
    if (!cleanName) return

    setCustomCustomers((current) => {
      const provinceCustomers = current[province] ?? []
      if (provinceCustomers.includes(cleanName) || customerGroups[province]?.includes(cleanName)) return current

      return {
        ...current,
        [province]: [...provinceCustomers, cleanName],
      }
    })
    setClient(cleanName)
  }

  function addCustomProvince(provinceName: string) {
    const cleanName = provinceName.trim()
    if (!cleanName) return
    if (customerGroups[cleanName] || customProvinces.includes(cleanName)) return

    setCustomProvinces((current) => [...current, cleanName])
    setCustomCustomers((current) => ({ ...current, [cleanName]: [] }))
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
    if (!name.trim()) return

    onCreateProject({
      name: name.trim(),
      path: path || '\\\\Synology\\projects\\待选择项目文件夹',
      type,
      client,
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
            <h2>新建项目</h2>
            <p>先录入项目基础信息和 NAS 路径，项目经理收到后继续拆任务。</p>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="structuredForm">
          <label className="textField">
            <span>项目名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：北京公司服务队宣传片" />
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
          <OptionGroup label="项目类型" options={projectTypeOptions} active={type} onSelect={setType} />
          <CustomerPicker
            province={province}
            provinces={[...Object.keys(customerGroups), ...customProvinces]}
            customers={[...(customerGroups[province] ?? []), ...(customCustomers[province] ?? [])]}
            client={client}
            onProvinceSelect={handleProvinceSelect}
            onClientSelect={setClient}
            onAddCustomProvince={addCustomProvince}
            onAddCustomCustomer={addCustomCustomer}
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
          <button className="primaryButton" type="button" onClick={submitProject} disabled={!name.trim()}>
            创建项目
          </button>
        </footer>
      </section>
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

function CustomerPicker({
  province,
  provinces,
  customers,
  client,
  onProvinceSelect,
  onClientSelect,
  onAddCustomProvince,
  onAddCustomCustomer,
}: {
  province: string
  provinces: string[]
  customers: string[]
  client: string
  onProvinceSelect: (province: string) => void
  onClientSelect: (client: string) => void
  onAddCustomProvince: (provinceName: string) => void
  onAddCustomCustomer: (customerName: string) => void
}) {
  const [customName, setCustomName] = useState('')
  const [customProvinceName, setCustomProvinceName] = useState('')

  function addCustomer() {
    if (!customName.trim()) return
    onAddCustomCustomer(customName)
    setCustomName('')
  }

  function addProvince() {
    if (!customProvinceName.trim()) return
    onAddCustomProvince(customProvinceName)
    setCustomProvinceName('')
  }

  return (
    <div className="customerPicker">
      <div className="optionGroup">
        <span>客户省份</span>
        <div>
          {provinces.map((item) => (
            <button key={item} className={item === province ? 'active' : ''} type="button" onClick={() => onProvinceSelect(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="customCustomer">
        <input value={customProvinceName} onChange={(event) => setCustomProvinceName(event.target.value)} placeholder="添加自定义省份" />
        <button type="button" onClick={addProvince} disabled={!customProvinceName.trim()}>
          添加省份
        </button>
      </div>
      <div className="optionGroup">
        <span>客户单位</span>
        <select value={client} onChange={(event) => onClientSelect(event.target.value)}>
          {customers.length === 0 && <option value="">请选择或添加客户单位</option>}
          {customers.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="customCustomer">
        <input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder={`添加${province}自定义单位`} />
        <button type="button" onClick={addCustomer} disabled={!customName.trim()}>
          添加自定义
        </button>
      </div>
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
  onClose: () => void
  onSave: (project: Project, tasks: Task[]) => void
  onDelete: (project: Project) => void
}) {
  const projectManagers = useMemo(() => staffMembers.filter(canManageProject), [staffMembers])
  const assignableStaff = useMemo(() => staffMembers.filter((member) => member.status === '在职'), [staffMembers])
  const initialManager = staffNameInOptions(project.manager, projectManagers) || projectManagers[0]?.name || ''
  const [name, setName] = useState(project.name)
  const [path, setPath] = useState(project.path)
  const [type, setType] = useState(project.type)
  const [client, setClient] = useState(project.client)
  const [clientContact, setClientContact] = useState(project.clientContact ?? '')
  const [manager, setManager] = useState(initialManager)
  const [stage, setStage] = useState(project.stage)
  const [calendarTitle, setCalendarTitle] = useState(project.calendarTitle ?? milestoneTitleFrom(project.nextMilestone))
  const [workStatus, setWorkStatus] = useState<WorkStatus>(project.workStatus)
  const [due, setDue] = useState(project.due)
  const [taskDrafts, setTaskDrafts] = useState<Task[]>(() => normalizeTaskAssigneesForStaff(projectTasks, assignableStaff))

  async function selectProjectFolder() {
    const selectedPath = await window.desktopBridge?.selectProjectFolder()
    if (selectedPath) setPath(selectedPath)
  }

  async function openProjectFolder() {
    if (!path) return
    await window.desktopBridge?.openProjectFolder(path)
  }

  function saveProject() {
    if (!name.trim()) return

    const dueDate = new Date(due)
    onSave(
      {
        ...project,
        name: name.trim(),
        path,
        type,
        client: client.trim() || project.client,
        clientContact: clientContact.trim(),
        manager,
        stage,
        calendarTitle: calendarTitle.trim(),
        workStatus,
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
            <h2>编辑项目</h2>
            <p>用于修正项目名称、客户、项目经理、流程节点、下一节点日期和 NAS 路径。</p>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="structuredForm">
          <label className="textField">
            <span>项目名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="textField">
            <span>客户单位</span>
            <input value={client} onChange={(event) => setClient(event.target.value)} />
          </label>
          <label className="textField">
            <span>甲方对接人</span>
            <input value={clientContact} onChange={(event) => setClientContact(event.target.value)} placeholder="例如：张主任 / 李老师" />
          </label>
          <div className="setupGrid">
            <label className="textField">
              <span>项目类型</span>
              <select value={type} onChange={(event) => setType(event.target.value)}>
                {projectTypeOptions.map((item) => (
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
              <span>下一节点日期</span>
              <input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
            </label>
            <label className="textField">
              <span>交付日历显示</span>
              <input value={calendarTitle} onChange={(event) => setCalendarTitle(event.target.value)} placeholder="例如：需求对接、脚本初稿、成片交付" />
            </label>
          </div>
          <div className="assignmentEditor">
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
          </div>
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
            保存修改
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
            <p>项目已创建，继续确认流程节点、下一节点日期，并把所选工种分派给内部人员或外包。</p>
          </div>
          <button type="button" onClick={onClose} title="稍后设置">
            <X size={18} />
          </button>
        </header>

        <div className="structuredForm">
          <div className="setupProjectName">
            <strong>{project.name}</strong>
            <span>{project.client} · {project.type} · 项目经理：{project.manager}</span>
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
              <span>下一节点日期</span>
              <input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
            </label>
            <label className="textField">
              <span>交付日历显示</span>
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
  const suggestions: Record<string, string> = {
    策划: '黄冠霖',
    文案: '曾嘉成',
    拍摄: '陈英琦',
    剪辑: '郭子铭',
    后期: '胡晓曼',
    包装: '胡晓曼',
    设计: '齐欣蓉',
    AI: '陈英琦',
    行政: '杜一迪',
    配音: '陈英琦',
    配乐: '陈英琦',
    三维: '胡晓曼',
    版权素材: '杜一迪',
    调色: '胡晓曼',
    外包: '陈英琦',
  }

  const suggestedName = suggestions[workType]
  const suggestedMember = staffMembers.find((member) => member.name === suggestedName)
  if (suggestedMember) return suggestedMember.name

  const byTag = staffMembers.find((member) => member.tags.some((tag) => workType.includes(tag) || tag.includes(workType)))
  return byTag?.name ?? staffMembers[0]?.name ?? ''
}

function Tasks({ tasks, onUpdateTaskStatus }: { tasks: Task[]; onUpdateTaskStatus: (taskId: string, status: TaskStatus) => void }) {
  return (
    <div className="contentGrid">
      <section className="panel span12">
        <div className="panelHeader">
          <div>
            <h2>我的任务</h2>
            <p>成员只需要更新未开始、制作中、修改中、已完成和备注</p>
          </div>
        </div>
        <div className="taskSource">
          <span>任务来源</span>
          <strong>项目经理在项目中心指派后，这里显示个人任务</strong>
          <em>执行成员只看与自己相关的项目节点</em>
        </div>
        <TaskRows tasks={tasks} large onUpdateTaskStatus={onUpdateTaskStatus} />
      </section>
    </div>
  )
}

function CalendarView({
  projects,
  calendarItems,
  holidayItems,
  now,
  staffMembers,
  canManageHolidays,
  onHolidayItemsChange,
  onAddPlan,
  onUpdatePlan,
  onDeletePlan,
}: {
  projects: Project[]
  calendarItems: CalendarItem[]
  holidayItems: HolidayItem[]
  now: Date
  staffMembers: StaffMember[]
  canManageHolidays: boolean
  onHolidayItemsChange: (items: HolidayItem[]) => void
  onAddPlan: (plan: ProjectPlanPayload) => void
  onUpdatePlan: (itemKey: string, plan: ProjectPlanPayload) => void
  onDeletePlan: (itemKey: string) => void
}) {
  const calendarProjects = projects.filter((project) => calendarItems.some((item) => item.projectId === project.id))
  const [selectedProjectId, setSelectedProjectId] = useState(calendarProjects[0]?.id ?? projects[0]?.id ?? '')
  const [planDate, setPlanDate] = useState<string | null>(null)
  const [rangeDays, setRangeDays] = useState(14)
  const [pageStart, setPageStart] = useState(0)
  const [editingPlan, setEditingPlan] = useState<{ item: CalendarItem; key: string; date: string } | null>(null)
  const [showHolidaySettings, setShowHolidaySettings] = useState(false)
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

  useEffect(() => {
    setPageStart(0)
  }, [rangeDays])

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
            const dayItems = calendarItems.filter((item) => isCalendarItemOnDate(now, item, date))
            const isToday = isSameDay(date, now)
            const holiday = holidayForDate(holidayItems, date)
            const weekend = isWeekend(date)

            return (
              <div
                key={date.toISOString()}
                className={[
                  dayItems.length > 0 ? 'calendarDay hasEvent' : 'calendarDay',
                  isToday ? 'today' : '',
                  weekend && holiday?.type !== '班' ? 'weekend' : '',
                  holiday?.type === '休' ? 'holidayRest' : '',
                  holiday?.type === '班' ? 'holidayWork' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onContextMenu={(event) => {
                  event.preventDefault()
                  if (projects.length > 0) setPlanDate(date.toISOString().slice(0, 10))
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
                  {dayItems.slice(0, 2).map((item) => (
                    <button
                      key={calendarItemKey(item)}
                      type="button"
                      className={item.projectId === effectiveSelectedProjectId ? 'calendarEvent active' : 'calendarEvent'}
                      onClick={() => setSelectedProjectId(item.projectId)}
                    >
                      <span>{item.project}</span>
                      <strong>{item.title}</strong>
                    </button>
                  ))}
                  {dayItems.length > 2 && <em>+{dayItems.length - 2} 个节点</em>}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="panel span5">
        <div className="panelHeader">
          <div>
            <h2>项目列表</h2>
            <p>点击项目，右侧显示完整时间安排</p>
          </div>
        </div>
        <div className="calendarProjectList">
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
              <span className={`pill ${statusTone[projectDisplayStatus(project)]}`}>{statusLabel[projectDisplayStatus(project)]}</span>
            </button>
          ))}
          {calendarProjects.length === 0 && <EmptyState title="暂无项目排期" note="在上方日历日期上右键，可以给已有项目添加计划。" />}
        </div>
      </section>

      <section className="panel span7">
        <div className="panelHeader">
          <div>
            <h2>{selectedProject?.name ?? '暂无项目节点'}</h2>
            <p>当前选定项目的具体时间安排</p>
          </div>
          {selectedProject && (
            <span className={`pill ${statusTone[projectDisplayStatus(selectedProject)]}`}>{statusLabel[projectDisplayStatus(selectedProject)]}</span>
          )}
        </div>
        <div className="projectSchedule">
          {selectedProjectSchedule.map((item) => {
            const itemKey = calendarItemKey(item)

            return (
            <article key={itemKey} className="scheduleItem">
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
              <div className="scheduleActions">
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
            </article>
            )
          })}
          {selectedProjectSchedule.length === 0 && (
            <div className="emptySchedule">这个项目暂时没有排期节点。</div>
          )}
        </div>
      </section>
      {planDate && (
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
      {editingPlan && (
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
          holidayItems={holidayItems}
          onClose={() => setShowHolidaySettings(false)}
          onChange={onHolidayItemsChange}
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
  onClose,
  onSave,
}: {
  date: string
  projects: Project[]
  staffMembers: StaffMember[]
  item?: CalendarItem
  onClose: () => void
  onSave: (plan: ProjectPlanPayload) => void
}) {
  const assignableStaff = useMemo(() => staffMembers.filter((member) => member.status === '在职'), [staffMembers])
  const [projectId, setProjectId] = useState(item?.projectId ?? projects[0]?.id ?? '')
  const selectedProject = projects.find((project) => project.id === projectId) ?? projects[0]
  const initialOwner =
    staffNameInOptions(item?.owner ?? '', assignableStaff) ||
    staffNameInOptions(selectedProject?.manager ?? '', assignableStaff) ||
    assignableStaff[0]?.name ||
    ''
  const [title, setTitle] = useState(item?.title ?? '项目计划')
  const [time, setTime] = useState(item?.time ?? formatMonthDay(new Date(date)))
  const [type, setType] = useState(item?.type ?? selectedProject?.stage ?? '项目计划')
  const [owner, setOwner] = useState(initialOwner)

  useEffect(() => {
    if (item) return
    if (!selectedProject) return
    setType(selectedProject.stage)
    setOwner(staffNameInOptions(selectedProject.manager, assignableStaff) || assignableStaff[0]?.name || '')
  }, [assignableStaff, item, selectedProject])

  if (!selectedProject) return null

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="financeEntryModal calendarPlanModal" role="dialog" aria-modal="true" aria-label="添加交付计划" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">{formatMonthDay(new Date(date))}</span>
            <h2>{item ? '编辑计划' : '添加计划'}</h2>
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
          <label className="textField">
            <span>显示时间</span>
            <input value={time} onChange={(event) => setTime(event.target.value)} placeholder="例如：7月6日 15:00" />
          </label>
          <label className="textField">
            <span>计划类型</span>
            <input value={type} onChange={(event) => setType(event.target.value)} placeholder="例如：客户节点、拍摄、审片" />
          </label>
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
                date,
                id: item?.id,
                projectId,
                title,
                time,
                type,
                owner,
              })
            }
          >
            {item ? '保存修改' : '保存计划'}
          </button>
        </footer>
      </section>
    </div>
  )
}

function HolidaySettingsModal({
  holidayItems,
  onClose,
  onChange,
}: {
  holidayItems: HolidayItem[]
  onClose: () => void
  onChange: (items: HolidayItem[]) => void
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
            {sortedItems.length === 0 && <EmptyState title="还没有节假日配置" note="日期和星期会自动显示；法定休假和调休上班可在这里维护。" />}
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
  const editableStaff = staffMembers.filter((person) => person.name !== '王标')
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

function TeamLoad({ projects, tasks, staffMembers }: { projects: Project[]; tasks: Task[]; staffMembers: StaffMember[] }) {
  const activeProjects = projects.filter((project) => !isArchivedProject(project))
  const activeProjectIds = new Set(activeProjects.map((project) => project.id))
  const teamLoad = staffMembers.filter((member) => member.name !== '王标' && member.status === '在职').map((person) => {
    const personTasks = tasks.filter((task) => task.assignee === person.name && task.status !== '已完成' && activeProjectIds.has(task.projectId))
    const managedProjects = activeProjects.filter((project) => project.manager === person.name)
    const ownedProjects = activeProjects.filter((project) => project.owner === person.name)
    const relatedProjectIds = new Set([...personTasks.map((task) => task.projectId), ...managedProjects.map((project) => project.id), ...ownedProjects.map((project) => project.id)])
    const risk = activeProjects.filter((project) => relatedProjectIds.has(project.id) && isRiskProject(project)).length
    const revisionTasks = personTasks.filter((task) => task.status === '修改中').length
    const load = Math.min(100, personTasks.length * 12 + managedProjects.length * 10 + ownedProjects.length * 8 + revisionTasks * 6)

    return {
      ...person,
      load,
      risk,
      tasks: personTasks.length,
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
              <InfoLine label="任务" value={`${person.tasks} 个`} />
              <InfoLine label="风险" value={`${person.risk} 个`} />
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function FinanceView({
  projects,
  displayProjects = projects,
  loadAppData,
  saveAppData,
  onRecordsChange,
}: {
  projects: Project[]
  displayProjects?: Project[]
  loadAppData: AppDataLoader
  saveAppData: AppDataSaver
  onRecordsChange?: (records: FinanceRecord[]) => void
}) {
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
  const overdueCount = visibleRecords.filter((record) => record.settlementStatus === '逾期').length
  const pendingInvoiceCount = visibleRecords.filter((record) => record.contractAmount > 0 && record.invoiceStatus !== '已开票').length
  const selectedRecord =
    visibleRecords.find((record) => record.projectId === selectedFinanceProjectId) ?? visibleRecords[0] ?? null
  const selectedProject = selectedRecord ? projects.find((project) => project.id === selectedRecord.projectId) ?? null : null
  const selectedLedger = selectedRecord ? ledger[selectedRecord.projectId] ?? emptyFinanceLedger() : emptyFinanceLedger()

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
      current.map((record) => (record.projectId === selectedRecord.projectId ? { ...record, ...patch } : record)),
    )
  }

  return (
    <div className="contentGrid financeGrid">
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
            const settlementText = record.contractAmount > 0 ? record.settlementStatus : '待录入'

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
                    {project?.client} · {project?.type} · {record.nextCollection}
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
                <span className={`financeStatus ${record.contractAmount > 0 ? financeTone(record.settlementStatus) : 'wait'}`}>{settlementText}</span>
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
    </div>
  )
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

  return (
    <div className="businessDetail">
      <div className="businessHero">
        <div className="businessHeroTitle">
          <strong>{project.name}</strong>
          <span>
            {project.client} · {project.type} · {project.manager}
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

function LocalAssistant({
  role,
  section,
  projects,
  tasks,
  calendarItems,
  canCreateProject,
  onOpenNewProject,
}: {
  role: Role
  section: Section
  projects: Project[]
  tasks: Task[]
  calendarItems: CalendarItem[]
  canCreateProject: boolean
  onOpenNewProject: () => void
}) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const assistantRef = useRef<HTMLElement | null>(null)
  const [messages, setMessages] = useState<Array<{ from: 'assistant' | 'user'; text: string }>>([
    {
      from: 'assistant',
      text: '我可以帮你查看项目、任务、交付和财务提醒。',
    },
  ])
  const suggestions = assistantSuggestions(role, section, projects, tasks, calendarItems)

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

  function sendMessage(text = input) {
    const cleanText = text.trim()
    if (!cleanText) return
    const wantsNewProject = /新建项目|创建项目|立项|录入项目/.test(cleanText)
    if (wantsNewProject && canCreateProject) onOpenNewProject()

    setMessages((current) => [
      ...current,
      { from: 'user', text: cleanText },
      { from: 'assistant', text: assistantReply(cleanText, role, section, projects, tasks, calendarItems, canCreateProject) },
    ])
    setInput('')
  }

  if (!open) {
    return (
      <button className="assistantFab" type="button" onClick={() => setOpen(true)}>
        <MessageSquareText size={20} />
        <span>制片助理</span>
      </button>
    )
  }

  return (
    <section ref={assistantRef} className="assistantWindow" aria-label="制片助理">
      <header>
        <div>
          <strong>制片助理</strong>
          <span>工作提醒</span>
        </div>
        <button type="button" onClick={() => setOpen(false)} title="收起">
          <Minimize2 size={16} />
        </button>
      </header>

      <div className="assistantBrief">
        {suggestions.map((item) => (
          <button key={item} type="button" onClick={() => sendMessage(item)}>
            {item}
          </button>
        ))}
      </div>

      <div className="assistantMessages">
        {messages.map((message, index) => (
          <div key={`${message.from}-${index}`} className={`assistantMessage ${message.from}`}>
            {message.text}
          </div>
        ))}
      </div>

      <form
        className="assistantInput"
        onSubmit={(event) => {
          event.preventDefault()
          sendMessage()
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="问：今天优先盯什么？"
        />
        <button type="submit" title="发送">
          <Send size={16} />
        </button>
      </form>
    </section>
  )
}

function assistantSuggestions(
  role: Role,
  section: Section,
  _projects: Project[],
  _tasks: Task[],
  calendarItems: CalendarItem[],
) {
  const createAction = canRoleCreateProject(role) ? ['新建项目'] : []
  const base = [...createAction, '今日优先盯什么', '有哪些风险', '下一步怎么安排']
  if (section === 'finance') return [...createAction, '哪些款项要跟进', '哪些项目待开票'].slice(0, 4)
  if (section === 'calendar') return [...createAction, '本周交付压力', '哪些节点容易撞期', '按项目整理日程'].slice(0, 4)
  if (section === 'tasks' || role === 'member') return ['我今天先做什么', '哪些任务在修改', '按优先级排序']
  if (calendarItems.length > 5) return [...createAction, '今日优先盯什么', '本周交付压力', '有哪些风险'].slice(0, 4)
  return base
}

function assistantReply(
  prompt: string,
  role: Role,
  section: Section,
  projects: Project[],
  tasks: Task[],
  calendarItems: CalendarItem[],
  canCreateProject: boolean,
) {
  const riskProjects = projects.filter(isRiskProject)
  const waitingProjects = projects.filter(isWaitingProject)
  const revisionTasks = tasks.filter((task) => task.status === '修改中')
  const activeTasks = tasks.filter((task) => task.status === '制作中' || task.status === '未开始')
  const financeRisks = financeRecords.filter((record) => record.settlementStatus === '逾期' || record.invoiceStatus !== '已开票')
  const lowerPrompt = prompt.toLowerCase()
  const canAnswerLocally = /新建项目|创建项目|立项|录入项目|款|开票|财务|交付|日程|撞期|任务|项目|风险|反馈|优先|今天|安排|进度|状态|延期|归档|负责人|项目经理|拍摄|素材|收款|合同/.test(prompt)

  if (/智障|傻|乱答|不对|驴唇不对马嘴/.test(prompt)) {
    return [
      '这个问题我现在答得不够准。',
      '目前更适合查项目、任务、交付日历、财务提醒，或打开新建项目窗口。',
      '其他问题我会尽量明确说明，避免给出没把握的回答。',
    ].join('\n')
  }

  if (!canAnswerLocally) {
    return [
      '这个问题我现在还不能准确回答。',
      '你可以这样问我：今天优先盯什么、有哪些风险、哪些节点撞期、我有哪些任务、哪些款项要跟进，或者让我新建项目。',
      '我会优先处理和项目、任务、交付、财务有关的内容。',
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
      '项目类型：纪录片/宣传片/短视频/总结片/微电影',
      '项目经理：',
      '成片交付日期：2026-07-03',
      '任务工种：剪辑、包装、调色',
      'NAS路径：/Volumes/NEWNAS/...',
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
      '建议项目经理提前确认客户反馈窗口，避免审片和成片交付挤在同一天。'
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
    '建议今天先看风险项目的下一节点，再确认任务是否已经指派到具体执行人。'
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

function archiveFinanceState(record: FinanceRecord) {
  if (record.contractAmount <= 0) return { label: '财务待录入', tone: 'wait' }
  if (record.settlementStatus === '逾期') return { label: '财务逾期', tone: 'danger' }

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
  return {
    ...createBlankFinanceRecord(record.projectId),
    ...record,
    comparisonStatus: record.comparisonStatus ?? '待制作',
  }
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
  return {
    ...project,
    clientContact: project.clientContact ?? '',
    calendarTitle: project.calendarTitle ?? milestoneTitleFrom(project.nextMilestone ?? project.stage),
    creatorAccountId: project.creatorAccountId,
    workStatus: normalizeNodeStatus(project.workStatus),
    stage: normalizeProjectStage(project.stage),
  }
}

function isArchivedProject(project: Project) {
  return project.stage === '归档完成' || project.workStatus === '已完成'
}

function isWaitingProject(project: Project) {
  return project.status === 'waiting' || project.workStatus === '等甲方反馈' || project.workStatus === '等内部确认'
}

function isRiskProject(project: Project) {
  return project.status === 'risk' || project.status === 'late' || project.workStatus === '需修改'
}

function projectDisplayStatus(project: Project): ProjectStatus {
  if (project.status === 'late') return 'late'
  if (isRiskProject(project)) return 'risk'
  if (isWaitingProject(project)) return 'waiting'
  return 'normal'
}

function progressForProject(project: Project, projectTasks: Task[]) {
  if (project.workStatus === '已完成' || isArchivedProject(project)) return 100
  if (projectTasks.length === 0) return project.progress

  const completedTasks = projectTasks.filter((task) => task.status === '已完成').length
  return Math.round((completedTasks / projectTasks.length) * 100)
}

function projectPriorityScore(project: Project) {
  if (project.status === 'late') return 40
  if (isRiskProject(project)) return 30
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
) {
  return projectList.filter((project) => {
    if (type !== '全部类型' && project.type !== type) return false
    if (status === 'archived' && !isArchivedProject(project)) return false
    if (status !== 'archived' && status !== 'all' && isArchivedProject(project)) return false
    if (status === 'normal' && projectDisplayStatus(project) !== 'normal') return false
    if (status === 'risk' && !isRiskProject(project)) return false
    if (status === 'late' && project.status !== 'late') return false
    if (status === 'waiting' && !isWaitingProject(project)) return false

    if (!query.trim()) return true
    return projectMatchesSearch(project, query) || Boolean(searchMatchedProjectIds?.has(project.id))
  })
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
  ]
    .join(' ')
    .toLowerCase()
    .includes(cleanQuery)
}

function taskMatchesSearch(task: Task, project: Project | undefined, query: string) {
  const cleanQuery = query.trim().toLowerCase()
  if (!cleanQuery) return true

  return [task.title, task.project, task.assignee, task.due, task.status, task.note, project?.name, project?.client, project?.path]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(cleanQuery)
}

function calendarItemMatchesSearch(item: CalendarItem, project: Project | undefined, query: string) {
  const cleanQuery = query.trim().toLowerCase()
  if (!cleanQuery) return true

  return [item.project, item.title, item.type, item.owner, item.time, project?.name, project?.client, project?.path]
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
  const previousDueDate = new Date(previousProject.due)
  const previousDueText = formatMonthDay(previousDueDate)
  const previousMilestoneTitle = milestoneTitleFrom(previousProject.nextMilestone)
  const primaryTitles = new Set([
    previousProject.stage,
    previousMilestoneTitle,
    '需求对接',
    '计划交付',
  ])

  return (
    item.day === previousDueDate.getDate() &&
    (item.type === previousProject.stage || item.type === '立项节点' || primaryTitles.has(item.title) || item.time === previousDueText)
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
  return date.toISOString().slice(0, 10)
}

function isCalendarItemOnDate(now: Date, item: CalendarItem, date: Date) {
  return dateForCalendarItem(now, item) === date.toISOString().slice(0, 10)
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
  const normalized = uniqueCleanOptions(options, defaultWorkflowOptions[category])
  return category === 'staffTags' ? ensureProtectedStaffTags(normalized) : normalized
}

function isProtectedWorkflowOption(category: WorkflowOptionCategory, value: string) {
  return category === 'staffTags' && protectedStaffTags.includes(value)
}

function normalizeWorkflowOptions(options: Partial<WorkflowOptions> | undefined): WorkflowOptions {
  return {
    taskWorkTypes: normalizeWorkflowOptionList('taskWorkTypes', options?.taskWorkTypes ?? []),
    nodeStatuses: normalizeWorkflowOptionList('nodeStatuses', options?.nodeStatuses ?? []),
    workflowStages: normalizeWorkflowOptionList('workflowStages', options?.workflowStages ?? []),
    staffTags: normalizeWorkflowOptionList('staffTags', options?.staffTags ?? []),
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

function taskTitleForWorkType(projectName: string, workType: string) {
  return `${projectName} ${workType}`
}

function isExternalTask(task: Task) {
  return task.assignmentMode === 'external' || task.assignee.startsWith('外包：') || task.note.includes('外包任务')
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

function isAssignableStaff(member: StaffMember) {
  return member.status === '在职' && member.name !== '王标'
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
    return {
      ...record,
      receivedAmount,
      clientSettlementStatus: receivedAmount >= record.contractAmount ? '已结算' : '部分结算',
      settlementStatus: receivedAmount >= record.contractAmount ? '正常' : '待收款',
    }
  }

  if (action === 'invoice') {
    const invoiceAmount = record.invoiceAmount + amount
    return {
      ...record,
      invoiceAmount,
      invoiceStatus: invoiceAmount >= record.contractAmount ? '已开票' : '部分开票',
      settlementStatus: invoiceAmount >= record.contractAmount ? record.settlementStatus : '待开票',
    }
  }

  return {
    ...record,
  }
}

function reverseFinanceRecord(record: FinanceRecord, action: FinanceAction, entry: FinanceLedgerEntry): FinanceRecord {
  const amount = entry.amount ?? 0

  if (action === 'payment') {
    const receivedAmount = Math.max(0, record.receivedAmount - amount)
    return {
      ...record,
      receivedAmount,
      clientSettlementStatus: receivedAmount <= 0 ? '未结算' : receivedAmount >= record.contractAmount ? '已结算' : '部分结算',
      settlementStatus: receivedAmount >= record.contractAmount ? '正常' : '待收款',
    }
  }

  if (action === 'invoice') {
    const invoiceAmount = Math.max(0, record.invoiceAmount - amount)
    return {
      ...record,
      invoiceAmount,
      invoiceStatus: invoiceAmount <= 0 ? '未开票' : invoiceAmount >= record.contractAmount ? '已开票' : '部分开票',
    }
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

function Widget({ icon: Icon, title, value, note }: { icon: typeof CloudSun; title: string; value: string; note: string }) {
  return (
    <div className="widget">
      <Icon size={20} />
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <p>{note}</p>
      </div>
    </div>
  )
}

function TaskRows({
  tasks,
  large = false,
  onUpdateTaskStatus,
}: {
  tasks: Task[]
  large?: boolean
  onUpdateTaskStatus?: (taskId: string, status: TaskStatus) => void
}) {
  return (
    <div className={large ? 'taskRows large' : 'taskRows'}>
      {tasks.length === 0 && <EmptyState title="暂无任务" note="项目经理分派后，相关人员会在这里看到自己的任务。" />}
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
        <div key={`${item.time}-${item.title}`} className="timelineItem">
          <span>{item.time}</span>
          <div>
            <strong>{item.title}</strong>
            <p>{item.type}</p>
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

function workdayCountdown(date: Date) {
  const endOfWorkday = new Date(date)
  endOfWorkday.setHours(18, 0, 0, 0)
  const diffMs = endOfWorkday.getTime() - date.getTime()

  if (diffMs <= 0) return '今日收工节点已过'

  const totalMinutes = Math.ceil(diffMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0) return `距离今日收工节点 ${minutes} 分钟`
  if (minutes === 0) return `距离今日收工节点 ${hours} 小时`

  return `距离今日收工节点 ${hours} 小时 ${minutes} 分钟`
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

function holidayForDate(items: HolidayItem[], date: Date) {
  return items.find((item) => item.date === localDateKey(date))
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

export default App
