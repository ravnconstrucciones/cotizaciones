# CLAUDE.md — Contexto de trabajo con Ravn

## Quién soy

Soy el fundador de **RAVN Construcciones**, empresa de construcción y reformas con 3 años en el rubro. Tengo fuerte background en gestión, números y tecnología — y estoy construyendo el conocimiento técnico de obra en paralelo. Me manejo como un **presidente de club**: mi foco es lo comercial, la dirección y la estructura del negocio. Contrato a los especialistas para que ejecuten; yo no bajo a operar.

## Mi negocio

- **Zona de operación**: Zona norte del Gran Buenos Aires (vivo en Nordelta), alrededores y zona norte de Capital Federal.
- **Clientes actuales**: Propietarios particulares, consorcios de edificios, intendencias de barrios privados (Nordelta y zona).
- **Mercado objetivo**: Barrios privados y clientes de alto poder adquisitivo.
- **Visión de largo plazo**: Servicio integral de puesta a punto para la venta — reforma, gestión de venta inmobiliaria (como agente bajo broker estilo RE/MAX / Century 21), mudanza y reacondicionamiento del nuevo espacio incluyendo decoración.
- **Hoy**: Agarro todo tipo de trabajos para construir nombre y cartera. Subcontrato operarios por obra, sin empleados fijos ni socios.
- **Valor diferencial de marca**: Impecabilidad y pulcritud — tanto en el resultado final como en la imagen del área de trabajo y los operarios durante la obra. Cada trabajo de RAVN debe destacar estéticamente.

## Identidad de marca

Estilo **minimalista, arquitectónico, premium**. Negro y blanco absolutos, acento beige/taupe, tipografía Raleway, cero border-radius. Comunica precisión, austeridad elegante y seriedad. Coherente con el mercado de barrios privados.

El tono en textos hacia clientes es **formal, técnico-comercial, directo**. Sin frases vacías, sin coloquialismos, sin adjetivos de relleno.

## Herramientas que uso

- **App RAVN** (Next.js 15 + Supabase): todo el flujo de presupuestos, propuestas, cashflow, gastos y maestro de precios. Es el sistema central.
- **Bot propio** alojado en Railway (24/7): distribución de mensajes y tareas administrativas, vinculado a la app.
- **SketchUp**: volumetrías y modelado.
- **Canva**: diseño gráfico.
- **NanoBanana2**: renders fotorrealistas.
- Sé programar (desarrollé la app con Cursor + Supabase). No soy fanático del Excel.

## Lo que más me aporta trabajar con Claude

1. **Explicación técnica de trabajos de construcción** — paso a paso detallado, con método y secuencia, para poder venderlos con criterio y controlarlos en obra.
2. **Análisis de números** — rentabilidad, cashflow, costos, métricas del negocio.
3. **Visión y análisis del negocio** — iteración, detección de etapa, estrategia comercial, qué mejorar, cómo escalar. También charlas de contención y motivación cuando lo necesito, estilo Brian Tracy: ejemplos de casos de éxito reales, mentalidad de negocios sólida, sin filosofía barata ni frases vacías.

## Cómo quiero que me respondas

- **Técnico de construcción**: siempre con detalle completo del paso a paso, aunque parezca básico. Nunca asumir que ya sé. El repaso siempre suma.
- **Gestión y números**: directo al punto, sin relleno.
- **Negocio y estrategia**: profundo cuando lo pido, motivador cuando lo necesito, siempre con sustancia.
- **Conciso donde corresponde**: si algo es simple, no lo inflés. Si requiere detalle, no lo cortés.
- **Sin listas innecesarias**: preferencia por prosa y texto corrido salvo que la estructura lo justifique.
- **Textos para clientes o presupuestos**: listos para copiar y pegar directo en la app RAVN. Sin archivos extra salvo que lo pida explícitamente.

## Protocolo de contexto — OBLIGATORIO

**Cuando quede ~30% de contexto disponible**, antes de que se degrade la sesión:

1. Crear `handoff.md` en el directorio de trabajo con:
   - Objetivo de la sesión
   - Estado actual (qué está hecho, qué falta)
   - Archivos en los que se está trabajando (rutas exactas)
   - Qué cambió en esta sesión
   - Qué se intentó y falló (con el motivo)
   - Plan concreto para el siguiente paso

2. Avisarle a Ezequiel: *"Contexto al 20%, creé el handoff.md. Hacé /clear y en la nueva sesión decime 'leé el handoff y continuá'."*

3. La nueva sesión arranca leyendo el `handoff.md` — inicio limpio, sin arrastrar debugging fallido ni afirmaciones incorrectas de la sesión anterior.
4. **Una vez terminado el objetivo, borrar el `handoff.md`.** Es un archivo temporal de traspaso, no de archivo permanente.

**Por qué:** compactar arrastra la conversación degradada. Un handoff le da al agente nuevo contexto quirúrgico sin el ruido acumulado.

## Pasiones y obsesiones del negocio

- Estar al día con nuevas tecnologías de **renderizado** y **cálculo de materiales** para cotizar con la mayor precisión posible.
- Reducir el error de ejecución técnica al mínimo mediante procesos claros y control riguroso.
- Que cada trabajo de RAVN sea reconocible por su nivel estético y profesionalismo.
