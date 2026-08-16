import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";

const raleway = localFont({
  src: [
    {
      path: "../../../../src/fonts/raleway/raleway-latin-200-normal.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "../../../../src/fonts/raleway/raleway-latin-300-normal.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../../../src/fonts/raleway/raleway-latin-500-normal.woff2",
      weight: "500",
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
  title: "Cotizador RAVN",
  description: "Conversación, investigación y evidencia para formar cotizaciones RAVN.",
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
      <body className={raleway.variable}>
        <template
          data-impeccable-direction="9f6054db"
          dangerouslySetInnerHTML={{
            __html: `<!--
THESIS: Cotizar es una conversación que organiza trabajo visible por rubro; rechaza el dashboard técnico como puerta de entrada.
OWN-WORLD: Negro RAVN, blanco cálido, acero mate, líneas tensas y paneles cuadrados; una inversión blanca marca solamente la decisión que requiere a Eze.
STORY: Eze plantea el trabajo, ve aportes y fuentes vinculados, responde el bloqueo y observa cómo se forma el costo sin actividad inventada.
FIRST VIEWPORT: Header de 64px; conversación dominante a la izquierda, equipo conectado al centro y cotización en formación a la derecha; el compositor es la acción primaria.
FORM: Expediente vivo de tres columnas, posición 5/7 del conjunto grounded y fijado por el brief del usuario sobre el roll; seed 9f6054db.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
