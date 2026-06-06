# Dashboard 重设计 Spec

> 日期：2026-06-06  
> 状态：设计完成，待实现  
> 范围：`src/commands/dashboard.html` — 仅 CSS + HTML 结构调整

## 设计方向

深色灰底 + 绿色单强调 + sans/mono 混排字体系统。灵感来自 Linear 的工具质感与终端配色的克制表达。仅暗色模式，不做 light/dark 切换。

三旋钮：`DESIGN_VARIANCE: 4` / `MOTION_INTENSITY: 2` / `VISUAL_DENSITY: 5`

## 设计令牌

### 颜色

```css
/* 底色系统 */
--bg-sidebar:    #0e0e10;  /* 侧边栏 */
--bg-page:       #121215;  /* 主区域 */
--bg-card:       #18181b;  /* 卡片 / 面板 */
--bg-card-hover: #1c1c20;  /* 卡片 hover */

/* 描边 */
--border-subtle: #1e1e22;  /* 默认 */
--border-hover:  #27272a;  /* hover / focus */

/* 文字 */
--text-primary:   #e4e4e7;  /* 标题 / 正文 */
--text-secondary: #a1a1aa;  /* 副标题 */
--text-muted:     #71717a;  /* 辅助信息 */
--text-dim:       #52525b;  /* 最弱 / 禁用 */

/* 强调 */
--accent:        #30d158;  /* 活跃 / 成功 */
--accent-subtle: rgba(48,209,88,0.12);
--accent-warn:   #f59e0b;  /* today 时间标记 */
--accent-danger: #ff3b30;  /* 错误 / 删除 */
```

### 字体

| 用途 | 字体栈 |
|------|--------|
| 标题 / 正文 / 项目名 / 会话内容 | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| 时间戳 / 分支名 / 变体标签 / 数值 | `"SF Mono", "JetBrains Mono", "Fira Code", monospace` |

### 圆角

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | 3px | 标签 / 徽章 |
| `--radius-md` | 4px | 卡片 / 按钮 / 输入框 |
| `--radius-lg` | 8px | 弹窗 / 弹出面板 |

### 间距

| Token | 值 |
|-------|-----|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 14px |
| `--space-lg` | 24px |

## 组件规范

### 侧边栏

- 底色 `--bg-sidebar`(#0e0e10)，宽 220px，右侧 1px `--border-subtle` 分隔
- 标题 "tracker"：mono 9px，`--text-dim`，全小写
- 活跃项目：绿色圆点 + 左侧 1px 绿线 + 5% 绿色半透明底
- 非活跃项目：灰色圆点 + `--text-dim` 文字
- hover 时出现齿轮设置按钮
- 底部「+ 添加项目」：`--text-dim`，hover 变 `--text-secondary`
- 项目间无分割线，靠间距区分

### 会话卡片

- 底色 `--bg-card`(#18181b) + 1px `--border-subtle` 边框
- hover：底色过渡到 `--bg-card-hover`(#1c1c20)，边框过渡到 `--border-hover`
- 实时会话（<1h）：标题前绿色圆点，时间戳用 `--accent` 绿色 mono 体
- 今日会话（1h-24h）：时间戳用 `--accent-warn` 橙色
- 旧会话（>24h）：时间戳用 `--text-dim`
- 隐藏会话：整体 40% 透明度 + 边框更暗
- 操作按钮（复制 resume / 隐藏）：mono 9px，`--text-muted`，仅 hover 时出现
- 变体标签（claude / claude-internal）：mono 9px，绿色底 `--accent-subtle`
- 分支名：mono 9px，`--text-dim`

### 弹窗（Modal）

- 底色 `--bg-card` + 1px `--border-subtle` + `--radius-lg` 8px
- 标题 14px sans 加粗 `--text-primary`
- 副标题 11px `--text-muted`
- 选项列表：底色 `--bg-page` + 1px `--border-hover` 边框
- 选项 hover：边框变绿 + 5% 绿色半透明底
- 入场：opacity 0→1 + translateY 4px→0，150ms

### Toast 通知

- 底色 `--bg-card` + 1px `--border-subtle` + 左边框 2px 颜色标识
- 成功：左边框 `--accent` 绿色
- 错误：左边框 `--accent-danger` 红色
- 加载中：左边框 `--accent-warn` + 左侧旋转细环
- 入场：translateX 右→左滑入 + opacity，250ms
- 3-5s 自动消失

### 时间过滤器

- 下拉框：mono 字体，`--text-muted` 文字
- hover：边框变亮
- focus：边框绿色

### 实时状态指示

- 绿色圆点 + "live" mono 文字
- 圆点 opacity 脉冲动画（2s 周期，1↔0.4）

### 会话管理器弹出框

- 底色 `--bg-card` + 1px `--border-subtle` + `--radius-lg`
- 列表项：sans 12px，`--text-secondary`
- 隐藏项：40% 透明度
- Checkbox：`--accent` 绿色勾选

### 空状态

- 居中排列，`--text-muted` 文字
- 引导语底部提示 `pt add <路径>` 命令

### Footer

- mono 字体，`--text-dim`，"最后更新 HH:MM:SS"

## 响应式 (<768px)

- 侧边栏转为顶部横向滚动标签栏
- 项目以 pill 形式水平排列，活跃项目有绿色边框
- 主内容区全宽，padding 缩减为 14px
- 卡片内容保持可读

## 动效规则

`MOTION_INTENSITY = 2`（极克制）：

| 触发 | 实现 | 时长 |
|------|------|------|
| SSE 更新 | 直接替换（无动画） | 0 |
| hover 过渡 | CSS transition background/border-color | 150ms |
| 按钮 active | transform: scale(0.98) | 100ms |
| 弹窗入场 | opacity + translateY | 150ms |
| Toast 入场 | translateX + opacity | 250ms |
| 实时指示灯 | opacity 脉冲 | 2s 周期 |
| Loading | 细环旋转 | 0.8s 周期 |

全 CSS transition/animation 实现，零 JS 动画库。`prefers-reduced-motion` 下全部禁用。

## 不改变

- HTML 元素层级结构保持兼容
- 所有 JavaScript 逻辑不变（SSE、弹窗、toast、复制 resume、隐藏会话、时间过滤器、设置面板）
- API 端点和服务端代码不变
- `package.json` 不新增依赖
- 功能行为完全不变

## 实现计划

单文件修改：`src/commands/dashboard.html`

1. 重写 `<style>` 块 — 全部 CSS 规则
2. 微调 HTML — class 名对齐新设计
3. 验证所有交互状态正常工作
4. 验证移动端布局
