"use client";

import { useState, useEffect } from "react";

export type ToastType = "success" | "error" | "info";

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose?: () => void;
}

export function Toast({ message, type = "info", duration = 4000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onClose?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  const bg =
    type === "success"
      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
      : type === "error"
        ? "bg-red-500/10 border-red-500/20 text-red-400"
        : "bg-blue-500/10 border-blue-500/20 text-blue-400";

  return (
    <div
      className={`fixed bottom-6 right-6 z-[100] px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm transition-opacity duration-300 ${bg}`}
      role="alert"
    >
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const show = (message: string, type: ToastType = "info") => {
    setToast({ message, type });
  };

  const hide = () => setToast(null);

  const toastElement = toast ? (
    <Toast message={toast.message} type={toast.type} onClose={hide} />
  ) : null;

  return { show, hide, toastElement };
}
