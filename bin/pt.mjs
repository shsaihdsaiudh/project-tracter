#!/usr/bin/env node
// Cross-platform launcher for `pt`.
// Why this exists:
//   We want the project's bin entry to "just work" on both macOS and Windows
//   after `npm install` + `npm link`. Pointing bin directly at a `.ts` file
//   with `#!/usr/bin/env tsx` works on macOS but breaks on Windows because:
//     1. Windows doesn't honor shebangs natively.
//     2. npm-shim (.ps1/.cmd) hardcodes calling `tsx.exe`, but global tsx on
//        Windows only ships `tsx.cmd`, not `tsx.exe`.
//   The fix is to make the bin entry a real `.mjs` file run by `node` (which
//   exists as a real `.exe` on Windows), and let it spawn the locally-installed
//   tsx from node_modules. No global tsx needed, no manual setup on either OS.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const entry = join(projectRoot, 'src', 'index.ts');

// Locate tsx's CLI JS directly — bypasses platform-specific shim files
// (.cmd on Windows, shell script on Unix). Works identically everywhere.
const tsxCli = join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

if (!existsSync(tsxCli)) {
  console.error('[pt] tsx not found in node_modules. Run `npm install` first.');
  process.exit(1);
}

const child = spawn(
  process.execPath, // current node binary
  [tsxCli, entry, ...process.argv.slice(2)],
  { stdio: 'inherit' }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
