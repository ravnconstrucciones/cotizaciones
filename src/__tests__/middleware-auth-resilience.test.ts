import { describe, expect, it, vi } from "vitest";
import {
  crearFetchConTimeout,
  obtenerEstadoAutenticacion,
} from "@/middleware";

describe("autenticación resiliente del middleware", () => {
  it("acepta claims firmados sin exigir un objeto user remoto", async () => {
    const estado = await obtenerEstadoAutenticacion(async () => ({
      data: { claims: { sub: "usuario-ravn" } },
      error: null,
    }));

    expect(estado).toEqual({ tipo: "autenticado" });
  });

  it("distingue una sesión inválida de una caída transitoria de Auth", async () => {
    const invalida = await obtenerEstadoAutenticacion(async () => ({
      data: { claims: null },
      error: { status: 401, name: "AuthApiError" },
    }));
    const authCaido = await obtenerEstadoAutenticacion(async () => ({
      data: { claims: null },
      error: { status: 504, name: "AuthRetryableFetchError" },
    }));

    expect(invalida).toEqual({ tipo: "no_autenticado" });
    expect(authCaido).toEqual({ tipo: "no_disponible" });
  });

  it("trata un aborto de red como indisponibilidad, no como logout", async () => {
    const estado = await obtenerEstadoAutenticacion(async () => {
      throw new DOMException("Auth demoró demasiado", "AbortError");
    });

    expect(estado).toEqual({ tipo: "no_disponible" });
  });

  it("aborta la red de Auth antes de que Vercel agote el middleware", async () => {
    const baseFetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true }
          );
        })
    );
    const fetchConTimeout = crearFetchConTimeout(baseFetch, 5);

    await expect(fetchConTimeout("https://auth.example.test/token")).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(baseFetch).toHaveBeenCalledOnce();
  });
});
