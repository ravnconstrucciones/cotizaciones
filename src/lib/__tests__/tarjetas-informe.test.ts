import {describe,it,expect} from 'vitest';
import {prepararRegistrosTarjeta,resumirTarjeta,saldoTarjeta,periodoMesAnterior,type MovimientoTarjeta} from '../tarjetas-informe';
const base:MovimientoTarjeta={id:'compra',fecha:'2026-09-02',cuenta_id:'visa',monto:-100.25,moneda:'ARS',origen_tipo:'gasto_personal',origen_id:'gasto',estado:'asentado',descripcion:'Compra',dueno_obra_id:null};
describe('informe de tarjetas',()=>{
 it('separa compras, pagos, reintegros y ajustes sin duplicar ni mezclar moneda o futuro',()=>{
  const rows=[base,base,{...base,id:'pago',monto:70,origen_tipo:'transferencia'},{...base,id:'reintegro',monto:20},{...base,id:'foto',monto:-500,origen_tipo:'foto_inicial'},{...base,id:'futuro',fecha:'2026-10-18',monto:-40},{...base,id:'usd',moneda:'USD',monto:-8},{...base,id:'borrador',estado:'borrador',monto:-999}];
  const datos=prepararRegistrosTarjeta(rows,{});const r=resumirTarjeta(datos,'2026-09-01','2026-09-09','ARS');
  expect(r.consumos).toBe(100.25);expect(r.reintegros).toBe(20);expect(r.neto).toBe(80.25);expect(r.pagos).toBe(70);expect(r.cantidad).toBe(1);
  expect(saldoTarjeta(rows.filter(r=>r.moneda==='ARS'),'visa','2026-09-09')).toBe(-510.25);
 });
 it('usa el origen para separar personal, empresa y obra, y conserva categorías confirmadas',()=>{
  const r=prepararRegistrosTarjeta([base,{...base,id:'obra',origen_tipo:'gasto_obra'}],{'gasto_personal:gasto':{categoria:'Súper',concepto:'Jumbo'},'gasto_obra:gasto':{categoria:'Materiales',concepto:'Cemento',obra:'Gipponi'}});
  expect(r[0]).toMatchObject({ambito:'Personal',categoria:'Supermercado',descripcion:'Jumbo'});expect(r[1]).toMatchObject({ambito:'Obra',obra:'Gipponi'});
 });
 it('compara el mismo tramo del mes anterior sin saltar de mes por sus días',()=>{expect(periodoMesAnterior('2026-03-01','2026-03-31')).toEqual({desde:'2026-02-01',hasta:'2026-02-28'});expect(periodoMesAnterior('2026-01-01','2026-01-09')).toEqual({desde:'2025-12-01',hasta:'2025-12-09'});});
});
