# 🚀 Configuración Rápida en Vercel

## ✅ Paso 1: Crear Cuenta en Vercel
1. Ve a https://vercel.com
2. Click en **"Get Started"**
3. Selecciona **"Continue with GitHub"**
4. Autoriza a Vercel para acceder a tus repositorios

## ✅ Paso 2: Importar Proyecto

### 2.1 Nuevo Proyecto
1. En el Dashboard de Vercel, click en **"Add New..."**
2. Selecciona **"Project"**
3. Busca y selecciona tu repositorio: `mauriciousa993-rgb/asistencia-colegio`
4. Click **"Import"**

### 2.2 Configuración del Proyecto

| Campo | Valor |
|-------|-------|
| **Framework Preset** | `Other` |
| **Root Directory** | `./` (deja como está) |
| **Build Command** | (deja vacío) |
| **Output Directory** | `frontend/public` |
| **Install Command** | (deja vacío) |

### 2.3 Variables de Entorno

Click en **"Environment Variables"** y agrega:

```
API_URL=https://asistencia-colegio-backend.onrender.com/api
```

**Nota**: Reemplaza la URL con la URL real de tu backend en Render.

### 2.4 Desplegar
Click en **"Deploy"**

⏳ **Espera 1-2 minutos** a que el despliegue termine.

---

## ✅ Paso 3: Obtener URL del Frontend

Una vez desplegado, Vercel te dará una URL como:
```
https://asistencia-colegio.vercel.app
```
o
```
https://asistencia-colegio-frontend.vercel.app
```

**Copia esta URL** - la necesitarás para configurar CORS en Render.

---

## ✅ Paso 4: Configurar CORS en Render (IMPORTANTE)

1. Ve al Dashboard de Render
2. Selecciona tu servicio `asistencia-colegio-backend`
3. Ve a la pestaña **"Environment"**
4. Actualiza la variable `FRONTEND_URL` con la URL real de Vercel:
   ```
   FRONTEND_URL=https://asistencia-colegio.vercel.app
   ```
5. Click **"Save Changes"**
6. El servicio se reiniciará automáticamente

---

## ✅ Paso 5: Verificar Funcionamiento

1. Abre tu URL de Vercel en el navegador:
   ```
   https://asistencia-colegio.vercel.app
   ```

2. Deberías ver la página de login del sistema

3. Prueba las credenciales:
   - **Usuario**: `admin`
   - **Contraseña**: `admin123`

4. Si todo funciona correctamente, ¡felicidades! Tu sistema está desplegado.

---

## 🔧 Solución de Problemas

### Error de CORS en consola
- Verifica que `FRONTEND_URL` en Render sea EXACTAMENTE igual a tu URL de Vercel
- Incluye `https://` y sin barra al final
- Reinicia el servicio en Render después de cambiar la variable

### Frontend no conecta al backend
- Verifica que `API_URL` en Vercel incluya `/api` al final
- URL correcta: `https://backend.onrender.com/api`
- URL incorrecta: `https://backend.onrender.com`

### Error de conexión a MongoDB
- Verifica que la IP `0.0.0.0/0` esté agregada en MongoDB Atlas (Network Access)
- Verifica que el usuario y contraseña en la URI sean correctos
- Asegúrate de que el cluster esté activo

---

## 🎉 ¡Listo!

Tu sistema de asistencia escolar está ahora desplegado y funcionando en:
- **Frontend**: https://tu-frontend.vercel.app
- **Backend**: https://tu-backend.onrender.com
- **Base de datos**: MongoDB Atlas

**Nota importante**: El plan gratuito de Render "duerme" el servicio después de 15 minutos de inactividad. La primera visita después de dormir puede tardar 30-60 segundos en cargar.
