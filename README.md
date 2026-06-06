# Project Tracker

> AI-native 多项目上下文追踪器 — 在项目间切换时，再也不丢失上下文。

## 痛点

同时在推进多个项目，切换回来时忘记「上次做到哪了」——思路断了，需要重新读代码回忆上下文。这个工具自动从 Claude Code 的会话记录中提取摘要，让你一眼看到每个项目的最近状态。

## 原理

```
Claude Code 会话         磁盘上的 JSONL 日志        pt 命令
─────────────          ──────────────────        ────────
 每次对话事件    ──▶    ~/.claude/projects/  ──▶  扫描 & 解析
 (用户输入、          <slug>/*.jsonl              提取标题/消息/时间/分支
  AI 回复、            逐行追加、实时写入           格式化为状态看板
  工具调用...)
```

无需任何网络请求或 API 调用，纯粹读取本地文件。

## 安装

### 前提条件

- **Node.js** ≥ 18（通过 Homebrew 安装：`brew install node`）
- **Claude Code**（已使用过至少一个项目，会话日志由 Claude Code 自动写入 `~/.claude/projects/`）

### 安装步骤

```bash
# 1. 进入项目目录
cd /path/to/project-tracker

# 2. 安装依赖
npm install

# 3. 注册为全局命令
npm link
```

执行后，在任意目录输入 `pt` 即可使用。源码修改实时生效（symlink），无需重新安装。

### 卸载

```bash
npm unlink -g project-tracker
```

## 命令

### `pt dashboard` / `pt db` — 启动 Web 看板（推荐）

```bash
pt dashboard               # 启动 Web 看板，自动打开浏览器
pt dashboard --port 4000    # 自定义端口
```

启动本地 HTTP 服务，浏览器中打开看板页面：

- **左侧边栏**：所有已追踪项目列表，点击「+」弹出原生文件夹选择器添加项目，悬停出现 ✕ 移除
- **右侧卡片区**：活跃项目卡片，展示话题、最后消息、分支、会话数
- **自动刷新**：每 5 秒更新，右上角绿色脉搏指示灯
- **颜色标识**：🟢 绿色 `< 1 小时`、🟡 黄色 `今天内`、⚪ 灰色 `更早`
- 终端常驻运行，`Ctrl+C` 停止

### `pt` / `pt status` — 终端查看活跃项目

```bash
pt              # 默认命令，显示今天活跃的项目
pt status       # 同上
pt status --all # 显示所有已追踪项目（包括不活跃的）
```

### `pt add <路径>` — 添加项目到追踪列表

```bash
pt add ~/Desktop/my-project
pt add .                        # 添加当前目录
```

路径会被解析为绝对路径并持久化存储。

### `pt list` / `pt ls` — 列出所有已追踪项目

```bash
pt list
```

### `pt remove` / `pt rm` — 从追踪列表移除项目

```bash
pt remove my-project            # 按项目名
pt remove ~/Desktop/my-project  # 按路径
```

## 数据存储

| 文件 | 用途 |
|------|------|
| `~/.project-tracker.json` | 项目追踪列表（你手动注册的项目） |
| `~/.claude/projects/<slug>/*.jsonl` | Claude Code 会话日志（自动生成，只读） |

工具**只读取** Claude Code 的会话日志，不会修改或删除它们。

## 活跃判定规则

一个项目被判定为「活跃」当且仅当：该项目在 `~/.claude/projects/` 下至少有一个会话文件的修改时间是**今天**。

只有在今天和 Claude Code 交互过的项目才会出现在默认视图中（使用 `--all` 可查看全部）。

## 项目结构

```
src/
├── index.ts              # CLI 入口，commander 路由
├── commands/
│   ├── add.ts            # pt add 命令
│   ├── dashboard.ts      # pt dashboard Web 看板 + API 路由
│   ├── status.ts         # pt status / 默认命令
│   ├── list.ts           # pt list 命令
│   └── remove.ts         # pt remove 命令
└── lib/
    ├── config.ts         # ~/.project-tracker.json 读写
    ├── scanner.ts        # 扫描 ~/.claude/projects/ 下的 JSONL 文件
    ├── parser.ts         # 解析单个 JSONL 文件，提取摘要
    └── formatter.ts      # 格式化输出（看板、列表、相对时间）
```

### 数据流

```
config.listProjects()
       │
       ▼
scanner.scanProject(path)  ──▶  [JSONL 文件列表] (按 mtime 降序)
       │
       ▼
parser.parseSession(file)  ──▶  { title, lastUserMessage, lastActiveAt, branch }
       │
       ▼
formatter.formatStatusBoard(results)  ──▶  终端输出
```

## License

MIT
