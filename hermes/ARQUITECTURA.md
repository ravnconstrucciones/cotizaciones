# 🌐 Arquitectura global del Enjambre

> No es un repo. No es un superagente. Son **3 capas** que trabajan juntas y donde
> **Obsidian es la única fuente de verdad**. Independiente de la app `cotizaciones`.

```
📱 CANALES        WhatsApp · Telegram · Terminal (SSH)
                          │
🖥️ HOSTINGER      HERMES (motor) → 🏗️ Construcción · 🎨 Publicidad · 🌟 Coach
   (VPS 24/7)             │   cada agente lee/escribe Obsidian
                          │
🧠 OBSIDIAN       Memoria + verdad única (repo git = backup + historial + grafo)
                          │
🔧 App RAVN       cotizaciones (Supabase) = solo una herramienta/fuente
```

---

## Las 3 capas

### 🧠 Capa 1 — Obsidian (memoria y verdad única)
- TODO se guarda acá: datos, notas, lo que cada agente recopila y concluye.
- La bóveda es un **repositorio git** → cada cambio queda versionado = **backup automático**
  e historial completo. Nada se pierde nunca.
- El **grafo** (los `[[enlaces]]` y `#tags`) son las "conexiones neuronales": filosofía
  de la empresa ↔ decisiones ↔ obras ↔ clientes. Los agentes crean esos vínculos al escribir.
- Estructura segmentada por agencia → ver `context/BOVEDA.md`.

### 🖥️ Capa 2 — Hostinger + Hermes (el motor del enjambre)
- Un **VPS** (servidor encendido 24/7) donde corre Hermes.
- Hermes **no es un superagente**: es la casa donde viven los **13 agentes** repartidos
  en 3 agencias. Cada uno con su skill (ver `skills/`).
- Hermes tiene la bóveda clonada (git) → lee lo que necesita, escribe conclusiones,
  y hace `git commit/push` (eso ES el backup).
- Le hablás por **gateway** (WhatsApp/Telegram) o por **SSH** desde cualquier lado.

### 📱 Capa 3 — Canales (cómo lo usás)
- Desde el celu: WhatsApp / Telegram (`hermes gateway start`).
- Desde la compu: `ssh` al VPS y `hermes`.
- Ves la actividad de cada agente en vivo (TUI).

---

## Flujo de datos (cómo todo termina en Obsidian)
1. Vos pedís algo por WhatsApp ("¿cómo viene la obra Casa López?").
2. Hermes elige al agente correcto (`construccion-vision`).
3. El agente **busca en Obsidian** (su carpeta) + consulta la app RAVN si hace falta.
4. Responde, y **escribe la conclusión de vuelta en Obsidian** (con enlaces a obra, cliente, etc.).
5. `git commit` → queda versionado. La memoria crece y se conecta sola.

---

## Salir del repo `cotizaciones`
Lo que armamos en `hermes/` (skills + contexto + plano de bóveda) es **portátil**:
son archivos de texto, no dependen de la app. Plan de mudanza:

1. **El cerebro del enjambre vive DENTRO de Obsidian**, en `91-Sistema/Enjambre/`
   (skills + ENJAMBRE.md + BOVEDA.md + esta arquitectura). Así "todo vive en Obsidian".
2. Hermes (en Hostinger) carga las skills desde esa carpeta de la bóveda.
3. `cotizaciones` queda como **una herramienta más**: los agentes de construcción
   consultan su base (Supabase) cuando necesitan presupuestos/cashflow. Nada más.

> Resultado: un solo lugar (Obsidian) con TODO; Hermes lo ejecuta; cotizaciones es periférico.

---

## Plan de despliegue por fases

**Fase 1 — Bóveda como repo git (backup + base de la memoria)**
- Convertir la bóveda de Obsidian en repo git privado.
- Sincronizar Mac ⇄ servidor por git.

**Fase 2 — VPS en Hostinger + Hermes**
- VPS con Ubuntu (Hermes necesita acceso SSH; el hosting compartido NO sirve).
- Instalar Hermes, `hermes setup --portal`, clonar la bóveda, cargar las skills.

**Fase 3 — Reorganizar la bóveda** (ejecuta Hermes, ver `BOVEDA.md`).

**Fase 4 — Gateway (hablarle desde el celu)**
- `hermes gateway start` → conectar WhatsApp/Telegram.

**Fase 5 — Rutinas automáticas**
- Resumen diario, búsqueda de oportunidades, alertas de finanzas, etc.

---

## Lo que necesito de vos para empezar
1. **Tu plan de Hostinger**: ¿es **VPS** (con acceso SSH) o **hosting compartido**?
   (Para Hermes hace falta VPS.)
2. **Cómo sincronizás Obsidian hoy**: ¿Obsidian Sync, iCloud, nada?
3. Con eso armo la **Fase 1** (bóveda-git) y el **runbook** del VPS paso a paso.
