# Bot de Grok → Portal del cliente

Instructivo para configurar el bot de obras. La clave NO va en este archivo: está en
`RAVN_PORTAL_BOT_SECRET` (`.env.local` y Vercel). Se le pega al bot a mano.

**Dirección:** `POST https://ravn-app-one-five.vercel.app/api/portal-bot`
**Encabezados:** `Authorization: Bearer <clave>` · `Content-Type: application/json`

## Qué puede hacer (campo `accion`)

| accion | datos | para qué |
|---|---|---|
| `obras` | `buscar?` | Encontrar la obra y su `presupuesto_id`. Siempre el primer paso. |
| `estado` | `presupuesto_id` | Ver rubros, agenda y registros con sus ids. |
| `acceso_crear` | `presupuesto_id`, `titulo`, `clave?` | Crea y activa el portal. `titulo` = nombre con el que entra el cliente (corto: "Forna"). Sin `clave` genera una. Devuelve `mensaje` listo para mandarle al cliente. |
| `rubros_agregar` | `presupuesto_id`, `nombres: []` | Cargar rubros. |
| `rubro_guardar` | `presupuesto_id`, `rubro_id`, `tareas?`, `estado?` (pendiente/en_curso/terminado) | Qué se hace en el rubro y en qué estado está. |
| `agenda_crear` | `presupuesto_id`, `fecha` (AAAA-MM-DD), `hora?` (09:30), `titulo`, `quien?`, `detalle?` | Calendario de la semana. |
| `registro_crear` | `presupuesto_id`, `tipo` (avance/video/resuelto/material/ticket), `titulo`, `texto?`, `rubro_id?`, `fecha?`, `media_url?`, `link_externo?`, `importe?` + `moneda?` (ticket), `material?` | Avances, videos, tickets. `media_url` = enlace https a la foto o video (hasta 50 MB). El ticket exige foto e importe. |
| `registro_publicar` | `presupuesto_id`, `registro_id` | Publicar un borrador. |
| `registro_borrar` / `agenda_borrar` / `rubro_borrar` | ids | Corregir. |

**Regla:** todo lo que carga el bot entra como BORRADOR y el cliente no lo ve hasta que se publica
(desde el panel o con `registro_publicar` cuando Eze lo pide). Para publicar directo, mandar `estado: "publicado"`.

**No puede:** crear obras (se crean en App RAVN), tocar pagos (salen del módulo Dinero) ni ver contraseñas.
