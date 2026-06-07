import { createServer, IncomingMessage, ServerResponse } from 'http';
import { exec } from 'child_process';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, resolve, join, extname } from 'path';
import { listProjects, addProject, removeProject, setProjectClaudeDirs, CLAUDE_VARIANTS, getReportOutputPath, setReportOutputPath, getHiddenSessions, toggleHiddenSession } from '../lib/config.js';
import { scanProject, isProjectActive, slugifyPath } from '../lib/scanner.js';
import { parseSession, extractAllUserMessages, extractAssistantReplies, extractWorkFootprint, parseSessionMessages } from '../lib/parser.js';
import { relativeTime } from '../lib/formatter.js';

// ── Types ──────────────────────────────────────────────

interface SessionItem {
  sessionId: string;
  title: string;
  lastMessage: string;
  lastActiveAt: string;
  relativeTime: string;
  branch: string;
  /** Which Claude variant this session came from: "claude" | "claude-internal" */
  claudeDir: string;
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

// ── AI Report ──────────────────────────────────────────

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

interface ReportRequest {
  hours: number;
}

interface ReportSession {
  projectName: string;
  sessionTitle: string;
  relativeTime: string;
  branch: string;
  filePath: string;
}

async function generateReport(sessions: ReportSession[], hours: number): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('未设置 DEEPSEEK_API_KEY 环境变量');
  }

  // Group sessions by project
  const grouped: Record<string, ReportSession[]> = {};
  for (const s of sessions) {
    if (!grouped[s.projectName]) grouped[s.projectName] = [];
    grouped[s.projectName].push(s);
  }

  const projectNames = Object.keys(grouped);
  const projectSummaries: string[] = [];

  // Process each project independently
  for (const projectName of projectNames) {
    const projSessions = grouped[projectName];
    const prompt = buildSingleProjectPrompt(projectName, projSessions, hours);

    const res = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`DeepSeek API error ${res.status} (${projectName}): ${errBody}`);
    }

    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      projectSummaries.push(`## ${projectName}\n\n${content.trim()}`);
    }
  }

  // Combine all project summaries into one report
  return projectSummaries.join('\n\n');
}

function buildSingleProjectPrompt(
  projectName: string,
  sessions: ReportSession[],
  hours: number,
): string {
  const timeLabel = hours >= 168 ? '本周' : hours >= 48 ? '最近 3 天' : hours >= 24 ? '昨天' : `最近 ${hours} 小时`;

  let dataBlock = '';
  let allFootprintFiles: string[] = [];
  let allFootprintActions: string[] = [];

  for (const s of sessions) {
    const userMessages = extractAllUserMessages(s.filePath);
    const assistantReplies = extractAssistantReplies(s.filePath);
    const footprint = extractWorkFootprint(s.filePath);

    // Collect footprint across all sessions
    allFootprintFiles.push(...footprint.files);
    allFootprintActions.push(...footprint.actions);

    // User messages — the primary signal (user's intent and thinking)
    const userText = userMessages.length > 0
      ? userMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')
      : '(无消息)';

    // Assistant replies — brief reference only (what was actually completed)
    const aiText = assistantReplies.length > 0
      ? assistantReplies.map((r, i) => `  [AI] ${r}`).join('\n')
      : '';

    // Work footprint — concrete evidence of what files were touched
    const fpText = footprint.files.length > 0 || footprint.actions.length > 0
      ? `涉及文件: ${footprint.files.join(', ') || '(无)'}\n使用工具: ${footprint.actions.join(', ') || '(无)'}`
      : '';

    dataBlock += `\n### ${s.sessionTitle}（${s.relativeTime}，分支: ${s.branch}）\n`;
    dataBlock += `用户的发言:\n${userText}\n`;
    if (aiText) {
      dataBlock += `AI 回复（供参考）:\n${aiText}\n`;
    }
    if (fpText) {
      dataBlock += `${fpText}\n`;
    }
  }

  // Deduplicate
  const uniqueFiles = [...new Set(allFootprintFiles)];
  const uniqueActions = [...new Set(allFootprintActions)];

  return `你是日报助手，请根据以下真实对话记录，为项目「${projectName}」输出${timeLabel}的工作总结。

## 数据说明
- "用户的发言"：用户的实际消息。这是核心依据。用户说了什么、问了什么、要求了什么，你就从这里提取。
- "AI 回复"：AI 的回答片段，用于判断用户的要求是否被实际执行了。
- "涉及文件 / 使用工具"：AI 实际操作过的文件和工具，是工作内容的客观证据。

## 关键规则（必须遵守）
1. **只写对话中实际发生的事情**。如果对话中没有提到某个功能、某个 bug、某个模块，绝不能凭空编造。
2. **不要使用模板化套话**。禁止写"完成了基础框架搭建""实现了核心功能模块""优化了用户体验"这类放之四海而皆准的空话。如果用户就是在修一个 toast 通知不消失的 bug，那就写"修复了日报生成后 loading toast 不消失的问题"。
3. **用对话中的具体词汇**。用户在讨论什么，你就写什么。用户在讨论"支持 claude-internal"，你就写"支持 claude-internal"，不要自己升华成"多平台适配"。
4. **如果没有足够信息判断工作是否完成，就不要声称已完成**。可以说"讨论了XX"，但不要说"完成了XX"除非 AI 回复中有明确证据。
5. **2-5 条即可，少而精**。宁可只有 2 条准确的，不要凑 5 条假的。

## 对话记录
${dataBlock}

## 全局足迹
本项目涉及的文件: ${uniqueFiles.join(', ') || '(无)'}
使用的工具类型: ${uniqueActions.join(', ') || '(无)'}

请直接输出工作总结（每条一行，用 - 开头），不要加前言或说明。`;
}

