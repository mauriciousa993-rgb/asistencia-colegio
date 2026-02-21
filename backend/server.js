require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  REQUIRED_HEADERS,
  parseCsv,
  buildStudentFromRow
} = require("./utils/estudiantesCsv");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || "secreto_super_seguro_2024";

// Configuración de CORS
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || '*' 
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const publicPath = path.join(__dirname, "..", "frontend", "public");
app.use(express.static(publicPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// ============ MODELOS ============

// Schema de Usuario
const usuarioSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nombre: { type: String, required: true },
  rol: { type: String, enum: ["admin", "profesor"], default: "profesor" },
  fechaCreacion: { type: Date, default: Date.now }
});

const Usuario = mongoose.model("Usuario", usuarioSchema);

// Schema de Estudiante (actualizado con datos de padres)
const estudianteSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  grado: { type: String, required: true },
  grupo: { type: String, required: true },
  identificacion: { type: String, required: true, unique: true },
  fechaNacimiento: { type: Date },
  direccion: { type: String },
  telefono: { type: String },
  email: { type: String },
  
  // Datos del padre/madre/tutor
  padre: {
    nombre: { type: String },
    telefono: { type: String },
    email: { type: String },
    ocupacion: { type: String }
  },
  madre: {
    nombre: { type: String },
    telefono: { type: String },
    email: { type: String },
    ocupacion: { type: String }
  },
  tutor: {
    nombre: { type: String },
    telefono: { type: String },
    email: { type: String },
    parentesco: { type: String }
  },
  
  historial: [
    {
      fecha: { type: Date, required: true },
      tipo: { type: String, enum: ["presente", "falta", "retardo", "salida"], required: true },
      hora: { type: String },
      observacion: { type: String },
      fotoUrl: { type: String },
      registradoPor: { type: String }
    }
  ],
  reportesConvivencia: [
    {
      fecha: { type: Date, required: true },
      categoria: {
        type: String,
        enum: ["convivencia", "disciplinario", "acoso", "agresion", "otro"],
        default: "convivencia"
      },
      gravedad: { type: String, enum: ["baja", "media", "alta"], default: "media" },
      estado: { type: String, enum: ["abierto", "en seguimiento", "cerrado"], default: "abierto" },
      descripcion: { type: String, required: true },
      acciones: { type: String },
      registradoPor: { type: String }
    }
  ]
}, { timestamps: true });

const Estudiante = mongoose.model("Estudiante", estudianteSchema);

// ============ CONEXIÓN A MONGODB ============
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch((error) => console.error("Error conectando a MongoDB:", error));

// ============ MIDDLEWARE DE AUTENTICACIÓN ============
const autenticarToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Token inválido" });
    }
    req.user = user;
    next();
  });
};

// ============ ENDPOINTS DE AUTENTICACIÓN ============

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Usuario y contraseña requeridos" });
    }

    const usuario = await Usuario.findOne({ username });
    if (!usuario) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    const passwordValido = await bcrypt.compare(password, usuario.password);
    if (!passwordValido) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    const token = jwt.sign(
      { id: usuario._id, username: usuario.username, rol: usuario.rol, nombre: usuario.nombre },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      usuario: {
        id: usuario._id,
        username: usuario.username,
        nombre: usuario.nombre,
        rol: usuario.rol
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// Registrar usuario (solo admin)
app.post("/api/usuarios", autenticarToken, async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ error: "Solo administradores pueden crear usuarios" });
    }

    const { username, password, nombre, rol } = req.body;

    const usuarioExistente = await Usuario.findOne({ username });
    if (usuarioExistente) {
      return res.status(400).json({ error: "El usuario ya existe" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const nuevoUsuario = new Usuario({
      username,
      password: hashedPassword,
      nombre,
      rol: rol || "profesor"
    });

    await nuevoUsuario.save();
    res.status(201).json({ message: "Usuario creado exitosamente" });
  } catch (error) {
    res.status(500).json({ error: "Error al crear usuario" });
  }
});

// ============ ENDPOINTS DE ESTUDIANTES ============

