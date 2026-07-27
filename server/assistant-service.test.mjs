import assert from 'node:assert/strict'
import test from 'node:test'
import assistantService from '../electron/assistant-service.cjs'

const {
  normalizeAssistantSettings,
  onlineChatUrl,
  localChatUrl,
  parseCalendarExtraction,
  stripThinkingBlocks,
} = assistantService

test('assistant settings default to local rules and keep context private by default', () => {
  assert.deepEqual(normalizeAssistantSettings({}), {
    mode: 'rules',
    onlineBaseUrl: '',
    onlineModel: '',
    localBaseUrl: 'http://127.0.0.1:11434',
    localModel: '',
    includeProjectContext: true,
    includeFinanceContext: false,
    fallbackToRules: true,
  })
})

test('assistant provider URLs are normalized safely', () => {
  assert.equal(onlineChatUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions')
  assert.equal(localChatUrl('http://127.0.0.1:11434/'), 'http://127.0.0.1:11434/api/chat')
  assert.throws(() => onlineChatUrl('file:///tmp/model'), /仅支持 http 或 https/)
})

test('calendar extraction accepts fenced JSON and drops incomplete candidates', () => {
  const result = parseCalendarExtraction(`\`\`\`json
  {
    "message": "请确认",
    "candidates": [
      {
        "projectId": "P-1",
        "projectName": "示例项目",
        "date": "2026-08-02",
        "title": "提交审核",
        "owner": "负责人",
        "source": "8月2日提交审核"
      },
      {
        "projectId": "P-1",
        "date": "",
        "title": "日期不明确"
      },
      {
        "projectId": "P-1",
        "date": "2026-02-30",
        "title": "无效日期"
      }
    ]
  }
  \`\`\``)

  assert.equal(result.message, '请确认')
  assert.deepEqual(result.candidates, [
    {
      projectId: 'P-1',
      projectName: '示例项目',
      date: '2026-08-02',
      title: '提交审核',
      owner: '负责人',
      source: '8月2日提交审核',
    },
  ])
})

test('assistant responses hide model reasoning blocks', () => {
  assert.equal(
    stripThinkingBlocks('<think>The user sent a test. I should answer briefly.</think>\n\n收到测试，可以正常使用。'),
    '收到测试，可以正常使用。',
  )
})

test('calendar extraction accepts a JSON object surrounded by model commentary', () => {
  const result = parseCalendarExtraction(
    '我已经整理完成。\n{"message":"请确认","candidates":[{"projectId":"P-1","date":"2026-08-08","title":"提交方案"}]}\n以上是提取结果。',
  )
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].title, '提交方案')
})
