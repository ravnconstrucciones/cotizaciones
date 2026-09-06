import { beforeEach, expect, it, vi } from "vitest";
const { query, maybeSingle } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["select", "eq", "order", "limit"]) query[name] = vi.fn(() => query);
  query.maybeSingle = maybeSingle;
  return { query, maybeSingle };
});
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => ({ from: () => query }) }));
import { GET } from "./route";
beforeEach(() => vi.clearAllMocks());
it("no inventa una revisión si no existe", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  const r = await GET();
  expect(await r.json()).toEqual({ revision: null });
  expect(query.eq).toHaveBeenCalledWith("tipo", "revision_financiera_integral");
  expect(query.eq).toHaveBeenCalledWith("estado", "procesado");
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
});
it("devuelve la foto con su fecha sin convertirla en saldo actual", async () => {
  const data = { id: "audit", creado_at: "2026-09-06", contenido: { informe: { fecha: "2026-09-06" } } };
  maybeSingle.mockResolvedValue({ data, error: null });
  expect(await (await GET()).json()).toEqual({ revision: data });
});
it("un error de lectura no parece una revisión vacía", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: { message: "private database failure" } });
  const r = await GET();
  expect(r.status).toBe(500);
  expect(await r.text()).not.toContain("private database failure");
});
