import chalk from 'chalk';
import { listProjects } from '../lib/config.js';
import { scanProject, isProjectActive } from '../lib/scanner.js';
import { parseSession } from '../lib/parser.js';
import { formatStatusBoard, FormattedStatus } from '../lib/formatter.js';

export function statusCommand(opts: { all?: boolean }): void {
  const projects = listProjects();

  if (projects.length === 0) {
    console.log(formatStatusBoard([]));
    return;
  }

  const results: FormattedStatus[] = [];

  for (const project of projects) {
    const claudeDirs = project.claudeDirs;
    const files = scanProject(project.path, claudeDirs);
    const active = isProjectActive(project.path, 6, claudeDirs);

    // Skip inactive unless --all is set
    if (!active && !opts.all) {
      continue;
    }

    let title = '';
    let lastMessage = '';
    let lastActiveAt: Date | null = null;
    let branch = '';

    // Parse the latest session file
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

    // For projects with files but no parseable summary, use file mtime
    if (!lastActiveAt && files.length > 0) {
      lastActiveAt = files[0].mtime;
    }

    results.push({
      name: project.name,
      path: project.path,
      title,
      lastMessage,
      lastActiveAt: lastActiveAt || new Date(0),
      branch,
      sessionCount: files.length,
      isActive: active,
    });
  }

  // Sort by last active time, most recent first
  results.sort(
    (a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime(),
  );

  if (results.length === 0 && !opts.all) {
    console.log(
      chalk.yellow('📊 当前没有活跃的项目。\n') +
        chalk.dim('使用 ') +
        chalk.cyan('pt status --all') +
        chalk.dim(' 查看所有已追踪项目'),
    );
    return;
  }

  console.log(formatStatusBoard(results));
}
