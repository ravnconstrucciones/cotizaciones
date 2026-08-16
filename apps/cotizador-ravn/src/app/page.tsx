import { loadQuoteWorkspace, QuoteReadError } from "../adapters";
import { createPreviewData } from "../domain";
import { ControlCenter } from "../components/control-center";
import type { BridgeConfig } from "../components/live-terminals";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CotizadorPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const preview =
    process.env.NODE_ENV !== "production" &&
    process.env.COTIZADOR_PREVIEW_ENABLED === "1" &&
    first(query.preview) === "1";

  const bridgeToken = process.env.COTIZADOR_BRIDGE_TOKEN;
  const bridge: BridgeConfig | null = bridgeToken
    ? { url: process.env.COTIZADOR_BRIDGE_URL ?? "http://127.0.0.1:3011", token: bridgeToken }
    : null;

  try {
    const data = preview
      ? createPreviewData()
      : await loadQuoteWorkspace(first(query.quote));

    return <ControlCenter initialData={data} preview={preview} bridge={bridge} />;
  } catch (error) {
    const message =
      error instanceof QuoteReadError
        ? error.message
        : "No se pudo construir el estado observable de la cotización.";

    return (
      <main className="qz-empty-page">
        <section className="qz-empty-page__card" aria-labelledby="connection-title">
          <p className="qz-kicker">COTIZADOR RAVN · LECTURA BLOQUEADA</p>
          <h1 id="connection-title">Sin estado operativo</h1>
          <p>{message}</p>
          <p>
            El control center falla cerrado: no muestra cotizaciones, agentes ni eventos si App
            RAVN no entrega datos verificables.
          </p>
        </section>
      </main>
    );
  }
}
