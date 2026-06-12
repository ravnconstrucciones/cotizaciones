/**
 * Prefetch de datos del cockpit (ronda 6 — hallazgo de perf).
 *
 * Server component que inyecta un script inline: los fetch de datos
 * arrancan apenas el browser parsea el HTML — en paralelo con la descarga
 * de JS y la hidratación — en lugar de esperar a que los módulos monten
 * (~3 s después en dev). Las promesas quedan en `window.__ravnPre` con el
 * MISMO shape que produce `fetchCompartido` ({ok, status, body}), que las
 * consume si están frescas.
 *
 * Solo corre en cargas de documento (los <script> inyectados por React en
 * navegaciones client-side no se ejecutan) — exactamente el caso donde la
 * hidratación tarda y el prefetch paga.
 */
export function PrefetchDatos({ rutas }: { rutas: string[] }) {
  const codigo = `(function(){var w=window;if(w.__ravnPre)return;w.__ravnPre={};w.__ravnPreT=Date.now();${JSON.stringify(
    rutas
  )}.forEach(function(p){w.__ravnPre[p]=fetch(p,{cache:"no-store",credentials:"same-origin"}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{ok:r.ok,status:r.status,body:j}})}).catch(function(e){return{ok:false,status:0,body:{error:String(e)}}})})})();`;
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: codigo }} />;
}
