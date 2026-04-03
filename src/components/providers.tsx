"use client";

import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/theme-toggle";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="ravn-theme"
      themes={["dark", "light"]}
    >
      <ThemeToggle />
      {children}
    </ThemeProvider>
  );
}
