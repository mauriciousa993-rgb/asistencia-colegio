# 🚀 Configuración Rápida en Render

## ✅ Paso 1: Crear Cuenta en Render
1. Ve a https://render.com
2. Click en **"Get Started for Free"**
3. Selecciona **"Sign up with GitHub"**
4. Autoriza a Render para acceder a tus repositorios

## ✅ Paso 2: Crear Web Service (Backend)

### 2.1 Nuevo Servicio
1. En el Dashboard de Render, click en **"New +"**
2. Selecciona **"Web Service"**
3. Busca y selecciona tu repositorio: `mauriciousa993-rgb/asistencia-colegio`
4. Click **"Connect"**

### 2.2 Configuración Básica
Completa estos campos:

| Campo | Valor |
|-------|-------|
| **Name** | `asistencia-colegio-backend` |
| **Region** | `Oregon (US West)` |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `cd backend && npm install` |
| **Start Command** | `cd backend && npm start` |
| **Plan** | `Free` |

### 2.3 Variables de Entorno (Environment Variables)
Click en **"Advanced"** → **"Add Environment Variable"**

Agrega estas variables:

```
NODE_ENV=production
```

```
MONGODB_URI=mongodb+srv://asistencia:reyes123@asistenciacolegio.nar4uuf.mongodb.net/asistencia-colegio?retryWrites=true&w=majority
```

```
JWT_SECRET=secreto_super_seguro_asistencia_colegio_2024_reyes_catolicos
```

```
PORT=10000
```

```
FRONTEND_URL=https://asistencia-colegio-frontend.vercel.app
```
(Nota: Actualiza esta URL después de desplegar en Vercel)

### 2.4 Crear Servicio
Click en **"Create Web Service"**

⏳ **Espera 2-5 minutos** a que el despliegue termine.

### 2.5 Obtener URL del Backend
Una vez desplegado, copia la URL que aparece en la parte superior:
```
https://asistencia-colegio-backend.onrender.com
```

---

## ✅ Paso 3: Verificar Backend

Visita en tu navegador:
```
https://asistencia-colegio-backend.onrender.com/api/login
```

Deberías ver un error JSON como este (¡eso es normal!):
```json
{"error":"Usuario y contraseña requeridos"}
```

Esto confirma que el backend está funcionando.

---

## 🎯 Siguiente Paso: Desplegar en Vercel

Una vez que tengas la URL del backend, ve a `VERCEL_SETUP.md` para configurar el frontend.
