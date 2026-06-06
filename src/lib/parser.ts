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

/** Strip control characters, surrogates, and other problematic content that breaks JSON/API calls */
function sanitize(text: string): string {
  return text
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '') // control chars (keep \n, \t)
    .replace(/[\uD800-\uDFFF]/g, '')  // unicode surrogates (break JSON encoding)
    .replace(/�/g, '')  // replacement character
    .replace(/\\/g, '/') // backslash → forward slash (avoids hex escape issues in API)
    .trim();
}

/**
 * Extract ALL user messages from a JSONL session file.
 * For report generation — provides the full conversation arc,
 * not just the last few messages.
 */
export function extractAllUserMessages(filePath: string): string[] {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');
  const messages: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: any;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (obj.type === 'user' && obj.message?.content) {
      const content = obj.message.content;
      if (typeof content === 'string') {
        if (!content.startsWith('<local-command-caveat>')) {
          const clean = sanitize(content);
          if (clean) messages.push(clean);
        }
      } else if (Array.isArray(content)) {
        const texts = content
          .filter((c: any) => c.type === 'text' && c.text)
          .map((c: any) => c.text);
        if (texts.length > 0) {
          const clean = sanitize(texts.join(' '));
          if (clean) messages.push(clean);
        }
      }
    }
  }

  return messages;
}

/**
 * Extract concise AI assistant replies from a JSONL session file.
 * Returns the first ~200 chars of each significant assistant reply,
 * skipping thinking blocks and short acknowledgments.
 * These are supplementary — user messages remain the primary signal.
 */
export function extractAssistantReplies(filePath: string): string[] {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');
  const replies: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: any;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (obj.type === 'assistant' && Array.isArray(obj.message?.content)) {
      for (const block of obj.message.content) {
        if (block.type === 'text' && block.text) {
          const text = sanitize(block.text);
          // Skip thinking blocks and very short responses
          if (text.length > 80) {
            replies.push(truncate(text, 200));
          }
        }
      }
    }
  }

  return replies;
}

/**
 * Extract a lightweight "work footprint" from tool calls in the session.
 * Returns deduplicated file names and tool action counts.
 * This gives the report AI concrete anchors — it can't invent work
 * that doesn't match the actual files touched.
 */
export function extractWorkFootprint(filePath: string): { files: string[]; actions: string[] } {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');
  const files = new Set<string>();
  const actionSet = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: any;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }

    // Tool calls are nested inside assistant messages
    if (obj.type === 'assistant' && Array.isArray(obj.message?.content)) {
      for (const block of obj.message.content) {
        if (block.type === 'tool_use' && block.name) {
          actionSet.add(block.name);
          // Extract file paths from common tool inputs
          const input = block.input || {};
          const paths = input.file_path || input.filePath || input.path || input.target_directory || '';
          if (typeof paths === 'string' && paths.length > 0) {
            // Take just the filename from absolute paths to keep it concise
            const parts = paths.split('/');
            files.add(parts[parts.length - 1]);
          }
        }
      }
    }
  }

  return {
    files: Array.from(files).slice(0, 15),
    actions: Array.from(actionSet),
  };
}
