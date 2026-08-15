# Cotizador RAVN

Producto independiente para pensar una cotización: diagnóstico, evidencia,
costos, bloqueos y decisión. App RAVN sigue siendo la verdad operativa y, en
esta primera entrega, el Cotizador la consulta únicamente por APIs `GET`.

## Límite de este subsistema

- Lee cotizaciones, evidencia y eventos ya persistidos en App RAVN.
- Proyecta esos datos a `QuoteWorkspaceSnapshot`; no vuelve a calcular el
  presupuesto ni copia el motor determinístico.
- Expone la salida persistida del motor existente, el latido compartido de
  `puente-cotizador`, mensajes, fuentes, checks y rubros afectados. Cuando el
  contrato legacy no ofrece runtime, lo marca como no instrumentado.
- No presenta agentes, jobs o actividad que no estén persistidos.
- Dispatch, presupuesto de créditos, propuesta y handoff final quedan
  bloqueados hasta que existan contratos propios, idempotentes y auditables.
- No llama al endpoint legado `/aprobar`: hoy ese endpoint también crea obra y
  presupuesto, una responsabilidad que debe permanecer en App RAVN.

## Desarrollo local

```bash
cp .env.example .env.local
npm install
npm run dev
```

Para revisar la composición visual sin tocar App RAVN, habilitar
`COTIZADOR_PREVIEW_ENABLED=1` y abrir `/?preview=1`. La pantalla lo identifica
como datos sintéticos y no ejecuta agentes.

## Validación

```bash
npm test
npm run typecheck
npm run build
```

## Configuración de producción

La app falla cerrada si no están configurados Basic Auth y el puente read-only.
Debe servirse exclusivamente sobre HTTPS. `RAVN_COTIZADOR_READ_SECRET`
permanece en el servidor y nunca llega al navegador. App RAVN acepta esta
credencial únicamente para los tres `GET` que consume el adaptador; el secreto
legacy `RAVN_AGENTE_SECRET` sigue reservado al puente conversacional.
