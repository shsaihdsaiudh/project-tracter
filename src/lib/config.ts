import { homedir } from 'os';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

export interface ProjectEntry {
  name: string;
  path: string;
  addedAt: string;
}

export interface TrackerConfig {
  projects: ProjectEntry[];
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
    return config;
  } catch {
    return { projects: [] };
  }
}

export function writeConfig(config: TrackerConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function addProject(projectPath: string, name?: string): ProjectEntry {
  const config = readConfig();
  const resolvedPath = resolve(projectPath);

  // Check if path already exists
  const existing = config.projects.find(
    (p) => resolve(p.path) === resolvedPath,
  );
  if (existing) {
    return existing;
  }

  const folderName = name || resolvedPath.split('/').pop() || resolvedPath;
  const entry: ProjectEntry = {
    name: folderName,
    path: resolvedPath,
    addedAt: new Date().toISOString(),
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

export function listProjects(): ProjectEntry[] {
  return readConfig().projects;
}
