import { useState } from "react";
import type { SessionItem } from "../api/types";

interface Props {
  session: SessionItem;
  hidden: boolean;
  onToggleHide: (sessionId: string) => void;
  onCopyResume: (cmd: string) => void;
}

function getTimeClass(iso: string): "recent" | "today" | "older" {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 3600000) return "recent";
  if (diffMs < 86400000) return "today";
  return "older";
}

export function SessionCard({ session, hidden, onToggleHide, onCopyResume }: Props) {
  const [copied, setCopied] = useState(false);
  const timeClass = getTimeClass(session.lastActiveAt);
  const isClaudeInternal = session.claudeDir === "claude-internal";
  const resumeCmd = `${session.claudeDir || "claude"} --resume ${session.sessionId}`;

  const handleCopy = () => {
    onCopyResume(resumeCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const borderColor =
    timeClass === "recent"
      ? "var(--color-accent)"
      : timeClass === "today"
        ? "var(--color-accent-warn)"
        : "var(--color-border-subtle)";

  const timeColor =
    timeClass === "recent"
      ? "var(--color-accent)"
      : timeClass === "today"
        ? "var(--color-accent-warn)"
        : "var(--color-text-dim)";

  return (
    <div
      className="session-row rounded p-3 mb-1 group relative"
      style={{
        borderLeft: `2px solid ${borderColor}`,
        opacity: hidden ? 0.4 : 1,
      }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-xs font-semibold flex-1 truncate min-w-0"
          style={{ color: "var(--color-text-primary)" }}
        >
          {hidden ? "[已隐藏] " : ""}
          {session.title}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <button className="action-btn" onClick={handleCopy}>
            {copied ? "已复制" : "复制 resume"}
          </button>
          <button
            className="action-btn hide-btn"
            onClick={() => onToggleHide(session.sessionId)}
          >
            {hidden ? "取消隐藏" : "隐藏"}
          </button>
          <span
            className="text-mono text-[9px] whitespace-nowrap"
            style={{ fontFamily: "var(--font-mono)", color: timeColor }}
          >
            {session.relativeTime}
          </span>
        </div>
      </div>

      {/* Message */}
      <div
        className="text-[11px] leading-relaxed pl-2 border-l mb-1.5"
        style={{
          color: "var(--color-text-muted)",
          borderColor: "var(--color-border-subtle)",
          whiteSpace: "pre-line",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 6,
          WebkitBoxOrient: "vertical",
        }}
      >
        {session.lastMessage}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-1.5 mt-1.5" style={{ color: "var(--color-text-dim)" }}>
        <span
          className="pill-mono"
          style={{
            color: isClaudeInternal ? "var(--color-accent-warn)" : "var(--color-accent)",
            background: isClaudeInternal
              ? "rgba(245,158,11,0.06)"
              : "var(--color-accent-subtle)",
          }}
        >
          {session.claudeDir || "claude"}
        </span>
        <span className="text-mono text-[9px]">{session.branch || "unknown"}</span>
      </div>
    </div>
  );
}
