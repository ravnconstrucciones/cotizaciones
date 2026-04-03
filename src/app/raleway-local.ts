import localFont from "next/font/local";

/**
 * Raleway **estática** (latin + latin-ext, pesos 200–700), archivos en `src/fonts/raleway/`.
 * Para bytes idénticos al PDF de Canva: `npm run extract-fonts` y reemplazá/ajustá rutas.
 */
export const raleway = localFont({
  src: [
    {
      path: "../fonts/raleway/raleway-latin-ext-200-normal.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "../fonts/raleway/raleway-latin-200-normal.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "../fonts/raleway/raleway-latin-ext-300-normal.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../fonts/raleway/raleway-latin-300-normal.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../fonts/raleway/raleway-latin-ext-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/raleway/raleway-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/raleway/raleway-latin-ext-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/raleway/raleway-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/raleway/raleway-latin-ext-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/raleway/raleway-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/raleway/raleway-latin-ext-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../fonts/raleway/raleway-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-raleway",
  display: "swap",
});
