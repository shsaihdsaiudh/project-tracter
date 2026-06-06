import chalk from 'chalk';
import { setProjectClaudeDirs, CLAUDE_VARIANTS, listProjects, getReportOutputPath, setReportOutputPath, getDefaultReportPath } from '../lib/config.js';

export function configCommand(opts: { claude?: string; output?: string }): void {
  // --output flag: set report output path
  if (opts.output) {
    setReportOutputPath(opts.output);
    console.log(chalk.green('✓ 日报输出路径已更新为: ') + chalk.cyan(opts.output));
    return;
  }

  // If no --claude flag, show current config
  if (!opts.claude) {
    const projects = listProjects();
    const reportPath = getReportOutputPath();

    if (projects.length === 0) {
      console.log(chalk.yellow('没有已追踪的项目。'));
    } else {
      const lines = projects.map((p) => {
        const dirs = (p.claudeDirs || ['claude']).join(', ');
        return `  ${chalk.cyan('📁 ' + p.name)}${chalk.gray('  →  追踪: ' + dirs)}`;
      });

      console.log(chalk.bold.white('当前项目的 Claude 目录配置：\n'));
      console.log(chalk.dim('─'.repeat(56)));
      console.log(lines.join('\n'));
      console.log('');
    }

    console.log(chalk.bold.white('日报输出路径：'));
    console.log(chalk.dim('─'.repeat(56)));
    console.log(`  ${chalk.gray(reportPath)}`);
    console.log('');
    console.log(
      chalk.dim('使用 ') +
        chalk.cyan('pt config <项目名> --claude <目录列表>') +
        chalk.dim(' 修改追踪的 Claude 变体'),
    );
    console.log(
      chalk.dim('使用 ') +
        chalk.cyan('pt config --output <路径>') +
        chalk.dim(' 修改日报输出目录'),
    );
    console.log(
      chalk.dim('可用变体: ') +
        Object.keys(CLAUDE_VARIANTS).map((k) => chalk.green(k)).join(', '),
    );
    return;
  }

  // --claude flag without project name is not valid
  if (opts.claude && !process.argv.some((a) => a !== 'claude' && !a.startsWith('--'))) {
    console.log(chalk.red('请指定项目名。用法: pt config <项目名> --claude <目录列表>'));
    return;
  }
}

export function configSetCommand(name: string, claudeDirs: string): void {
  const dirs = claudeDirs.split(',').map((d) => d.trim()).filter(Boolean);

  // Validate
  const invalid = dirs.filter((d) => !(d in CLAUDE_VARIANTS));
  if (invalid.length > 0) {
    console.log(chalk.red(`无效的目录别名: ${invalid.join(', ')}`));
    console.log(
      chalk.dim('可用别名: ') +
        Object.keys(CLAUDE_VARIANTS).map((k) => chalk.green(k)).join(', '),
    );
    return;
  }

  const result = setProjectClaudeDirs(name, dirs);
  if (!result) {
    console.log(chalk.red(`未找到项目: ${name}`));
    console.log(chalk.dim('使用 ') + chalk.cyan('pt list') + chalk.dim(' 查看所有已追踪项目'));
    return;
  }

  console.log(
    chalk.green(`✓ ${result.name} 的追踪目录已更新为: `) +
      chalk.cyan(dirs.join(', ')),
  );
}
