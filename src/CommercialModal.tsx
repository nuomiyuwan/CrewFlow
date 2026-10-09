import { useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, X } from 'lucide-react'
import {
  emptyCommercialRecord, generalCategories, makeQuote, newCommercialId, newWorkLine,
  numberOrNull, quoteLineTotal, taskSnapshot, usesDays, validateQuote, validateWorkStatement,
  videoCategories, workUnits,
  type CommercialRecord, type Quote, type QuoteLine, type WorkLine, type WorkProject, type WorkTask,
} from './commercial-model'
import './CommercialModal.css'

type Props = {
  project: WorkProject
  tasks: WorkTask[]
  record?: CommercialRecord
  canEditWork: boolean
  canQuote: boolean
  actor: string
  onSave: (next: CommercialRecord, previous?: CommercialRecord) => Promise<void>
  onClose: () => void
}

export default function CommercialModal({ project, tasks, record, canEditWork, canQuote, actor, onSave, onClose }: Props) {
  const [base, setBase] = useState(record)
  const [draft, setDraft] = useState(() => structuredClone(record ?? emptyCommercialRecord(project.id)))
  const [tab, setTab] = useState<'work' | 'quote'>('work')
  const [selectedLines, setSelectedLines] = useState<string[]>([])
  const [versionId, setVersionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(base ?? emptyCommercialRecord(project.id))
  const remoteChanged = JSON.stringify(record) !== JSON.stringify(base)
  const statement = draft.statement
  const categories = statement.preset === 'video' ? videoCategories : generalCategories
  const selectedVersion = draft.versions.find((item) => item.id === versionId)
  const quote = selectedVersion ?? draft.draft
  const quoteEditable = canQuote && !selectedVersion
  const sourceChanged = statement.taskSnapshot && statement.taskSnapshot !== taskSnapshot(tasks)
  const workChanged = JSON.stringify(statement) !== JSON.stringify(base?.statement ?? emptyCommercialRecord(project.id).statement)

  function close() {
    if (busy || (dirty && !window.confirm('有未保存的修改，确认关闭？'))) return
    onClose()
  }

  async function persist(next: CommercialRecord) {
    if (tab === 'quote' && workChanged) { setMessage('请先保存工作量明细，再保存报价。'); return false }
    if (remoteChanged) { setMessage('此项目的明细已更新，请重新载入后编辑。'); return false }
    setBusy(true)
    setMessage('')
    try {
      const saved = { ...next, updatedAt: new Date().toISOString() }
      await onSave(saved, base)
      setBase(saved)
      setDraft(structuredClone(saved))
      setMessage('已保存')
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败，请重试')
      return false
    } finally {
      setBusy(false)
    }
  }

  function changeWork(patch: Partial<CommercialRecord['statement']>) {
    setDraft((current) => ({ ...current, statement: { ...current.statement, ...patch, status: 'draft', confirmedAt: '', confirmedBy: '' } }))
  }

  function changeWorkLine(id: string, patch: Partial<WorkLine>) {
    changeWork({ lines: statement.lines.map((line) => line.id === id ? { ...line, ...patch } : line) })
  }

  function changeQuote(patch: Partial<Quote>) {
    setDraft((current) => current.draft ? { ...current, draft: { ...current.draft, ...patch } } : current)
  }

  function changeQuoteLine(id: string, patch: Partial<QuoteLine>) {
    if (!quote || !quoteEditable) return
    changeQuote({ lines: quote.lines.map((line) => line.id === id ? { ...line, ...patch } : line) })
  }

  function importTasks() {
    const imported = new Set(statement.lines.map((line) => line.taskId))
    changeWork({ lines: [...statement.lines, ...tasks.filter((task) => !imported.has(task.id)).map((task) => newWorkLine(statement.preset, task))] })
  }

  async function saveWork(confirm: boolean) {
    if (!canEditWork) return
    const error = confirm ? validateWorkStatement(statement) : ''
    if (error) { setMessage(error); return }
    await persist({ ...draft, statement: {
      ...statement,
      revision: (base?.statement.revision ?? 0) + (workChanged || confirm ? 1 : 0),
      status: confirm ? 'confirmed' : statement.status,
      confirmedAt: confirm ? new Date().toISOString() : statement.confirmedAt,
      confirmedBy: confirm ? actor : statement.confirmedBy,
      taskSnapshot: confirm ? taskSnapshot(tasks) : statement.taskSnapshot,
    } })
  }

  function generateQuote() {
    if (statement.status !== 'confirmed' || workChanged || sourceChanged) {
      setMessage('请先由项目负责人核对并确认工作量依据。')
      return
    }
    if (draft.draft && !window.confirm('重新生成将替换当前报价草稿，已确认版本会保留。继续？')) return
    setDraft((current) => ({ ...current, draft: makeQuote(project, statement) }))
    setSelectedLines([])
    setVersionId('')
    setTab('quote')
    setMessage('')
  }

  async function confirmQuote() {
    if (!draft.draft || !canQuote) return
    const error = validateQuote(draft.draft)
    if (error) { setMessage(error); return }
    if (statement.status !== 'confirmed' || draft.draft.sourceRevision !== statement.revision || sourceChanged || workChanged) {
      setMessage('工作量依据有变动，请核对并从已确认依据重新生成报价。')
      return
    }
    const version = { ...structuredClone(draft.draft), id: newCommercialId(), confirmedAt: new Date().toISOString(), confirmedBy: actor }
    if (await persist({ ...draft, versions: [...draft.versions, version] })) setVersionId(version.id)
  }

  async function exportQuote() {
    if (!quote || !selectedVersion) return
    setBusy(true)
    setMessage('')
    try {
      const bridge = window.desktopBridge?.exportQuote
      if (!bridge) throw new Error('请在桌面 App 中导出报价单')
      const result = await bridge({ title: quote.title, customer: quote.customer, issuer: quote.issuer, note: quote.note, date: quote.confirmedAt.slice(0, 10), lines: quote.lines.map(({ category, name, quantity, days, unit, price, note }) => ({ category, name, quantity, days, unit, price, note })) })
      if (!result.canceled) setMessage('报价单已导出')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导出失败')
    } finally { setBusy(false) }
  }

  function mergeQuoteLines() {
    if (!quote || selectedLines.length < 2) return
    const merging = quote.lines.filter((line) => selectedLines.includes(line.id))
    const first = merging[0]
    const merged: QuoteLine = { ...first, id: newCommercialId(), sourceIds: [...new Set(merging.flatMap((line) => line.sourceIds))], name: merging.map((line) => line.name).join(' / '), quantity: null, days: null, unit: '项', price: null }
    changeQuote({ lines: quote.lines.flatMap((line) => line.id === first.id ? [merged] : selectedLines.includes(line.id) ? [] : [line]) })
    setSelectedLines([])
  }

  return (
    <div className="modalBackdrop" onMouseDown={close}>
      <section className="financeEntryModal commercialModal" role="dialog" aria-modal="true" aria-label="工作量与报价" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="eyebrow">工作量与报价</span><h2>{project.name}</h2></div><button type="button" onClick={close} aria-label="关闭"><X size={18} /></button></header>
        <div className="commercialTabs">
          <button className={tab === 'work' ? 'active' : ''} onClick={() => setTab('work')}>工作量与费用明细</button>
          {canQuote && <button className={tab === 'quote' ? 'active' : ''} onClick={() => setTab('quote')}>报价单{draft.versions.length > 0 ? ` · ${draft.versions.length}个版本` : ''}</button>}
          <span>{statement.status === 'confirmed' ? '依据已确认' : statement.lines.length ? '依据待确认' : '依据待补充'}</span>
        </div>
        <div className="commercialBody">
          {remoteChanged && <div className="commercialNotice">其他成员已更新此项目的明细。<button disabled={busy} onClick={() => { if (dirty && !window.confirm('重新载入会放弃未保存修改，继续？')) return; setBase(record); setDraft(structuredClone(record ?? emptyCommercialRecord(project.id))); setMessage(''); setVersionId('') }}>重新载入</button></div>}
          {tab === 'work' ? <>
            <div className="commercialToolbar">
              <label>填写预设<select disabled={!canEditWork || busy} value={statement.preset} onChange={(event) => changeWork({ preset: event.target.value as 'general' | 'video' })}><option value="general">通用项目</option><option value="video">视频制作</option></select></label>
              {canEditWork && <><button disabled={busy} onClick={importTasks}>带入未添加的任务</button><button disabled={busy} onClick={() => changeWork({ lines: [...statement.lines, newWorkLine(statement.preset)] })}><Plus size={15} />添加明细</button></>}
            </div>
            {sourceChanged && <p className="commercialNotice">关联任务有变动，请核对人员与工作内容后重新确认依据。</p>}
            {statement.lines.length === 0 && <div className="commercialEmpty">暂无工作量明细</div>}
            <fieldset disabled={!canEditWork || busy} className="commercialLines">
              {statement.lines.map((line, index) => <article className="commercialWorkLine" key={line.id}>
                <div className="commercialLineHeading"><strong>{index + 1}. {line.name || '新增明细'}</strong><button aria-label="删除明细" onClick={() => changeWork({ lines: statement.lines.filter((item) => item.id !== line.id) })}><Trash2 size={15} /></button></div>
                <div className="commercialFields">
                  <label>分类<input list="commercial-categories" value={line.category} onChange={(event) => changeWorkLine(line.id, { category: event.target.value })} /></label>
                  <label>工作内容<input value={line.name} onChange={(event) => changeWorkLine(line.id, { name: event.target.value })} /></label>
                  <label>关联任务<select value={line.taskId} onChange={(event) => { const task = tasks.find((item) => item.id === event.target.value); changeWorkLine(line.id, { taskId: event.target.value, ...(task ? { people: task.assignee } : {}) }) }}><option value="">独立费用／工作项</option>{line.taskId && !tasks.some((task) => task.id === line.taskId) && <option value={line.taskId}>原任务已移除</option>}{tasks.map((task) => <option value={task.id} key={task.id}>{task.workType || task.title} · {task.assignee || '未分配'}</option>)}</select></label>
                  <label>人员／外包方<input value={line.people} onChange={(event) => changeWorkLine(line.id, { people: event.target.value })} /></label>
                  <label>实际开始<input type="date" value={line.start} onChange={(event) => changeWorkLine(line.id, { start: event.target.value })} /></label>
                  <label>实际结束<input type="date" value={line.end} onChange={(event) => changeWorkLine(line.id, { end: event.target.value })} /></label>
                  <label>数量<input type="number" min="0" step="any" placeholder="待补充" value={line.quantity ?? ''} onChange={(event) => changeWorkLine(line.id, { quantity: numberOrNull(event.target.value) })} /></label>
                  <label>单位<input list="commercial-units" value={line.unit} onChange={(event) => changeWorkLine(line.id, { unit: event.target.value })} /></label>
                  <label>{usesDays(line.unit) ? '计费天数' : '实际投入天数'}<input type="number" min="0" step="any" value={line.days ?? ''} placeholder="待补充" onChange={(event) => changeWorkLine(line.id, { days: numberOrNull(event.target.value) })} /></label>
                  <label>内部成本（元）<input type="number" min="0" step="0.01" placeholder="待补充" value={line.cost ?? ''} onChange={(event) => changeWorkLine(line.id, { cost: numberOrNull(event.target.value) })} /></label>
                  <label className="commercialWide">规格与备注<input placeholder={statement.preset === 'video' ? '如：成片2分45秒；包装10条共120秒' : '填写规格、交付数量或费用说明'} value={line.note} onChange={(event) => changeWorkLine(line.id, { note: event.target.value })} /></label>
                </div>
              </article>)}
            </fieldset>
            {statement.confirmedAt && <p className="commercialMeta">{statement.confirmedBy} · {new Date(statement.confirmedAt).toLocaleString()} 确认</p>}
          </> : <>
            <div className="commercialToolbar">
              <select aria-label="报价版本" value={versionId} onChange={(event) => { setVersionId(event.target.value); setSelectedLines([]) }}><option value="">当前草稿</option>{draft.versions.map((item, index) => <option key={item.id} value={item.id}>第 {index + 1} 版 · {new Date(item.confirmedAt).toLocaleDateString()}</option>)}</select>
              <button disabled={busy} onClick={generateQuote}>从已确认依据生成草稿</button>
              {selectedVersion && <button disabled={busy} onClick={() => { if (draft.draft && !window.confirm('以此版本替换当前草稿？')) return; setDraft((current) => ({ ...current, draft: { ...structuredClone(selectedVersion), id: newCommercialId(), confirmedAt: '', confirmedBy: '' } })); setVersionId('') }}>复制为草稿</button>}
            </div>
            {!quote ? <div className="commercialEmpty">确认工作量依据后，可生成报价草稿</div> : <>
              {(quote.sourceRevision !== statement.revision || statement.status !== 'confirmed' || sourceChanged) && <p className="commercialNotice">当前依据与此报价版本不同，原报价内容保留。</p>}
              <fieldset disabled={!quoteEditable || busy} className="commercialQuoteFields">
                <div className="commercialFields"><label className="commercialWide">报价单标题<input value={quote.title} onChange={(event) => changeQuote({ title: event.target.value })} /></label><label>客户名称<input value={quote.customer} onChange={(event) => changeQuote({ customer: event.target.value })} /></label><label>报价单位<input value={quote.issuer} onChange={(event) => changeQuote({ issuer: event.target.value })} /></label></div>
                <div className="commercialToolbar"><button onClick={() => changeQuote({ lines: [...quote.lines, { id: newCommercialId(), sourceIds: [], category: '其他费用', name: '', quantity: null, days: null, unit: '项', price: null, note: '' }] })}><Plus size={15} />添加报价项</button><button disabled={selectedLines.length < 2} onClick={mergeQuoteLines}>合并所选项</button><span>单价与金额均为含税金额</span></div>
                <div className="commercialQuoteTable"><table><thead><tr><th>选择</th><th>分类／内容</th><th>数量</th><th>天数</th><th>单位</th><th>含税单价</th><th>含税小计</th><th>备注／关联依据</th><th>调整</th></tr></thead><tbody>
                  {quote.lines.map((line, index) => <tr key={line.id}>
                    <td><input type="checkbox" aria-label={`选择报价项${index + 1}`} checked={selectedLines.includes(line.id)} onChange={(event) => setSelectedLines(event.target.checked ? [...selectedLines, line.id] : selectedLines.filter((id) => id !== line.id))} /></td>
                    <td><input aria-label="报价分类" list="commercial-categories" value={line.category} onChange={(event) => changeQuoteLine(line.id, { category: event.target.value })} /><input aria-label="报价内容" value={line.name} onChange={(event) => changeQuoteLine(line.id, { name: event.target.value })} /></td>
                    <td><input aria-label="报价数量" type="number" min="0" step="any" value={line.quantity ?? ''} onChange={(event) => changeQuoteLine(line.id, { quantity: numberOrNull(event.target.value) })} /></td>
                    <td><input aria-label="报价天数" disabled={!usesDays(line.unit)} type="number" min="0" step="any" value={usesDays(line.unit) ? line.days ?? '' : ''} onChange={(event) => changeQuoteLine(line.id, { days: numberOrNull(event.target.value) })} /></td>
                    <td><input aria-label="计费单位" list="commercial-units" value={line.unit} onChange={(event) => changeQuoteLine(line.id, { unit: event.target.value })} /></td>
                    <td><input aria-label="报价单价" type="number" min="0" step="0.01" value={line.price ?? ''} onChange={(event) => changeQuoteLine(line.id, { price: numberOrNull(event.target.value) })} /></td>
                    <td>{quoteLineTotal(line)?.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) ?? '待填写'}</td>
                    <td><input aria-label="报价备注" value={line.note} onChange={(event) => changeQuoteLine(line.id, { note: event.target.value })} /><small>{line.sourceIds.map((id) => quote.source.lines.find((source) => source.id === id)?.name).filter(Boolean).join('、') || '独立报价项'}</small></td>
                    <td><div className="commercialRowActions"><button aria-label="上移" disabled={index === 0} onClick={() => { const lines = [...quote.lines]; [lines[index - 1], lines[index]] = [lines[index], lines[index - 1]]; changeQuote({ lines }) }}><ArrowUp size={14} /></button><button aria-label="下移" disabled={index === quote.lines.length - 1} onClick={() => { const lines = [...quote.lines]; [lines[index + 1], lines[index]] = [lines[index], lines[index + 1]]; changeQuote({ lines }) }}><ArrowDown size={14} /></button><button aria-label="复制拆分报价项" title="复制拆分" onClick={() => changeQuote({ lines: quote.lines.flatMap((item) => item.id === line.id ? [item, { ...structuredClone(item), id: newCommercialId(), quantity: null, price: null }] : [item]) })}><Copy size={14} /></button><button aria-label="删除报价项" onClick={() => changeQuote({ lines: quote.lines.filter((item) => item.id !== line.id) })}><Trash2 size={14} /></button></div></td>
                  </tr>)}
                </tbody></table></div>
                <label>报价备注<textarea value={quote.note} onChange={(event) => changeQuote({ note: event.target.value })} /></label>
              </fieldset>
              <div className="commercialTotals">{[...new Set(quote.lines.map((line) => line.category))].map((category) => { const lines = quote.lines.filter((line) => line.category === category); return <span key={category}>{category}：{lines.some((line) => quoteLineTotal(line) === null) ? '待补充' : lines.reduce((sum, line) => sum + quoteLineTotal(line)!, 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span> })}<strong>合计：{quote.lines.some((line) => quoteLineTotal(line) === null) ? '待补充' : quote.lines.reduce((sum, line) => sum + quoteLineTotal(line)!, 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })} 元</strong></div>
              <details className="commercialSource"><summary>查看此报价采用的工作量依据</summary>{quote.source.lines.map((line) => <p key={line.id}>{line.category} · {line.name} · {line.quantity ?? '待补充'}{line.unit}{usesDays(line.unit) ? ` × ${line.days ?? '待补充'}天` : line.days !== null ? ` · 投入${line.days}天` : ''} · {line.people || '人员未填写'}{line.start || line.end ? ` · ${line.start || '未填写'} 至 ${line.end || '未填写'}` : ''} · 内部成本：{line.cost === null ? '待补充' : `${line.cost}元`}{line.note ? ` · ${line.note}` : ''}</p>)}</details>
            </>}
          </>}
          <datalist id="commercial-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
          <datalist id="commercial-units">{workUnits.map((unit) => <option key={unit} value={unit} />)}</datalist>
        </div>
        <footer><span className="commercialMessage" role="status">{message}</span><button disabled={busy} onClick={close}>关闭</button>{tab === 'work' && canEditWork && <><button disabled={busy || remoteChanged} onClick={() => void saveWork(false)}>保存明细</button><button className="primary" disabled={busy || remoteChanged} onClick={() => void saveWork(true)}>确认依据</button></>}{tab === 'quote' && quoteEditable && quote && <><button disabled={busy || remoteChanged} onClick={() => void persist(draft)}>保存草稿</button><button className="primary" disabled={busy || remoteChanged} onClick={() => void confirmQuote()}>确认并保存版本</button></>}{tab === 'quote' && selectedVersion && <button className="primary" disabled={busy} onClick={() => void exportQuote()}>导出 Excel</button>}</footer>
      </section>
    </div>
  )
}
