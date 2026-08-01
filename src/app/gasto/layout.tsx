import type { Metadata, Viewport } from "next";

/**
 * Layout de /gasto — pantalla de captura rápida con su PROPIO manifest PWA:
 * agregada a la pantalla de inicio del iPhone desde esta URL, iOS la instala
 * como app standalone independiente ("Gasto", ícono = isotipo R) que abre
 * directo en /gasto?fuente=atajo. El manifest general de la app (start_url
 * "/") queda intacto: conviven como dos apps standalone distintas — es el
 * comportamiento buscado.
 */

export const metadata: Metadata = {
  title: "Cargar gasto — RAVN",
  manifest: "/manifest-gasto.webmanifest",
  // Ícono propio del atajo: isotipo R INVERTIDO (negro sobre blanco cálido)
  // para distinguirlo del ícono de la app en la pantalla de inicio del iPhone.
  icons: {
    apple: "/apple-touch-icon-gasto.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Gasto",
  },
};

export const viewport: Viewport = {
  themeColor: "#070707",
  // safe-areas reales (notch/home indicator): la pantalla usa env(safe-area-inset-*).
  viewportFit: "cover",
};

export default function GastoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
