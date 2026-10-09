const ExcelJS = require('exceljs')

const usesDays = (unit) => ['人天', '台天', '间夜'].includes(unit)
const rounded = (value) => Math.round((value + Number.EPSILON) * 100) / 100

async function createQuoteWorkbookBuffer(payload) {
  if (!payload || typeof payload.title !== 'string' || !payload.title.trim()) throw new Error('报价单标题未填写')
  if (!Array.isArray(payload.lines) || !payload.lines.length || payload.lines.length > 2000) throw new Error('报价明细数量无效')
  const groups = new Map()
  for (const line of payload.lines) {
    if (!line || typeof line.name !== 'string' || !line.name.trim() || typeof line.category !== 'string' || !line.category.trim() || typeof line.unit !== 'string' || !line.unit.trim()) throw new Error('报价名称、分类或单位未填写')
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.price) || line.price < 0) throw new Error('报价数量或单价无效')
    if (usesDays(line.unit) && (!Number.isFinite(line.days) || line.days <= 0)) throw new Error('计费天数未填写')
    if (!Number.isFinite(line.price * line.quantity * (usesDays(line.unit) ? line.days : 1))) throw new Error('报价金额超出范围')
    if (!groups.has(line.category)) groups.set(line.category, [])
    groups.get(line.category).push(line)
  }
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CrewFlow'
  workbook.created = new Date()
  workbook.calcProperties.fullCalcOnLoad = true
  const sheet = workbook.addWorksheet('报价单', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:4' },
  })
  sheet.columns = [7, 16, 32, 16, 12, 12, 12, 18, 32].map((width) => ({ width }))
  sheet.mergeCells('A1:I1')
  sheet.getCell('A1').value = payload.title.trim()
  sheet.getRow(1).height = 36
  sheet.mergeCells('A2:I2')
  sheet.getCell('A2').value = `客户：${payload.customer || ''}`
  sheet.mergeCells('A3:I3')
  sheet.getCell('A3').value = `报价单位：${payload.issuer || ''}    日期：${payload.date || ''}`
  sheet.getRow(4).values = ['序号', '项目', '内容', '单价（含税）', '数量', '天数', '单位', '小计（含税）', '备注']
  let serial = 1
  let total = 0
  const subtotalRows = []
  for (const [category, lines] of groups) {
    const start = sheet.rowCount + 1
    let subtotal = 0
    for (const line of lines) {
      const amount = rounded(line.price * line.quantity * (usesDays(line.unit) ? line.days : 1))
      const row = sheet.addRow([serial++, category, line.name, line.price, line.quantity, usesDays(line.unit) ? line.days : '/', line.unit, amount, String(line.note || '')])
      const visualLength = (text) => Array.from(String(text)).reduce((sum, character) => sum + (character.charCodeAt(0) > 255 ? 2 : 1), 0)
      row.height = 20 * Math.max(2, Math.ceil(visualLength(line.name) / 28), Math.ceil(visualLength(line.note || '') / 28))
      row.getCell(8).value = { formula: `ROUND(D${row.number}*E${row.number}${usesDays(line.unit) ? `*F${row.number}` : ''},2)`, result: amount }
      subtotal = rounded(subtotal + amount)
    }
    const end = sheet.rowCount
    if (end > start) sheet.mergeCells(start, 2, end, 2)
    const row = sheet.addRow([`${category}小计`])
    sheet.mergeCells(row.number, 1, row.number, 7)
    row.getCell(8).value = { formula: `SUM(H${start}:H${end})`, result: subtotal }
    subtotalRows.push(row.number)
    total = rounded(total + subtotal)
  }
  const totalRow = sheet.addRow(['合计（含税）'])
  sheet.mergeCells(totalRow.number, 1, totalRow.number, 7)
  totalRow.getCell(8).value = { formula: subtotalRows.map((row) => `H${row}`).join('+'), result: total }
  if (payload.note) {
    const row = sheet.addRow([`备注：${String(payload.note)}`])
    sheet.mergeCells(row.number, 1, row.number, 9)
    row.height = 42
  }
  const fontName = process.platform === 'win32' ? 'Microsoft YaHei' : 'PingFang SC'
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 3) row.height = Math.max(row.height || 28, 28)
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: fontName, size: rowNumber === 1 ? 18 : 11, bold: rowNumber === 1 || rowNumber === 4 || subtotalRows.includes(rowNumber) || rowNumber === totalRow.number }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      if (rowNumber >= 4) cell.border = Object.fromEntries(['top', 'bottom', 'left', 'right'].map((side) => [side, { style: 'thin', color: { argb: 'FF9CB3A5' } }]))
      if (rowNumber === 1 || rowNumber === 4 || subtotalRows.includes(rowNumber) || rowNumber === totalRow.number) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6EBD9' } }
    })
  })
  for (const column of [4, 8]) sheet.getColumn(column).numFmt = '#,##0.00'
  sheet.pageSetup.printArea = `A1:I${sheet.rowCount}`
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

module.exports = { createQuoteWorkbookBuffer }
