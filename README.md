# Project Tracker

> AI 时代的多项目上下文追踪器 — 切换项目不丢思路，一键生成工作日报。

## 痛点

同时推进多个项目，切换回来时忘记「上次做到哪了」。这个工具自动从 Claude Code / Claude Internal 的会话记录中提取上下文，让你一眼看到每个项目的最近状态。

更进阶的是：**点一下按钮，AI 自动总结你今天做了什么，写进 Obsidian。**

## 原理

```
Claude Code 会话         磁盘上的 JSONL 日志         pt
─────────────           ──────────────────         ────────
 每次对话事件    ──▶    ~/.claude/projects/  ──▶   扫描 & 解析
                       ~/.claude-internal/          Web Dashboard
                          projects/                 终端看板
                                                    AI 日报生成
```

纯本地运行，零网络请求（日报生成除外）。

## 安装

### 前提

- **Node.js** ≥ 18
- **Claude Code** 或 **Claude Internal**（已使用过）

### 步骤

```bash
git clone <repo-url>
cd project-tracker
npm install      # 自动同时安装并构建前端 dashboard
npm link
```

执行后，在任意目录输入 `pt` 即可使用。源码修改实时生效（tsx 直接执行 TS），无需重新编译。

> **Windows 兼容性**：本工具完整支持 Mac / Windows / Linux 三个平台 —— 路径分隔符、文件夹选择对话框、Obsidian Vault 检测、命令入口都已做跨平台适配。Windows 用户不需要额外配置 tsx 等工具。

### 配置 AI 日报（可选）

```bash
cp .env.example .env
# 编辑 .env，填入你的 DeepSeek API Key
# 获取地址：https://platform.deepseek.com
```

日报默认自动检测 Obsidian Vault 路径（支持 Mac / Windows / Linux）。
如需手动指定：

```bash
pt config --output ~/my-notes/日报/
```

### 跨平台

| 平台 | 文件夹选择 | Obsidian 检测 |
|------|-----------|---------------|
| macOS | 原生 Finder | `~/Library/Application Support/obsidian/` |
| Windows | 原生资源管理器（PowerShell） | `%APPDATA%/obsidian/` |
| Linux | 原生文件选择器（zenity/kdialog） | `~/.config/obsidian/` |

所有平台都会弹出原生文件夹选择对话框。

## 命令

| 命令 | 说明 |
|------|------|
| `pt dashboard` / `pt db` | 🚀 **启动 Web 看板**（推荐） |
| `pt` / `pt status` | 终端查看活跃项目 |
| `pt status --all` | 查看所有已追踪项目 |
| `pt add <路径>` | 添加项目 |
| `pt list` / `pt ls` | 列出所有项目 |
| `pt remove <名称>` / `pt rm` | 移除项目 |
| `pt config` | 查看全部配置（项目 + 日报路径） |
| `pt config <项目> --claude claude,claude-internal` | 配置追踪的 Claude 变体 |
| `pt config --output <路径>` | 设置日报输出目录 |

## Web Dashboard 功能

### 🏠 项目看板
- 左侧边栏：项目列表 + 实时活跃状态指示灯（绿/灰）
- 右侧卡片区：每个项目展开显示会话
- 5 秒自动刷新 + SSE 实时推送
- 添加项目时可选追踪哪个 Claude 变体（claude / claude-internal）

### ⏱ 时间范围过滤器
每个项目独立的时间下拉选择器：
`1h | 6h | 12h | 1天 | 3天 | 7天 | 全部`

想看昨天的进度？切到「1 天」就行。

### 📋 一键复制 resume
每个会话卡片 hover 时出现 `📋 复制 resume` 按钮，点击复制：
```
claude --resume <session-id>
```
（或 `claude-internal --resume <id>`）

粘贴到终端即可恢复对话，电脑重启也不怕。

### 🤖 AI 日报生成
点击右上角 `📝 生成日报` → 选时间范围 → AI 自动总结。

**工作方式**：
```
收集今天所有项目的对话 → 按项目分组 → 逐个调 DeepSeek API 总结 → 合并 → 写入 Obsidian
```

