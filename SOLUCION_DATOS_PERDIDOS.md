# 🔧 Solución: Pérdida de Datos de Estudiantes

## 📋 Resumen de Mejoras Implementadas

Se han implementado varias mejoras de seguridad y monitoreo para prevenir y diagnosticar la pérdida de datos:

### 1. ✅ Logging de Operaciones Críticas
- Todas las operaciones de importación, eliminación y actualización ahora se registran con timestamp
- Logs incluyen usuario que realizó la acción y detalles del estudiante afectado

### 2. ✅ Endpoint de Health Check
- Nuevo endpoint `/api/health` para verificar estado del sistema
- Muestra cantidad de estudiantes en la base de datos
- Permite detectar si hay problemas de conexión

### 3. ✅ Validaciones de Seguridad
- Importaciones masivas (>500 estudiantes) requieren confirmación explícita
- Prevención de sobrescritura accidental de datos

### 4. ✅ Sistema de Backup/Restore
- Script `npm run backup:estudiantes` - Crea respaldo JSON de todos los estudiantes
- Script `npm run restore:estudiantes` - Restaura desde un backup
- Backups automáticos al iniciar el servidor si hay estudiantes

### 5. ✅ Monitoreo de Conexión MongoDB
- Alertas cuando MongoDB se desconecta
- Logs de errores de conexión

---

## 🔍 Pasos para Diagnosticar el Problema

### Paso 1: Verificar Estado del Sistema

Visita el endpoint de health check:
```
https://tu-backend.onrender.com/api/health
```

Debería mostrar algo como:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": {
    "state": "conectado",
    "estudiantes": 150
  },
  "uptime": 3600
}
```

Si muestra `"estudiantes": 0`, los datos se perdieron.

### Paso 2: Revisar Logs en Render

1. Ve a [dashboard.render.com](https://dashboard.render.com)
2. Selecciona tu servicio `asistencia-colegio-backend`
3. Ve a la pestaña **Logs**
4. Busca mensajes como:
   - `[WARN] Eliminación de estudiante por...`
   - `[INFO] Importación CSV completada...`
   - `[ERROR] Error en conexión MongoDB...`

### Paso 3: Verificar MongoDB Atlas

1. Ve a [MongoDB Atlas](https://cloud.mongodb.com)
2. Selecciona tu cluster
3. Verifica que el cluster esté **activo** (no "paused")
4. En **Collections**, verifica que la colección `estudiantes` tenga documentos

---

## 🛠️ Soluciones según la Causa

### Causa 1: Cluster MongoDB Atlas Pausado (Más Común)

**Síntoma:** El health check muestra `"estado": "desconectado"` o error de conexión.

**Solución:**
1. Ve a MongoDB Atlas → Clusters
2. Si dice "Paused", haz clic en **Resume**
3. Espera 1-2 minutos a que el cluster se active
4. Reinicia el backend en Render (botón "Manual Deploy")

### Causa 2: Importación Accidental de CSV Vacío

**Síntoma:** En logs ves `[INFO] Importación CSV completada` con pocos o cero estudiantes.

**Solución:**
1. Si tienes backup reciente, usa el script de restore
2. Si no, reimporta desde el CSV original:
   ```bash
   cd backend
   npm run import:estudiantes -- --file data/tu-archivo-original.csv
   ```

### Causa 3: Eliminación Manual Accidental

**Síntoma:** En logs ves `[WARN] Eliminación de estudiante por...`

**Solución:**
1. Restaura desde el backup más reciente:
   ```bash
   cd backend
   npm run restore:estudiantes -- --file backup-estudiantes-2024-01-15.json
   ```

### Causa 4: Problema de Credenciales/URI

**Síntoma:** Errores de autenticación en logs.

**Solución:**
1. Verifica que `MONGODB_URI` en Render sea correcta
2. Verifica que el usuario de MongoDB Atlas tenga permisos
3. Verifica que la IP `0.0.0.0/0` esté en Network Access

---

## 💾 Cómo Usar el Sistema de Backup

### Crear Backup Manual

```bash
cd backend
npm run backup:estudiantes
```

Esto crea un archivo en `backend/data/backups/backup-estudiantes-YYYY-MM-DD.json`

### Listar Backups Disponibles

```bash
cd backend
npm run restore:estudiantes
```

### Restaurar desde Backup

```bash
# Simular primero (dry-run)
cd backend
npm run restore:estudiantes -- --file backup-estudiantes-2024-01-15.json --dry-run

# Si todo se ve bien, restaurar de verdad
npm run restore:estudiantes -- --file backup-estudiantes-2024-01-15.json --force
```

---

## 🔄 Flujo de Recuperación Recomendado

1. **Verificar estado actual:**
   ```bash
   curl https://tu-backend.onrender.com/api/health
   ```

2. **Si no hay estudiantes, revisar logs en Render**

3. **Si hay backup reciente, restaurar:**
   ```bash
   cd backend
   npm run restore:estudiantes -- --file <backup-mas-reciente> --force
   ```

4. **Si no hay backup, reimportar desde CSV:**
   ```bash
   cd backend
   npm run import:estudiantes -- --file data/plantilla-estudiantes.csv
   ```

5. **Verificar restauración:**
   ```bash
   curl https://tu-backend.onrender.com/api/health
   ```

6. **Crear backup inmediatamente después:**
   ```bash
   cd backend
   npm run backup:estudiantes
   ```

---

## 🛡️ Prevención Futura

1. **Crear backups regularmente:**
   - Antes de cualquier importación masiva
   - Después de cargar datos importantes
   - Semanalmente como rutina

2. **Usar siempre dry-run antes de importar:**
   - La API web ahora requiere `dryRun=true` primero para importaciones grandes

3. **Monitorear el health check:**
   - Revisar periódicamente `/api/health`
   - Configurar alertas si `estudiantes` baja de cierto umbral

4. **Verificar MongoDB Atlas:**
   - El plan gratuito pausa el cluster después de inactividad
   - Considerar upgrade a plan M10 ($9/mes) para evitar pausas

---

## 📞 Comandos Rápidos de Referencia

```bash
# Verificar estado
curl https://tu-backend.onrender.com/api/health

# Crear backup
cd backend && npm run backup:estudiantes

# Listar backups
cd backend && npm run restore:estudiantes

# Restaurar backup
cd backend && npm run restore:estudiantes -- --file <archivo> --force

# Importar CSV
cd backend && npm run import:estudiantes -- --file data/archivo.csv

# Importar con simulación primero
cd backend && npm run import:estudiantes -- --file data/archivo.csv --dry-run
```

---

## ✅ Checklist de Recuperación

- [ ] Verificar estado en `/api/health`
- [ ] Revisar logs en Render dashboard
- [ ] Verificar estado del cluster en MongoDB Atlas
- [ ] Identificar causa de la pérdida de datos
- [ ] Restaurar desde backup o reimportar CSV
- [ ] Verificar que estudiantes estén disponibles
- [ ] Crear backup de los datos restaurados
- [ ] Implementar monitoreo regular
