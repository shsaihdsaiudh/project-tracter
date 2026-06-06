# AI 日报生成 — 设计文档

## 概述

在 Dashboard 中添加一键生成日报功能。点击按钮后，自动收集追踪项目的近期对话数据，通过 DeepSeek API 总结为结构化日报，写入 Obsidian Vault。

## 核心流程

```
Dashboard [📝 生成日报]
  │
  ├─ 1. 收集数据：scanProject + parseSession，收集活跃窗口内的会话
  ├─ 2. 构建 prompt：结构化数据（项目名、会话标题、用户消息、时间）
  ├─ 3. 调用 DeepSeek API（chat/completions）
  ├─ 4. 接收 AI 总结
  └─ 5. 写入 Obsidian Vault/每日工作记录/YYYY-MM-DD-日报.md
```

## 组件

### 1. 后端：新增 API 端点 `POST /api/report`

- 接收参数：`{ hours: number, outputPath?: string }`
- 收集所有追踪项目的会话数据（同 `collectAllSessions`）
- 构建 prompt
- 调用 DeepSeek API（`DEEPSEEK_API_KEY` 环境变量）
- 流式返回 AI 总结（SSE chunk）
- 写入文件

### 2. 前端：Dashboard 添加按钮

- 位置：顶部 header 区域，实时监控指示灯旁边
- 点击弹出时间范围选择（今天 / 昨天 / 本周）
- 显示生成进度（流式展示 AI 输出）
- 完成后提示文件路径

### 3. DeepSeek API 调用

- 端点：`https://api.deepseek.com/chat/completions`
- 模型：`deepseek-chat`（默认）
- API Key：环境变量 `DEEPSEEK_API_KEY`
- 格式：OpenAI 兼容

### 4. 输出

- 默认路径：`~/Documents/Obsidian Vault/每日工作记录/`
- 文件名：`YYYY-MM-DD-日报.md`
- 路径可通过 `--output` 参数覆盖

## prompt 模板

```
你是一个工作日志助手。请根据以下用户与 AI 编程助手的对话记录，
总结今天的开发工作内容。

格式要求：
1. 按项目分组
2. 每个项目下列出关键工作项（2-5 条）
3. 用中文输出

## 对话记录
{结构化数据}
```

## 新增依赖

无。使用 Node.js 内置 `fetch`（Node 18+）直接调用 DeepSeek API。

## 配置

- `DEEPSEEK_API_KEY`：环境变量，必填
- 输出路径：`~/.project-tracker.json` 中新增 `reportOutputPath` 字段，默认 `~/Documents/Obsidian Vault/每日工作记录/`

## 文件改动

| 文件 | 改动 |
|------|------|
| `src/commands/dashboard.ts` | 新增 `POST /api/report` 端点；流式调 DeepSeek API |
| `src/commands/dashboard.html` | 新增日报按钮、时间选择、进度展示 |
| `src/lib/config.ts` | 新增 `reportOutputPath` 配置字段 |
