import { useEffect } from "react";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import { generateReport, fetchReportConfig } from "../api/client";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ReportModal({ open, onClose }: Props) {
  const { showToast, removeToast } = useToast();

  useEffect(() => {
    if (open) {
      fetchReportConfig().then((config) => {
        if (!config.hasApiKey) {
          onClose();
          showToast("未配置 DEEPSEEK_API_KEY 环境变量", "error");
        }
      });
    }
  }, [open, onClose, showToast]);

  const handleGenerate = async (hours: number) => {
    onClose();
    const loadingId = showToast("正在生成日报，请稍候...", "loading", 0);
    try {
      await generateReport(hours);
      removeToast(loadingId);
      showToast("日报已生成", "success");
    } catch (err: any) {
      removeToast(loadingId);
      showToast(err.message || "生成日报失败", "error");
    }
  };

  const timeOptions = [
    { label: "最近 6 小时", hours: 6 },
    { label: "今天（24 小时）", hours: 24 },
    { label: "昨天 + 今天", hours: 48 },
    { label: "本周", hours: 168 },
  ];

  return (
    <Modal open={open} onClose={onClose}>
      <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>生成日报</h3>
      <p className="text-[11px] mb-4" style={{ color: "var(--color-text-muted)" }}>选择时间范围，AI 将自动总结工作内容</p>
      <div className="flex flex-col gap-1 mb-3.5">
        {timeOptions.map((opt) => (
          <button
            key={opt.hours}
            className="opt-item w-full text-left px-3 py-2.5 rounded border text-xs cursor-pointer"
            onClick={() => handleGenerate(opt.hours)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <button className="btn-cancel px-3.5 py-1.5 rounded border text-[11px] font-medium cursor-pointer" onClick={onClose}>取消</button>
      </div>
    </Modal>
  );
}
