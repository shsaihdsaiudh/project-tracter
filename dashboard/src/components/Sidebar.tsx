import type { ProjectItem } from "../api/types";

interface Props {
  projects: ProjectItem[];
  activeName: string | null;
  onRemove: (name: string) => void;
  onSettings: (name: string, anchor: HTMLElement) => void;
  onAdd: () => void;
  onToggleNotify: (name: string, enabled: boolean) => void;
  adding: boolean;
}

export function Sidebar({
  projects,
  activeName,
  onRemove,
  onSettings,
  onAdd,
  onToggleNotify,
  adding,
}: Props) {
  return (
    <aside
      className="flex flex-col h-screen sticky top-0 flex-shrink-0 border-r"
      style={{
        width: 220,
        minWidth: 220,
        background: "var(--color-bg-sidebar)",
        borderColor: "var(--color-border-subtle)",
      }}
    >
      {/* Header */}
      <div
        className="px-3.5 pt-5 pb-3"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 500,
          textTransform: "lowercase",
          letterSpacing: "0.06em",
          color: "var(--color-text-dim)",
        }}
      >
        tracker
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto px-1.5">
        {projects.length === 0 ? (
          <div
            className="px-3.5 py-8 text-center text-[11px] leading-relaxed"
            style={{ color: "var(--color-text-dim)" }}
          >
            暂无追踪项目
            <br />
            点击下方按钮添加
          </div>
        ) : (
          projects.map((p) => {
            const isActive = p.name === activeName || projects.length === 1;
            return (
              <div key={p.name}>
                <div
                  className="sidebar-item-hover flex items-center gap-1.5 px-2.5 py-2 rounded cursor-pointer text-xs font-medium mb-px"
                  style={{
                    color: isActive
                      ? "var(--color-text-primary)"
                      : "var(--color-text-secondary)",
                    borderLeft: isActive
                      ? "1px solid rgba(48,209,88,0.4)"
                      : "1px solid transparent",
                    background: isActive
                      ? "var(--color-accent-subtle)"
                      : "transparent",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background: p.isActive
                        ? "var(--color-accent)"
                        : "#3a3a40",
                    }}
                  />
                  <span className="flex-1 truncate" title={p.path}>
                    {p.name}
                  </span>
                  {/*
                    Notification toggle. Always visible when ON (so the
                    user can see at a glance which projects ping them);
                    fades to nearly invisible when OFF and only fully
                    appears on hover, mirroring the gear/× pattern used
                    elsewhere in this row.
                  */}
                  <button
                    className="w-5 h-5 flex items-center justify-center border-none bg-transparent rounded-sm cursor-pointer text-[12px] flex-shrink-0 transition-all"
                    style={{
                      color: p.notifyEnabled
                        ? "var(--color-accent)"
                        : "var(--color-text-dim)",
                      opacity: p.notifyEnabled ? 1 : 0.25,
                    }}
                    title={
                      p.notifyEnabled
                        ? "已开启提醒 — 点击关闭"
                        : "点击开启对话完成提醒"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleNotify(p.name, !p.notifyEnabled);
                    }}
                    onMouseEnter={(e) => {
                      if (!p.notifyEnabled) {
                        e.currentTarget.style.opacity = "1";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!p.notifyEnabled) {
                        e.currentTarget.style.opacity = "0.25";
                      }
                    }}
                  >
                    {p.notifyEnabled ? "\u{1F514}" : "\u{1F515}"}
                  </button>
                  <button
                    className="w-5 h-5 flex items-center justify-center border-none bg-transparent rounded-sm cursor-pointer text-[11px] opacity-0 transition-all flex-shrink-0 sidebar-item-hover:opacity-100"
                    style={{ color: "var(--color-text-dim)" }}
                    title="配置 Claude 目录"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSettings(p.name, e.currentTarget);
                    }}
                  >
                    &#9881;
                  </button>
                  <button
                    className="w-5 h-5 flex items-center justify-center border-none bg-transparent rounded-sm cursor-pointer text-[14px] opacity-0 hover:opacity-100 flex-shrink-0"
                    style={{ color: "var(--color-text-dim)" }}
                    title="移除追踪"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(p.name);
                    }}
                  >
                    &times;
                  </button>
                </div>
                {/* Claude variant tags */}
                <div className="flex gap-1.5 mb-0.5" style={{ paddingLeft: 21 }}>
                  {(p.claudeDirs || ["claude"]).map((d) => (
                    <span
                      key={d}
                      className="pill-mono"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        background: "rgba(255,255,255,0.04)",
                        color: "var(--color-accent)",
                      }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        className="p-1.5 border-t"
        style={{ borderColor: "var(--color-border-subtle)" }}
      >
        <button
          className="sidebar-add-btn w-full py-2 flex items-center justify-center gap-1 rounded border text-[10px] cursor-pointer bg-transparent"
          style={{ fontFamily: "var(--font-sans)" }}
          onClick={onAdd}
          disabled={adding}
        >
          {adding ? "... 选择中" : "+ 添加项目"}
        </button>
      </div>
    </aside>
  );
}
