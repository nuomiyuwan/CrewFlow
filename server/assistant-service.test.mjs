import assert from 'node:assert/strict'
import test from 'node:test'
import assistantService from '../electron/assistant-service.cjs'

const {
  normalizeAssistantSettings,
  onlineChatUrl,
  onlineConversationMessages,
  localChatUrl,
  localChatModelNames,
  parseCalendarExtraction,
  parseOperationExtraction,
  parseAssistantRouting,
  sanitizeRoutedOperation,
  inferOperationFromConversation,
  stripThinkingBlocks,
  normalizeAssistantMessage,
} = assistantService

test('assistant settings default to local rules and keep context private by default', () => {
  assert.deepEqual(normalizeAssistantSettings({}), {
    mode: 'rules',
    onlineBaseUrl: '',
    onlineModel: '',
    localBaseUrl: 'http://127.0.0.1:11434',
    localModel: '',
    localThinking: false,
    includeProjectContext: true,
    includeFinanceContext: false,
    fallbackToRules: true,
  })
  assert.equal(normalizeAssistantSettings({ localThinking: true }).localThinking, true)
})

test('assistant provider URLs are normalized safely', () => {
  assert.equal(onlineChatUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions')
  assert.equal(localChatUrl('http://127.0.0.1:11434/'), 'http://127.0.0.1:11434/api/chat')
  assert.throws(() => onlineChatUrl('file:///tmp/model'), /仅支持 http 或 https/)
})

test('online assistant requests keep supported images as high-detail multimodal content', () => {
  const imageDataUrl = 'data:image/png;base64,aGVsbG8='
  assert.deepEqual(
    onlineConversationMessages([
      {
        role: 'user',
        content: '识别这张排期表',
        images: [
          { name: 'schedule.png', mimeType: 'image/png', dataUrl: imageDataUrl },
          { name: 'unsafe.svg', mimeType: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,aGVsbG8=' },
        ],
      },
    ]),
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: '识别这张排期表' },
          {
            type: 'image_url',
            image_url: {
              url: imageDataUrl,
              detail: 'high',
            },
          },
        ],
      },
    ],
  )
})

test('local model options exclude embedding-only models', () => {
  assert.deepEqual(
    localChatModelNames({
      models: [
        {
          name: 'qwen3:14b',
          details: { family: 'qwen3', families: ['qwen3'] },
        },
        {
          name: 'nomic-embed-text:latest',
          details: { family: 'nomic-bert', families: ['nomic-bert'] },
        },
      ],
    }),
    ['qwen3:14b'],
  )
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

test('assistant capability replies describe calendar prefill instead of denying all write support', () => {
  assert.equal(
    normalizeAssistantMessage(
      '抱歉，我无法直接写入项目数据。所有修改都需要你确认后落地，我没有写入权限。\n\n已经整理好四个节点。',
    ),
    '我可以把明确的日历节点带入 CrewFlow 的确认窗口，由你检查后保存。所有修改都需要你确认后落地，\n\n已经整理好四个节点。',
  )
})

test('calendar extraction accepts a JSON object surrounded by model commentary', () => {
  const result = parseCalendarExtraction(
    '我已经整理完成。\n{"message":"请确认","candidates":[{"projectId":"P-1","date":"2026-08-08","title":"提交方案"}]}\n以上是提取结果。',
  )
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].title, '提交方案')
})

test('operation extraction normalizes project and task drafts without inventing missing values', () => {
  const result = parseOperationExtraction(`{
    "message": "正在打开确认窗口",
    "operation": {
      "type": "assign_task",
      "projectId": "P-1",
      "projectName": "示例项目",
      "workType": "设计",
      "assignmentMode": "internal",
      "assignee": "张三",
      "taskStatus": "未开始",
      "deliveryDate": "2026-08-20"
    }
  }`)

  assert.equal(result.message, '正在打开确认窗口')
  assert.equal(result.operation.type, 'assign_task')
  assert.equal(result.operation.projectId, 'P-1')
  assert.equal(result.operation.workType, '设计')
  assert.equal(result.operation.deliveryDate, '2026-08-20')
  assert.deepEqual(result.operation.workTypes, [])
  assert.equal(result.operation.client, '')
})

