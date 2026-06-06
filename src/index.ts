#!/usr/bin/env tsx

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .env ──────────────────────────────────────────
const __rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = resolve(__rootDir, '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

import { Command } from 'commander';
import { addCommand } from './commands/add.js';
import { removeCommand } from './commands/remove.js';
import { statusCommand } from './commands/status.js';
import { listCommand } from './commands/list.js';
import { startDashboard } from './commands/dashboard.js';
import { configCommand, configSetCommand } from './commands/config.js';

const program = new Command();

program
  .name('pt')
  .description('AI-native multi-project context tracker')
  .version('0.1.0');

program
  .command('add')
  .description('添加项目到追踪列表')
  .argument('<path>', '项目根目录路径')
  .action((projectPath: string) => {
    addCommand(projectPath);
  });

program
  .command('remove')
  .alias('rm')
  .description('从追踪列表移除项目')
  .argument('<name>', '项目名称或路径')
  .action((name: string) => {
    removeCommand(name);
  });

program
  .command('list')
  .alias('ls')
  .description('列出所有已追踪的项目')
  .action(() => {
    listCommand();
  });

program
  .command('status')
  .alias('st')
  .description('显示当前活跃项目的状态看板')
  .option('-a, --all', '显示所有项目（包括不活跃的）')
  .action((opts: { all?: boolean }) => {
    statusCommand(opts);
  });

program
  .command('dashboard')
  .alias('db')
  .description('启动 Web 看板仪表盘')
  .option('-p, --port <port>', '端口号', '3456')
  .option('--hours <hours>', '活跃窗口小时数', '6')
  .option('--api-only', '仅启动 API 服务（开发模式）')
  .action((opts: { port?: string; hours?: string; apiOnly?: boolean }) => {
    startDashboard(opts);
  });

program
  .command('config')
  .alias('cfg')
  .description('查看或修改项目的 Claude 目录配置')
  .argument('[name]', '项目名称')
  .option('-c, --claude <dirs>', 'Claude 目录别名列表，逗号分隔 (如 claude,claude-internal)')
  .option('-o, --output <path>', '设置日报输出目录')
  .action((name?: string, opts?: { claude?: string; output?: string }) => {
    if (opts?.output) {
      configCommand(opts);
    } else if (name && opts?.claude) {
      configSetCommand(name, opts.claude);
    } else {
      configCommand(opts || {});
    }
  });

// Default command: show status when no subcommand given
program.action(() => {
  statusCommand({ all: false });
});

program.parse(process.argv);
