import { homedir } from 'os';
import { readdirSync, statSync, existsSync } from 'fs';
import { resolve, basename } from 'path';
import { CLAUDE_VARIANTS, DEFAULT_CLAUDE_DIRS, type ProjectEntry } from './config.js';

/**
 * Convert a project path to the slugified directory name
 * used by Claude Code inside ~/.claude/projects/
 *
 * Example:
 *   /Users/yangyeyuan/Desktop/project-tracker
 *   -> -Users-yangyeyuan-Desktop-project-tracker
 */
export function slugifyPath(projectPath: string): string {
  return projectPath.replace(/\//g, '-');
}

export interface JsonlFile {
  path: string;
  filename: string;
  mtime: Date;
  size: number;
}

/**
 * Resolve the actual directory path for a given claude variant alias.
 *
 * Example:
 *   resolveClaudeDir("claude")           → ~/.claude/projects/<slug>
 *   resolveClaudeDir("claude-internal")  → ~/.claude-internal/projects/<slug>
 */
function resolveClaudeDir(claudeDir: string, slug: string): string {
  const homeDirName = CLAUDE_VARIANTS[claudeDir];
  if (!homeDirName) {
    // Unknown variant — fall back to treating it as a literal dir name
    return resolve(homedir(), claudeDir, 'projects', slug);
  }
  return resolve(homedir(), homeDirName, 'projects', slug);
}

/**
 * Scan JSONL session files from a single claude variant directory.
 */
function scanSingleDir(claudeDir: string, slug: string): JsonlFile[] {
  const dirPath = resolveClaudeDir(claudeDir, slug);

  if (!existsSync(dirPath)) {
    return [];
  }

  const entries = readdirSync(dirPath, { withFileTypes: true });
  const jsonlFiles: JsonlFile[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      const filePath = resolve(dirPath, entry.name);
      try {
        const stat = statSync(filePath);
        jsonlFiles.push({
          path: filePath,
          filename: entry.name,
          mtime: stat.mtime,
          size: stat.size,
        });
      } catch {
        // Skip files we can't stat
      }
    }
  }

  return jsonlFiles;
}

/**
 * Scan all configured Claude variant directories for JSONL session files.
 * Returns files sorted by modification time (newest first).
 *
 * @param projectPath  Absolute path to the project
 * @param claudeDirs   Which Claude variants to scan (default: ["claude"])
 */
export function scanProject(
  projectPath: string,
  claudeDirs?: string[],
): JsonlFile[] {
  const slug = slugifyPath(resolve(projectPath));
  const dirs = claudeDirs && claudeDirs.length > 0 ? claudeDirs : DEFAULT_CLAUDE_DIRS;

  const allFiles: JsonlFile[] = [];
  for (const dir of dirs) {
    allFiles.push(...scanSingleDir(dir, slug));
  }

  // Sort by mtime, newest first
  allFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return allFiles;
}

/**
 * Check if a project is "active" — has any conversation in the last N hours.
 * Default window: 6 hours.
 */
export function isProjectActive(
  projectPath: string,
  hours = 6,
  claudeDirs?: string[],
): boolean {
  const files = scanProject(projectPath, claudeDirs);
  if (files.length === 0) return false;

  const threshold = new Date(Date.now() - hours * 60 * 60 * 1000);
  return files.some((f) => f.mtime >= threshold);
}
