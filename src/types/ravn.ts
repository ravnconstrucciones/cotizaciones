export type Receta = {
  id: string;
  rubro_id: string;
  nombre_item: string;
  unidad: string;
  costo_base_material_unitario: number;
  costo_base_mo_unitario: number;
};

export type RubroRow = {
  id: string;
  nombre: string;
};

export type PresupuestoInsert = {
  nombre_obra: string;
  nombre_cliente: string;
  domicilio: string;
  fecha: string;
  ajuste_total_obra_pct: number;
  estado: string;
};

export type RecetaNombreUnidad = {
  nombre_item: string;
  unidad: string;
  /** Presente cuando el join incluye rubro_id (p. ej. pantalla propuesta). */
  rubro_id?: string;
};

export type PresupuestoItemRow = {
  id: string;
  presupuesto_id: string;
  receta_id: string;
  cantidad: number;
  precio_material_congelado: number;
  /** Descuento % sobre subtotal materiales de la línea (0–100). */
  descuento_material_pct: number;
  precio_mo_congelada: number;
  recetas: RecetaNombreUnidad | null;
};
