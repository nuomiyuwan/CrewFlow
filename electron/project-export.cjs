const ExcelJS = require('exceljs')
const workbookFont = process.platform === 'win32' ? 'Microsoft YaHei UI' : process.platform === 'darwin' ? 'PingFang SC' : 'Noto Sans CJK SC'

const sheetDefinitions = [
  {
    name: '项目总览',
    key: 'projects',
    columns: [
      ['项目编号', 'id', 27], ['项目名称', 'name', 32], ['项目类型', 'type', 18], ['公司/客户', 'client', 24],
      ['对接人', 'clientContact', 16], ['项目经理', 'manager', 15], ['项目负责人', 'owner', 15], ['当前执行', 'executor', 24],
      ['项目状态', 'status', 14], ['记录健康状态', 'healthStatus', 16], ['人工标记状态', 'healthStatusExplicit', 16],
      ['当前进度', 'progress', 12, '0%'], ['节点状态', 'workStatus', 16], ['当前流程', 'stage', 18],
      ['下一节点', 'nextMilestone', 24], ['节点名称', 'calendarTitle', 20], ['最终交付日期', 'due', 16], ['项目主路径', 'path', 42],
      ['其他路径', 'additionalPaths', 42], ['创建账号', 'creatorAccountId', 16],
    ],
  },
  {
    name: '任务明细',
    key: 'tasks',
    columns: [
      ['项目编号', 'projectId', 27], ['项目名称', 'projectName', 32], ['任务编号', 'id', 24], ['任务工种', 'workType', 18],
      ['任务名称', 'title', 34], ['分派方式', 'assignmentMode', 14], ['执行人/外包方', 'assignee', 20], ['截止时间', 'due', 16],
      ['任务状态', 'status', 14], ['任务备注', 'note', 42], ['完成实证资料', 'evidencePath', 42],
    ],
  },
  {
    name: '交付节点',
    key: 'calendarItems',
    columns: [
      ['项目编号', 'projectId', 27], ['项目名称', 'projectName', 32], ['节点编号', 'id', 24], ['日期', 'date', 16], ['日序', 'day', 10],
      ['显示日期', 'time', 14], ['节点名称', 'title', 26], ['节点类型', 'type', 18], ['负责人', 'owner', 18],
      ['最终交付节点', 'isFinalDelivery', 16], ['已完成', 'completed', 12],
    ],
  },
  {
    name: '财务结算',
    key: 'financeRecords',
    columns: [
      ['项目编号', 'projectId', 27], ['项目名称', 'projectName', 32], ['合同名称', 'contractName', 30],
      ['合同金额', 'contractAmount', 16, '#,##0.00'], ['已收金额', 'receivedAmount', 16, '#,##0.00'], ['待收金额', 'unreceivedAmount', 16, '#,##0.00'],
      ['已开票金额', 'invoiceAmount', 16, '#,##0.00'], ['报价单状态', 'quoteStatus', 15], ['报价单文件', 'quoteFile', 42],
      ['比价单状态', 'comparisonStatus', 15], ['比价单文件', 'comparisonFile', 42], ['甲方结算状态', 'clientSettlementStatus', 16],
      ['合同状态', 'contractStatus', 15], ['合同文件', 'contractFile', 42], ['开票状态', 'invoiceStatus', 15], ['财务状态', 'settlementStatus', 15],
      ['下一步收款', 'nextCollection', 28], ['收款日期', 'nextCollectionDate', 16], ['收款备注', 'nextCollectionNote', 36],
      ['外包成本', 'outsourcedCost', 16, '#,##0.00'], ['外包发票状态', 'outsourcedInvoiceStatus', 16],
      ['外包结算状态', 'outsourcedSettlementStatus', 16], ['应付金额', 'payableAmount', 16, '#,##0.00'], ['应付备注', 'payableNote', 36],
    ],
  },
  {
    name: '财务流水',
    key: 'financeLedger',
    columns: [
      ['项目编号', 'projectId', 27], ['项目名称', 'projectName', 32], ['记录类型', 'category', 14], ['记录编号', 'id', 24],
      ['日期', 'date', 16], ['标题', 'title', 28], ['金额', 'amount', 16, '#,##0.00'], ['备注', 'note', 42], ['资料文件', 'materialFile', 42],
    ],
  },
]

function cellValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return value == null ? '' : String(value)
}

function addSheet(workbook, definition, rows) {
  const sheet = workbook.addWorksheet(definition.name, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 22 },
  })
  sheet.columns = definition.columns.map(([header, key, width]) => ({ header, key, width }))
  sheet.addRows(rows.map((row) => Object.fromEntries(definition.columns.map(([, key]) => [key, cellValue(row?.[key])]))))
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(definition.columns.length).letter}${Math.max(1, sheet.rowCount)}` }

  const header = sheet.getRow(1)
  header.height = 28
  header.font = { name: workbookFont, size: 10, bold: true, color: { argb: 'FFF7FBFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173449' } }
  header.alignment = { vertical: 'middle', horizontal: 'center' }

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.font = { name: workbookFont, size: 10, color: { argb: 'FF1C2A35' } }
      row.alignment = { vertical: 'top', wrapText: true }
    }
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFDCE4EA' } },
        left: { style: 'thin', color: { argb: 'FFDCE4EA' } },
        bottom: { style: 'thin', color: { argb: 'FFDCE4EA' } },
        right: { style: 'thin', color: { argb: 'FFDCE4EA' } },
      }
      if (rowNumber > 1 && rowNumber % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F8FA' } }
      }
    })
  })

  definition.columns.forEach(([, key, , numFmt]) => {
    if (numFmt) sheet.getColumn(key).numFmt = numFmt
  })
}

async function createProjectWorkbookBuffer(data) {
  const projects = Array.isArray(data?.projects) ? data.projects : []
  if (projects.length === 0 || projects.length > 5000) throw new Error('请选择要导出的项目')

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CrewFlow'
  workbook.created = new Date()
  sheetDefinitions.forEach((definition) => addSheet(workbook, definition, Array.isArray(data?.[definition.key]) ? data[definition.key] : []))
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

module.exports = { createProjectWorkbookBuffer }