生成后的日报会自动写入：
```
~/Documents/Obsidian Vault/每日工作记录/2026-06-06-日报.md
```

打开 Obsidian 就能看到，完美融入你的笔记工作流。

### 🔔 对话完成提醒（v2 新增）

Mac 上 Claude Code 终端会自动响铃提示「这一轮回复完了」，但 Windows 上没有这个能力。Project Tracker 通过监听 JSONL 文件变化补上这块缺口：**Claude 真正说完一段话停下来等你输入时，浏览器右下角弹出原生桌面通知。**

#### 怎么用

1. 启动 `pt dashboard`，浏览器打开看板
2. 在左侧 Sidebar 里给想要被提醒的项目点击 🔕（变成绿色 🔔 即开启）
3. 第一次开启时浏览器会请求通知权限 → 选「允许」
4. 接下来每次该项目的 Claude 回复完，Windows 右下角会弹通知：

```
✦ project-tracter
现在的最终用户体验...
```

点击通知会自动把 dashboard 标签页拉到前台。

#### 触发逻辑

| 状态 | 通知？ |
|------|--------|
| Claude 在调工具中（`stop_reason=tool_use`） | ❌ 不通知 |
| Claude 真正说完一段在等输入（`stop_reason=end_turn`） | ✅ 通知一次 |
| 同一会话连续多次回复 | 系统托盘里替换前一个，不堆积 |
| dashboard 启动前已存在的对话 | ❌ 不会回放历史通知 |

#### 持久化

- 项目铃铛开关写入 `~/.project-tracker.json` 的 `notifyEnabled` 字段
- 浏览器通知权限走系统级（关浏览器 / 重启都还在）
- 默认全部关闭（opt-in），不主动打扰

---

## 多 Claude 变体支持

如果你的工作环境同时使用标准版 `claude` 和内部版 `claude-internal`：

```bash
# 项目 A 只追踪内部版
pt config my-project --claude claude-internal

# 项目 B 两者都追踪
pt config another-project --claude claude,claude-internal
```

每个项目的配置独立，不同项目可以追踪不同的 Claude 变体。

## 数据存储

| 文件 | 用途 |
|------|------|
| `~/.project-tracker.json` | 项目追踪列表（路径、claudeDirs、notifyEnabled）+ 全局配置 |
| `~/.claude/projects/<slug>/*.jsonl` | Claude Code 会话日志（只读） |
| `~/.claude-internal/projects/<slug>/*.jsonl` | Claude Internal 会话日志（只读） |
| `.env` | DeepSeek API Key（可选，仅日报功能需要） |

工具**只读取** Claude 的会话日志，不会修改或删除它们。

## 项目结构

```
src/                         # 后端 CLI（TypeScript，tsx 直接执行）
├── index.ts                 # CLI 入口
├── commands/
│   ├── add.ts               # pt add
│   ├── config.ts            # pt config
│   ├── dashboard.ts         # HTTP 服务器 + SSE 推送 + AI 日报 API + 通知探测
│   ├── list.ts              # pt list
│   ├── remove.ts            # pt remove
│   └── status.ts            # pt status
├── lib/
│   ├── config.ts            # ~/.project-tracker.json 读写
│   ├── scanner.ts           # 扫描 Claude 会话目录（跨平台路径 slug）
│   ├── parser.ts            # 解析 JSONL（含 turn-complete 探测）
│   └── formatter.ts         # 终端输出格式化
└── ...

dashboard/                   # 前端看板（独立 Vite + React 应用）
├── src/
│   ├── App.tsx              # 主组件 + SSE 订阅 + 桌面通知
│   ├── api/                 # REST + SSE 客户端
│   ├── components/
│   │   ├── Sidebar.tsx      # 项目列表（含 🔔 提醒切换）
│   │   ├── SessionCard.tsx  # 会话卡片
│   │   ├── SessionDetail.tsx# 对话详情页
│   │   └── ...
│   └── styles/
└── dist/                    # 构建产物（npm install 时自动生成）

bin/
└── pt.mjs                   # 跨平台启动器（Node 包装 tsx，避免 Windows shebang 问题）
```

## License

MIT
