import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { fetchSessionDetail } from "../api/client";
import type { SessionDetail as SessionDetailT } from "../api/types";

interface Props {
  sessionId: string;
  projectName: string;
  claudeDir: string;
  onClose: () => void;
}

export function SessionDetail({ sessionId, projectName, claudeDir, onClose }: Props) {
  const [data, setData] = useState<SessionDetailT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeUserIdx, setActiveUserIdx] = useState(0);

  const msgRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSessionDetail(sessionId, projectName, claudeDir)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, projectName, claudeDir]);

  // After data loads, jump straight to the bottom — the user opens a
  // session detail to see "where I left off", not to re-read the whole
  // conversation from message #1. Same UX as IM apps (WeChat / iMessage):
  // newest message in the natural reading position. Use a microtask so the
  // DOM has rendered and the container has its final scrollHeight.
  useEffect(() => {
    if (!data || loading) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    // Two RAFs: first paints the messages, second runs after layout so
    // scrollHeight reflects the rendered content.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    });
  }, [data, loading]);

  // 提取所有用户消息的索引，用于侧边导航
  const userMessageIndices = useMemo(() => {
    if (!data) return [];
    return data.messages
      .map((m, i) => (m.role === "user" ? i : -1))
      .filter((i) => i >= 0);
  }, [data]);

  // 滚动监听：更新当前活跃的用户消息
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || userMessageIndices.length === 0) return;

    const containerTop = container.scrollTop;
    let closest = userMessageIndices[0];

    for (const idx of userMessageIndices) {
      const el = msgRefs.current.get(idx);
      if (!el) continue;
      if (el.offsetTop - containerTop < 100) {
        closest = idx;
      } else {
        break;
      }
    }
    setActiveUserIdx(closest);
  }, [userMessageIndices]);

  // 点击导航点跳转到对应消息
  const scrollToMessage = (idx: number) => {
    const el = msgRefs.current.get(idx);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveUserIdx(idx);
    }
  };

  const isClaudeInternal = claudeDir === "claude-internal";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center animate-[fadeIn_0.15s_ease]"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-lg border shadow-2xl animate-[modalIn_0.15s_ease] flex flex-col relative"
        style={{
          background: "var(--color-bg-card)",
          borderColor: "var(--color-border-subtle)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
          width: "90vw",
          maxWidth: 820,
          maxHeight: "85vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <div className="flex-1 min-w-0 mr-3">
            <h2
              className="text-[14px] font-semibold truncate"
              style={{ color: "var(--color-text-primary)" }}
            >
              {data?.title || "加载中..."}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="pill-mono"
                style={{
                  color: isClaudeInternal ? "var(--color-accent-warn)" : "var(--color-accent)",
                  background: isClaudeInternal
                    ? "rgba(245,158,11,0.06)"
                    : "var(--color-accent-subtle)",
                }}
              >
                {claudeDir}
              </span>
              <span
                className="text-mono text-[9px]"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-dim)",
                }}
              >
                {data?.branch || "unknown"}
              </span>
              {data && (
                <span
                  className="text-mono text-[9px]"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-dim)",
                  }}
                >
                  {data.messages.length} 条消息
                </span>
              )}
            </div>
          </div>
          <button
            className="text-[18px] leading-none cursor-pointer flex-shrink-0 px-1.5 py-1 rounded transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            onClick={onClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-text-primary)";
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-muted)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            ✕
          </button>
        </div>

        {/* Body + Sidebar */}
        <div className="flex flex-1 min-h-0 relative">
          {/* Scrollable message area */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-5 py-4"
            style={{ minHeight: 0, paddingRight: 56 }}
            onScroll={handleScroll}
          >
            {loading && (
              <div
                className="flex items-center justify-center py-16"
                style={{ color: "var(--color-text-muted)" }}
              >
                <span className="text-[13px]">加载对话记录...</span>
              </div>
            )}

            {error && (
              <div
                className="flex items-center justify-center py-16"
                style={{ color: "var(--color-accent-danger)" }}
              >
                <span className="text-[13px]">加载失败: {error}</span>
              </div>
            )}

            {data && !loading && (
              <div className="flex flex-col gap-3">
                {data.messages.map((msg, i) => {
                  const isUser = msg.role === "user";
                  const timeLabel = msg.timestamp
                    ? new Date(msg.timestamp).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : null;

                  return (
                    <div
                      key={i}
                      ref={(el) => {
                        if (el && isUser) msgRefs.current.set(i, el);
                      }}
                      className="rounded p-3 scroll-mt-4"
                      style={{
                        background: isUser
                          ? "rgba(59,130,246,0.06)"
                          : "rgba(48,209,88,0.04)",
                        borderLeft: `2px solid ${isUser ? "rgba(59,130,246,0.4)" : "var(--color-accent)"}`,
                      }}
                    >
                      {/* Role + time */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider"
                          style={{
                            color: isUser
                              ? "rgba(96,165,250,0.9)"
                              : "var(--color-accent)",
                          }}
                        >
                          {isUser ? "👤 用户" : "🤖 AI"}
                        </span>
                        {timeLabel && (
                          <span
                            className="text-mono text-[9px]"
                            style={{
                              fontFamily: "var(--font-mono)",
                              color: "var(--color-text-dim)",
                            }}
                          >
                            {timeLabel}
                          </span>
                        )}
                      </div>

                      {/* Content */}
                      {msg.content && (
                        <div
                          className="text-[12px] leading-relaxed"
                          style={{
                            color: "var(--color-text-secondary)",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {msg.content}
                        </div>
                      )}
                    </div>
                  );
                })}

                {data.messages.length === 0 && (
                  <div
                    className="text-center py-12 text-[12px]"
                    style={{ color: "var(--color-text-dim)" }}
                  >
                    此会话没有对话记录
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar navigation — dots for each user message */}
          {data && userMessageIndices.length > 1 && (
            <div
              className="flex-shrink-0 flex flex-col items-center gap-0.5 py-4 overflow-y-auto"
              style={{
                width: 44,
                borderLeft: "1px solid var(--color-border-subtle)",
                background: "var(--color-bg-card)",
              }}
            >
              {userMessageIndices.map((msgIdx, dotIdx) => {
                const msg = data.messages[msgIdx];
                const preview = msg.content.slice(0, 12);
                const isActive = msgIdx === activeUserIdx;

                return (
                  <button
                    key={msgIdx}
                    className="flex items-center justify-center cursor-pointer transition-all rounded-sm"
                    style={{
                      width: 28,
                      height: 20,
                      background: isActive
                        ? "rgba(96,165,250,0.12)"
                        : "transparent",
                      color: isActive
                        ? "rgba(96,165,250,0.9)"
                        : "var(--color-text-dim)",
                    }}
                    onClick={() => scrollToMessage(msgIdx)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "rgba(96,165,250,0.8)";
                      e.currentTarget.style.background = "rgba(96,165,250,0.06)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = "var(--color-text-dim)";
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                    title={`${dotIdx + 1}. ${preview}…`}
                  >
                    <span
                      className="text-mono text-[9px] font-medium"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {dotIdx + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
