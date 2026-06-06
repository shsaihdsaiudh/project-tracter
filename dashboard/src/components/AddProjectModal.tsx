import { useState } from "react";
import { Modal } from "./Modal";
import { addProject } from "../api/client";
import { useToast } from "./Toast";

interface Props {
  open: boolean;
  projectPath: string;
  onClose: () => void;
  onAdded: () => void;
}

export function AddProjectModal({ open, projectPath, onClose, onAdded }: Props) {
  const { showToast } = useToast();
  const [claude, setClaude] = useState(true);
  const [claudeInternal, setClaudeInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!claude && !claudeInternal) return;
    const dirs: string[] = [];
    if (claude) dirs.push("claude");
    if (claudeInternal) dirs.push("claude-internal");

    setSubmitting(true);
    try {
      await addProject(projectPath, dirs);
      onAdded();
      onClose();
    } catch {
      showToast("添加失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setClaude(true);
    setClaudeInternal(false);
    setSubmitting(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose}>
      <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>添加项目</h3>
      <p className="text-[11px] mb-4" style={{ color: "var(--color-text-muted)" }}>选择要追踪的 Claude 对话源</p>
      <div className="text-mono text-[10px] px-2.5 py-1.5 rounded border mb-3.5 truncate" style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", background: "var(--color-bg-input)", borderColor: "var(--color-border-subtle)" }}>
        {projectPath}
      </div>
      <div className="flex flex-col gap-1 mb-3.5">
        {[{
          key: "claude", label: "claude", desc: "~/.claude/projects/",
          val: claude, set: setClaude,
        }, {
          key: "claude-internal", label: "claude-internal", desc: "~/.claude-internal/projects/",
          val: claudeInternal, set: setClaudeInternal,
        }].map((opt) => (
          <label
            key={opt.key}
            className={`flex items-center gap-2 px-2.5 py-2 rounded border cursor-pointer text-xs ${opt.val ? "border-[var(--color-accent-border)] bg-[var(--color-accent-subtle)]" : "opt-item"}`}
            style={{
              color: opt.val ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              background: opt.val ? "var(--color-accent-subtle)" : "var(--color-bg-input)",
              borderColor: opt.val ? "var(--color-accent-border)" : undefined,
            }}
            onClick={() => opt.set(!opt.val)}
          >
            <input type="checkbox" checked={opt.val} onChange={() => opt.set(!opt.val)} style={{ accentColor: "var(--color-accent)", width: 14, height: 14 }} />
            <span className="flex-1">
              {opt.label}
              <span className="block text-[10px]" style={{ color: "var(--color-text-dim)" }}>{opt.desc}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-1.5">
        <button className="btn-cancel px-3.5 py-1.5 rounded border text-[11px] font-medium cursor-pointer" onClick={handleClose}>取消</button>
        <button className="btn-primary px-3.5 py-1.5 rounded text-[11px] font-medium cursor-pointer" disabled={!claude && !claudeInternal || submitting} onClick={handleConfirm}>
          {submitting ? "添加中..." : "确认添加"}
        </button>
      </div>
    </Modal>
  );
}
