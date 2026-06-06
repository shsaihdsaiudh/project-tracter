import { useState, useEffect, useRef } from "react";
import type { ProjectItem } from "../api/types";

interface Props {
  projectName: string;
  projects: ProjectItem[];
  anchor: HTMLElement;
  onClose: () => void;
  onUpdate: (name: string, dirs: string[]) => void;
}

export function SettingsPopover({
  projectName,
  projects,
  anchor,
  onClose,
  onUpdate,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const project = projects.find((p) => p.name === projectName);
  if (!project) return null;

  const [dirs, setDirs] = useState<string[]>([...(project.claudeDirs || ["claude"])]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener("click", handler), 10);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handler);
    };
  }, [onClose]);

  const toggle = (variant: string) => {
    const next = dirs.includes(variant)
      ? dirs.filter((d) => d !== variant)
      : [...dirs, variant];
    if (next.length === 0) next.push("claude");
    setDirs(next);
    onUpdate(projectName, next);
  };

  const rect = anchor.getBoundingClientRect();
  const sidebarRect = anchor.closest("aside")?.getBoundingClientRect();
  const top = rect.bottom - (sidebarRect?.top || 0);

  return (
    <div
      ref={popoverRef}
      className="absolute rounded-lg border shadow-xl z-[100] p-1.5"
      style={{
        background: "var(--color-bg-card)",
        borderColor: "var(--color-border-subtle)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        minWidth: 160,
        right: 4,
        top: top + 4,
      }}
    >
      {["claude", "claude-internal"].map((variant) => (
        <label
          key={variant}
          className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs"
          style={{ color: "var(--color-text-secondary)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <input
            type="checkbox"
            className="w-3.5 h-3.5"
            style={{ accentColor: "var(--color-accent)" }}
            checked={dirs.includes(variant)}
            onChange={() => toggle(variant)}
          />
          <span>{variant}</span>
        </label>
      ))}
    </div>
  );
}
