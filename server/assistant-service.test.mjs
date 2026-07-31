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
    '我可以把当前账号有权限的项目、任务、日历和本机设置带入 CrewFlow 确认窗口，由你检查后保存。所有修改都需要你确认后落地，\n\n已经整理好四个节点。',
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
        "projectName": "示例项目",
        "date": "2026-08-30",
        "title": "后期包装制作",
        "owner": "李四",
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
      "projectName": "示例项目",
      "manager": "张三",
      "stage": "等甲方反馈",
      "deliveryDate": "2026-07-28"
    }
  }`).operation
  const sanitizedUpdate = sanitizeRoutedOperation(
    updateOperation,
    [{ role: 'user', content: '示例项目现在先等客户回话，状态带到等甲方反馈' }],
    {
      workflowOptions: {
        workflowStages: ['后期制作'],
        nodeStatuses: ['进行中', '等甲方反馈'],
      },
      projects: [
        {
          id: 'P-1',
          name: '示例项目',
          manager: '张三',
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
      "projectName": "示例项目",
      "workType": "包装",
      "assignee": "李四",
      "calendarTitle": "包装",
      "deliveryDate": "2026-07-28"
    }
  }`).operation
  const sanitizedAssignment = sanitizeRoutedOperation(
    assignmentOperation,
    [{ role: 'user', content: '示例项目的包装让李四来做' }],
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

test('assistant operations parse project health, task status and local setting drafts', () => {
  const projectResult = parseOperationExtraction(
    '{"operation":{"type":"update_project","projectId":"P-1","healthStatus":"有风险","manager":"张三"}}',
  )
  assert.equal(projectResult.operation.healthStatus, 'risk')
  assert.equal(projectResult.operation.manager, '张三')

  const taskResult = parseOperationExtraction(
    '{"operation":{"type":"update_task","taskId":"T-1","taskTitle":"示例项目 设计","taskStatus":"已完成"}}',
  )
  assert.equal(taskResult.operation.type, 'update_task')
  assert.equal(taskResult.operation.taskId, 'T-1')
  assert.equal(taskResult.operation.taskStatus, '已完成')

  const scheduleResult = parseOperationExtraction(
    '{"operation":{"type":"update_work_schedule","workStart":"09:30","workEnd":"18:30","weatherCity":"不应保留"}}',
  )
  const sanitizedSchedule = sanitizeRoutedOperation(
    scheduleResult.operation,
    [{ role: 'user', content: '上班改成9点半，下班18点半' }],
    {},
  )
  assert.equal(sanitizedSchedule.workStart, '09:30')
  assert.equal(sanitizedSchedule.workEnd, '18:30')
  assert.equal(sanitizedSchedule.weatherCity, '')
})

test('assistant operation fallback recognizes weather, work schedule and task status changes', () => {
  const weather = inferOperationFromConversation(
    [{ role: 'user', content: '把天气城市改成上海' }],
    {},
  )
  assert.equal(weather.operation.type, 'update_weather')
  assert.equal(weather.operation.weatherCity, '上海')

  const schedule = inferOperationFromConversation(
    [{ role: 'user', content: '上下班时间调整一下，上班9点30分，下班18点30分' }],
    {},
  )
  assert.equal(schedule.operation.type, 'update_work_schedule')
  assert.equal(schedule.operation.workStart, '09:30')
  assert.equal(schedule.operation.workEnd, '18:30')

  const task = inferOperationFromConversation(
    [{ role: 'user', content: '把示例项目的设计任务改成已完成' }],
    {
      tasks: [
        {
          id: 'T-1',
          projectId: 'P-1',
          project: '示例项目',
          title: '示例项目 设计',
          workType: '设计',
        },
      ],
    },
  )
  assert.equal(task.operation.type, 'update_task')
  assert.equal(task.operation.taskId, 'T-1')
  assert.equal(task.operation.taskStatus, '已完成')
})

test('assistant operation sanitizer keeps only fields supported by each action', () => {
  const weatherOperation = parseOperationExtraction(
    '{"operation":{"type":"update_weather","weatherCity":"成都","manager":"张三","taskStatus":"已完成"}}',
  ).operation
  const sanitizedWeather = sanitizeRoutedOperation(
    weatherOperation,
    [{ role: 'user', content: '天气换成成都' }],
    {},
  )
  assert.equal(sanitizedWeather.weatherCity, '成都')
  assert.equal(sanitizedWeather.manager, '')
  assert.equal(sanitizedWeather.taskStatus, '')

  const taskOperation = parseOperationExtraction(
    '{"operation":{"type":"update_task","taskId":"T-1","taskStatus":"修改中","healthStatus":"risk"}}',
  ).operation
  const sanitizedTask = sanitizeRoutedOperation(
    taskOperation,
    [{ role: 'user', content: '这条任务改成修改中' }],
    {},
  )
  assert.equal(sanitizedTask.taskId, 'T-1')
  assert.equal(sanitizedTask.taskStatus, '修改中')
  assert.equal(sanitizedTask.healthStatus, '')
})
