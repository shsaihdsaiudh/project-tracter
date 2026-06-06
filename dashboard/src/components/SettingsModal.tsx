import { useState } from "react";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import {
  fetchReportConfig,
  saveReportConfig,
  browseFolder,
} from "../api/client";
import type { ReportConfig } from "../api/types";

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  hiddenSessionsCount: number;
  showHidden: boolean;
  onToggleShowHidden: () => void;
}

export function SettingsModal({
  open,
  onClose,
  hiddenSessionsCount,
  showHidden,
  onToggleShowHidden,
}: SettingsProps) {
  const { showToast } = useToast();
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [outputPath, setOutputPath] = useState("");

  if (open && !loaded) {
    setLoaded(true);
    fetchReportConfig().then((c) => {
      setConfig(c);
      setOutputPath(c.outputPath);
    });
  }

  const handleClose = () => {
    setLoaded(false);
    setConfig(null);
    onClose();
  };

  const handleBrowse = async () => {
    const data = await browseFolder();
    if (data.path) setOutputPath(data.path);
  };

  const handleSave = async () => {
    try {
      await saveReportConfig(outputPath);
      showToast("设置已保存", "success");
      handleClose();
    } catch {
      showToast("保存失败", "error");
    }
  };

  return (
    <Modal open={open} onClose={handleClose} maxWidth="480px">
      <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>设置</h3>
      <p className="text-[11px] mb-4" style={{ color: "var(--color-text-muted)" }}>配置日报输出和笔记软件</p>

      <div className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--color-text-primary)" }}>笔记软件</div>
      <div className="flex flex-col gap-1 mb-3.5">
        <label className="opt-item flex items-center gap-2 px-2.5 py-2 rounded border cursor-pointer text-xs" style={{ borderColor: "var(--color-accent-border)", background: "var(--color-accent-subtle)", color: "var(--color-text-primary)" }}>
          <input type="radio" name="noteApp" defaultChecked style={{ accentColor: "var(--color-accent)" }} />
          <span className="flex-1 text-xs">Obsidian<span className="block text-[10px]" style={{ color: "var(--color-text-dim)" }}>自动检测 Vault</span></span>
        </label>
        <label className="opt-item flex items-center gap-2 px-2.5 py-2 rounded border cursor-pointer text-xs">
          <input type="radio" name="noteApp" style={{ accentColor: "var(--color-accent)" }} />
          <span className="flex-1 text-xs">本地文件夹<span className="block text-[10px]" style={{ color: "var(--color-text-dim)" }}>自定义输出目录</span></span>
        </label>
      </div>

      <div className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--color-text-primary)" }}>输出路径</div>
      <div className="flex gap-1.5 mb-3.5">
        <input
          className="flex-1 px-2.5 py-1.5 rounded border text-[11px]"
          style={{ borderColor: "var(--color-border-hover)", color: "var(--color-text-muted)", background: "var(--color-bg-input)", fontFamily: "var(--font-mono)" }}
          value={outputPath}
          onChange={(e) => setOutputPath(e.target.value)}
        />
        <button className="btn-cancel px-2.5 py-1.5 rounded border text-[11px] cursor-pointer" onClick={handleBrowse}>浏览</button>
      </div>

      <div className="flex items-center justify-between mb-3 px-2.5 py-2 rounded border" style={{ background: "var(--color-bg-input)", borderColor: "var(--color-border-subtle)" }}>
        <span className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
          显示已隐藏的会话
          {hiddenSessionsCount > 0 && <span className="ml-1" style={{ color: "var(--color-text-dim)" }}>({hiddenSessionsCount})</span>}
        </span>
        <label className="relative inline-block cursor-pointer" style={{ width: 38, height: 20 }}>
          <input type="checkbox" className="opacity-0 w-0 h-0" checked={showHidden} onChange={onToggleShowHidden} />
          <span className="absolute inset-0 rounded-full transition-colors" style={{ background: showHidden ? "var(--color-accent)" : "var(--color-border-hover)" }} />
          <span className="absolute w-4 h-4 bg-white rounded-full transition-all" style={{ top: 2, left: showHidden ? 20 : 2 }} />
        </label>
      </div>

      <div className="text-mono text-[10px] mb-3.5" style={{ fontFamily: "var(--font-mono)", color: config?.hasApiKey ? "var(--color-accent)" : "var(--color-accent-danger)" }}>
        {config?.hasApiKey ? "DeepSeek API Key 已配置" : "未配置 DeepSeek API Key（日报功能不可用）"}
      </div>

      <div className="flex justify-end gap-1.5">
        <button className="btn-cancel px-3.5 py-1.5 rounded border text-[11px] font-medium cursor-pointer" onClick={handleClose}>取消</button>
        <button className="btn-primary px-3.5 py-1.5 rounded text-[11px] font-medium cursor-pointer" onClick={handleSave}>保存</button>
      </div>
    </Modal>
  );
}
