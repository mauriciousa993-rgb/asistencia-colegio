# 🔧 Solución para Vercel - Variable API_URL

## ⚠️ El Problema
Vercel no inyecta automáticamente variables de entorno en sitios estáticos (HTML/JS puro).

## ✅ Solución Simple - 2 Opciones:

---

## OPCIÓN 1: Editar app.js directamente (Recomendado)

Después de obtener la URL de Render, edita `frontend/public/app.js`:

```javascript
// Línea 2 de app.js - Cambia esto:
const API_URL = window.API_URL || "http://localhost:5000/api";

// Por esto (usa tu URL de Render):
const API_URL = "https://asistencia-colegio-backend.onrender.com/api";
```

Luego sube el cambio a GitHub:
```bash
git add frontend/public/app.js
git commit -m "Actualiza API_URL para producción"
git push origin main
```

Y redeploy en Vercel.

---

## OPCIÓN 2: Usar script inline en index.html

En `frontend/public/index.html`, ANTES de cargar app.js, agrega:

```html
<script>
  window.API_URL = "https://asistencia-colegio-backend.onrender.com/api";
</script>
<script src="./app.js"></script>
```

---

## 📝 Pasos Completos:

### 1. Despliega primero en RENDER
- Sigue `RENDER_SETUP.md`
- Obtén tu URL: `https://asistencia-colegio-backend.onrender.com`

### 2. Actualiza app.js con la URL de Render

Edita `frontend/public/app.js` línea 2:
```javascript
const API_URL = "https://asistencia-colegio-backend.onrender.com/api";
```

### 3. Sube cambios a GitHub
```bash
git add frontend/public/app.js
git commit -m "Configura API_URL para producción"
git push origin main
```

### 4. Despliega en VERCEL
- Importa desde GitHub
- Framework: `Other`
- Output Directory: `frontend/public`
- **NO necesitas variables de entorno** (la URL está hardcodeada en app.js)

### 5. Configura CORS en Render
- Ve a Render → tu servicio → Environment
- Agrega:
  ```
  FRONTEND_URL=https://asistencia-colegio.vercel.app
  ```
- Guarda y espera a que se reinicie

---

## 🎯 Resumen de URLs a usar:

| Archivo | Qué poner |
|---------|-----------|
| `frontend/public/app.js` línea 2 | `https://asistencia-colegio-backend.onrender.com/api` |
| Render `FRONTEND_URL` | `https://asistencia-colegio.vercel.app` |

---

## ❌ No usar variables de entorno en Vercel para este caso

Para sitios estáticos (HTML/JS vanilla), las variables de entorno de Vercel no funcionan automáticamente. La solución más simple es hardcodear la URL en el código JavaScript.

**¿Tienes la URL de tu backend en Render ya?** Si es así, dime cuál es y te digo exactamente qué línea cambiar en app.js.
