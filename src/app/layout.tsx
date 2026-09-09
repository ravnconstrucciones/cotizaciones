import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/shell/app-shell";
import { raleway } from "./raleway-local";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#070707",
};

export const metadata: Metadata = {
  title: "RAVN — Centro de Mando",
  description: "El centro de mando de Ravn Construcciones",
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
        {/* OJO: sin <link rel="apple-touch-icon"> hardcodeado acá — lo emite
            metadata.icons y así /gasto puede declarar su ícono verde propio. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RAVN" />
        <meta name="theme-color" content="#070707" />
      </head>
      <body
        className={`min-h-screen font-sans ${raleway.variable}`}
      >
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
