# 🐝 Enjambre RAVN para Hermes

Tu enjambre dividido por especialidades, listo para cargar en **Hermes Agent**.
No es un super-agente: son **13 especialistas**, cada uno con su tarea, repartidos
en 3 agencias. Hermes los activa según lo que pidas y puede correr varios en paralelo.

```
hermes/
├── context/ENJAMBRE.md     ← memoria central (Hermes la lee siempre → nunca olvida)
└── skills/                 ← los 13 especialistas (estándar agentskills.io)
    ├── construccion-*      (6)  🏗️ Agencia Construcción
    ├── publicidad-*        (3)  🎨 Agencia Publicidad
    └── coach-*             (4)  🌟 Coach Personal
```

---

## Puesta en marcha (una sola vez)

### 1. Instalar Hermes
- **Mac/Linux/WSL:** `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash`
- **Windows:** `iex (irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1)`

### 2. Conectar tu plan (ya tienes Hermes Plus)
```bash
hermes setup --portal
```
Inicia sesión con la cuenta donde pagaste el plan. Esto te da los 300+ modelos
y las herramientas. **Recomendado:** elegí un modelo Claude para el cerebro
(`hermes model`).

### 3. Cargar el enjambre (las skills)
Copiá la carpeta `skills/` de este repo a la carpeta de skills de Hermes
(`~/.hermes/skills/` — confirmá con `hermes config`):
```bash
cp -r hermes/skills/* ~/.hermes/skills/
```
Verificá que las vea:
```bash
hermes        # abre la interfaz
/skills       # debe listar los 13 agentes
```

### 4. Enchufar tu información (Obsidian = nunca olvida)
1. Editá `context/ENJAMBRE.md` y ajustá la línea **VAULT** a la ruta real de tu bóveda.
2. Cargá ese archivo como contexto permanente de Hermes (vía `hermes config`,
   sección de context files). Así arranca cada sesión conociendo todo tu imperio.
3. Dale a Hermes acceso de lectura a la carpeta de tu Obsidian.

---

## Cómo se usa (lo visual)

- `hermes` → **interfaz en vivo (TUI)**: ves en tiempo real qué agente actúa y qué
  herramienta usa (streaming de actividad). Esto es tu "enjambre a la vista".
- Invocás un especialista por su nombre, ej: *"con el agente construccion-clientes,
  respondé a Juan…"* o dejás que Hermes elija.
- Tareas grandes → Hermes lanza **subagentes en paralelo** (un especialista por frente).
- `hermes gateway start` → conectarlo a **WhatsApp / Telegram** para operarlo desde el teléfono.

## La vista web (complemento)
En la app RAVN, ruta `/enjambre`: tablero con los 13 agentes, su área, estado y
conexiones. Útil como panel de "organigrama" del enjambre.

---

## Las 3 agencias
| Agencia | Agentes |
|---------|---------|
| 🏗️ Construcción | clientes · proveedores · cotizaciones · renders · inmobiliario · vision |
| 🎨 Publicidad | webs · codigo · software |
| 🌟 Coach Personal | psicologo · wellness · finanzas · oportunidades |

> Regla del enjambre: cada agente hace SOLO lo suyo. Si la tarea es de otro, la deriva
> (ver "Deriva a otro agente cuando" en cada skill).
