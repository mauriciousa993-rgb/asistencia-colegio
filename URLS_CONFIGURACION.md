# 🔗 Guía de URLs - Qué va en cada lugar

## 📋 Resumen Visual

```
┌─────────────────────────────────────────────────────────────┐
│  MONGODB ATLAS (Ya configurado)                              │
│  mongodb+srv://asistencia:reyes123@asistenciacolegio...      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  RENDER (Backend)                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Variables de Entorno:                                │   │
│  │                                                       │   │
│  │  MONGODB_URI=mongodb+srv://asistencia:reyes123...    │   │
│  │  JWT_SECRET=secreto_super_seguro...                   │   │
│  │  PORT=10000                                           │   │
│  │  NODE_ENV=production                                  │   │
│  │  FRONTEND_URL=https://asistencia-colegio.vercel.app  │   │  ◄── URL de Vercel
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  URL del Backend: https://asistencia-colegio-backend.onrender.com
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  VERCEL (Frontend)                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Variables de Entorno:                                │   │
│  │                                                       │   │
│  │  API_URL=https://asistencia-colegio-backend.onrender.com/api  │  ◄── URL de Render + /api
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  URL del Frontend: https://asistencia-colegio.vercel.app   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Configuración Paso a Paso

### 1️⃣ RENDER (Backend) - Variables de Entorno

Ve a tu servicio en Render → Environment → Add Environment Variable

| Variable | Valor |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `JWT_SECRET` | `secreto_super_seguro_asistencia_colegio_2024_reyes_catolicos` |
| `MONGODB_URI` | `mongodb+srv://asistencia:reyes123@asistenciacolegio.nar4uuf.mongodb.net/asistencia-colegio?retryWrites=true&w=majority` |
| `FRONTEND_URL` | `https://asistencia-colegio.vercel.app` |

**⚠️ Nota sobre FRONTEND_URL**: 
- Inicialmente puedes poner `*` (comodín) para permitir cualquier origen
- Después de desplegar en Vercel, actualiza con la URL real de tu frontend
- **No olvides el `https://` y no pongas barra al final**

---

### 2️⃣ VERCEL (Frontend) - Variables de Entorno

Ve a tu proyecto en Vercel → Settings → Environment Variables

| Variable | Valor |
|----------|-------|
| `API_URL` | `https://asistencia-colegio-backend.onrender.com/api` |

**⚠️ Importante**: 
- La URL debe terminar en `/api`
- Usa la URL que te da Render (aparece en la parte superior del dashboard)
- Ejemplo: `https://asistencia-colegio-backend.onrender.com/api`

---

## 🔍 Ejemplo Completo

### Escenario:
- Tu backend en Render: `https://asistencia-colegio-backend.onrender.com`
- Tu frontend en Vercel: `https://asistencia-colegio.vercel.app`

### Configuración en RENDER:
```
FRONTEND_URL=https://asistencia-colegio.vercel.app
```

### Configuración en VERCEL:
```
API_URL=https://asistencia-colegio-backend.onrender.com/api
```

---

## ✅ Checklist de Verificación

Después de desplegar, verifica:

1. **Backend funcionando**: 
   - Visita `https://tu-backend.onrender.com/api/login`
   - Deberías ver: `{"error":"Usuario y contraseña requeridos"}`

2. **Frontend conectado**:
   - Abre `https://tu-frontend.vercel.app`
   - Intenta hacer login con: `admin` / `admin123`
   - Si funciona, ¡todo está correcto!

3. **Sin errores de CORS**:
   - Abre la consola del navegador (F12)
   - No deberías ver errores rojos de CORS

---

## 🆘 Si algo falla

### Error de CORS (rojo en consola):
1. Ve a Render → tu servicio → Environment
2. Verifica que `FRONTEND_URL` sea EXACTAMENTE igual a tu URL de Vercel
3. Guarda cambios y espera a que se reinicie (1-2 minutos)

### Frontend no conecta:
1. Verifica que `API_URL` en Vercel termine en `/api`
2. Verifica que la URL del backend sea correcta
3. Redespliega el frontend en Vercel si cambiaste la variable

---

## 📝 Resumen de URLs

| Servicio | URL de Ejemplo | Variable |
|----------|---------------|----------|
| MongoDB | `mongodb+srv://...` | `MONGODB_URI` en Render |
| Backend | `https://asistencia-colegio-backend.onrender.com` | `API_URL` en Vercel (agregar `/api`) |
| Frontend | `https://asistencia-colegio.vercel.app` | `FRONTEND_URL` en Render |

**¿Tienes alguna duda específica sobre qué URL va en algún lugar?**