test('assistant routing returns model-selected confirmation flows without phrase matching', () => {
  const calendarResult = parseAssistantRouting(`{
    "kind": "calendar_candidates",
    "message": "准备打开确认窗口",
    "openConfirmation": true,
    "clearPending": false,
    "candidates": [
      {
        "projectId": "P-1",
        "projectName": "时差2.0",
        "date": "2026-08-30",
        "title": "后期包装制作",
        "owner": "胡晓曼",
        "source": "自然语言内容"
      }
    ],
    "operation": null
  }`)
  assert.equal(calendarResult.kind, 'calendar_candidates')
  assert.equal(calendarResult.openConfirmation, true)
  assert.equal(calendarResult.candidates[0].title, '后期包装制作')

  const operationResult = parseAssistantRouting(`{
    "kind": "operation",
    "message": "准备新建项目",
    "operation": {
      "type": "create_project",
      "name": "秋季活动"
    }
  }`)
  assert.equal(operationResult.kind, 'operation')
  assert.equal(operationResult.operation.type, 'create_project')
  assert.equal(operationResult.operation.name, '秋季活动')
})

test('assistant routing keeps ordinary conversation and cancellation as messages', () => {
  const result = parseAssistantRouting(
    '{"kind":"message","message":"当然可以，我们接着聊。","clearPending":true,"candidates":[],"operation":null}',
  )
  assert.deepEqual(result, {
    kind: 'message',
    message: '当然可以，我们接着聊。',
    clearPending: true,
  })
})

test('routed operations drop unrelated or unmentioned model fields before opening a form', () => {
  const updateOperation = parseOperationExtraction(`{
    "operation": {
      "type": "update_project",
      "projectId": "P-1",
      "projectName": "时差2.0",
      "manager": "陈英琦",
      "stage": "等甲方反馈",
      "deliveryDate": "2026-07-28"
    }
  }`).operation
  const sanitizedUpdate = sanitizeRoutedOperation(
    updateOperation,
    [{ role: 'user', content: '时差现在先等客户回话，状态带到等甲方反馈' }],
    {
      workflowOptions: {
        workflowStages: ['后期制作'],
        nodeStatuses: ['进行中', '等甲方反馈'],
      },
      projects: [
        {
          id: 'P-1',
          name: '时差2.0',
          manager: '陈英琦',
          stage: '后期制作',
          workStatus: '进行中',
        },
      ],
    },
  )
  assert.equal(sanitizedUpdate.deliveryDate, '')
  assert.equal(sanitizedUpdate.manager, '')
  assert.equal(sanitizedUpdate.stage, '')
  assert.equal(sanitizedUpdate.workStatus, '等甲方反馈')

  const assignmentOperation = parseOperationExtraction(`{
    "operation": {
      "type": "assign_task",
      "projectId": "P-1",
      "projectName": "时差2.0",
      "workType": "包装",
      "assignee": "胡晓曼",
      "calendarTitle": "包装",
      "deliveryDate": "2026-07-28"
    }
  }`).operation
  const sanitizedAssignment = sanitizeRoutedOperation(
    assignmentOperation,
    [{ role: 'user', content: '时差的包装让胡晓曼来做' }],
    {},
  )
  assert.equal(sanitizedAssignment.deliveryDate, '')
  assert.equal(sanitizedAssignment.taskDue, '')
  assert.equal(sanitizedAssignment.calendarTitle, '')
  assert.equal(sanitizedAssignment.workType, '包装')
})

test('routed project creation accepts a model-provided projectName as the draft name', () => {
  const operation = parseOperationExtraction(
    '{"operation":{"type":"create_project","projectName":"秋季发布会宣传片","deliveryDate":"2026-09-18"}}',
  ).operation
  const sanitized = sanitizeRoutedOperation(
    operation,
    [{ role: 'user', content: '秋季发布会宣传片，9月18日交付，先立个项目' }],
    {},
  )
  assert.equal(sanitized.name, '秋季发布会宣传片')
  assert.equal(sanitized.deliveryDate, '2026-09-18')
})

test('operation fallback recognizes natural task assignment from visible options', () => {
  const result = inferOperationFromConversation(
    [{ role: 'user', content: '把项目“示例项目”的设计任务分给张三，状态设为未开始。' }],
    {
      today: '2026-07-28',
      projects: [{ id: 'P-1', name: '示例项目' }],
      staff: [{ name: '张三' }],
      workflowOptions: {
        taskWorkTypes: ['设计', '开发'],
        workflowStages: ['方案确认'],
        nodeStatuses: ['未开始'],
      },
    },
  )

  assert.equal(result.operation.type, 'assign_task')
  assert.equal(result.operation.projectId, 'P-1')
  assert.equal(result.operation.workType, '设计')
  assert.equal(result.operation.assignee, '张三')
  assert.equal(result.operation.taskStatus, '未开始')
})
