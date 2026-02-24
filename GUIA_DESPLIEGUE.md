# 🚀 Guía de Despliegue - Sistema de Asistencia Escolar

## ✅ Estado Actual: PROYECTO CONFIGURADO

Todos los archivos de configuración han sido creados. El proyecto está listo para desplegar en GitHub, Render y Vercel.

---

## 🎯 PASOS A SEGUIR (Acciones del Usuario)

### 1️⃣ SUBIR A GITHUB

Abre tu terminal en la carpeta del proyecto y ejecuta:

```bash
# 1. Navegar a la carpeta del proyecto
cd "c:/Users/mauri/OneDrive/Escritorio/asistencia colegio"

# 2. Inicializar repositorio Git
git init

# 3. Agregar todos los archivos
git add .

# 4. Crear primer commit
git commit -m "Initial commit: Sistema de asistencia escolar listo para desplegar"

# 5. Crear repositorio en GitHub primero (en github.com)
# Luego conectar con:
git remote add origin https://github.com/TU_USUARIO/asistencia-colegio.git

# 6. Subir código a GitHub
git push -u origin main
```

---

### 2️⃣ CONFIGURAR MONGODB ATLAS

1. Ve a [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Crea una cuenta gratuita
3. Crea un **Cluster** (M0 - gratuito)
4. En **Database Access**:
   - Crea un usuario con nombre y contraseña
   - Guarda estas credenciales
5. En **Network Access**:
   - Agrega IP: `0.0.0.0/0` (permite acceso desde cualquier lugar)
6. Obtén la **URI de conexión**:mongodb+srv://asistencia:<db_password>@asistenciacolegio.nar4uuf.mongodb.net/?appName=asistenciacolegio
   ```
   mongodb+srv://usuario:password@cluster.mongodb.net/asistencia-colegio?retryWrites=true&w=majority
   ```

---

### 3️⃣ DESPLEGAR BACKEND EN RENDER

1. Ve a [render.com](https://render.com)
2. Crea cuenta usando **"Sign up with GitHub"**
3. Click en **"New +"** → **"Web Service"**
4. Selecciona tu repositorio de GitHub
5. Configura el servicio:
   - **Name**: `asistencia-colegio-backend`
   - **Environment**: `Node`
   - **Region**: `Oregon (US West)` (recomendado)
   - **Branch**: `main`
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Plan**: `Free`

6. Agrega **Variables de Entorno** (Environment Variables):
   ```
   MONGODB_URI=mongodb+srv://tu_usuario:tu_password@cluster.mongodb.net/asistencia-colegio?retryWrites=true&w=majority
   JWT_SECRET=un_secreto_seguro_de_al_menos_32_caracteres_aqui_12345
   NODE_ENV=production
   FRONTEND_URL=https://tu-frontend.vercel.app
   ```

7. Click **"Create Web Service"**

8. **Espera** a que el despliegue termine (toma 2-5 minutos)

9. **Copia la URL del backend** (aparece en la parte superior):
   ```
   https://asistencia-colegio-backend.onrender.com
   ```

---

### 4️⃣ DESPLEGAR FRONTEND EN VERCEL

1. Ve a [vercel.com](https://vercel.com)
2. Crea cuenta usando **"Continue with GitHub"**
3. Click en **"Add New..."** → **"Project"**
4. Selecciona tu repositorio de GitHub
5. Configura el proyecto:
   - **Framework Preset**: `Other`
   - **Root Directory**: `./` (deja como está)
   - **Build Command**: (deja vacío)
   - **Output Directory**: `frontend/public`

6. Agrega **Environment Variables**:
   ```
   API_URL=https://asistencia-colegio-backend.onrender.com/api
   ```
   (Reemplaza con la URL real de tu backend)

7. Click **"Deploy"**

8. **Espera** el despliegue (toma 1-2 minutos)

9. **Copia la URL del frontend**:
   ```
   https://asistencia-colegio.vercel.app
   ```

---

### 5️⃣ CONFIGURACIÓN FINAL

1. **Vuelve a Render** (dashboard del backend)
2. Actualiza la variable `FRONTEND_URL` con la URL real de Vercel:
   ```
   FRONTEND_URL=https://asistencia-colegio.vercel.app
   ```
3. Click **"Save Changes"** - El servicio se reiniciará automáticamente

---

## ✅ VERIFICACIÓN

### Prueba el Backend:
Visita en tu navegador:
```
https://tu-backend.onrender.com/api/login
```
Debería mostrar un error JSON (eso es normal, significa que funciona)

### Prueba el Frontend:
Visita tu URL de Vercel:
```
https://tu-frontend.vercel.app
```

### Credenciales de Prueba:
- **Usuario**: `admin`
- **Contraseña**: `admin123`

---

## 🔧 SOLUCIÓN DE PROBLEMAS

### Error de CORS
Si ves errores de CORS en la consola del navegador:
1. Verifica que `FRONTEND_URL` en Render sea EXACTAMENTE igual a tu URL de Vercel
2. Incluye `https://` y sin barra al final
3. Reinicia el servicio en Render

### Error de Conexión a MongoDB
1. Verifica que la IP `0.0.0.0/0` esté agregada en MongoDB Atlas
2. Verifica que el usuario y contraseña en la URI sean correctos
3. Asegúrate de que el cluster esté activo (no "paused")

### Frontend no conecta al Backend
1. Verifica que `API_URL` en Vercel incluya `/api` al final
2. Ejemplo correcto: `https://backend.onrender.com/api`
3. Ejemplo incorrecto: `https://backend.onrender.com`

---

## 📁 ARCHIVOS CREADOS

El asistente ha creado/configurado estos archivos:

| Archivo | Descripción |
|---------|-------------|
| `backend/.env.example` | Variables de entorno de ejemplo |
| `.gitignore` | Ignora node_modules, .env, logs |
| `vercel.json` | Configuración para Vercel |
| `frontend/public/app.js` | API_URL configurable |
| `backend/server.js` | CORS configurado para producción |
| `README.md` | Documentación completa |

---

## 🎉 ¡LISTO!

Tu sistema de asistencia escolar estará disponible en:
- **Frontend**: https://tu-frontend.vercel.app
- **Backend**: https://tu-backend.onrender.com

**Nota**: El plan gratuito de Render "duerme" el servicio después de 15 minutos de inactividad. La primera visita después de dormir puede tardar 30-60 segundos en cargar.

---

**¿Necesitas ayuda?** Revisa los logs en:
- Dashboard de Render → Logs
- Dashboard de Vercel → Deployments → View Logs
- Consola del navegador (F12)
