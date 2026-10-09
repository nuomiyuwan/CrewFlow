export type WorkProject = { id: string; name: string; type: string; client: string; manager: string }
export type WorkTask = { id: string; projectId: string; title: string; workType?: string; assignee: string; due: string }
export type WorkLine = {
  id: string
  taskId: string
  category: string
  name: string
  people: string
  start: string
  end: string
  quantity: number | null
  days: number | null
  unit: string
  cost: number | null
  note: string
}
export type WorkStatement = {
  preset: 'general' | 'video'
  lines: WorkLine[]
  status: 'draft' | 'confirmed'
  revision: number
  confirmedBy: string
  confirmedAt: string
  taskSnapshot: string
}
export type QuoteLine = {
  id: string
  sourceIds: string[]
  category: string
  name: string
  quantity: number | null
  days: number | null
  unit: string
  price: number | null
  note: string
}
export type Quote = {
  id: string
  title: string
  customer: string
  issuer: string
  note: string
  lines: QuoteLine[]
  sourceRevision: number
  source: WorkStatement
  confirmedAt: string
  confirmedBy: string
}
export type CommercialRecord = {
  id: string
  statement: WorkStatement
  draft: Quote | null
  versions: Quote[]
  updatedAt: string
}

export const videoCategories = ['前期策划', '拍摄人员', '拍摄设备', '后期制作', '交通食宿', '其他费用']
export const generalCategories = ['人员服务', '设备材料', '制作交付', '交通食宿', '其他费用']
export const workUnits = ['项', '份', '版', '条', '秒', '分钟', '人天', '台天', '天', '张', '套', '间夜', '次']
export const newCommercialId = () => crypto.randomUUID()
export const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value)
export const usesDays = (unit: string) => ['人天', '台天', '间夜'].includes(unit)
export const taskSnapshot = (tasks: WorkTask[]) => JSON.stringify(tasks.map(({ id, title, workType, assignee, due }) => ({ id, title, workType, assignee, due })))

export function emptyCommercialRecord(id: string): CommercialRecord {
  return { id, statement: { preset: 'general', lines: [], status: 'draft', revision: 0, confirmedBy: '', confirmedAt: '', taskSnapshot: '' }, draft: null, versions: [], updatedAt: '' }
}

export function newWorkLine(preset: WorkStatement['preset'], task?: WorkTask): WorkLine {
  const name = task?.workType || task?.title || ''
  const category = preset === 'video'
    ? /策划|脚本|文案/.test(name) ? '前期策划' : /拍摄|摄影|导演|灯光/.test(name) ? '拍摄人员' : '后期制作'
    : '人员服务'
  return { id: newCommercialId(), taskId: task?.id || '', category, name, people: task?.assignee || '', start: '', end: '', quantity: null, days: null, unit: '项', cost: null, note: '' }
}

export function quoteLineTotal(line: QuoteLine) {
  if (line.price === null || line.quantity === null || (usesDays(line.unit) && line.days === null)) return null
  const value = line.price * line.quantity * (usesDays(line.unit) ? line.days! : 1)
  return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : null
}

export function validateWorkStatement(statement: WorkStatement): string {
  if (!statement.lines.length) return '请先添加工作量明细'
  for (const [index, line] of statement.lines.entries()) {
    if (!line.name.trim() || !line.category.trim() || !line.unit.trim()) return `第 ${index + 1} 项的名称、分类和单位未填写`
    if (line.quantity === null || !Number.isFinite(line.quantity) || line.quantity <= 0) return `第 ${index + 1} 项的数量待补充`
    if (usesDays(line.unit) && (line.days === null || !Number.isFinite(line.days) || line.days <= 0)) return `第 ${index + 1} 项的计费天数待补充`
    if (line.cost !== null && (!Number.isFinite(line.cost) || line.cost < 0)) return `第 ${index + 1} 项的成本无效`
    if (line.days !== null && (!Number.isFinite(line.days) || line.days < 0)) return `第 ${index + 1} 项的天数无效`
    if (line.start && line.end && line.end < line.start) return `第 ${index + 1} 项的结束日期早于开始日期`
  }
  return ''
}

export function validateQuote(quote: Quote): string {
  if (!quote.title.trim()) return '请填写报价单标题'
  if (!quote.lines.length) return '请先添加报价条目'
  for (const [index, line] of quote.lines.entries()) {
    if (!line.name.trim() || !line.category.trim() || !line.unit.trim()) return `第 ${index + 1} 项的名称、分类和单位未填写`
    if (line.quantity === null || !Number.isFinite(line.quantity) || line.quantity <= 0) return `第 ${index + 1} 项的数量待补充`
    if (usesDays(line.unit) && (line.days === null || !Number.isFinite(line.days) || line.days <= 0)) return `第 ${index + 1} 项的计费天数待补充`
    if (line.price === null || !Number.isFinite(line.price) || line.price < 0 || quoteLineTotal(line) === null) return `第 ${index + 1} 项的单价待补充`
  }
  return ''
}

export function makeQuote(project: WorkProject, statement: WorkStatement): Quote {
  return {
    id: newCommercialId(), title: `${project.name}报价单`, customer: project.client, issuer: '', note: '',
    sourceRevision: statement.revision, source: structuredClone(statement), confirmedAt: '', confirmedBy: '',
    lines: statement.lines.map((line) => ({ id: newCommercialId(), sourceIds: [line.id], category: line.category, name: line.name, quantity: line.quantity, days: line.days, unit: line.unit, price: null, note: '' })),
  }
}

export function workSummary(line: WorkLine) {
  const amount = line.quantity === null ? '数量待补充' : `${line.quantity}${line.unit}`
  return `${line.name || '未命名'}：${usesDays(line.unit) && line.quantity !== null ? `${line.quantity} × ${line.days ?? '待补充'} ${line.unit}` : amount}`
}
