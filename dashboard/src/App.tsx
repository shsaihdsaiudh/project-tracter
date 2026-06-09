import { useState, useEffect, useRef, useCallback } from "react";
import { ToastProvider, useToast } from "./components/Toast";
import { Sidebar } from "./components/Sidebar";
import { ProjectSection } from "./components/ProjectSection";
import { EmptyState } from "./components/EmptyState";
import { SettingsModal } from "./components/SettingsModal";
import { ReportModal } from "./components/ReportModal";
import { AddProjectModal } from "./components/AddProjectModal";
import { SettingsPopover } from "./components/SettingsPopover";
import { SessionDetail } from "./components/SessionDetail";
import {
  subscribeSSE,
  removeProject,
  toggleHiddenSession,
  browseFolder,
  fetchReportConfig,
  updateClaudeDirs,
  setNotifyEnabled,
} from "./api/client";
import type {
  InitialPayload,
  ProjectItem,
  ProjectSection as ProjectSectionT,
} from "./api/types";

const DEFAULT_TIME_HOURS = 6;

function AppInner() {
  const { showToast } = useToast();

  // Core state
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [sections, setSections] = useState<ProjectSectionT[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState("");

  // UI state
  const [activeProject] = useState<string | null>(null);
  const [timeFilters, setTimeFilters] = useState<Record<string, number>>({});
  const [hiddenSessions, setHiddenSessions] = useState<Record<string, boolean>>(
    {},
  );
  const [showHidden, setShowHidden] = useState(false);
  const [adding, setAdding] = useState(false);

  // Modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [addProjectPath, setAddProjectPath] = useState("");
  const [addProjectOpen, setAddProjectOpen] = useState(false);

  // Session detail state
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [detailProject, setDetailProject] = useState("");
  const [detailClaudeDir, setDetailClaudeDir] = useState("claude");

  // Settings popover state
  const [popoverProject, setPopoverProject] = useState<string | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);

  // Footer timer
  const footerRef = useRef<HTMLDivElement>(null);

  // ── Notifications ───────────────────────────────────
  // Keep a ref to the current projects list so the SSE turn-complete
  // callback (which is captured once at mount time) can read the
  // latest notifyEnabled flags without resubscribing on every change.
  const projectsRef = useRef<ProjectItem[]>([]);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  // Re-render the permission banner when status changes (we don't poll —
  // we just snapshot it once and update after the user clicks "enable").
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    () => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"),
  );

  // De-dupe guard: even with the backend's lastSeenTurns map, a tab that
  // re-mounts (HMR, navigation, etc.) starts a fresh EventSource and
  // could re-receive a turn-complete it just showed. Track recent uuids.
  const shownTurnUuids = useRef<Set<string>>(new Set());

  // Load hidden sessions on mount
  useEffect(() => {
    fetchReportConfig().then((config) => {
      const map: Record<string, boolean> = {};
      (config.hiddenSessions || []).forEach((id) => (map[id] = true));
      setHiddenSessions(map);
    });
  }, []);

  // SSE subscription
  useEffect(() => {
    const unsub = subscribeSSE(
      (data: InitialPayload) => {
        setProjects(data.projects);
        setSections(data.sections);
        setConnected(true);
        setLastUpdate(
          new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        );
      },
      // Turn-complete handler: fire a desktop notification IF the
      // originating project has the bell on AND the user has granted
      // permission. Reads `projectsRef.current` rather than `projects`
      // because this callback is captured once at mount.
      (event) => {
        // Quick de-dupe in case the same uuid arrives twice (e.g. brief
        // disconnect + reconnect during a single turn).
        if (shownTurnUuids.current.has(event.turnUuid)) return;
        shownTurnUuids.current.add(event.turnUuid);
        // Bound the cache so it doesn't grow unbounded across long sessions.
        if (shownTurnUuids.current.size > 500) {
          const first = shownTurnUuids.current.values().next().value;
          if (first !== undefined) shownTurnUuids.current.delete(first);
        }

        const proj = projectsRef.current.find(
          (p) => p.name === event.projectName,
        );
        if (!proj?.notifyEnabled) return;

        if (
          typeof Notification === "undefined" ||
          Notification.permission !== "granted"
        ) {
          return;
        }

        const body = event.preview
          ? event.preview
          : "Claude 这一轮回复完了，可以查看结果";

        try {
          const n = new Notification(`✦ ${event.projectName}`, {
            body,
            // Tag dedupes notifications per session — if the user gets a
            // notification, ignores it, then Claude finishes another
            // turn in the same session, the new one replaces the old in
            // the system tray rather than stacking.
            tag: `pt-${event.sessionId}`,
            // Prevent the OS from auto-dismissing — these are async
            // long-running tasks the user actually wants to see.
            requireInteraction: false,
          });
          n.onclick = () => {
            // Bring the dashboard tab forward and let the user follow up.
            window.focus();
            n.close();
          };
        } catch (e) {
          console.error("[notify] failed to fire notification", e);
        }
      },
    );
    return unsub;
  }, []);

  // Permission helper — invoked from the banner button. Async so the user
  // sees the OS prompt; we update local state with the resolved verdict.
  const handleEnableNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
    } catch (e) {
      console.error("[notify] permission request failed", e);
    }
  }, []);

  // Toggle the per-project bell. We optimistically flip the local state
  // for instant feedback, then send to the server (which broadcasts the
  // authoritative new payload back via SSE).
  const handleToggleNotify = useCallback(
    async (name: string, enabled: boolean) => {
      setProjects((prev) =>
        prev.map((p) => (p.name === name ? { ...p, notifyEnabled: enabled } : p)),
      );
      try {
        await setNotifyEnabled(name, enabled);
        // If the user just turned ON a project's bell but hasn't granted
        // notification permission yet, prompt right now so they don't
        // discover later that "enabled" did nothing.
        if (
          enabled &&
          typeof Notification !== "undefined" &&
          Notification.permission === "default"
        ) {
          handleEnableNotifications();
        }
      } catch (e) {
        console.error("[notify] toggle failed", e);
        // Roll back on error — server didn't accept the change.
        setProjects((prev) =>
          prev.map((p) =>
            p.name === name ? { ...p, notifyEnabled: !enabled } : p,
          ),
        );
        showToast("更新提醒设置失败", "error");
      }
    },
    [handleEnableNotifications, showToast],
  );

  // Footer clock
  useEffect(() => {
    const iv = setInterval(() => {
      if (footerRef.current) {
        footerRef.current.textContent =
          "最后更新 " +
          new Date().toLocaleTimeString("zh-CN", { hour12: false });
      }
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  // Actions
  const handleTimeChange = useCallback((name: string, hours: number) => {
    setTimeFilters((prev) => ({ ...prev, [name]: hours }));
  }, []);

  const handleToggleHide = useCallback(
    async (sessionId: string) => {
      try {
        const list = await toggleHiddenSession(sessionId);
        const map: Record<string, boolean> = {};
        list.forEach((id) => (map[id] = true));
        setHiddenSessions(map);
      } catch {
        showToast("操作失败", "error");
      }
    },
    [showToast],
  );

  const handleCopyResume = useCallback((cmd: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(cmd).catch(() => fallbackCopy(cmd));
    } else {
      fallbackCopy(cmd);
    }
  }, []);

  const handleRemoveProject = useCallback(
    async (name: string) => {
      if (!confirm(`确定要移除对「${name}」的追踪吗？`)) return;
      try {
        await removeProject(name);
      } catch {
        showToast("移除失败", "error");
      }
    },
    [showToast],
  );

  const handleAddProject = useCallback(async () => {
    setAdding(true);
    try {
      const data = await browseFolder();
      if (data.path) {
        setAddProjectPath(data.path);
        setAddProjectOpen(true);
      }
    } catch {
      const manual = prompt("请输入项目文件夹的完整路径：");
      if (manual?.trim()) {
        setAddProjectPath(manual.trim());
        setAddProjectOpen(true);
      }
    } finally {
      setAdding(false);
    }
  }, []);

  const handleSessionClick = useCallback(
    (sessionId: string, projectName: string, claudeDir: string) => {
      setDetailSessionId(sessionId);
      setDetailProject(projectName);
      setDetailClaudeDir(claudeDir);
    },
    [],
  );

  const handleSettings = useCallback((name: string, anchor: HTMLElement) => {
    setPopoverProject(name);
    setPopoverAnchor(anchor);
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Settings popover */}
      {popoverProject && popoverAnchor && (
        <SettingsPopover
          projectName={popoverProject}
          projects={projects}
          anchor={popoverAnchor}
          onClose={() => {
            setPopoverProject(null);
            setPopoverAnchor(null);
          }}
          onUpdate={async (name, dirs) => {
            await updateClaudeDirs(name, dirs);
          }}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        projects={projects}
        activeName={activeProject}
        onRemove={handleRemoveProject}
        onSettings={handleSettings}
        onAdd={handleAddProject}
        onToggleNotify={handleToggleNotify}
        adding={adding}
      />

      {/* Main */}
      <div className="flex-1 min-w-0 max-w-[960px] px-7 py-6">
        {/*
          Permission banner: shown only when at least one project has the
          bell ON but the browser hasn't been granted notification permission
          yet. Hidden once granted/denied/unsupported. We deliberately don't
          nag on first-load — only when there's actually something the user
          opted into that won't work without permission.
        */}
        {notifPermission === "default" &&
          projects.some((p) => p.notifyEnabled) && (
            <div
              className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded mb-4 text-[11px]"
              style={{
                background: "var(--color-accent-subtle)",
                border: "1px solid var(--color-accent-border)",
                color: "var(--color-text-primary)",
              }}
            >
              <span>
                💡 你为某些项目开启了对话完成提醒，但浏览器还没有通知权限
              </span>
              <button
                className="btn-primary px-3 py-1 rounded text-[11px] font-medium cursor-pointer flex-shrink-0"
                onClick={handleEnableNotifications}
              >
                启用通知
              </button>
            </div>
          )}

        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-[15px] font-semibold tracking-[-0.01em]">
            Project Tracker
          </h1>
          <div className="flex items-center gap-2.5 text-[11px]">
            <button
              className="btn-glow flex items-center gap-1 px-2.5 py-1.5 rounded border text-[10px] font-medium cursor-pointer"
              onClick={() => setReportOpen(true)}
            >
              生成日报
            </button>
            <button
              className="btn-glow flex items-center gap-1 px-2.5 py-1.5 rounded border text-[10px] font-medium cursor-pointer"
              onClick={() => setSettingsOpen(true)}
            >
              设置
            </button>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: "var(--color-accent)",
                animation: "livePulse 2s ease-in-out infinite",
              }}
            />
            <span
              className="text-mono text-[9px]"
              style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}
            >
              live
            </span>
          </div>
        </header>

        {/* Content */}
        {sections.length === 0 && !connected ? (
          <EmptyState />
        ) : (
          sections.map((sec) => (
            <ProjectSection
              key={sec.name}
              section={sec}
              timeHours={timeFilters[sec.name] ?? DEFAULT_TIME_HOURS}
              hiddenSessions={hiddenSessions}
              showHidden={showHidden}
              onTimeChange={handleTimeChange}
              onToggleHide={handleToggleHide}
              onCopyResume={handleCopyResume}
              onSessionClick={(sessionId) => {
                const s = sec.sessions.find(
                  (sess) => sess.sessionId === sessionId,
                );
                handleSessionClick(
                  sessionId,
                  sec.name,
                  s?.claudeDir || "claude",
                );
              }}
            />
          ))
        )}

        {sections.length === 0 && connected && <EmptyState />}

        {/* Footer */}
        <div
          ref={footerRef}
          className="text-center text-mono text-[9px] mt-6 pb-6"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-dim)",
          }}
        >
          {lastUpdate ? `最后更新 ${lastUpdate}` : "正在连接..."}
        </div>
      </div>

      {/* Session detail */}
      {detailSessionId && (
        <SessionDetail
          sessionId={detailSessionId}
          projectName={detailProject}
          claudeDir={detailClaudeDir}
          onClose={() => setDetailSessionId(null)}
        />
      )}

      {/* Modals */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        hiddenSessionsCount={
          Object.values(hiddenSessions).filter(Boolean).length
        }
        showHidden={showHidden}
        onToggleShowHidden={() => setShowHidden(!showHidden)}
      />
      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} />
      <AddProjectModal
        open={addProjectOpen}
        projectPath={addProjectPath}
        onClose={() => setAddProjectOpen(false)}
        onAdded={() => setAddProjectOpen(false)}
      />
    </div>
  );
}

function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
