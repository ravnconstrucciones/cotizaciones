export type DocObra = {
  label: string;
  url: string;
  tipo: "diagnostico" | "presupuesto" | "materiales";
};

export const DOCUMENTOS_OBRA: Record<string, DocObra[]> = {
  // Lucila Lagomarsino — Impermeabilización baño y reparación cielorrasos
  "ad00bfc9-7a28-4fc5-9005-3e51e36a4065": [
    { tipo: "diagnostico", label: "Diagnóstico técnico", url: "/docs/Diagnostico_Lagomarsino.html" },
    { tipo: "materiales", label: "Lista de materiales", url: "/docs/Materiales_Lagomarsino.html" },
    { tipo: "presupuesto", label: "Presupuesto", url: "/docs/Presupuesto_Lagomarsino.html" },
  ],
  // Intendencia Barrio Las Glorietas — Sliding de Fibrocemento en Container
  "d21edde6-9f93-45ea-886a-c1a106134901": [
    { tipo: "materiales", label: "Lista de materiales", url: "/docs/Materiales_LasGlorias_Container.html" },
    { tipo: "presupuesto", label: "Presupuesto", url: "/docs/Presupuesto_LasGlorias_Container.html" },
  ],
};
