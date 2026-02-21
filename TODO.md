# 🚀 Plan de Despliegue - Sistema de Asistencia Escolar

## 📋 Resumen del Proyecto
- **Backend**: Node.js + Express + MongoDB (Mongoose)
- **Frontend**: HTML + JavaScript vanilla + Tailwind CSS (CDN)
- **Estructura**: Backend y frontend en carpetas separadas

## ✅ Pasos de Despliegue

### Fase 1: Preparar Proyecto para Producción ✅ COMPLETADA
- [x] Crear `.env.example` en backend
- [x] Crear `.gitignore` en raíz y backend
- [x] Actualizar `API_URL` en frontend para usar variable de entorno
- [x] Crear `vercel.json` para configuración de Vercel
- [x] Actualizar CORS en backend para producción
- [x] Crear README.md con guía completa


### Fase 2: Subir a GitHub
- [ ] Inicializar repositorio Git
- [ ] Crear repositorio en GitHub
- [ ] Subir código al repositorio

### Fase 3: Desplegar Backend en Render
- [ ] Crear cuenta en Render (render.com)
- [ ] Crear Web Service conectado a GitHub
- [ ] Configurar variables de entorno:
  - MONGODB_URI
  - JWT_SECRET
  - PORT (Render lo asigna automáticamente)
- [ ] Obtener URL del backend desplegado

### Fase 4: Desplegar Frontend en Vercel
- [ ] Crear cuenta en Vercel (vercel.com)
- [ ] Importar proyecto desde GitHub
- [ ] Configurar variable de entorno API_URL con URL de Render
- [ ] Desplegar frontend

### Fase 5: Configuración Final
- [ ] Actualizar CORS en backend para permitir dominio de Vercel
- [ ] Verificar conexión frontend-backend
- [ ] Probar funcionalidades principales

## 🔧 Archivos Creados/Modificados ✅

1. ✅ `backend/.env.example` - Variables de entorno de ejemplo
2. ✅ `.gitignore` - Ignorar node_modules, .env, logs
3. ✅ `frontend/public/app.js` - Actualizar API_URL
4. ✅ `vercel.json` - Configuración de Vercel
5. ✅ `backend/server.js` - Actualizar CORS para producción
6. ✅ `README.md` - Guía completa de despliegue
