import { homedir } from 'os';
import { readdirSync, statSync, existsSync } from 'fs';
import { resolve, basename } from 'path';

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
 * Scan ~/.claude/projects/<slugified-path>/ for JSONL session files.
 * Returns files sorted by modification time (newest first).
 */
export function scanProject(projectPath: string): JsonlFile[] {
  const slug = slugifyPath(resolve(projectPath));
  const claudeDir = resolve(homedir(), '.claude', 'projects', slug);

  if (!existsSync(claudeDir)) {
    return [];
  }

  const entries = readdirSync(claudeDir, { withFileTypes: true });
  const jsonlFiles: JsonlFile[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      const filePath = resolve(claudeDir, entry.name);
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

  // Sort by mtime, newest first
  jsonlFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return jsonlFiles;
}

/**
 * Check if a project is "active" — has any conversation today.
 */
export function isProjectActive(projectPath: string): boolean {
  const files = scanProject(projectPath);
  if (files.length === 0) return false;

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  return files.some((f) => f.mtime >= todayStart);
}
