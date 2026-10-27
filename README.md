<div align="center">

# Sistema de Asistencia Escolar

**Asistencia, convivencia y reportes de estudiantes para un colegio**

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?logo=tailwindcss&logoColor=white)

</div>

---

## Qué resuelve

Llevar la asistencia en planillas de papel hace que los datos tarden días en
convertirse en información útil: cuántas faltas acumula un estudiante, qué
grupo tiene más ausentismo, o si un caso de convivencia ya venía repitiéndose.

Esta aplicación digitaliza ese registro diario y lo convierte en reportes
inmediatos, con alertas cuando un estudiante empieza a acumular faltas o
incidencias.

## Funcionalidades

### Estudiantes
- Gestión completa de la ficha del estudiante, con datos de padres y acudientes.
- **Importación masiva por CSV**, para cargar un colegio entero de una vez.
- Filtros por grado y grupo.
- Scripts de respaldo y restauración de la base de estudiantes.

### Asistencia
- Registro individual o masivo por grado y grupo.
- Estados: presente, falta, retardo y permiso.
- Observaciones y evidencia fotográfica por registro.

### Convivencia escolar
- Reportes clasificados por categoría: convivencia, disciplinario, acoso,
  agresión u otro.
- Niveles de gravedad (baja, media, alta) y seguimiento del caso hasta cerrarlo.
- Alertas automáticas cuando un estudiante acumula incidencias.

### Reportes
- Estadísticas generales y por grado o grupo.
- Reporte individual por estudiante y resumen de los últimos 30 días.
- Exportación a CSV.

## Arquitectura

```
backend/        Node.js + Express + MongoDB (Mongoose)
  server.js     API REST con autenticación JWT
  utils/        Año lectivo, cálculo de comportamiento, manejo de CSV
  scripts/      Respaldo, importación y restauración de estudiantes

frontend/       HTML + JavaScript (sin framework) + Tailwind CSS
  public/       Interfaz de una sola página contra la API
```

**Seguridad:** autenticación JWT con expiración de 8 horas, contraseñas
hasheadas con bcrypt, roles de administrador y profesor, CORS restringido y
validación de datos en cada endpoint.

**Despliegue:** backend en Render, frontend en Vercel.

## Ejecución local

Requisitos: Node 18+ y una instancia de MongoDB (local o Atlas).

```bash
cd backend
npm install
cp .env.example .env     # configura MONGODB_URI y JWT_SECRET
npm start                # http://localhost:5000
```

El frontend son archivos estáticos: ábrelos con cualquier servidor local
(por ejemplo la extensión Live Server de VS Code) y apunta `config.js` a la URL
de tu API.

### Variables de entorno

| Variable | Para qué sirve |
|---|---|
| `MONGODB_URI` | Conexión a la base de datos |
| `JWT_SECRET` | Firma de los tokens de sesión |
| `PORT` | Puerto del servidor (5000 por defecto) |

El primer usuario administrador se crea desde los scripts del backend.

## Licencia

Proyecto privado desarrollado para una institución educativa.
