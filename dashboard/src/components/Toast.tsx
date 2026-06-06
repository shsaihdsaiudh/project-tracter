import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

type ToastType = "success" | "error" | "loading";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastCtx {
  showToast: (message: string, type: ToastType, duration?: number) => number;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastCtx>({
  showToast: () => -1,
  removeToast: () => {},
});

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType, duration = 4000) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type }]);
      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
      return id;
    },
    [],
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Toast container */}
      <div
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          zIndex: 300,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-md border border-[var(--color-border-subtle)] shadow-lg text-[11px] font-medium text-[var(--color-text-primary)]`}
            style={{
              background: "var(--color-bg-card)",
              animation: "toastIn 0.25s ease",
              borderLeft:
                t.type === "success"
                  ? "2px solid var(--color-accent)"
                  : t.type === "error"
                    ? "2px solid var(--color-accent-danger)"
                    : "2px solid var(--color-accent-warn)",
              minWidth: 260,
            }}
          >
            {t.type === "loading" && (
              <span
                className="inline-block w-3.5 h-3.5 border-2 rounded-full animate-spin flex-shrink-0"
                style={{
                  borderColor: "var(--color-border-hover)",
                  borderTopColor: "var(--color-accent)",
                }}
              />
            )}
            <span>{t.message}</span>
            {t.type !== "loading" && (
              <button
                onClick={() => removeToast(t.id)}
                className="ml-auto text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] bg-transparent border-none cursor-pointer text-[13px] p-0 leading-none"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
