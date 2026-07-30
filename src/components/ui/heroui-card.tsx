"use client";

import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn() inline: el proyecto tiene `@/lib/utils` con la misma helper, pero ese
 * archivo aún no está versionado — dejarlo inline mantiene esta card
 * autocontenida (la preview de Vercel construye sin depender de ese archivo).
 * clsx + tailwind-merge ya son dependencias del proyecto.
 */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Card base del Centro de Mando: acero monocromo, borde preciso y superficies
 * planas que se leen claro sin abandonar el lenguaje geométrico de RAVN.
 * con soporte dark: (atado a la clase .dark vía el @custom-variant de
 * globals.css → responde al toggle [MODO CLARO]/[MODO OSCURO] de la app).
 *
 * SaaS premium limpio (Linear / HeroUI), NO el HUD denso del cockpit viejo.
 * Subcomponentes: Card / CardHeader / CardTitle / CardDescription /
 * CardContent / CardFooter.
 */

type Variant = "default" | "muted" | "accent";

const VARIANT: Record<Variant, string> = {
  // Superficie principal: blanca en claro, zinc-900 sutil en oscuro.
  default:
    "bg-white text-zinc-900 ring-1 ring-zinc-950/[0.06] dark:bg-zinc-900/70 dark:text-zinc-50 dark:ring-white/[0.08]",
  // Un punto más apagada, para tarjetas secundarias.
  muted:
    "bg-zinc-50 text-zinc-900 ring-1 ring-zinc-950/[0.05] dark:bg-zinc-900/40 dark:text-zinc-100 dark:ring-white/[0.06]",
  // La tarjeta protagonista sube apenas el contraste, sin introducir color.
  accent:
    "bg-white text-zinc-900 ring-1 ring-zinc-900/[0.16] dark:bg-zinc-900/70 dark:text-zinc-50 dark:ring-white/[0.18]",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  /** Eleva la sombra y hace que reaccione al hover (cards interactivas). */
  interactive?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", interactive = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-none border border-zinc-900/[0.14] bg-white shadow-none dark:border-white/[0.14] dark:bg-zinc-900/70",
        VARIANT[variant],
        interactive && "hover:bg-zinc-50 dark:hover:bg-zinc-900/90",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col gap-1.5 px-6 pt-6 sm:px-7 sm:pt-7",
      className
    )}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-base font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400",
      className
    )}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-6 py-5 sm:px-7", className)}
    {...props}
  />
));
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center gap-3 px-6 pb-6 pt-1 sm:px-7 sm:pb-7",
      className
    )}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";