// Obtener todos los estudiantes (con filtros opcionales)
app.get("/api/estudiantes", autenticarToken, async (req, res) => {
  try {
    const { grado, grupo, busqueda } = req.query;
    let filtro = {};

    if (grado) filtro.grado = grado;
    if (grupo) filtro.grupo = grupo;
    if (busqueda) {
      filtro.$or = [
        { nombre: { $regex: busqueda, $options: "i" } },
        { identificacion: { $regex: busqueda, $options: "i" } }
      ];
    }

    const estudiantes = await Estudiante.find(filtro)
      .select("nombre grado grupo identificacion")
      .sort({ nombre: 1 });
    
    res.json(estudiantes);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener estudiantes" });
  }
});

// Importar estudiantes por CSV (solo admin)
app.post("/api/estudiantes/importar-csv", autenticarToken, async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ error: "Solo administradores pueden importar estudiantes" });
    }

    const { csvContent, dryRun = false } = req.body;
    if (!csvContent || typeof csvContent !== "string") {
      return res.status(400).json({ error: "Debe enviar csvContent en formato texto" });
    }

    const { headers, rows } = parseCsv(csvContent);
    if (!rows.length) {
      return res.status(400).json({ error: "El CSV no contiene filas para importar" });
    }

    const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
    if (missingHeaders.length) {
      return res.status(400).json({
        error: `Faltan columnas requeridas: ${missingHeaders.join(", ")}`
      });
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];

    for (const item of rows) {
      try {
        const data = buildStudentFromRow(item.row);
        const existing = await Estudiante.findOne({ identificacion: data.identificacion }).select("_id");

        if (existing) {
          if (!dryRun) {
            await Estudiante.updateOne({ _id: existing._id }, data, { runValidators: true });
          }
          updated += 1;
        } else {
          if (!dryRun) {
            await Estudiante.create(data);
          }
          created += 1;
        }
      } catch (error) {
        failed += 1;
        errors.push(`Linea ${item.lineNumber}: ${error.message}`);
      }
    }

    return res.json({
      message: dryRun ? "Validacion completada (dry run)" : "Importacion completada",
      dryRun: Boolean(dryRun),
      totalFilas: rows.length,
      creados: created,
      actualizados: updated,
      errores: failed,
      detalleErrores: errors.slice(0, 100)
    });
  } catch (error) {
    return res.status(500).json({ error: "Error al importar CSV" });
  }
});

// Obtener estudiante por ID
app.get("/api/estudiantes/:id", autenticarToken, async (req, res) => {
  try {
    const estudiante = await Estudiante.findById(req.params.id);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    res.json(estudiante);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener estudiante" });
  }
});

// Crear estudiante
app.post("/api/estudiantes", autenticarToken, async (req, res) => {
  try {
    const estudianteData = req.body;
    const nuevoEstudiante = new Estudiante(estudianteData);
    await nuevoEstudiante.save();
    res.status(201).json({ message: "Estudiante creado exitosamente", estudiante: nuevoEstudiante });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: "Ya existe un estudiante con esa identificación" });
    }
    res.status(500).json({ error: "Error al crear estudiante" });
  }
});

// Actualizar estudiante
app.put("/api/estudiantes/:id", autenticarToken, async (req, res) => {
  try {
    const estudianteActualizado = await Estudiante.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!estudianteActualizado) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    
    res.json({ message: "Estudiante actualizado", estudiante: estudianteActualizado });
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar estudiante" });
  }
});

// Eliminar estudiante
app.delete("/api/estudiantes/:id", autenticarToken, async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ error: "Solo administradores pueden eliminar estudiantes" });
    }

    const estudianteEliminado = await Estudiante.findByIdAndDelete(req.params.id);
    if (!estudianteEliminado) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    
    res.json({ message: "Estudiante eliminado" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar estudiante" });
  }
});

// ============ ENDPOINTS DE ASISTENCIA ============

app.post("/api/asistencia", autenticarToken, async (req, res) => {
  const { estudianteId, fecha, tipo, hora, observacion, fotoUrl } = req.body;

  if (!estudianteId || !fecha || !tipo) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  try {
    const estudiante = await Estudiante.findById(estudianteId);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }

    estudiante.historial.push({
      fecha,
      tipo,
      hora,
      observacion,
      fotoUrl,
      registradoPor: req.user.nombre
    });

    await estudiante.save();
    res.status(201).json({ message: "Asistencia registrada" });
  } catch (error) {
    res.status(500).json({ error: "Error al registrar asistencia" });
  }
});

