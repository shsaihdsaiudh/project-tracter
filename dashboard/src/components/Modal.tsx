import type { ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, children, maxWidth }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center animate-[fadeIn_0.15s_ease]"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-lg border p-5 shadow-2xl animate-[modalIn_0.15s_ease]"
        style={{
          background: "var(--color-bg-card)",
          borderColor: "var(--color-border-subtle)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
          minWidth: 320,
          maxWidth: maxWidth || 420,
        }}
      >
        {children}
      </div>
    </div>
  );
}
