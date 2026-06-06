export interface ProjectItem {
  name: string;
  path: string;
  isActive: boolean;
  claudeDirs: string[];
}

export interface SessionItem {
  sessionId: string;
  title: string;
  lastMessage: string;
  lastActiveAt: string;
  relativeTime: string;
  branch: string;
  claudeDir: string;
}

export interface ProjectSection {
  name: string;
  path: string;
  sessions: SessionItem[];
  sessionCount: number;
  isActive: boolean;
  claudeDirs: string[];
}

export interface InitialPayload {
  projects: ProjectItem[];
  sections: ProjectSection[];
}

export interface ReportConfig {
  outputPath: string;
  hasApiKey: boolean;
  hiddenSessions: string[];
}
