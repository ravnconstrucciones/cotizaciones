import type { HTMLAttributes } from "react";

/**
 * Card mínima del cockpit (sin Radix — API compatible con la de shadcn que
 * esperan los componentes de 21st.dev). ADN RAVN: radius 0, tokens cdm.
 */
export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`border border-cdm-line bg-cdm-panel text-cdm-fg ${className}`}
      {...props}
    />
  );
}

export function CardHeader({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex flex-col gap-1 p-4 ${className}`} {...props} />;
}

export function CardTitle({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`text-sm font-semibold leading-snug text-cdm-fg ${className}`}
      {...props}
    />
  );
}

export function CardContent({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-4 pt-0 ${className}`} {...props} />;
}
