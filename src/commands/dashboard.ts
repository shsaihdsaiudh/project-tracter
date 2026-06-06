import { createServer, IncomingMessage, ServerResponse } from 'http';
import { exec } from 'child_process';
import { listProjects, addProject, removeProject } from '../lib/config.js';
import { scanProject, isProjectActive } from '../lib/scanner.js';
import { parseSession } from '../lib/parser.js';
import { relativeTime } from '../lib/formatter.js';

// ── Types ──────────────────────────────────────────────

interface DashboardStatus {
  name: string;
  title: string;
  lastMessage: string;
  lastActiveAt: string;
  relativeTime: string;
  branch: string;
  sessionCount: number;
}

interface ProjectItem {
  name: string;
  path: string;
  isActive: boolean;
}

interface InitialPayload {
  projects: ProjectItem[];
  statuses: DashboardStatus[];
}

// ── Data collection ────────────────────────────────────

function collectStatuses(): DashboardStatus[] {
  const projects = listProjects();
  const results: DashboardStatus[] = [];

  for (const project of projects) {
    const files = scanProject(project.path);
    const active = isProjectActive(project.path);

    if (!active) continue;

    let title = '';
    let lastMessage = '';
    let lastActiveAt: Date | null = null;
    let branch = '';

    if (files.length > 0) {
      const latestFile = files[0];
      const summary = parseSession(latestFile.path);

      if (summary) {
        title = summary.title;
        lastMessage = summary.lastUserMessage;
        lastActiveAt = summary.lastActiveAt;
        branch = summary.branch;
      } else {
        lastActiveAt = latestFile.mtime;
      }
    }

    if (!lastActiveAt && files.length > 0) {
      lastActiveAt = files[0].mtime;
    }

    const lastActiveDate = lastActiveAt || new Date(0);

    results.push({
      name: project.name,
      title: title || '(无标题)',
      lastMessage: lastMessage || '(无消息)',
      lastActiveAt: lastActiveDate.toISOString(),
      relativeTime: relativeTime(lastActiveDate),
      branch: branch || 'unknown',
      sessionCount: files.length,
    });
  }

  results.sort(
    (a, b) =>
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  );

  return results;
}

function collectProjects(): ProjectItem[] {
  return listProjects().map((p) => ({
    name: p.name,
    path: p.path,
    isActive: isProjectActive(p.path),
  }));
}

function collectInitialPayload(): InitialPayload {
  return {
    projects: collectProjects(),
    statuses: collectStatuses(),
  };
}

// ── Body parsing ───────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

// ── HTML page ──────────────────────────────────────────

