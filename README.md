# 🎓 Sistema de Asistencia Escolar - Colegio Reyes Católicos

Sistema completo para gestión de asistencia, convivencia y reportes de estudiantes.

## 🏗️ Arquitectura

- **Backend**: Node.js + Express + MongoDB (Mongoose)
- **Frontend**: HTML + JavaScript vanilla + Tailwind CSS (CDN)
- **Autenticación**: JWT (JSON Web Tokens)
- **Despliegue**: Render (backend) + Vercel (frontend)

## 📁 Estructura del Proyecto

```
asistencia-colegio/
├── backend/
│   ├── server.js              # Servidor Express principal
│   ├── package.json             # Dependencias del backend
│   ├── .env.example             # Variables de entorno de ejemplo
│   ├── utils/
│   │   └── estudiantesCsv.js    # Utilidades para CSV
│   ├── scripts/
│   │   └── import-estudiantes.js # Script de importación
│   └── data/                    # Datos de prueba
├── frontend/
│   └── public/
│       ├── index.html           # Interfaz principal
│       └── app.js               # Lógica del frontend
├── vercel.json                  # Configuración de Vercel
├── .gitignore                   # Archivos ignorados por Git
└── README.md                    # Este archivo
```

## 🚀 Guía de Despliegue

### Paso 1: Preparar el Proyecto

El proyecto ya está configurado para producción. Los archivos clave son:

- `backend/.env.example` - Variables de entorno necesarias
- `vercel.json` - Configuración para Vercel
- `backend/server.js` - CORS configurado para producción
- `frontend/public/app.js` - API_URL configurable

### Paso 2: Crear Repositorio en GitHub

```bash
# Inicializar repositorio Git
git init

# Agregar todos los archivos
git add .

# Primer commit
git commit -m "Initial commit: Sistema de asistencia escolar"

# Conectar con GitHub (reemplaza con tu URL)
git remote add origin https://github.com/TU_USUARIO/asistencia-colegio.git

# Subir código
git push -u origin main
```

### Paso 3: Desplegar Backend en Render

1. **Crear cuenta** en [render.com](https://render.com) (puedes usar GitHub para login)

2. **Crear Web Service**:
   - Click en "New +" → "Web Service"
   - Conectar con tu repositorio de GitHub
   - Configuración:
     - **Name**: `asistencia-colegio-backend`
     - **Environment**: `Node`
     - **Build Command**: `cd backend && npm install`
     - **Start Command**: `cd backend && npm start`
     - **Plan**: Free

3. **Variables de Entorno**:
   Agrega estas variables en el dashboard de Render:
   ```
   MONGODB_URI=tu_uri_de_mongodb_atlas
   JWT_SECRET=un_secreto_seguro_de_al_menos_32_caracteres
   NODE_ENV=production
   FRONTEND_URL=https://tu-frontend.vercel.app
   ```

4. **Obtener URL**:
   - Una vez desplegado, copia la URL (ej: `https://asistencia-colegio-backend.onrender.com`)

### Paso 4: Configurar MongoDB Atlas

1. Crea cuenta en [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Crea un cluster gratuito (M0)
3. En "Database Access", crea un usuario con contraseña
4. En "Network Access", agrega IP `0.0.0.0/0` (acceso desde cualquier lugar)
5. Obtén la URI de conexión:
   ```
   mongodb+srv://usuario:password@cluster.mongodb.net/asistencia-colegio?retryWrites=true&w=majority
   ```

### Paso 5: Desplegar Frontend en Vercel

1. **Crear cuenta** en [vercel.com](https://vercel.com) (usa GitHub para login)

2. **Importar proyecto**:
   - Click en "Add New..." → "Project"
   - Selecciona tu repositorio de GitHub
   - Configuración:
     - **Framework Preset**: `Other`
     - **Root Directory**: `./` (raíz del proyecto)
     - **Build Command**: (dejar vacío, usamos static)
     - **Output Directory**: `frontend/public`

3. **Variables de Entorno**:
   ```
   API_URL=https://tu-backend.onrender.com/api
   ```

4. **Deploy**:
   - Click en "Deploy"
   - Obtendrás una URL como `https://asistencia-colegio.vercel.app`

### Paso 6: Configurar CORS (Importante)

Una vez que tengas la URL de Vercel, actualiza la variable `FRONTEND_URL` en Render con la URL de tu frontend.

## 🔧 Variables de Entorno

### Backend (.env)
```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=secreto_super_seguro_2024
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://tu-frontend.vercel.app
```

### Frontend (Vercel)
```
API_URL=https://tu-backend.onrender.com/api
```

## 👤 Credenciales por Defecto

- **Usuario**: `admin`
- **Contraseña**: `admin123`

⚠️ **IMPORTANTE**: Cambia la contraseña del admin después del primer login.

## 📊 Funcionalidades

### Gestión de Estudiantes
- ✅ CRUD completo de estudiantes
- ✅ Importación masiva por CSV
- ✅ Datos de padres/madres/tutores
- ✅ Filtros por grado y grupo

### Registro de Asistencia
- ✅ Registro individual
- ✅ Registro masivo por grado/grupo
- ✅ Tipos: Presente, Falta, Retardo, Salida
- ✅ Adjuntar fotos (base64)
- ✅ Observaciones

### Convivencia Escolar
- ✅ Reportes de convivencia
- ✅ Categorías: Convivencia, Disciplinario, Acoso, Agresión, Otro
- ✅ Niveles de gravedad: Baja, Media, Alta
- ✅ Estados: Abierto, En seguimiento, Cerrado
- ✅ Sistema de alertas automáticas

### Reportes y Estadísticas
- ✅ Estadísticas generales
- ✅ Reportes por grado/grupo
- ✅ Reporte individual de estudiantes
- ✅ Exportación a CSV
- ✅ Resumen de asistencia (últimos 30 días)

## 🔒 Seguridad

- Autenticación JWT con expiración de 8 horas
- Contraseñas hasheadas con bcrypt
- Roles: Admin y Profesor
- CORS configurado para dominios específicos
- Validación de datos en todos los endpoints

## 🛠️ Desarrollo Local

```bash
# Backend
cd backend
npm install
npm start

# Frontend (servir archivos estáticos)
cd frontend/public
# Usar Live Server de VS Code o similar
```

## 📝 Notas Importantes

1. **MongoDB**: El sistema requiere MongoDB Atlas para funcionar en producción
2. **Imágenes**: Las fotos se almacenan en base64 (considerar limitaciones de tamaño)
3. **CSV**: La importación requiere columnas: `identificacion`, `nombre`, `grado`, `grupo`
4. **CORS**: Configurar correctamente las URLs de frontend/backend

## 🆘 Solución de Problemas

### Error de CORS
Verifica que `FRONTEND_URL` en Render coincida exactamente con la URL de Vercel (incluyendo `https://`).

### Error de conexión a MongoDB
- Verifica que la IP esté permitida en Atlas (0.0.0.0/0)
- Verifica que el usuario y contraseña sean correctos
- Asegúrate de que el cluster esté activo

### Frontend no conecta al backend
- Verifica que `API_URL` en Vercel sea correcta
- Asegúrate de incluir `/api` al final de la URL
- Verifica que el backend esté desplegado y funcionando

## 📞 Soporte

Para problemas o preguntas, revisa:
- Logs en el dashboard de Render
- Logs en el dashboard de Vercel
- Consola del navegador (F12)

---

**Desarrollado para Colegio Reyes Católicos** 🏫
