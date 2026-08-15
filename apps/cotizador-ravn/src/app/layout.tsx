import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";

const raleway = localFont({
  src: [
    {
      path: "../../../../src/fonts/raleway/raleway-latin-300-normal.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../../../src/fonts/raleway/raleway-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../../src/fonts/raleway/raleway-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../../../src/fonts/raleway/raleway-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-raleway",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cotizador RAVN — Laboratorio",
  description: "Entorno de diagnóstico, evidencia y decisión de cotizaciones RAVN.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#070707",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className={raleway.variable}>{children}</body>
    </html>
  );
}
