# Project Tracker — MVP v0.1 设计文档

> 状态：📋 设计完成，待审核

## 1. 问题定义

### 1.1 核心痛点

同时在多个项目目录下开 Claude Code（或其它 AI 工具），在等待 AI 输出的间隙切换窗口，切回来时忘记了「刚才在做什么」。

痛点本质是：**多会话并行时，缺乏一个居中状态面板来快速恢复上下文**。

### 1.2 一句话定位

**一个读取 AI 对话记录的本地 CLI 工具，让你一眼看到当前所有活跃项目的工作状态。**

## 2. 产品范围

### 2.1 MVP v0.1 包含

| 功能 | 描述 |
|------|------|
| `pt add <path>` | 添加项目到追踪列表 |
| `pt remove <name>` | 从追踪列表移除项目 |
| `pt list` | 列出所有已追踪项目 |
| `pt status` | 输出当前活跃项目的状态看板 |

### 2.2 MVP v0.1 不包含

- ❌ 拖拽交互（留到 v0.2 Web UI）
- ❌ 非 Claude Code 的 AI 工具支持（留到 v0.3 适配层）
- ❌ AI 对话总结（v0.1 只提取原始数据，不调用 AI）
- ❌ 历史项目归档（只显示近期活跃的）
- ❌ Web 界面

### 2.3 后续演进方向

```
v0.1 CLI MVP           → 跑通「读取对话→显示状态」闭环
v0.2 终端看板增强       → 更丰富的信息提取、交互式刷新
v0.3 多工具适配层       → 支持 Cursor、ChatGPT 等其它 AI 工具的对话记录
v0.4 本地 Web 看板      → 浏览器打开，拖拽添加项目，可交互的卡片
v0.5 AI 智能总结        → 接入 LLM 自动总结对话内容为状态摘要
```

## 3. 核心数据流

```
用户执行 pt status
       │
       ▼
读取 ~/.project-tracker.json 配置
       │
       ▼
遍历每个项目路径 → 拼接 ~/.claude/projects/<slugified-path>/
       │
       ▼
找到最新的 .jsonl 文件（按修改时间）
       │
       ▼
解析 JSONL：提取 ai-title / user消息 / assistant消息 / timestamp / gitBranch
       │
       ▼
过滤：只显示今天有对话记录的项目
       │
       ▼
终端输出状态看板
```

## 4. 数据结构

### 4.1 配置文件：`~/.project-tracker.json`

```json
{
  "projects": [
    {
      "name": "project-tracker",
      "path": "/Users/yangyeyuan/Desktop/project-tracker",
      "addedAt": "2026-06-04T15:00:00Z"
    }
  ]
}
```

- `name`：项目显示名称，默认取文件夹名，后续可自定义
- `path`：项目根目录的绝对路径
- `addedAt`：添加时间

### 4.2 CLI 内部数据提取（从 JSONL 解析）

```
JSONL 顶层类型：
  · ai-title      → aiTitle              → 最近话题标题
  · user          → message.content      → 用户最后说了什么
  · assistant     → message.content[]    → AI 最后回复了什么
  · system/*      → timestamp             → 时间信息
  · last-prompt   → leafUuid             → 最后一条提示
  · attachment    → gitBranch / cwd      → 项目上下文
```

### 4.3 内部表示

```typescript
interface ProjectStatus {
  name: string;           // 项目名称
  path: string;           // 项目路径
  lastSessionId: string;  // 最后会话 ID
  lastTopic: string;      // AI 生成的会话标题
  lastUserMessage: string;// 最后一条用户消息（截断）
  lastActiveAt: Date;     // 最后活跃时间
  branch: string;         // 最后所在分支
  sessionCount: number;   // 总会话数
}
```

## 5. 输出格式

### 5.1 `pt status` 输出示意

```
╔══════════════════════════════════════════════════════════╗
║                  📊 当前工作状态                           ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  📁 project-tracker                         刚刚          ║
║     话题: Discuss product evolution direction             ║
║     分支: master  ·  3 个会话                             ║
║     ── "讨论产品演进方向，决定先做 CLI MVP"                 ║
║                                                          ║
║  📁 interview                                3 小时前      ║
║     话题: 面试题目设计                                      ║
║     分支: main  ·  8 个会话                               ║
║     ── "在完善面试题的评估标准"                             ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

### 5.2 `pt list` 输出示意

```
已追踪的项目：

  📁 project-tracker     /Users/yangyeyuan/Desktop/project-tracker
  📁 interview           /Users/yangyeyuan/Desktop/interview
  📁 thinglog            /Users/yangyeyuan/Desktop/thinglog
```

### 5.3 过滤规则

- 默认只显示**今天有对话记录**的项目
- 可选的 `--all` 或 `-a` 标志显示所有已追踪项目（含不活跃的）
- 后续可加 `--days N` 自定义时间窗口

## 6. CLI 命令设计

| 命令 | 参数 | 描述 |
|------|------|------|
| `pt add <path>` | 项目路径 | 添加项目到追踪列表 |
| `pt remove <name>` | 项目名称 | 移除项目 |
| `pt list` | — | 列出所有已追踪项目 |
| `pt status` | `[--all/-a]` | 显示当前活跃项目状态看板 |
| `pt --version` | — | 显示版本号 |
| `pt --help` | — | 显示帮助 |

## 7. 技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 语言 | TypeScript | 类型安全，CLI 生态丰富 |
| 运行时 | Bun | 零配置跑 TS，冷启动快，可编译单文件二进制 |
| CLI 框架 | Commander.js | 最主流，事实标准 |
| 终端样式 | chalk + boxen | 颜色 + 边框 |
| 配置存储 | JSON 文件 | 零依赖，用户可手动编辑 |
| 分发 | `bun build --compile` | 单文件二进制（Claude Code 同款方案） |

## 8. 项目结构

```
project-tracker/
├── src/
│   ├── index.ts              # CLI 入口，注册子命令
│   ├── commands/
│   │   ├── add.ts            # pt add <path>
│   │   ├── remove.ts         # pt remove <name>
│   │   ├── status.ts         # pt status [--all]
│   │   └── list.ts           # pt list
│   └── lib/
│       ├── config.ts         # 读写 ~/.project-tracker.json
│       ├── scanner.ts        # 扫描 .claude/projects/ 目录
│       ├── parser.ts         # 解析 JSONL 文件
│       └── formatter.ts      # 格式化终端输出
├── package.json
├── tsconfig.json
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-06-04-project-tracker-mvp-design.md
```

## 9. 非功能需求

- **启动速度**：`pt status` 应在 500ms 内完成（Bun 冷启动 + JSONL 解析）
- **无网络依赖**：纯本地工具，不发送任何数据
- **零外部依赖服务**：不需要数据库、不需要 API Key
- **隐私**：所有数据在本地，对话内容不上传

## 10. 待决策项

- [ ] 项目名称取文件夹名还是支持自定义别名？
- [ ] `pt status` 默认显示多少条会话信息（最新 1 条？最近 N 条？）
- [ ] 如果用户删了项目文件夹但还留在配置里，怎么处理？
- [ ] JSONL 解析需要处理多少种顶层消息类型？
