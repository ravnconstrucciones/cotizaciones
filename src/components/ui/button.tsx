import type { ButtonHTMLAttributes } from "react";

/**
 * Button mínimo del cockpit (sin Radix/cva). Variante única "outline" sutil;
 * para acciones primarias el cockpit usa sus propios botones taupe.
 */
export function Button({
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center border border-cdm-line bg-transparent text-cdm-muted transition-colors hover:bg-cdm-fg/10 hover:text-cdm-fg disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...props}
    />
  );
}