// ============ ENDPOINTS DE CONVIVENCIA ============

app.post("/api/convivencia/reportes", autenticarToken, async (req, res) => {
  try {
    const {
      estudianteId,
      fecha,
      categoria = "convivencia",
      gravedad = "media",
      estado = "abierto",
      descripcion,
      acciones = ""
    } = req.body;

    if (!estudianteId || !descripcion) {
      return res.status(400).json({ error: "estudianteId y descripcion son obligatorios" });
    }

    const estudiante = await Estudiante.findById(estudianteId);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }

    const fechaReporte = fecha ? new Date(fecha) : new Date();
    if (Number.isNaN(fechaReporte.getTime())) {
      return res.status(400).json({ error: "Fecha de reporte invalida" });
    }

    const nuevoReporte = {
      fecha: fechaReporte,
      categoria,
      gravedad,
      estado,
      descripcion,
      acciones,
      registradoPor: req.user.nombre
    };

    estudiante.reportesConvivencia.push(nuevoReporte);
    await estudiante.save();

    return res.status(201).json({
      message: "Reporte de convivencia registrado",
      reporte: estudiante.reportesConvivencia[estudiante.reportesConvivencia.length - 1]
    });
  } catch (error) {
    return res.status(500).json({ error: "Error al registrar reporte de convivencia" });
  }
});

app.get("/api/convivencia/reportes/:estudianteId", autenticarToken, async (req, res) => {
  try {
    const estudiante = await Estudiante.findById(req.params.estudianteId)
      .select("nombre grado grupo identificacion reportesConvivencia");

    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }

    const reportesConvivencia = [...(estudiante.reportesConvivencia || [])]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    return res.json({
      estudiante: {
        id: estudiante._id,
        nombre: estudiante.nombre,
        grado: estudiante.grado,
        grupo: estudiante.grupo,
        identificacion: estudiante.identificacion
      },
      reportesConvivencia
    });
  } catch (error) {
    return res.status(500).json({ error: "Error al obtener reportes de convivencia" });
  }
});

function construirResumenAsistencia(historial) {
  const ahora = new Date();
  const fechaCorte30 = new Date(ahora);
  fechaCorte30.setDate(fechaCorte30.getDate() - 30);

  const totalRegistros = historial.length;
  const presentes = historial.filter((h) => h.tipo === "presente").length;
  const faltas = historial.filter((h) => h.tipo === "falta").length;
  const retardos = historial.filter((h) => h.tipo === "retardo").length;
  const salidas = historial.filter((h) => h.tipo === "salida").length;

  const ultimos30dias = historial.filter((h) => new Date(h.fecha) >= fechaCorte30);
  const presentes30 = ultimos30dias.filter((h) => h.tipo === "presente").length;
  const faltas30 = ultimos30dias.filter((h) => h.tipo === "falta").length;
  const retardos30 = ultimos30dias.filter((h) => h.tipo === "retardo").length;
  const salidas30 = ultimos30dias.filter((h) => h.tipo === "salida").length;

  return {
    totalRegistros,
    presentes,
    faltas,
    retardos,
    salidas,
    ultimoRegistro: historial[0] || null,
    ultimos30dias: {
      total: ultimos30dias.length,
      presentes: presentes30,
      faltas: faltas30,
      retardos: retardos30,
      salidas: salidas30
    }
  };
}

