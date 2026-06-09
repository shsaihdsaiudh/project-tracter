export interface ProjectItem {
  name: string;
  path: string;
  isActive: boolean;
  claudeDirs: string[];
  /** Desktop notifications enabled when an assistant turn completes */
  notifyEnabled: boolean;
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

// ── Session Detail (full conversation) ──────────────────

export interface ToolUse {
  name: string;
  summary: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  toolUses?: ToolUse[];
}

export interface SessionDetail {
  sessionId: string;
  title: string;
  branch: string;
  messages: ChatMessage[];
}
