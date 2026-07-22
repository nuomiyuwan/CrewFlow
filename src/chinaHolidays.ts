export type ChinaHolidayItem = {
  id: string
  date: string
  name: string
  type: '休' | '班'
}

export type ChinaHolidayLoadSource = 'network' | 'cache' | 'bundled' | 'mixed' | 'unavailable'

export type ChinaHolidayLoadResult = {
  items: ChinaHolidayItem[]
  source: ChinaHolidayLoadSource
  updatedAt?: number
  unavailableYears: number[]
}

type ChinaHolidayDay = {
  name: string
  date: string
  isOffDay: boolean
}

type ChinaHolidayDocument = {
  year: number
  papers: string[]
  days: ChinaHolidayDay[]
}

type ChinaHolidayCacheEntry = {
  fetchedAt: number
  document: ChinaHolidayDocument
}

type ChinaHolidayCache = {
  version: 1
  years: Record<string, ChinaHolidayCacheEntry>
}

const chinaHolidayCacheKey = 'crewflow-china-holidays-cache-v1'
const chinaHolidayRefreshIntervalMs = 24 * 60 * 60 * 1000
const chinaHolidayRequestTimeoutMs = 5000
const maxHolidayPayloadLength = 100_000

export const chinaHolidayProjectUrl = 'https://github.com/NateScarlet/holiday-cn'

const bundledChinaHolidayDocuments: Record<number, ChinaHolidayDocument> = {
  2026: {
    year: 2026,
    papers: ['https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm'],
    days: [
      { name: '元旦', date: '2026-01-01', isOffDay: true },
      { name: '元旦', date: '2026-01-02', isOffDay: true },
      { name: '元旦', date: '2026-01-03', isOffDay: true },
      { name: '元旦', date: '2026-01-04', isOffDay: false },
      { name: '春节', date: '2026-02-14', isOffDay: false },
      { name: '春节', date: '2026-02-15', isOffDay: true },
      { name: '春节', date: '2026-02-16', isOffDay: true },
      { name: '春节', date: '2026-02-17', isOffDay: true },
      { name: '春节', date: '2026-02-18', isOffDay: true },
      { name: '春节', date: '2026-02-19', isOffDay: true },
      { name: '春节', date: '2026-02-20', isOffDay: true },
      { name: '春节', date: '2026-02-21', isOffDay: true },
      { name: '春节', date: '2026-02-22', isOffDay: true },
      { name: '春节', date: '2026-02-23', isOffDay: true },
      { name: '春节', date: '2026-02-28', isOffDay: false },
      { name: '清明节', date: '2026-04-04', isOffDay: true },
      { name: '清明节', date: '2026-04-05', isOffDay: true },
      { name: '清明节', date: '2026-04-06', isOffDay: true },
      { name: '劳动节', date: '2026-05-01', isOffDay: true },
      { name: '劳动节', date: '2026-05-02', isOffDay: true },
      { name: '劳动节', date: '2026-05-03', isOffDay: true },
      { name: '劳动节', date: '2026-05-04', isOffDay: true },
      { name: '劳动节', date: '2026-05-05', isOffDay: true },
      { name: '劳动节', date: '2026-05-09', isOffDay: false },
      { name: '端午节', date: '2026-06-19', isOffDay: true },
      { name: '端午节', date: '2026-06-20', isOffDay: true },
      { name: '端午节', date: '2026-06-21', isOffDay: true },
      { name: '国庆节', date: '2026-09-20', isOffDay: false },
      { name: '中秋节', date: '2026-09-25', isOffDay: true },
      { name: '中秋节', date: '2026-09-26', isOffDay: true },
      { name: '中秋节', date: '2026-09-27', isOffDay: true },
      { name: '国庆节', date: '2026-10-01', isOffDay: true },
      { name: '国庆节', date: '2026-10-02', isOffDay: true },
      { name: '国庆节', date: '2026-10-03', isOffDay: true },
      { name: '国庆节', date: '2026-10-04', isOffDay: true },
      { name: '国庆节', date: '2026-10-05', isOffDay: true },
      { name: '国庆节', date: '2026-10-06', isOffDay: true },
      { name: '国庆节', date: '2026-10-07', isOffDay: true },
      { name: '国庆节', date: '2026-10-10', isOffDay: false },
    ],
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidHolidayDate(date: string, year: number) {
  if (!new RegExp(`^${year}-\\d{2}-\\d{2}$`).test(date)) return false
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return false

  const [parsedYear, parsedMonth, parsedDay] = date.split('-').map(Number)
  return parsed.getFullYear() === parsedYear && parsed.getMonth() + 1 === parsedMonth && parsed.getDate() === parsedDay
}

export function normalizeChinaHolidayDocument(value: unknown, expectedYear: number): ChinaHolidayDocument {
  if (!isRecord(value) || value.year !== expectedYear || !Array.isArray(value.days)) {
    throw new Error(`节假日数据格式无效：${expectedYear}`)
  }
  if (value.days.length > 400) throw new Error(`节假日数据条目过多：${expectedYear}`)

  const days = value.days.map((item) => {
    if (!isRecord(item)) throw new Error(`节假日数据条目无效：${expectedYear}`)
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const date = typeof item.date === 'string' ? item.date : ''
    if (!name || name.length > 40 || !isValidHolidayDate(date, expectedYear) || typeof item.isOffDay !== 'boolean') {
      throw new Error(`节假日数据条目无效：${expectedYear}`)
    }
    return { name, date, isOffDay: item.isOffDay }
  })

  const papers = Array.isArray(value.papers)
    ? value.papers.filter((paper): paper is string => typeof paper === 'string' && paper.startsWith('https://')).slice(0, 8)
    : []

  return { year: expectedYear, papers, days }
}

function chinaHolidaySourceUrls(year: number) {
  return [
    `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
    `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
  ]
}

async function fetchChinaHolidayDocument(year: number) {
  let lastError: unknown = new Error(`无法读取 ${year} 年节假日数据`)

  for (const url of chinaHolidaySourceUrls(year)) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), chinaHolidayRequestTimeoutMs)

    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error(`节假日数据读取失败：${response.status}`)
      const body = await response.text()
      if (body.length > maxHolidayPayloadLength) throw new Error('节假日数据文件过大')
      return normalizeChinaHolidayDocument(JSON.parse(body) as unknown, year)
    } catch (error) {
      lastError = error
    } finally {
      window.clearTimeout(timer)
    }
  }

  throw lastError
}