function construirReporteConvivencia(historial, resumenAsistencia, reportesConvivencia = []) {
  const palabrasClave = /pelea|agres|acoso|bully|insulto|violencia|indisciplina|irrespeto|conflicto|disciplina/i;
  const observacionesHistorial = historial
    .filter((h) => h.observacion && palabrasClave.test(h.observacion))
    .map((h) => ({
      fecha: h.fecha,
      tipo: h.tipo,
      observacion: h.observacion,
      registradoPor: h.registradoPor || "",
      fuente: "asistencia"
    }));

  const observacionesReportes = reportesConvivencia.map((r) => ({
    fecha: r.fecha,
    tipo: r.categoria || "convivencia",
    observacion: r.descripcion,
    registradoPor: r.registradoPor || "",
    gravedad: r.gravedad || "media",
    estado: r.estado || "abierto",
    fuente: "reporte"
  }));

  const observacionesRelevantes = [...observacionesReportes, ...observacionesHistorial]
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 15);

  const reportesAltos30 = reportesConvivencia.filter((r) => {
    const fecha = new Date(r.fecha);
    return !Number.isNaN(fecha.getTime()) &&
      fecha >= new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)) &&
      r.gravedad === "alta";
  }).length;

  const reportesConvivencia30 = reportesConvivencia.filter((r) => {
    const fecha = new Date(r.fecha);
    return !Number.isNaN(fecha.getTime()) && fecha >= new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
  }).length;

  const reportesAbiertos = reportesConvivencia.filter((r) => (r.estado || "") !== "cerrado").length;

  const faltas30 = resumenAsistencia.ultimos30dias.faltas;
  const retardos30 = resumenAsistencia.ultimos30dias.retardos;
  const salidas30 = resumenAsistencia.ultimos30dias.salidas;
  const incidentesConvivencia = observacionesRelevantes.length;

  const puntajeRiesgo =
    (faltas30 * 3) +
    (retardos30 * 1) +
    (salidas30 * 2) +
    (incidentesConvivencia * 3) +
    (reportesAltos30 * 5) +
    (reportesAbiertos * 2);

  let nivel = "bajo";
  if (puntajeRiesgo >= 25) nivel = "alto";
  else if (puntajeRiesgo >= 12) nivel = "medio";

  const alertas = [];
  if (faltas30 >= 3) alertas.push("Acumula 3 o mas faltas en los ultimos 30 dias.");
  if (retardos30 >= 5) alertas.push("Acumula 5 o mas retardos en los ultimos 30 dias.");
  if (salidas30 >= 3) alertas.push("Acumula 3 o mas salidas anticipadas en los ultimos 30 dias.");
  if (reportesConvivencia30 > 0) alertas.push(`Tiene ${reportesConvivencia30} reporte(s) de convivencia en los ultimos 30 dias.`);
  if (reportesAbiertos > 0) alertas.push(`Tiene ${reportesAbiertos} reporte(s) de convivencia abiertos/en seguimiento.`);
  if (alertas.length === 0) alertas.push("Sin alertas relevantes de convivencia.");

  return {
    nivel,
    puntajeRiesgo,
    alertas,
    observacionesRelevantes,
    totalReportesConvivencia: reportesConvivencia.length,
    reportesAbiertos
  };
}

app.get("/api/perfil/:id", autenticarToken, async (req, res) => {
  try {
    const estudiante = await Estudiante.findById(req.params.id);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }

    const historialAnual = [...estudiante.historial].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const reportesConvivencia = [...(estudiante.reportesConvivencia || [])]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const resumenAsistencia = construirResumenAsistencia(historialAnual);
    const reporteConvivencia = construirReporteConvivencia(historialAnual, resumenAsistencia, reportesConvivencia);

    res.json({
      estudiante: {
        id: estudiante._id,
        nombre: estudiante.nombre,
        grado: estudiante.grado,
        grupo: estudiante.grupo,
        identificacion: estudiante.identificacion,
        fechaNacimiento: estudiante.fechaNacimiento,
        direccion: estudiante.direccion,
        telefono: estudiante.telefono,
        email: estudiante.email,
        padre: estudiante.padre,
        madre: estudiante.madre,
        tutor: estudiante.tutor
      },
      historial: historialAnual,
      reportesConvivencia,
      resumenAsistencia,
      reporteConvivencia
    });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener perfil" });
  }
});

// ============ ENDPOINTS DE REPORTES ============

