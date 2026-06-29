"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isLight = resolvedTheme === "light";
  const ariaLabel =
    !mounted
      ? "Cambiar tema"
      : isLight
        ? "Activar modo oscuro"
        : "Activar modo claro";

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      className="fixed right-4 top-4 z-[200] flex h-10 w-10 items-center justify-center rounded-none border border-ravn-line bg-ravn-surface text-ravn-ink transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-ink"
      aria-label={ariaLabel}
    >
      {!mounted ? (
        <Moon className="h-[18px] w-[18px]" strokeWidth={1} aria-hidden />
      ) : isLight ? (
        <Moon className="h-[18px] w-[18px]" strokeWidth={1} aria-hidden />
      ) : (
        <Sun className="h-[18px] w-[18px]" strokeWidth={1} aria-hidden />
      )}
    </button>
  );
}
