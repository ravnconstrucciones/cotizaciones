import type { HTMLAttributes } from "react";

/**
 * Badge mínimo del cockpit (sin Radix/cva — el repo no usa shadcn completo).
 * ADN RAVN: radius 0, tipografía chica en mayúsculas con tracking.
 */
export function Badge({
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] ${className}`}
      {...props}
    />
  );
}
