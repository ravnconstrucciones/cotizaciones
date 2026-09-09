/** Portadas livianas y por debajo del límite del servidor, también en iPhone. */
export async function comprimirPortada(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la foto.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .8));
    if (!blob || blob.size > 3_500_000) throw new Error("Elegí una foto más pequeña.");
    return new File([blob], "portada.jpg", { type: "image/jpeg" });
  } catch {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size < 3_500_000) return file;
    throw new Error("No pude preparar esta foto. Elegí JPG, PNG o una foto compatible del iPhone.");
  } finally { URL.revokeObjectURL(url); }
}
