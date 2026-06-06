import { useState, useEffect, useRef, useCallback } from "react";
import { ToastProvider, useToast } from "./components/Toast";
import { Sidebar } from "./components/Sidebar";
import { ProjectSection } from "./components/ProjectSection";
import { EmptyState } from "./components/EmptyState";
import { SettingsModal } from "./components/SettingsModal";
import { ReportModal } from "./components/ReportModal";
import { AddProjectModal } from "./components/AddProjectModal";
import { SettingsPopover } from "./components/SettingsPopover";
import {
  subscribeSSE,
  removeProject,
  toggleHiddenSession,
  browseFolder,
  fetchReportConfig,
  updateClaudeDirs,
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

  // Settings popover state
  const [popoverProject, setPopoverProject] = useState<string | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);

  // Footer timer
  const footerRef = useRef<HTMLDivElement>(null);

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
    const unsub = subscribeSSE((data: InitialPayload) => {
      setProjects(data.projects);
      setSections(data.sections);
      setConnected(true);
      setLastUpdate(
        new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      );
    });
    return unsub;
  }, []);

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
        adding={adding}
      />

      {/* Main */}
      <div className="flex-1 min-w-0 max-w-[960px] px-7 py-6">
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
