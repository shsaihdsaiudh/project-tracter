import { createServer, IncomingMessage, ServerResponse } from 'http';
import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { listProjects, addProject, removeProject, setProjectClaudeDirs, CLAUDE_VARIANTS } from '../lib/config.js';
import { scanProject, isProjectActive } from '../lib/scanner.js';
import { parseSession } from '../lib/parser.js';
import { relativeTime } from '../lib/formatter.js';

// ── Types ──────────────────────────────────────────────

interface SessionItem {
  sessionId: string;
  title: string;
  lastMessage: string;
  lastActiveAt: string;
  relativeTime: string;
  branch: string;
}

interface ProjectSection {
  name: string;
  path: string;
  sessions: SessionItem[];
  sessionCount: number;
  isActive: boolean;
  claudeDirs: string[];
}

interface ProjectItem {
  name: string;
  path: string;
  isActive: boolean;
  claudeDirs: string[];
}

interface InitialPayload {
  projects: ProjectItem[];
  sections: ProjectSection[];
}

// ── HTML template ──────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HTML_TEMPLATE = readFileSync(resolve(__dirname, 'dashboard.html'), 'utf-8');

function renderHTML(payload: InitialPayload): string {
  return HTML_TEMPLATE.replace('__INITIAL_JSON__', JSON.stringify(payload));
}

// ── Data collection ────────────────────────────────────

let activeHours = 6;

function isRecent(date: Date): boolean {
  return (Date.now() - date.getTime()) < activeHours * 60 * 60 * 1000;
}

function collectAllSessions(): ProjectSection[] {
  const projects = listProjects();
  const results: ProjectSection[] = [];

  for (const project of projects) {
    const claudeDirs = project.claudeDirs || ['claude'];
    const files = scanProject(project.path, claudeDirs);
    const active = isProjectActive(project.path, activeHours, claudeDirs);
    const sessions: SessionItem[] = [];

    for (const file of files) {
      const summary = parseSession(file.path);
      const sessionTime = summary?.lastActiveAt || file.mtime;

      if (summary) {
        sessions.push({
          sessionId: summary.sessionId,
          title: summary.title || '(无标题)',
          lastMessage: summary.lastUserMessage || '(无消息)',
          lastActiveAt: (summary.lastActiveAt || file.mtime).toISOString(),
          relativeTime: relativeTime(summary.lastActiveAt || file.mtime),
          branch: summary.branch || 'unknown',
        });
      } else {
        sessions.push({
          sessionId: file.filename.replace('.jsonl', ''),
          title: '(无标题)',
          lastMessage: '(无消息)',
          lastActiveAt: file.mtime.toISOString(),
          relativeTime: relativeTime(file.mtime),
          branch: 'unknown',
        });
      }
    }

    results.push({
      name: project.name,
      path: project.path,
      sessions,
      sessionCount: sessions.length,
      isActive: active,
      claudeDirs,
    });
  }

  results.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const aTime = a.sessions[0]?.lastActiveAt || '0';
    const bTime = b.sessions[0]?.lastActiveAt || '0';
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  return results;
}

function collectProjects(): ProjectItem[] {
  return listProjects().map((p) => {
    const claudeDirs = p.claudeDirs || ['claude'];
    return {
      name: p.name,
      path: p.path,
      isActive: isProjectActive(p.path, activeHours, claudeDirs),
      claudeDirs,
    };
  });
}

function collectInitialPayload(): InitialPayload {
  return {
    projects: collectProjects(),
    sections: collectAllSessions(),
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

// ── Server ─────────────────────────────────────────────

export function startDashboard(opts: { port?: string; hours?: string }): void {
  const port = parseInt(opts.port || '3456', 10);
  activeHours = parseInt(opts.hours || '6', 10);

  // SSE client management
  const sseClients = new Set<ServerResponse>();
  let lastBroadcastJson = '';

  function broadcast() {
    const payload = collectInitialPayload();
    const json = JSON.stringify(payload);
    if (json === lastBroadcastJson) {
      // Data unchanged — send heartbeat only (SSE comment, ignored by browser)
      for (const client of sseClients) {
        client.write(':ping\n\n');
      }
      return;
    }
    lastBroadcastJson = json;
    for (const client of sseClients) {
      client.write(`data: ${json}\n\n`);
    }
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const url = req.url || '/';
    const method = req.method || 'GET';

    // GET /api/events — SSE stream
    if (url === '/api/events' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Send initial data immediately
      const payload = collectInitialPayload();
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // GET /api/status — all project sections with sessions
    if (url === '/api/status' && method === 'GET') {
      const data = collectAllSessions();
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

    // POST /api/projects — add a project
    if (url === '/api/projects' && method === 'POST') {
      const body = await readBody(req);
      try {
        const { path, claudeDirs } = JSON.parse(body);
        if (!path) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: '缺少 path 参数' }));
          return;
        }
        const entry = addProject(path, undefined, claudeDirs);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ name: entry.name, path: entry.path, claudeDirs: entry.claudeDirs }));
        // Push update to all SSE clients
        broadcast();
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

    // PUT /api/projects/:name/claude-dirs — update which Claude variants to track
    if (url.startsWith('/api/projects/') && url.endsWith('/claude-dirs') && method === 'PUT') {
      const name = decodeURIComponent(
        url.replace('/api/projects/', '').replace('/claude-dirs', ''),
      );
      const body = await readBody(req);
      try {
        const { claudeDirs } = JSON.parse(body);
        if (!Array.isArray(claudeDirs) || claudeDirs.length === 0) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: '缺少 claudeDirs 参数或为空数组' }));
          return;
        }
        const updated = setProjectClaudeDirs(name, claudeDirs);
        if (!updated) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: '未找到项目: ' + name }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ name: updated.name, path: updated.path, claudeDirs: updated.claudeDirs }));
        broadcast();
      } catch (e: any) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
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
        // Push update to all SSE clients
        broadcast();
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: '未找到项目: ' + name }));
      }
      return;
    }

    // Default: serve HTML
    const payload = collectInitialPayload();
    const html = renderHTML(payload);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  // Periodic scan: broadcast to all SSE clients every 5 seconds
  const scanTimer = setInterval(() => {
    if (sseClients.size > 0) {
      broadcast();
    }
  }, 5000);

  // Port retry: if port is in use, try next one (up to 10 attempts)
  let actualPort = port;
  const MAX_RETRIES = 10;

  function tryListen(currentPort: number) {
    server.listen(currentPort)
      .once('listening', () => {
        actualPort = currentPort;
        const url = `http://localhost:${actualPort}`;

        console.log('');
        console.log('  🚀  Dashboard 已启动');
        console.log('  ──────────────────────────────────────');
        console.log(`  🌐  ${url}`);
        console.log(`  📡  SSE 实时推送已启用  (${activeHours}h 活跃窗口)`);
        console.log('');
        console.log('  按 Ctrl+C 停止');
        console.log('');

        exec(`open ${url}`, (err) => {
          if (err) {
            console.log(`  请在浏览器中打开: ${url}`);
          }
        });
      })
      .once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && currentPort - port < MAX_RETRIES) {
          tryListen(currentPort + 1);
        } else {
          console.error(`  ✗ 无法启动: 端口 ${port}-${currentPort} 均被占用`);
          process.exit(1);
        }
      });
  }

  tryListen(port);

  const shutdown = () => {
    console.log('\n  👋 Dashboard 已停止');
    clearInterval(scanTimer);
    // Close all SSE connections
    for (const client of sseClients) {
      client.end();
    }
    sseClients.clear();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