function readChinaHolidayCache(): ChinaHolidayCache {
  const emptyCache: ChinaHolidayCache = { version: 1, years: {} }

  try {
    const saved = localStorage.getItem(chinaHolidayCacheKey)
    if (!saved) return emptyCache
    const parsed = JSON.parse(saved) as unknown
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.years)) return emptyCache

    const years: Record<string, ChinaHolidayCacheEntry> = {}
    Object.entries(parsed.years).forEach(([yearKey, rawEntry]) => {
      const year = Number(yearKey)
      if (!Number.isInteger(year) || !isRecord(rawEntry) || typeof rawEntry.fetchedAt !== 'number') return
      try {
        years[yearKey] = {
          fetchedAt: rawEntry.fetchedAt,
          document: normalizeChinaHolidayDocument(rawEntry.document, year),
        }
      } catch {
        // Ignore only the malformed cached year and keep other valid years.
      }
    })
    return { version: 1, years }
  } catch {
    return emptyCache
  }
}

function writeChinaHolidayCache(cache: ChinaHolidayCache) {
  try {
    localStorage.setItem(chinaHolidayCacheKey, JSON.stringify(cache))
  } catch {
    // Holiday data remains available from the bundled fallback when storage is unavailable.
  }
}

function normalizedHolidayYears(years: number[]) {
  return Array.from(new Set(years.filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100))).sort((left, right) => left - right)
}

function holidayItemsFromDocuments(documents: ChinaHolidayDocument[]) {
  const itemsByDate = new Map<string, ChinaHolidayItem>()
  documents.forEach((document) => {
    document.days.forEach((day) => {
      itemsByDate.set(day.date, {
        id: `china-holiday-${day.date}`,
        date: day.date,
        name: day.name,
        type: day.isOffDay ? '休' : '班',
      })
    })
  })
  return Array.from(itemsByDate.values()).sort((left, right) => left.date.localeCompare(right.date))
}

export function chinaHolidayYearsForRange(start: Date, end: Date) {
  const startYear = Math.min(start.getFullYear(), end.getFullYear())
  const endYear = Math.max(start.getFullYear(), end.getFullYear())
  return normalizedHolidayYears(Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index))
}

export function bundledChinaHolidayItems(years: number[]) {
  return holidayItemsFromDocuments(
    normalizedHolidayYears(years)
      .map((year) => bundledChinaHolidayDocuments[year])
      .filter((document): document is ChinaHolidayDocument => Boolean(document)),
  )
}

export async function loadChinaHolidayItems(years: number[], forceRefresh = false): Promise<ChinaHolidayLoadResult> {
  const requestedYears = normalizedHolidayYears(years)
  const cache = readChinaHolidayCache()
  const now = Date.now()
  let cacheChanged = false

  const loadedYears = await Promise.all(
    requestedYears.map(async (year) => {
      const cached = cache.years[String(year)]
      if (!forceRefresh && cached && now - cached.fetchedAt < chinaHolidayRefreshIntervalMs) {
        return { document: cached.document, source: 'cache' as const, updatedAt: cached.fetchedAt }
      }

      try {
        const document = await fetchChinaHolidayDocument(year)
        cache.years[String(year)] = { fetchedAt: now, document }
        cacheChanged = true
        return { document, source: 'network' as const, updatedAt: now }
      } catch {
        if (cached) return { document: cached.document, source: 'cache' as const, updatedAt: cached.fetchedAt }
        const bundled = bundledChinaHolidayDocuments[year]
        if (bundled) return { document: bundled, source: 'bundled' as const, updatedAt: undefined }
        return { document: null, source: 'unavailable' as const, updatedAt: undefined }
      }
    }),
  )

  if (cacheChanged) writeChinaHolidayCache(cache)

  const available = loadedYears.filter((entry): entry is Exclude<typeof entry, { document: null }> => entry.document !== null)
  const sources = new Set(available.map((entry) => entry.source))
  const source: ChinaHolidayLoadSource =
    available.length === 0
      ? 'unavailable'
      : sources.size > 1
        ? 'mixed'
        : (available[0]?.source ?? 'unavailable')
  const updatedAtValues = available.map((entry) => entry.updatedAt).filter((value): value is number => typeof value === 'number')

  return {
    items: holidayItemsFromDocuments(available.map((entry) => entry.document)),
    source,
    updatedAt: updatedAtValues.length > 0 ? Math.max(...updatedAtValues) : undefined,
    unavailableYears: requestedYears.filter((year) => !available.some((entry) => entry.document.year === year)),
  }
}
