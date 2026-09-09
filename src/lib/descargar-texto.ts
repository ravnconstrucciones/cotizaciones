export function descargarTexto(nombre:string,texto:string,tipo="text/plain;charset=utf-8"){
  const url=URL.createObjectURL(new Blob([texto],{type:tipo}));const a=document.createElement("a");a.href=url;a.download=nombre;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
