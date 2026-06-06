import { useState, useRef, useEffect } from "react";
import type { ProjectSection as ProjectSectionT } from "../api/types";
import { SessionCard } from "./SessionCard";

const TIME_OPTIONS = [
  { label: "1 小时", hours: 1 },
  { label: "6 小时", hours: 6 },
  { label: "12 小时", hours: 12 },
  { label: "1 天", hours: 24 },
  { label: "3 天", hours: 72 },
  { label: "7 天", hours: 168 },
  { label: "全部", hours: 0 },
];

interface Props {
  section: ProjectSectionT;
  timeHours: number;
  hiddenSessions: Record<string, boolean>;
  showHidden: boolean;
  onTimeChange: (projectName: string, hours: number) => void;
  onToggleHide: (sessionId: string) => void;
  onCopyResume: (cmd: string) => void;
}

export function ProjectSectionComp({
  section,
  timeHours,
  hiddenSessions,
  showHidden,
  onTimeChange,
  onToggleHide,
  onCopyResume,
}: Props) {
  const [mgrOpen, setMgrOpen] = useState(false);
  const mgrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mgrOpen) return;
    const handler = (e: MouseEvent) => {
      if (mgrRef.current && !mgrRef.current.contains(e.target as Node)) {
        setMgrOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [mgrOpen]);

  const threshold =
    timeHours === 0 ? 0 : Date.now() - timeHours * 60 * 60 * 1000;

  const filteredSessions = section.sessions.filter((s) => {
    if (timeHours !== 0 && new Date(s.lastActiveAt).getTime() < threshold)
      return false;
    if (!showHidden && hiddenSessions[s.sessionId]) return false;
    return true;
  });

  const visibleCount = section.sessions.filter((s) => {
    if (!showHidden && hiddenSessions[s.sessionId]) return false;
    return true;
  }).length;

  const isActive = section.isActive;

  return (
    <div className="mb-[22px]">
      {/* Project bar */}
      <div
        className="flex items-center gap-1.5 pb-2.5 mb-2.5 border-b"
        style={{ borderColor: "var(--color-border-subtle)" }}
      >
        <span className="text-[13px] font-semibold">{section.name}</span>
        <span
          className="text-mono text-[9px] font-medium px-1.5 py-0.5 rounded-sm border"
          style={{
            fontFamily: "var(--font-mono)",
            color: isActive ? "var(--color-accent)" : "var(--color-text-dim)",
            borderColor: isActive
              ? "var(--color-accent-border)"
              : "var(--color-border-subtle)",
            background: isActive ? "var(--color-accent-subtle)" : "transparent",
          }}
        >
          {isActive ? "活跃" : "休眠"}
        </span>
        <span
          className="text-mono text-[10px] ml-1"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-muted)",
          }}
        >
          {section.sessions[0]?.branch || "-"}
        </span>

        {/* Session count */}
        <span
          className="text-mono text-[10px] px-1.5 py-0.5 rounded-sm cursor-pointer transition-colors ml-1 relative"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}
        >
          <span
            onClick={() => setMgrOpen(!mgrOpen)}
            onMouseEnter={(e) => {
              e.currentTarget.parentElement!.style.background =
                "var(--color-accent-subtle)";
              e.currentTarget.parentElement!.style.color = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              if (!mgrOpen) {
                e.currentTarget.parentElement!.style.background = "transparent";
                e.currentTarget.parentElement!.style.color =
                  "var(--color-text-muted)";
              }
            }}
          >
            {filteredSessions.length}/{visibleCount} 会话
          </span>

          {/* Session manager popover */}
          {mgrOpen && (
            <div
              ref={mgrRef}
              className="absolute top-full left-0 mt-1 rounded-lg border shadow-xl z-[150] p-1.5 max-h-[360px] overflow-y-auto"
              style={{
                background: "var(--color-bg-card)",
                borderColor: "var(--color-border-subtle)",
                minWidth: 280,
                maxWidth: 380,
              }}
            >
              {section.sessions.map((s) => (
                <label
                  key={s.sessionId}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${hiddenSessions[s.sessionId] ? "opacity-40" : ""}`}
                  style={{ color: "var(--color-text-secondary)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ accentColor: "var(--color-accent)" }}
                    checked={!hiddenSessions[s.sessionId]}
                    onChange={() => onToggleHide(s.sessionId)}
                  />
                  <span className="flex-1 truncate">{s.title}</span>
                  <span
                    className="text-mono text-[9px] flex-shrink-0"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-text-dim)",
                    }}
                  >
                    {s.relativeTime}
                  </span>
                </label>
              ))}
            </div>
          )}
        </span>

        {/* Time filter */}
        <div className="flex items-center gap-1 ml-auto flex-shrink-0">
          <select
            className="text-mono text-[9px] px-1.5 py-[3px] rounded-sm border cursor-pointer outline-none appearance-none pr-4"
            style={{
              fontFamily: "var(--font-mono)",
              borderColor: "var(--color-border-hover)",
              background:
                "var(--color-bg-input) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%2352525b'/%3E%3C/svg%3E\") no-repeat right 5px center",
              color: "var(--color-text-muted)",
            }}
            value={timeHours}
            onChange={(e) =>
              onTimeChange(section.name, parseInt(e.target.value, 10))
            }
          >
            {TIME_OPTIONS.map((opt) => (
              <option key={opt.hours} value={opt.hours}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Session list */}
      {filteredSessions.length === 0 ? (
        <div
          className="px-4 py-3.5 rounded text-[11px]"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-subtle)",
            color: "var(--color-text-dim)",
          }}
        >
          该时间范围内无对话
        </div>
      ) : (
        filteredSessions.map((s) => (
          <SessionCard
            key={s.sessionId}
            session={s}
            hidden={!!hiddenSessions[s.sessionId]}
            onToggleHide={onToggleHide}
            onCopyResume={onCopyResume}
          />
        ))
      )}
    </div>
  );
}

export { ProjectSectionComp as ProjectSection };
