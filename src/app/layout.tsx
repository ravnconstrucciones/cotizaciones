import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppShell } from "@/components/shell/app-shell";
import { raleway } from "./raleway-local";
import "./globals.css";

/**
 * Space Grotesk = fuente de interfaz del cockpit (texto, datos, labels),
 * aplicada por scope con `font-grotesk` (mismo patrón que tenía Inter).
 * Raleway queda para la marca "RAVN." y los documentos A4 (que siguen
 * usando font-sans/font-raleway, sin cambios).
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-grotesk",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#070707",
};

export const metadata: Metadata = {
  title: "RAVN — Presupuestos",
  description: "Automatización de presupuestos",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RAVN",
  },
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RAVN" />
        <meta name="theme-color" content="#070707" />
      </head>
      <body
        className={`min-h-screen font-sans ${raleway.variable} ${spaceGrotesk.variable}`}
      >
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
