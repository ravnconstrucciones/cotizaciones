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
 * Card estilo HeroUI — la estética que pasó Eze: tarjeta redondeada
 * (rounded-[32px]), sombra suave, superficie limpia que se LEE bien claro,
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
  // Con un baño de acento cian (la marca) muy sutil para tarjetas hero.
  accent:
    "bg-white text-zinc-900 ring-1 ring-cyan-500/20 dark:bg-zinc-900/70 dark:text-zinc-50 dark:ring-cyan-400/20",
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
        "rounded-[32px] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-12px_rgba(16,24,40,0.12)]",
        "transition-shadow duration-300 dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_18px_44px_-18px_rgba(0,0,0,0.6)]",
        VARIANT[variant],
        interactive &&
          "hover:shadow-[0_2px_4px_rgba(16,24,40,0.05),0_24px_56px_-16px_rgba(16,24,40,0.2)] dark:hover:shadow-[0_2px_4px_rgba(0,0,0,0.5),0_28px_64px_-18px_rgba(0,0,0,0.7)]",
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