function saveReport(markdown: string, hours: number): string {
  const outputDir = getReportOutputPath();
  mkdirSync(outputDir, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const filename = `${dateStr}-日报.md`;
  const filePath = join(outputDir, filename);

  // Add a header with generation info
  const header = `# 工作日报 — ${dateStr}\n\n> 自动生成 · 覆盖最近 ${hours} 小时的对话\n\n---\n\n`;
  writeFileSync(filePath, header + markdown, 'utf-8');

  return filePath;
}

// ── HTML template ──────────────────────────────────────

// ── MIME types ────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST_DIR = resolve(__dirname, '..', '..', 'dashboard', 'dist');

function serveStatic(url: string, res: ServerResponse): boolean {
  let filePath = join(DIST_DIR, url === '/' ? 'index.html' : url);
  // Security: prevent directory traversal
  if (!filePath.startsWith(DIST_DIR)) return false;
  if (!existsSync(filePath)) {
    // SPA fallback: serve index.html for unknown paths
    filePath = join(DIST_DIR, 'index.html');
    if (!existsSync(filePath)) return false;
  }

  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

// ── Data collection ────────────────────────────────────

let activeHours = 6;

/** Detect which Claude variant a session file belongs to from its path */
function detectClaudeDir(filePath: string): string {
  if (filePath.includes('/.claude-internal/')) return 'claude-internal';
  return 'claude';
}

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

      const claudeDir = detectClaudeDir(file.path);

      if (summary) {
        sessions.push({
          sessionId: summary.sessionId,
          title: summary.title || '(无标题)',
          lastMessage: summary.lastUserMessage || '(无消息)',
          lastActiveAt: (summary.lastActiveAt || file.mtime).toISOString(),
          relativeTime: relativeTime(summary.lastActiveAt || file.mtime),
          branch: summary.branch || 'unknown',
          claudeDir,
        });
      } else {
        sessions.push({
          sessionId: file.filename.replace('.jsonl', ''),
          title: '(无标题)',
          lastMessage: '(无消息)',
          lastActiveAt: file.mtime.toISOString(),
          relativeTime: relativeTime(file.mtime),
          branch: 'unknown',
          claudeDir,
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

export function startDashboard(opts: { port?: string; hours?: string; apiOnly?: boolean }): void {
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

    // POST /api/browse — open native folder picker (cross-platform)
    if (url === '/api/browse' && method === 'POST') {
      const platform = process.platform;
      let cmd: string;

      if (platform === 'darwin') {
        cmd = `osascript -e 'POSIX path of (choose folder with prompt "选择要追踪的项目文件夹")'`;
      } else if (platform === 'win32') {
        // PowerShell: .NET FolderBrowserDialog
        cmd = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f=New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description='选择要追踪的项目文件夹'; if($f.ShowDialog() -eq 'OK'){$f.SelectedPath}"`;
      } else {
        // Linux: try zenity first, fall back to kdialog
        cmd = `if command -v zenity >/dev/null 2>&1; then zenity --file-selection --directory --title='选择要追踪的项目文件夹' 2>/dev/null; elif command -v kdialog >/dev/null 2>&1; then kdialog --getexistingdirectory 2>/dev/null; else echo ''; fi`;
      }

      exec(cmd, { timeout: 120000 }, (err, stdout) => {
        if (err || !stdout.trim()) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ path: null, cancelled: true }));
          return;
        }
        const selectedPath = stdout.trim();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ path: selectedPath }));
      });
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

    // GET /api/report-config — 日报配置状态
    if (url === '/api/report-config') {
      if (method === 'GET') {
        const hasApiKey = !!process.env.DEEPSEEK_API_KEY;
        const outputPath = getReportOutputPath();
        const hiddenSessions = getHiddenSessions();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ outputPath, hasApiKey, hiddenSessions }));
        return;
      }

      if (method === 'POST') {
        const body = await readBody(req);
        try {
          const { outputPath } = JSON.parse(body);
          if (!outputPath) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: '缺少 outputPath' }));
            return;
          }
          setReportOutputPath(outputPath);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, outputPath }));
        } catch (e: any) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }
    }

    // POST /api/hidden-sessions — toggle hide/show a session
    if (url === '/api/hidden-sessions' && method === 'POST') {
      const body = await readBody(req);
      try {
        const { sessionId } = JSON.parse(body);
        if (!sessionId) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: '缺少 sessionId' }));
          return;
        }
        const hiddenSessions = toggleHiddenSession(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ hiddenSessions }));
        broadcast();
      } catch (e: any) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // POST /api/report — AI 日报生成
    if (url === '/api/report' && method === 'POST') {
      const body = await readBody(req);
      try {
        const { hours = 24 } = JSON.parse(body) as ReportRequest;

        // Collect all sessions across all projects for the time window
        const projects = listProjects();
        const reportSessions: ReportSession[] = [];

        for (const project of projects) {
          const claudeDirs = project.claudeDirs || ['claude'];
          const files = scanProject(project.path, claudeDirs);

          for (const file of files) {
            const summary = parseSession(file.path);
            if (!summary) continue;

            const sessionTime = summary.lastActiveAt || file.mtime;
            const threshold = Date.now() - hours * 60 * 60 * 1000;
            if (sessionTime.getTime() < threshold) continue;

            reportSessions.push({
              projectName: project.name,
              sessionTitle: summary.title || '(无标题)',
              relativeTime: relativeTime(sessionTime),
              branch: summary.branch || 'unknown',
              filePath: file.path,
            });
          }
        }

        const markdown = await generateReport(reportSessions, hours);
        const filePath = saveReport(markdown, hours);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, filePath, content: markdown }));
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message || '生成日报失败' }));
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

    // GET /api/sessions/:sessionId — full conversation detail
    if (url.startsWith('/api/sessions/') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${actualPort}`);
      const pathPart = url.replace('/api/sessions/', '');
      const sessionId = pathPart.split('?')[0];
      const projectName = urlObj.searchParams.get('project');
      const claudeDir = urlObj.searchParams.get('claudeDir') || 'claude';

      if (!sessionId || !projectName) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: '缺少 sessionId 或 project 参数' }));
        return;
      }

      // Resolve project path from config
      const allProjects = listProjects();
      const project = allProjects.find((p) => p.name === projectName);
      if (!project) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: '未找到项目: ' + projectName }));
        return;
      }

      // Construct the JSONL file path
      const homeDirName = CLAUDE_VARIANTS[claudeDir] || `.${claudeDir}`;
      const slug = slugifyPath(resolve(project.path));
      const jsonlPath = resolve(homedir(), homeDirName, 'projects', slug, `${sessionId}.jsonl`);

      if (!existsSync(jsonlPath)) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: '会话文件不存在' }));
        return;
      }

      try {
        const detail = parseSessionMessages(jsonlPath);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(detail));
      } catch (e: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message || '解析会话失败' }));
      }
      return;
    }

    // Default: serve static files from dashboard/dist/
    if (!opts.apiOnly && serveStatic(url, res)) return;
    // Fallback for API-only mode
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, mode: 'api-only' }));
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