function renderHTML(initial: InitialPayload): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Tracker</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f5f5f7;
      color: #1d1d1f;
      min-height: 100vh;
      display: flex;
    }

    /* ── Sidebar ── */
    .sidebar {
      width: 260px;
      min-width: 260px;
      background: #ffffff;
      border-right: 1px solid #e8e8ed;
      display: flex;
      flex-direction: column;
      height: 100vh;
      position: sticky;
      top: 0;
    }
    .sidebar-header {
      padding: 1.25rem 1rem 0.75rem;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #aeaeb2;
    }
    .sidebar-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 0.5rem;
    }
    .sidebar-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.55rem 0.6rem;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
      font-size: 0.85rem;
    }
    .sidebar-item:hover { background: #f5f5f7; }
    .sidebar-item.active { background: #e8f5e9; }
    .sidebar-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .sidebar-dot.on  { background: #34c759; }
    .sidebar-dot.off { background: #d1d1d6; }
    .sidebar-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sidebar-remove {
      width: 20px;
      height: 20px;
      border: none;
      background: transparent;
      color: #aeaeb2;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      opacity: 0;
      transition: opacity 0.15s, color 0.15s;
    }
    .sidebar-item:hover .sidebar-remove { opacity: 1; }
    .sidebar-remove:hover { color: #ff3b30; background: #fff0f0; }

    .sidebar-footer {
      padding: 0.75rem 0.5rem;
      border-top: 1px solid #e8e8ed;
    }
    .sidebar-add-btn {
      width: 100%;
      padding: 0.55rem;
      border: 1.5px dashed #d1d1d6;
      background: transparent;
      border-radius: 8px;
      color: #86868b;
      font-size: 0.82rem;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s, background 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
    }
    .sidebar-add-btn:hover {
      border-color: #34c759;
      color: #34c759;
      background: #f0faf2;
    }
    .sidebar-empty {
      padding: 2rem 1rem;
      text-align: center;
      color: #aeaeb2;
      font-size: 0.8rem;
      line-height: 1.6;
    }

    /* ── Main ── */
    .main {
      flex: 1;
      padding: 2rem 2rem 2rem 2rem;
      min-width: 0;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2rem;
    }
    .header h1 {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .live-badge {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8rem;
      color: #86868b;
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #34c759;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ── Cards grid ── */
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
    }
    .card {
      background: #ffffff;
      border-radius: 14px;
      padding: 1.25rem 1.25rem 1rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      border-left: 3px solid #e5e5e7;
      transition: box-shadow 0.2s, transform 0.2s;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      min-height: 140px;
    }
    .card:hover {
      box-shadow: 0 4px 16px rgba(0,0,0,0.1);
      transform: translateY(-1px);
    }
    .card.recent  { border-left-color: #34c759; }
    .card.today   { border-left-color: #f59e0b; }
    .card.older   { border-left-color: #aeaeb2; }

    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .card-name {
      font-weight: 700;
      font-size: 1rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .card-name .icon { font-size: 1.1rem; }
    .card-time {
      font-size: 0.75rem;
      color: #86868b;
      white-space: nowrap;
    }
    .card-time.live { color: #34c759; font-weight: 600; }

    .card-topic {
      font-size: 0.85rem;
      color: #1d1d1f;
      line-height: 1.4;
      flex: 1;
    }
    .card-topic .label {
      color: #86868b;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .card-message {
      font-size: 0.8rem;
      color: #6e6e73;
      line-height: 1.4;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      font-style: italic;
    }
    .card-meta {
      display: flex;
      gap: 1rem;
      font-size: 0.72rem;
      color: #aeaeb2;
      padding-top: 0.3rem;
      border-top: 1px solid #f0f0f2;
    }

    /* ── Empty state ── */
    .empty {
      text-align: center;
      padding: 4rem 1rem;
      color: #86868b;
      display: none;
    }
    .empty.show { display: block; }
    .empty .emoji { font-size: 3rem; margin-bottom: 1rem; }
    .empty h2 { font-size: 1.1rem; margin-bottom: 0.5rem; color: #515154; }
    .empty p { font-size: 0.85rem; line-height: 1.6; }
    .empty code {
      background: #e8e8ed;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.82rem;
    }

    /* ── Footer ── */
    .footer {
      text-align: center;
      font-size: 0.7rem;
      color: #aeaeb2;
      margin-top: 2rem;
    }

    /* ── Adding state ── */
    .sidebar-add-btn.loading {
      pointer-events: none;
      opacity: 0.6;
    }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      body { flex-direction: column; }
      .sidebar {
        width: 100%;
        min-width: 0;
        height: auto;
        position: static;
        border-right: none;
        border-bottom: 1px solid #e8e8ed;
        max-height: 40vh;
      }
      .main { padding: 1rem; }
      .cards { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <aside class="sidebar">
    <div class="sidebar-header">📋 追踪项目</div>
    <div class="sidebar-list" id="sidebarList"></div>
    <div class="sidebar-footer">
      <button class="sidebar-add-btn" id="addBtn" title="添加项目">
        <span>+</span> 添加项目
      </button>
    </div>
  </aside>

  <div class="main">
    <div class="header">
      <h1>🏠 Project Tracker</h1>
      <div class="live-badge">
        <span class="live-dot"></span>
        实时监控中
      </div>
    </div>

    <div class="cards" id="cards"></div>

    <div class="empty" id="empty">
      <div class="emoji">📋</div>
      <h2>当前没有活跃项目</h2>
      <p>
        点击左侧「+ 添加项目」追踪项目<br>
        和 Claude Code 对话后，活跃项目会自动显示在这里
      </p>
    </div>

    <div class="footer" id="footer">正在加载...</div>
  </div>

  <script>
    var __INITIAL__ = ${JSON.stringify(initial)};

    // ── Utils ──────────────────────────────────────────

    function esc(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function getTimeClass(iso) {
      var diffMs = Date.now() - new Date(iso).getTime();
      if (diffMs < 3600000) return 'recent';
      if (diffMs < 86400000) return 'today';
      return 'older';
    }

    function getTimeLiveClass(iso) {
      return (Date.now() - new Date(iso).getTime()) < 600000 ? ' live' : '';
    }

    function updateFooter() {
      var now = new Date();
      document.getElementById('footer').textContent =
        '最后更新 ' + now.toLocaleTimeString('zh-CN', { hour12: false });
    }

    // ── Sidebar ────────────────────────────────────────

    function renderSidebar(projects) {
      var listEl = document.getElementById('sidebarList');
      if (!projects || projects.length === 0) {
        listEl.innerHTML = '<div class="sidebar-empty">暂无追踪项目<br>点击下方按钮添加</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < projects.length; i++) {
        var p = projects[i];
        var dotCls = p.isActive ? 'on' : 'off';
        html +=
          '<div class="sidebar-item' + (p.isActive ? ' active' : '') + '" data-name="' + esc(p.name) + '">' +
            '<span class="sidebar-dot ' + dotCls + '"></span>' +
            '<span class="sidebar-name" title="' + esc(p.path) + '">📁 ' + esc(p.name) + '</span>' +
            '<button class="sidebar-remove" data-name="' + esc(p.name) + '" title="移除追踪">&times;</button>' +
          '</div>';
      }
      listEl.innerHTML = html;
    }

    function bindSidebarEvents() {
      // Remove buttons
      var btns = document.querySelectorAll('.sidebar-remove');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function(e) {
          e.stopPropagation();
          var name = this.getAttribute('data-name');
          if (confirm('确定要移除对 「' + name + '」 的追踪吗？')) {
            removeProject(name);
          }
        });
      }
      // Click on project item: scroll to card (future: highlight)
    }

    function removeProject(name) {
      fetch('/api/projects/' + encodeURIComponent(name), { method: 'DELETE' })
        .then(function() { refreshAll(); })
        .catch(function() { /* ignore */ });
    }

    // ── Add project ────────────────────────────────────

    function addProject() {
      var btn = document.getElementById('addBtn');
      btn.classList.add('loading');
      btn.textContent = '... 选择中';

      fetch('/api/browse', { method: 'POST' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.path) {
            return fetch('/api/projects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: data.path })
            });
          }
          return null;
        })
        .then(function() { refreshAll(); })
        .catch(function() { /* user cancelled or error */ })
        .finally(function() {
          btn.classList.remove('loading');
          btn.innerHTML = '<span>+</span> 添加项目';
        });
    }

    document.getElementById('addBtn').addEventListener('click', addProject);

    // ── Cards ──────────────────────────────────────────

    function renderCards(data) {
      var cardsEl = document.getElementById('cards');
      var emptyEl = document.getElementById('empty');

      if (!data || data.length === 0) {
        cardsEl.innerHTML = '';
        emptyEl.classList.add('show');
      } else {
        emptyEl.classList.remove('show');
        var html = '';
        for (var i = 0; i < data.length; i++) {
          var p = data[i];
          var cls = getTimeClass(p.lastActiveAt);
          var liveCls = getTimeLiveClass(p.lastActiveAt);
          html +=
            '<div class="card ' + cls + '">' +
              '<div class="card-top">' +
                '<span class="card-name"><span class="icon">📁</span>' + esc(p.name) + '</span>' +
                '<span class="card-time' + liveCls + '">' + esc(p.relativeTime) + '</span>' +
              '</div>' +
              '<div class="card-topic"><span class="label">话题</span> ' + esc(p.title) + '</div>' +
              '<div class="card-message">── "' + esc(p.lastMessage) + '"</div>' +
              '<div class="card-meta">' +
                '<span>🌿 ' + esc(p.branch) + '</span>' +
                '<span>💬 ' + p.sessionCount + ' 个会话</span>' +
              '</div>' +
            '</div>';
        }
        cardsEl.innerHTML = html;
      }
      updateFooter();
    }

    // ── Refresh ────────────────────────────────────────

    function refreshAll() {
      fetch('/api/projects')
        .then(function(r) { return r.json(); })
        .then(function(projects) {
          renderSidebar(projects);
          bindSidebarEvents();
        })
        .catch(function() {});

      fetch('/api/status')
        .then(function(r) { return r.json(); })
        .then(renderCards)
        .catch(function() {});
    }

    // ── Init ───────────────────────────────────────────

    renderSidebar(__INITIAL__.projects);
    bindSidebarEvents();
    renderCards(__INITIAL__.statuses);

    setInterval(refreshAll, 5000);
  </script>
</body>
</html>`;
}

// ── Server ─────────────────────────────────────────────

export function startDashboard(opts: { port?: string }): void {
  const port = parseInt(opts.port || '3456', 10);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const url = req.url || '/';
    const method = req.method || 'GET';

    // ── API routes ──────────────────────────────────────

    // GET /api/status — active project statuses
    if (url === '/api/status' && method === 'GET') {
      const data = collectStatuses();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
      return;
    }

    // GET /api/projects — all tracked projects with active flag
    if (url === '/api/projects' && method === 'GET') {
      const data = collectProjects();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
      return;
    }

    // POST /api/projects — add a project by path
    if (url === '/api/projects' && method === 'POST') {
      const body = await readBody(req);
      try {
        const { path } = JSON.parse(body);
        if (!path) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: '缺少 path 参数' }));
          return;
        }
        const entry = addProject(path);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ name: entry.name, path: entry.path }));
      } catch (e: any) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // POST /api/browse — open native macOS folder picker
    if (url === '/api/browse' && method === 'POST') {
      exec(
        `osascript -e 'POSIX path of (choose folder with prompt "选择要追踪的项目文件夹")'`,
        (err, stdout) => {
          if (err) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ path: null, cancelled: true }));
            return;
          }
          const selectedPath = stdout.trim();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ path: selectedPath }));
        },
      );
      return;
    }

    // DELETE /api/projects/:name — remove a project
    if (url.startsWith('/api/projects/') && method === 'DELETE') {
      const name = decodeURIComponent(url.replace('/api/projects/', ''));
      if (!name) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: '缺少项目名称' }));
        return;
      }
      const removed = removeProject(name);
      if (removed) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ removed: true }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: '未找到项目: ' + name }));
      }
      return;
    }

    // ── Default: serve HTML ──────────────────────────────
    const payload = collectInitialPayload();
    const html = renderHTML(payload);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log('');
    console.log('  🚀  Dashboard 已启动');
    console.log('  ──────────────────────────────────────');
    console.log(`  🌐  ${url}`);
    console.log('');
    console.log('  按 Ctrl+C 停止');
    console.log('');

    exec(`open ${url}`, (err) => {
      if (err) {
        console.log(`  请在浏览器中打开: ${url}`);
      }
    });
  });

  const shutdown = () => {
    console.log('\n  👋 Dashboard 已停止');
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
