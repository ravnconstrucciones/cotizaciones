# 🟢 Fase 1 — Convertir la bóveda Obsidian en repo git

> Meta: que la bóveda tenga **backup con historial** y pueda **sincronizarse** con
> el servidor de Hermes. Esto reemplaza iCloud/Drive como puente con el servidor.
> Tu Mac sigue editando Obsidian igual que siempre.

**Tiempo estimado:** 20-30 min · **Nivel:** guiado, paso a paso.

---

## Antes de empezar (importante)

⚠️ **Sacá la bóveda de la carpeta de iCloud/Drive** para evitar que dos sistemas
de sincronización peleen. La movés a una carpeta local normal:

- Hoy probablemente está en algo como `~/Library/Mobile Documents/iCloud~md~obsidian/...`
  o dentro de tu Google Drive/Dropbox.
- Destino recomendado: **`~/Obsidian/RAVN`** (carpeta local, fuera de la nube).
- En Obsidian: *Abrir otra bóveda → Abrir carpeta como bóveda* y elegís la nueva ubicación.

> iCloud puede quedar como respaldo extra, pero NO con la misma carpeta del git.

---

## Opción A — Fácil, desde Obsidian (recomendada, sin terminal)

1. **Crear un repo privado** para la bóveda:
   - En GitHub: *New repository* → nombre `boveda` → **Private** → Create.
   - (Alternativa sin terceros: un repo en tu propio VPS. Ver Fase 2.)
2. **Instalar el plugin "Git"** en Obsidian:
   - *Settings → Community plugins → Browse →* buscar **"Git"** (de Vinzent) → Install → Enable.
3. **Conectar el repo:**
   - En el plugin: *Authenticate* con GitHub, y poné la URL del repo `boveda`.
4. **Primer commit:**
   - Comando (Cmd+P) → *"Git: Commit all changes"* → luego *"Git: Push"*.
5. **Automatizar:**
   - En ajustes del plugin: *Auto commit-and-sync* cada 10 min. Listo: backup solo.

## Opción B — Por terminal (si preferís control total)

```bash
# 1. Entrar a la bóveda
cd ~/Obsidian/RAVN

# 2. Inicializar git
git init

# 3. Ignorar cache de Obsidian y basura del sistema
cat > .gitignore <<'EOF'
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/cache
.trash/
.DS_Store
EOF

# 4. Primer commit
git add .
git commit -m "Boveda inicial - memoria del enjambre"

# 5. Conectar al repo remoto privado (cambiá la URL por la tuya)
git remote add origin git@github.com:TU_USUARIO/boveda.git
git branch -M main
git push -u origin main
```

---

## Verificación de la Fase 1
- [ ] La bóveda abre normal en Obsidian desde su nueva ubicación local.
- [ ] `git log` (o el plugin) muestra al menos 1 commit.
- [ ] El repo `boveda` en remoto tiene tus notas.
- [ ] Auto-sync activado (o sabés cómo hacer commit/push).

✅ Con esto, la **memoria central** ya tiene backup e historial.
Siguiente: **Fase 2** — levantar Hermes en el VPS de Hostinger y clonar esta bóveda.
