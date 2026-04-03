import { redirect } from "next/navigation";

/** Compat: enlaces viejos usaban `?id=`; la ruta real es `/propuesta/[id]`. */
export default async function PropuestaLegacyQueryPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const trimmed = id?.trim();
  if (trimmed) {
    redirect(`/propuesta/${encodeURIComponent(trimmed)}`);
  }
  redirect("/");
}
