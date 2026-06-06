import { readFileSync } from 'fs';

export interface SessionSummary {
  sessionId: string;
  title: string;
  lastUserMessage: string;
  lastActiveAt: Date;
  branch: string;
}

/**
 * Parse a single JSONL session file to extract a summary.
 *
 * JSONL format (one JSON object per line):
 *   - "ai-title": { aiTitle, sessionId }
 *   - "user": { message: { role: "user", content } }
 *   - "assistant": { message: { role: "assistant", content[] } }
 *   - "attachment": { attachment: { ... }, gitBranch, cwd, timestamp, version }
 *   - "system": { subtype, ... }
 *   - "last-prompt": { leafUuid, sessionId }
 *   - "mode": { mode, sessionId }
 *   - "permission-mode": { permissionMode, sessionId }
 *   - "file-history-snapshot": { ... }
 */
export function parseSession(filePath: string): SessionSummary | null {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');

  let title = '';
  const userMessages: string[] = [];
  let lastActiveAt: Date | null = null;
  let branch = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: any;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }

    // Extract AI-generated session title
    if (obj.type === 'ai-title' && obj.aiTitle) {
      title = obj.aiTitle;
    }

    // Extract user messages (skip meta/system messages)
    if (obj.type === 'user' && obj.message?.content) {
      const content = obj.message.content;
      if (typeof content === 'string') {
        // Skip caveat meta-messages
        if (!content.startsWith('<local-command-caveat>')) {
          userMessages.push(content);
        }
      } else if (Array.isArray(content)) {
        // Content blocks — look for text
        const texts = content
          .filter((c: any) => c.type === 'text' && c.text)
          .map((c: any) => c.text);
        if (texts.length > 0) {
          userMessages.push(texts.join(' '));
        }
      }
    }

    // Extract assistant messages for fallback "what happened" context
    // We don't store full assistant messages but note we could in the future

    // Extract timestamp from any entry that has one
    if (obj.timestamp) {
      const ts = new Date(obj.timestamp);
      if (!lastActiveAt || ts > lastActiveAt) {
        lastActiveAt = ts;
      }
    }

    // Extract git branch
    if (obj.gitBranch && !branch) {
      branch = obj.gitBranch;
    }
  }

  // Extract session ID from filename
  const filename = filePath.split('/').pop() || filePath;
  const sessionId = filename.replace('.jsonl', '');

  // Take last 3 user messages to give richer context
  const lastUserMessages = userMessages.slice(-3).join('\n');
  const lastUserMessage = lastUserMessages || userMessages[userMessages.length - 1] || '';

  if (!title && !lastUserMessage && !lastActiveAt) {
    return null;
  }

  return {
    sessionId: sessionId || 'unknown',
    title: title || '(无标题)',
    lastUserMessage: truncate(lastUserMessage, 500),
    lastActiveAt: lastActiveAt || new Date(0),
    branch: branch || 'unknown',
  };
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + '...';
}
