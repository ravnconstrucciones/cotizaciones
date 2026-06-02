"use client";

import Link from "next/link";
import {
  Building2,
  Users,
  Truck,
  FileText,
  Home,
  TrendingUp,
  Globe,
  Code2,
  ShieldCheck,
  Brain,
  Salad,
  Wallet,
  Sparkles,
  MessageCircle,
  BookOpen,
  Mail,
  Calendar,
  FolderOpen,
  Database,
  type LucideIcon,
} from "lucide-react";

type Estado = "operativo" | "conectado" | "por-activar";

type Agente = {
  nombre: string;
  icon: LucideIcon;
  hace: string;
  conexiones: string[];
  estado: Estado;
};

type Area = {
  area: string;
  emoji: string;
  agentes: Agente[];
};

const ENJAMBRE: Area[] = [
  {
    area: "Constructora · RAVN",
    emoji: "🏗️",
    agentes: [
      { nombre: "Renders", icon: Building2, hace: "Genera y gestiona visuales de obra", conexiones: ["Drive"], estado: "por-activar" },
      { nombre: "Clientes", icon: Users, hace: "Seguimiento y comunicación", conexiones: ["WhatsApp", "Gmail"], estado: "conectado" },
      { nombre: "Proveedores", icon: Truck, hace: "Precios, pedidos y comparativas", conexiones: ["Gmail", "App RAVN"], estado: "conectado" },
      { nombre: "Cotizaciones", icon: FileText, hace: "Presupuestos e historial", conexiones: ["App RAVN", "Supabase"], estado: "operativo" },
      { nombre: "Inmobiliario", icon: Home, hace: "Propiedades y oportunidades", conexiones: ["Web"], estado: "por-activar" },
      { nombre: "Visión de negocio", icon: TrendingUp, hace: "KPIs, rentabilidad, estrategia", conexiones: ["App RAVN", "Calendar"], estado: "conectado" },
    ],
  },
  {
    area: "Publicidad · Diseño",
    emoji: "🎨",
    agentes: [
      { nombre: "Creación de webs", icon: Globe, hace: "Genera sitios y landings", conexiones: ["Web"], estado: "conectado" },
      { nombre: "Revisión de código", icon: Code2, hace: "Code review automático", conexiones: ["GitHub"], estado: "conectado" },
      { nombre: "Revisión de software", icon: ShieldCheck, hace: "QA, pruebas y calidad", conexiones: ["GitHub"], estado: "por-activar" },
    ],
  },
  {
    area: "Holding · Vida",
    emoji: "🌟",
    agentes: [
      { nombre: "Coach psicólogo", icon: Brain, hace: "Claridad mental y apoyo", conexiones: ["Obsidian"], estado: "conectado" },
      { nombre: "Coach de wellness", icon: Salad, hace: "Comida, hábitos y energía", conexiones: ["Obsidian", "Calendar"], estado: "conectado" },
      { nombre: "Finanzas personales", icon: Wallet, hace: "Estado y ajuste de finanzas", conexiones: ["Drive", "Gmail"], estado: "por-activar" },
      { nombre: "Oportunidades", icon: Sparkles, hace: "Nuevas fuentes de ingreso", conexiones: ["Web", "Deep Research"], estado: "por-activar" },
    ],
  },
];

const CONEXION_ICONS: Record<string, LucideIcon> = {
  WhatsApp: MessageCircle,
  Obsidian: BookOpen,
  Gmail: Mail,
  Calendar: Calendar,
  Drive: FolderOpen,
  Supabase: Database,
};

const ESTADO_META: Record<Estado, { label: string; dot: string }> = {
  operativo: { label: "Operativo", dot: "bg-emerald-400" },
  conectado: { label: "Conectado", dot: "bg-sky-400" },
  "por-activar": { label: "Por activar", dot: "bg-ravn-muted" },
};

export default function EnjambrePage() {
  const total = ENJAMBRE.reduce((n, a) => n + a.agentes.length, 0);
  const operativos = ENJAMBRE.reduce(
    (n, a) => n + a.agentes.filter((g) => g.estado !== "por-activar").length,
    0,
  );

  return (
    <main className="min-h-[100dvh] min-h-screen bg-ravn-surface px-6 py-12 text-ravn-fg sm:px-10">
      <div className="mx-auto w-full max-w-6xl font-raleway">
        {/* Encabezado */}
        <header className="mb-10 flex flex-col gap-6 border-b-2 border-ravn-line pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/"
              className="mb-4 inline-block text-xs uppercase tracking-widest text-ravn-fg/40 transition-colors hover:text-ravn-fg/70"
            >
              ← Inicio
            </Link>
            <h1 className="text-3xl font-light uppercase tracking-wider sm:text-4xl">
              Enjambre
            </h1>
            <p className="mt-2 max-w-md text-sm text-ravn-muted">
              Tus agentes a la vista. Constructora, diseño y vida — operando como uno.
            </p>
          </div>
          <div className="flex gap-8">
            <div>
              <div className="text-3xl font-light">{total}</div>
              <div className="text-xs uppercase tracking-widest text-ravn-muted">Agentes</div>
            </div>
            <div>
              <div className="text-3xl font-light">{operativos}</div>
              <div className="text-xs uppercase tracking-widest text-ravn-muted">Activos</div>
            </div>
            <div>
              <div className="text-3xl font-light">3</div>
              <div className="text-xs uppercase tracking-widest text-ravn-muted">Áreas</div>
            </div>
          </div>
        </header>

        {/* Áreas */}
        <div className="flex flex-col gap-12">
          {ENJAMBRE.map((area) => (
            <section key={area.area}>
              <h2 className="mb-5 flex items-center gap-3 text-sm uppercase tracking-widest text-ravn-fg/70">
                <span className="text-base">{area.emoji}</span>
                {area.area}
                <span className="ml-1 text-ravn-muted">· {area.agentes.length}</span>
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {area.agentes.map((ag) => {
                  const Icon = ag.icon;
                  const estado = ESTADO_META[ag.estado];
                  return (
                    <article
                      key={ag.nombre}
                      className="group flex flex-col gap-4 border-2 border-ravn-line bg-ravn-surface p-5 transition-colors hover:bg-ravn-subtle"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex h-11 w-11 items-center justify-center border-2 border-ravn-line">
                          <Icon className="h-5 w-5" strokeWidth={1.5} />
                        </div>
                        <span className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-ravn-muted">
                          <span className={`h-2 w-2 rounded-full ${estado.dot}`} />
                          {estado.label}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base uppercase tracking-wide">{ag.nombre}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-ravn-muted">{ag.hace}</p>
                      </div>

                      <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                        {ag.conexiones.map((c) => {
                          const CIcon = CONEXION_ICONS[c];
                          return (
                            <span
                              key={c}
                              className="inline-flex items-center gap-1 border border-ravn-line px-2 py-1 text-[10px] uppercase tracking-wider text-ravn-fg/60"
                            >
                              {CIcon && <CIcon className="h-3 w-3" strokeWidth={1.5} />}
                              {c}
                            </span>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-14 border-t-2 border-ravn-line pt-6 text-center text-[10px] uppercase tracking-widest text-ravn-muted">
          Enjambre RAVN · v0.1 · memoria en docs/ENJAMBRE.md
        </footer>
      </div>
    </main>
  );
}
