"use client";

import { useEffect } from "react";

export function CatalogToast({
  message,
  variant,
  onDismiss,
}: {
  message: string | null;
  variant: "error" | "success";
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 7000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;

  const isError = variant === "error";

  return (
    <div
      role="alert"
      className={`fixed right-4 top-16 z-[150] flex max-w-md items-start gap-3 border-2 px-4 py-3 text-sm shadow-none ${
        isError
          ? "border-ravn-accent bg-ravn-accent text-ravn-accent-contrast"
          : "border-ravn-line bg-ravn-surface text-ravn-fg"
      }`}
    >
      <p className="flex-1 leading-snug">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 border border-current px-2 py-0.5 text-xs uppercase tracking-wider opacity-80 hover:opacity-100"
        aria-label="Cerrar"
      >
        ×
      </button>
    </div>
  );
}