// Reporte general de asistencia
app.get("/api/reportes/general", autenticarToken, async (req, res) => {
  try {
    const { fechaInicio, fechaFin, grado, grupo } = req.query;
    
    let filtro = {};
    let filtroFecha = {};

    if (fechaInicio && fechaFin) {
      filtroFecha = {
        fecha: {
          $gte: new Date(fechaInicio),
          $lte: new Date(fechaFin)
        }
      };
    }

    if (grado) filtro.grado = grado;
    if (grupo) filtro.grupo = grupo;

    const estudiantes = await Estudiante.find(filtro);
    
    const reporte = estudiantes.map(estudiante => {
      const historialFiltrado = estudiante.historial.filter(h => {
        if (fechaInicio && fechaFin) {
          const fechaHistorial = new Date(h.fecha);
          return fechaHistorial >= new Date(fechaInicio) && fechaHistorial <= new Date(fechaFin);
        }
        return true;
      });

      const faltas = historialFiltrado.filter(h => h.tipo === "falta").length;
      const retardos = historialFiltrado.filter(h => h.tipo === "retardo").length;
      const salidas = historialFiltrado.filter(h => h.tipo === "salida").length;
      const presentes = historialFiltrado.filter(h => h.tipo === "presente").length;

      return {
        id: estudiante._id,
        nombre: estudiante.nombre,
        grado: estudiante.grado,
        grupo: estudiante.grupo,
        presentes,
        faltas,
        retardos,
        salidas,
        total: faltas + retardos + salidas
      };
    });

    res.json(reporte);
  } catch (error) {
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

// Reporte por grado/grupo
app.get("/api/reportes/por-grupo", autenticarToken, async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    
    const estudiantes = await Estudiante.find({});
    
    const grupos = {};
    
    estudiantes.forEach(estudiante => {
      const key = `${estudiante.grado}-${estudiante.grupo}`;
      if (!grupos[key]) {
        grupos[key] = {
          grado: estudiante.grado,
          grupo: estudiante.grupo,
          totalEstudiantes: 0,
          totalPresentes: 0,
          totalFaltas: 0,
          totalRetardos: 0,
          totalSalidas: 0
        };
      }
      grupos[key].totalEstudiantes++;

      const historialFiltrado = estudiante.historial.filter(h => {
        if (fechaInicio && fechaFin) {
          const fechaHistorial = new Date(h.fecha);
          return fechaHistorial >= new Date(fechaInicio) && fechaHistorial <= new Date(fechaFin);
        }
        return true;
      });

      grupos[key].totalPresentes += historialFiltrado.filter(h => h.tipo === "presente").length;
      grupos[key].totalFaltas += historialFiltrado.filter(h => h.tipo === "falta").length;
      grupos[key].totalRetardos += historialFiltrado.filter(h => h.tipo === "retardo").length;
      grupos[key].totalSalidas += historialFiltrado.filter(h => h.tipo === "salida").length;
    });

    res.json(Object.values(grupos));
  } catch (error) {
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

// Estadísticas generales
app.get("/api/reportes/estadisticas", autenticarToken, async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    
    const estudiantes = await Estudiante.find({});
    
    let totalFaltas = 0;
    let totalRetardos = 0;
    let totalSalidas = 0;
    let totalPresentes = 0;
    let totalRegistros = 0;

    estudiantes.forEach(estudiante => {
      const historialFiltrado = estudiante.historial.filter(h => {
        if (fechaInicio && fechaFin) {
          const fechaHistorial = new Date(h.fecha);
          return fechaHistorial >= new Date(fechaInicio) && fechaHistorial <= new Date(fechaFin);
        }
        return true;
      });

      totalPresentes += historialFiltrado.filter(h => h.tipo === "presente").length;
      totalFaltas += historialFiltrado.filter(h => h.tipo === "falta").length;
      totalRetardos += historialFiltrado.filter(h => h.tipo === "retardo").length;
      totalSalidas += historialFiltrado.filter(h => h.tipo === "salida").length;
      totalRegistros += historialFiltrado.length;
    });

    res.json({
      totalEstudiantes: estudiantes.length,
      totalPresentes,
      totalFaltas,
      totalRetardos,
      totalSalidas,
      totalRegistros
    });
  } catch (error) {
    res.status(500).json({ error: "Error al generar estadísticas" });
  }
});

// Inicializar usuario admin por defecto si no existe
const inicializarAdmin = async () => {
  try {
    const adminExistente = await Usuario.findOne({ username: "admin" });
    if (!adminExistente) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash("admin123", salt);
      
      const admin = new Usuario({
        username: "admin",
        password: hashedPassword,
        nombre: "Administrador",
        rol: "admin"
      });
      
      await admin.save();
      console.log("Usuario admin creado: admin / admin123");
    }
  } catch (error) {
    console.error("Error al inicializar admin:", error);
  }
};

inicializarAdmin();

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
