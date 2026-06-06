import chalk from 'chalk';
import { removeProject } from '../lib/config.js';

export function removeCommand(nameOrPath: string): void {
  const removed = removeProject(nameOrPath);

  if (removed) {
    console.log(chalk.green(`✓ 已移除项目: ${chalk.cyan(nameOrPath)}`));
  } else {
    console.error(chalk.red(`✗ 未找到项目: ${nameOrPath}`));
    console.log(chalk.dim('使用 pt list 查看所有已追踪项目'));
    process.exit(1);
  }
}
