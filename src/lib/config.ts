import { homedir } from 'os';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

/**
 * Supported Claude variants and their home directory prefixes.
 * Each key is a short alias, value is the `~/.xxx` directory name.
 */
export const CLAUDE_VARIANTS: Record<string, string> = {
  claude: '.claude',
  'claude-internal': '.claude-internal',
};

export const DEFAULT_CLAUDE_DIRS = ['claude'];

/**
 * Try to auto-detect Obsidian vault path from Obsidian's own config.
 * Falls back to sensible defaults per platform.
 */
function detectObsidianVault(): string | null {
  const platform = process.platform;
  let obsidianConfigPath: string;

  if (platform === 'darwin') {
    obsidianConfigPath = resolve(homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json');
  } else if (platform === 'win32') {
    const appData = process.env.APPDATA || resolve(homedir(), 'AppData', 'Roaming');
    obsidianConfigPath = resolve(appData, 'obsidian', 'obsidian.json');
  } else {
    // Linux / other
    const xdgConfig = process.env.XDG_CONFIG_HOME || resolve(homedir(), '.config');
    obsidianConfigPath = resolve(xdgConfig, 'obsidian', 'obsidian.json');
  }

  try {
    const raw = readFileSync(obsidianConfigPath, 'utf-8');
    const cfg = JSON.parse(raw);
    const vaults: Record<string, { path: string; open?: boolean }> = cfg.vaults || {};
    // Prefer the currently-open vault, otherwise first one found
    const openVault = Object.values(vaults).find((v) => v.open);
    const firstVault = Object.values(vaults)[0];
    const vault = openVault || firstVault;
    if (vault?.path) {
      return resolve(vault.path, '每日工作记录');
    }
  } catch {
    // Obsidian config not found or unreadable
  }
  return null;
}

/** Default output path for daily reports */
export function getDefaultReportPath(): string {
  // Try auto-detection first
  const detected = detectObsidianVault();
  if (detected) return detected;

  // Fallback: platform-appropriate default
  const platform = process.platform;
  if (platform === 'darwin') {
    return resolve(homedir(), 'Documents', 'Obsidian Vault', '每日工作记录');
  } else if (platform === 'win32') {
    return resolve(homedir(), 'Documents', 'Obsidian', '每日工作记录');
  }
  return resolve(homedir(), 'project-tracker-reports');
}

export interface ProjectEntry {
  name: string;
  path: string;
  addedAt: string;
  /** Which Claude variants to scan for this project. Default: ["claude"] */
  claudeDirs?: string[];
}

export interface TrackerConfig {
  projects: ProjectEntry[];
  /** Output directory for daily AI-generated reports */
  reportOutputPath?: string;
}

const CONFIG_PATH = resolve(homedir(), '.project-tracker.json');

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function readConfig(): TrackerConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { projects: [] };
  }

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw) as TrackerConfig;
    if (!Array.isArray(config.projects)) {
      return { projects: [] };
    }
    // Backward compat: ensure every project has claudeDirs
    for (const p of config.projects) {
      if (!p.claudeDirs || p.claudeDirs.length === 0) {
        p.claudeDirs = [...DEFAULT_CLAUDE_DIRS];
      }
    }
    return config;
  } catch {
    return { projects: [] };
  }
}

export function writeConfig(config: TrackerConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function addProject(
  projectPath: string,
  name?: string,
  claudeDirs?: string[],
): ProjectEntry {
  const config = readConfig();
  const resolvedPath = resolve(projectPath);

  // Check if path already exists
  const existing = config.projects.find(
    (p) => resolve(p.path) === resolvedPath,
  );
  if (existing) {
    // If claudeDirs provided and different, update existing entry
    if (claudeDirs && claudeDirs.length > 0) {
      const validDirs = claudeDirs.filter((d) => d in CLAUDE_VARIANTS);
      if (validDirs.length > 0) {
        existing.claudeDirs = validDirs;
        writeConfig(config);
      }
    }
    return existing;
  }

  const folderName = name || resolvedPath.split('/').pop() || resolvedPath;
  const validDirs = (claudeDirs && claudeDirs.length > 0)
    ? claudeDirs.filter((d) => d in CLAUDE_VARIANTS)
    : [...DEFAULT_CLAUDE_DIRS];

  const entry: ProjectEntry = {
    name: folderName,
    path: resolvedPath,
    addedAt: new Date().toISOString(),
    claudeDirs: validDirs.length > 0 ? validDirs : [...DEFAULT_CLAUDE_DIRS],
  };

  config.projects.push(entry);
  writeConfig(config);
  return entry;
}

export function removeProject(nameOrPath: string): boolean {
  const config = readConfig();
  const idx = config.projects.findIndex(
    (p) => p.name === nameOrPath || p.path === nameOrPath,
  );

  if (idx === -1) {
    return false;
  }

  config.projects.splice(idx, 1);
  writeConfig(config);
  return true;
}

/**
 * Update the claudeDirs for a project.
 * @returns The updated ProjectEntry, or null if project not found.
 */
export function setProjectClaudeDirs(
  nameOrPath: string,
  claudeDirs: string[],
): ProjectEntry | null {
  const config = readConfig();
  const project = config.projects.find(
    (p) => p.name === nameOrPath || p.path === nameOrPath,
  );

  if (!project) return null;

  // Validate: all dirs must be known variants
  const validDirs = claudeDirs.filter((d) => d in CLAUDE_VARIANTS);
  if (validDirs.length === 0) {
    return null; // no valid dirs provided
  }

  project.claudeDirs = validDirs;
  writeConfig(config);
  return project;
}

export function listProjects(): ProjectEntry[] {
  return readConfig().projects;
}

/**
 * Get the report output path. Uses configured path or default Obsidian Vault.
 */
export function getReportOutputPath(): string {
  const config = readConfig();
  return config.reportOutputPath || getDefaultReportPath();
}

/**
 * Set the report output path.
 */
export function setReportOutputPath(path: string): void {
  const config = readConfig();
  config.reportOutputPath = path;
  writeConfig(config);
}
