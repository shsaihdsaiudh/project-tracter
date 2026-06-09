import { readFileSync } from 'fs';
import { basename } from 'path';

// ── Session Summary (existing) ──────────────────────────

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
  // Use path.basename — split('/') only works on POSIX paths, but on
  // Windows the path uses '\' so the original split returned the entire
  // path as "filename", producing a corrupt sessionId.
  const filename = basename(filePath);
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
            // Take just the filename from absolute paths to keep it concise.
            // Split on both / and \ so paths recorded on either OS work.
            const parts = paths.split(/[/\\]/);
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

// ── Full Session Messages ───────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  toolUses?: { name: string; summary: string }[];
}

// ── Turn-complete detection (for notifications) ─────────

export interface LatestTurn {
  /** uuid of the most recent assistant message in the file */
  turnUuid: string;
  /**
   * true when that message ends the turn (Claude is done talking and
   * waiting for the user). Drives notification firing.
   *
   * Detected via the message's `stop_reason`:
   *   "end_turn"     → done, waiting for user (notify)
   *   "tool_use"     → still working, will be followed by tool result + more (skip)
   *   anything else  → treated as "still working" to be safe
   */
  isComplete: boolean;
  /** First chars of the assistant's text content, for the notification body. */
  preview: string;
  /** ISO timestamp of the assistant message, used for "is this fresh?" checks. */
  timestamp?: string;
}

/**
 * Read a JSONL session file and return info about the most recent
 * assistant message. Used to detect "AI just finished a turn" so we can
 * fire a notification — see dashboard.ts.
 *
 * Returns null if the file has no assistant messages yet (e.g. session
 * just opened, user typed something but Claude hasn't replied yet).
 */
export function extractLatestTurn(filePath: string): LatestTurn | null {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');

  // Walk backwards — the latest assistant message is almost always near
  // the end, no need to parse the whole file.
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    let obj: any;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (obj.type !== 'assistant') continue;
    if (!obj.uuid) continue;

    const stopReason: string | undefined = obj.message?.stop_reason;
    const isComplete = stopReason === 'end_turn';

    // Build a short text preview from the assistant's text blocks.
    // Skips thinking blocks (internal reasoning) and tool_use blocks.
    let preview = '';
    if (Array.isArray(obj.message?.content)) {
      const texts = obj.message.content
        .filter((c: any) => c.type === 'text' && typeof c.text === 'string')
        .map((c: any) => c.text);
      preview = texts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    }

    return {
      turnUuid: obj.uuid,
      isComplete,
      preview,
      timestamp: typeof obj.timestamp === 'string' ? obj.timestamp : undefined,
    };
  }

  return null;
}

export interface SessionFull {
  sessionId: string;
  title: string;
  branch: string;
  messages: ChatMessage[];
}

/**
 * Parse a JSONL session file to extract the complete conversation
 * (user messages + assistant replies, interleaved in chronological order).
 *
 * Assistant tool_use blocks are extracted as compact labels with the
 * tool name and target file (when detectable).
 */
export function parseSessionMessages(filePath: string): SessionFull {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');

  let title = '';
  let branch = '';
  const messages: ChatMessage[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: any;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }

    // Extract title
    if (obj.type === 'ai-title' && obj.aiTitle) {
      title = obj.aiTitle;
      continue;
    }

    // Extract branch
    if (obj.gitBranch && !branch) {
      branch = obj.gitBranch;
    }

    // Timestamp
    const timestamp = obj.timestamp
      ? new Date(obj.timestamp).toISOString()
      : undefined;

    // ── User message ──────────────────────────────
    if (obj.type === 'user' && obj.message?.content) {
      const content = extractTextContent(obj.message.content);
      if (content) {
        messages.push({ role: 'user', content, timestamp });
      }
      continue;
    }

    // ── Assistant message ─────────────────────────
    if (obj.type === 'assistant' && Array.isArray(obj.message?.content)) {
      const textParts: string[] = [];
      const toolUses: { name: string; summary: string }[] = [];

      for (const block of obj.message.content) {
        if (block.type === 'text' && block.text) {
          textParts.push(block.text);
        } else if (block.type === 'tool_use' && block.name) {
          toolUses.push({
            name: block.name,
            summary: toolUseSummary(block.name, block.input || {}),
          });
        }
      }

      const content = textParts.join('\n').trim();
      // 只有有实际文字内容时才加入消息列表，纯工具调用不显示
      if (content) {
        messages.push({
          role: 'assistant',
          content,
          timestamp,
        });
      }
      continue;
    }
  }

  // Extract session ID from filename (cross-platform — see parseSession above)
  const filename = basename(filePath);
  const sessionId = filename.replace('.jsonl', '');

  return {
    sessionId: sessionId || 'unknown',
    title: title || '(无标题)',
    branch: branch || 'unknown',
    messages,
  };
}

/** Extract plain text from a user message content (string or ContentBlock[]) */
function extractTextContent(content: any): string {
  if (typeof content === 'string') {
    if (content.startsWith('<local-command-caveat>')) return '';
    return sanitize(content);
  }
  if (Array.isArray(content)) {
    const texts = content
      .filter((c: any) => c.type === 'text' && c.text)
      .map((c: any) => c.text);
    return texts.length > 0 ? sanitize(texts.join(' ')) : '';
  }
  return '';
}

/**
 * Build a compact one-line summary of a tool call for display.
 * Examples:
 *   "Read src/foo.ts"
 *   "Edit src/bar.ts"
 *   "Bash npm install"
 *   "Grep 'pattern' in 3 files"
 */
function toolUseSummary(toolName: string, input: Record<string, any>): string {
  const path = input.file_path || input.filePath || input.path || '';
  // Split on both POSIX and Windows separators (paths inside JSONL may be either)
  const fileName = path ? path.split(/[/\\]/).pop() || path : '';

  switch (toolName) {
    case 'Read':
      return fileName ? `Read ${fileName}` : 'Read';
    case 'Write':
      return fileName ? `Write ${fileName}` : 'Write';
    case 'Edit':
      return fileName ? `Edit ${fileName}` : 'Edit';
    case 'Bash':
      // Show first 50 chars of command
      if (input.command) {
        const cmd = typeof input.command === 'string'
          ? input.command
          : input.command.description || JSON.stringify(input.command);
        const short = cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd;
        return `Bash ${short}`;
      }
      return 'Bash';
    case 'Grep':
      return input.pattern ? `Grep "${input.pattern}"` : 'Grep';
    case 'Glob':
      return input.pattern ? `Glob ${input.pattern}` : 'Glob';
    case 'LS':
      return 'LS';
    case 'WebFetch':
      return input.url ? `WebFetch ${input.url.split('/').pop() || input.url}` : 'WebFetch';
    case 'WebSearch':
      return input.query ? `WebSearch "${input.query.substring(0, 40)}"` : 'WebSearch';
    case 'Task':
      return input.subject || 'Task';
    case 'Agent':
      return input.description || 'Agent';
    default:
      return fileName ? `${toolName} ${fileName}` : toolName;
  }
}
