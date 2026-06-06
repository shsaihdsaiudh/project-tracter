#!/usr/bin/env tsx

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
  .action((opts: { port?: string; hours?: string }) => {
    startDashboard(opts);
  });

program
  .command('config')
  .alias('cfg')
  .description('查看或修改项目的 Claude 目录配置')
  .argument('[name]', '项目名称')
  .option('-c, --claude <dirs>', 'Claude 目录别名列表，逗号分隔 (如 claude,claude-internal)')
  .action((name?: string, opts?: { claude?: string }) => {
    if (name && opts?.claude) {
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
