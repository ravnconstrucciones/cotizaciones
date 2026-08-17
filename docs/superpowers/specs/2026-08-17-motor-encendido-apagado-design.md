# Motor del cotizador: encendido/apagado desde el visor — diseño (17/08/2026)

**Brief de Eze (textual):** *"tendría que prender cuando estoy en análisis y
dejarme un botón tipo de prendido apagado cuando lo quiera suspender! lo mismo
si doy la orden de apagarlo"* — y auto-apagado a los 30 min sin uso.

Sucede a los specs de la puerta (17/08): el motor de la mesa es el
**cotizador-bridge** (`bridge/server.mjs`, 127.0.0.1:3011). Hoy hay que
levantarlo a mano (`npm run bridge`) y el chip del visor ("Lectura
fresca/demorada") lee `puente_latidos`, que ya nadie late: el puente legacy
quedó retirado (plist apagado 17/08). Este diseño arregla las dos cosas.

## Enfoque aprobado (opción A): bridge residente con modo suspendido

La web (Vercel) no puede prender un proceso en la Mac — algo tiene que estar
escuchando. El bridge pasa a ser **residente bajo launchd** y lo que se
prende/apaga es su **voluntad de procesar olas** (un flag compartido), no el
proceso. Suspendido no gasta un token: es un server HTTP dormido.

## 1 · Estado compartido (Supabase, fila `puente_latidos` id `puente-cotizador`)

- `visto_at` — latido del bridge cada 30 s (reusa el índice que el chip ya lee).
- `estado` — `activo` | `suspendido` (lo reporta el bridge).
- `deseado` — `encendido` | `apagado` (lo escriben el visor, la directiva de
  chat y el auto-apagado). Default `encendido`.
- `presencia_at` — último ping de presencia del visor.

RLS ya vigente en la tabla; sólo la tocan service role (App RAVN y bridge).

## 2 · Bridge (`bridge/server.mjs`)

- `COTIZADOR_BRIDGE_RESIDENTE=1` (lo setea el wrapper de launchd): desactiva el
  self-exit de 30 min y activa el latido a `puente_latidos` (upsert cada 30 s
  con `visto_at` + `estado`).
- Antes de correr cada ola consulta `deseado` fresco (PostgREST). `apagado` →
  409 `{error: "El motor está apagado…"}`; el visor lo muestra y el mensaje ya
  quedó persistido (mismo contrato de siempre).
- **Auto-apagado**: cada minuto, si `deseado=encendido` y pasaron 30 min sin
  uso (máx entre actividad local del bridge y `presencia_at`) → escribe
  `deseado=apagado`. El botón y la entrada al visor mandan siempre.
- **Directiva de chat**: ola de charla cuyo texto es "apagate" / "apagá el
  motor" / "apagar motor" → no corre Fable: escribe `deseado=apagado` y deja
  en el hilo un mensaje `sistema` "Motor apagado a pedido."

## 3 · App RAVN

- `POST/GET /api/puente/control`: GET devuelve `{deseado, estado, visto_at,
  presencia_at}`; POST acepta `{accion: "encender"|"apagar"|"presencia"}`.
  GET entra a la allowlist de lectura del Cotizador; POST a la de escritura.
- `/api/cotizaciones/[id]/mensajes` suma al payload `motor: {estado, deseado,
  visto_at}`. `motor_conectado` (booleano legacy) se mantiene: latido fresco
  **y** estado activo.

## 4 · Visor (apps/cotizador-ravn)

- Ruta proxy `/api/motor` (GET estado / POST acción) contra App RAVN con las
  credenciales existentes.
- **Al montar la mesa de un expediente** → POST `encender` + ping `presencia`
  cada 60 s mientras la pestaña está abierta. Se dispara al entrar, no en
  loop: si Eze apaga a mano estando adentro, queda apagado hasta que salga y
  vuelva a entrar (o toque el botón).
- **El chip pasa a ser el botón** (toggle), tres estados:
  - **Motor encendido** — latido fresco + deseado encendido.
  - **Motor apagado** — latido fresco + deseado apagado (residente vivo,
    no procesa). Click = encender/apagar.
  - **Sin señal** — latido viejo: la Mac está apagada o el bridge murió. El
    botón lo dice y no promete nada.

## 5 · launchd

`com.ravn.bridge-cotizador` (KeepAlive, wrapper estilo puente legacy: carga
`.env.local` del app del cotizador y corre `node bridge/server.mjs` con
`COTIZADOR_BRIDGE_RESIDENTE=1`). El plist del puente legacy retirado
(`.apagado-20260817`) se archiva; el daemon legacy no se reinstala.

## Fuera de alcance

- Despachar olas desde el celular (el navegador→127.0.0.1 sigue siendo la
  física del bridge; desde el celu el botón y el chip funcionan — la ola no).
- Unificar olas / revivir el puente legacy.

## Testing

- Unit del mapeo de estados del chip (dominio del visor) y del guard de
  deseado en el bridge donde sea testeable.
- E2E manual: encender desde el visor, ola de charla, apagar por botón, ola
  rechazada visible, directiva "apagate", auto-off (simulado), latido visto
  en el chip. Verificación completa antes de afirmar nada.
