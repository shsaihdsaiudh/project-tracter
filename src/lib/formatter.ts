import chalk from 'chalk';
import boxen from 'boxen';

export interface FormattedStatus {
  name: string;
  path: string;
  title: string;
  lastMessage: string;
  lastActiveAt: Date;
  branch: string;
  sessionCount: number;
  isActive: boolean;
}

/**
 * Format a relative time string from a Date.
 */
export function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 30) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-CN');
}

/**
 * Format a single project status line.
 */
function formatProjectCard(p: FormattedStatus): string {
  const timeStr = chalk.gray(relativeTime(p.lastActiveAt));
  const nameStr = chalk.bold.cyan(`📁 ${p.name}`);
  const titleStr = chalk.white(`  话题: ${p.title || chalk.dim('(无)')}`);
  const metaStr = chalk.gray(
    `  分支: ${p.branch}  ·  ${p.sessionCount} 个会话`,
  );
  const lastMsgStr = chalk.yellow(`  ── "${p.lastMessage || chalk.dim('(无消息)')}"`);

  return [nameStr + '  ' + timeStr, titleStr, metaStr, lastMsgStr].join('\n');
}

/**
 * Format the full status board for all projects.
 */
export function formatStatusBoard(projects: FormattedStatus[]): string {
  if (projects.length === 0) {
    return boxen(
      chalk.yellow('📊 没有已追踪的项目。\n\n') +
        chalk.dim('使用 ') +
        chalk.cyan('pt add <路径>') +
        chalk.dim(' 添加项目'),
      {
        padding: 1,
        borderColor: 'yellow',
        title: 'Project Tracker',
        titleAlignment: 'center',
      },
    );
  }

  const cards = projects.map(formatProjectCard).join('\n\n');
  const activeCount = projects.filter((p) => p.isActive).length;

  const header =
    chalk.bold.white(`📊 当前工作状态`) +
    chalk.gray(`  (${activeCount}/${projects.length} 活跃)\n`) +
    chalk.dim('─'.repeat(56));

  const body = header + '\n\n' + cards;

  return boxen(body, {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    borderColor: 'cyan',
    title: 'Project Tracker',
    titleAlignment: 'center',
  });
}

/**
 * Format the project list.
 */
export function formatProjectList(
  projects: { name: string; path: string }[],
): string {
  if (projects.length === 0) {
    return chalk.yellow(
      '没有已追踪的项目。\n使用 pt add <路径> 添加项目。',
    );
  }

  const lines = projects.map(
    (p) =>
      `  ${chalk.cyan('📁 ' + p.name)}${chalk.gray('  →  ' + p.path)}`,
  );

  return (
    chalk.bold.white('已追踪的项目：\n') +
    chalk.dim('─'.repeat(56)) +
    '\n' +
    lines.join('\n')
  );
}
