import chalk from 'chalk';
import { addProject } from '../lib/config.js';
import { existsSync } from 'fs';
import { resolve } from 'path';

export function addCommand(projectPath: string): void {
  const resolved = resolve(projectPath);

  if (!existsSync(resolved)) {
    console.error(chalk.red(`✗ 路径不存在: ${resolved}`));
    process.exit(1);
  }

  const folderName = resolved.split('/').pop() || resolved;
  const entry = addProject(resolved, folderName);

  console.log(
    chalk.green(`✓ 已添加项目: `) +
      chalk.cyan.bold(entry.name) +
      chalk.gray(`  →  ${entry.path}`),
  );
}
