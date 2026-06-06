# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Project Tracker — AI 时代的多项目上下文追踪器。纯本地 CLI 工具 + Web Dashboard，通过解析 Claude Code / Claude Internal 的 JSONL 会话日志，让你在多项目间快速恢复上下文，并支持一键生成 AI 工作日报写入 Obsidian。

## 运行方式

```bash
npm run dev              # tsx src/index.ts（直接运行 TypeScript，无编译步骤）
pt                       # 如果已 npm link，等同于 pt status（显示活跃项目）
pt dashboard             # 启动 Web 看板（默认端口 3456）
```

本项目使用 `tsx` 直接执行 TypeScript 源码，**没有 build/compile 步骤**。`package.json` 的 `bin` 字段指向 `src/index.ts`，`npm link` 后全局可用 `pt` 命令。

## 项目架构

```
src/
├── index.ts              # CLI 入口 — Commander 路由，加载 .env
├── commands/             # 命令处理层（薄封装，解析参数 → 调用 lib）
│   ├── add.ts / remove.ts / list.ts / status.ts / config.ts
│   ├── dashboard.ts      # HTTP 服务器 + SSE 实时推送 + AI 日报 API
│   └── dashboard.html    # 前端单页（1655 行，内嵌 CSS/JS）
└── lib/                  # 核心业务逻辑
    ├── config.ts         # ~/.project-tracker.json 读写 + 项目 CRUD
    ├── scanner.ts        # 扫描 Claude 会话目录，按 mtime 排序
    ├── parser.ts         # 解析单个 JSONL 文件，提取会话摘要
    └── formatter.ts      # 终端输出格式化（boxen + chalk）
```

**数据流向**：`~/.claude/projects/<slug>/*.jsonl` → `scanner` → `parser` → `formatter` → 终端 / Web

## 核心概念

### 路径 Slug 化
Claude Code 将项目路径转为目录名：`/Users/foo/bar` → `-Users-foo-bar`。这就是 `scanner.slugifyPath()` 做的事。

### Claude 变体
支持同时追踪多个 Claude 变体，映射关系定义在 `config.ts`：
```ts
CLAUDE_VARIANTS = { claude: '.claude', 'claude-internal': '.claude-internal' }
```

每个项目可以独立配置追踪哪些变体（`project.claudeDirs`），默认只追踪 `['claude']`。

### 配置文件
唯一的数据文件：`~/.project-tracker.json`，结构为：
```ts
interface TrackerConfig {
  projects: ProjectEntry[];        // 项目列表（name, path, claudeDirs）
  reportOutputPath?: string;       // 日报输出目录
  hiddenSessions?: string[];       // 用户隐藏的会话 ID
}
```

### JSONL 会话格式
解析器 (`parser.ts`) 理解的 JSONL 事件类型：
- `ai-title` → `obj.aiTitle`（AI 生成的会话标题）
- `user` → `obj.message.content`（用户消息，string 或 ContentBlock[]）
- `attachment` → `obj.gitBranch`, `obj.timestamp`
- 跳过 `<local-command-caveat>` 前缀的元消息

### Dashboard 架构
- 服务端渲染：HTML 模板中 `__INITIAL_JSON__` 被替换为初始数据
- SSE 实时推送：`GET /api/events` 建立长连接，每 5 秒广播增量数据（自动去重）
- 端口重试：从配置端口开始，被占用则自动尝试 +1（最多 10 次）
- REST API 端点：`/api/status`, `/api/projects`, `/api/report`, `/api/hidden-sessions`, `/api/browse` 等

### AI 日报
- 通过 DeepSeek API（`deepseek-chat` 模型）按项目独立调用生成总结
- 每个项目一个 API 请求（避免跨项目上下文混淆）
- 需要 `.env` 中配置 `DEEPSEEK_API_KEY`
- 输出路径自动检测 Obsidian Vault（macOS/Windows/Linux），也可手动配置

## 常用命令

```bash
pt                        # 显示活跃项目状态（默认 6 小时内）
pt status --all           # 显示所有已追踪项目
pt dashboard -p 3456      # 启动 Web 看板（可指定端口）
pt dashboard --hours 12   # 自定义活跃窗口
pt add /path/to/project   # 添加项目
pt config                 # 查看当前配置
pt config myproj --claude claude,claude-internal  # 配置追踪变体
```

## 技术约束

- Node.js ≥ 18（package.json engines 未声明，但用了 ESM `type: "module"`）
- 纯 ESM（`import`/`export` 语法，`.js` 扩展名在 import 中）
- **没有测试**（`npm test` 直接 `exit 0`）
- `.env` 文件被 `.gitignore` 排除，需从 `.env.example` 复制
- 所有文件 I/O 为同步操作（`readFileSync`/`writeFileSync`），适合当前数据规模
