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
THESIS: El costo es un instrumento que se lee y se calibra, no un documento que se scrollea; cada precio se muestra contra su referencia y el visor dice cuál usaría. Rechaza el dashboard de cards apiladas.
OWN-WORLD: Consola negra montada por planos (#030303 chasis, paneles #101010→#0a0a0a) separados por costuras de 1px, cantos de luz y caída estática; marcas de registro en las esquinas de cada lectura; cifras Raleway 200 tabulares y etiquetas de 0.58rem tracking .2em; glow sólo en lecturas vivas (salvia cubierto, ámbar espera, óxido riesgo); el monolito de piedra gira detrás de la conversación.
STORY: Eze lee el rango y cuánto se puede mover, baja a los rubros donde cada ítem muestra su abanico de precios con el desvío contra la más barata, resuelve la cola de decisiones y dispara la ola escribiendo en la conversación.
FIRST VIEWPORT: 100dvh sin scroll de página. Rail de 52px; conversación de 360px con el monolito de fondo · tablero central (rango a 4rem con escala de piso a techo, cuatro instrumentos, ledger de rubros scrolleable, banda de la ola al pie) · rail de decisión de 356px con la cola ordenada por severidad.
FORM: Tablero de instrumentos, fijado por el brief de Eze del 16/08 (laboratorio / centro de control) sobre el roll; seed 9f6054db.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
